// Runs only against the local Firestore emulator; never uses real accounts.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const base = 'http://127.0.0.1:8089';
const project = 'demo-harzafi-messages-recovery';
const root = `projects/${project}/databases/(default)/documents`;
const field = value => value === null ? {nullValue:null} : typeof value === 'boolean' ? {booleanValue:value}
    : typeof value === 'number' ? {integerValue:String(value)}
    : Array.isArray(value) ? {arrayValue:{values:value.map(field)}}
    : typeof value === 'object' ? {mapValue:{fields:fields(value)}} : {stringValue:value};
const fields = value => Object.fromEntries(Object.entries(value).map(([key,value])=>[key,field(value)]));
const stamp = {timestampValue:'2026-11-11T17:37:25Z'};
function identity(uid) {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${encode({alg:'none',typ:'JWT'})}.${encode({sub:uid,user_id:uid,aud:project,
        iss:`https://securetoken.google.com/${project}`,email:uid+'@school.test',
        iat:Math.floor(Date.now()/1000)-60,exp:Math.floor(Date.now()/1000)+3600,
        firebase:{sign_in_provider:'password'}})}.`;
}
async function request(path,body,token='owner') {
    const response = await fetch(base+path,{method:body?'POST':'GET',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
        ...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,body:await response.json()};
}
const commit = (writes,uid) => request('/v1/'+root+':commit',{writes},uid?identity(uid):'owner');
const seed = (path,data,extra={}) => ({update:{name:root+'/'+path,fields:{...fields(data),...extra}}});
const update = (path,data,transforms=[]) => ({update:{name:root+'/'+path,fields:fields(data)},
    updateMask:{fieldPaths:Object.keys(data)},currentDocument:{exists:true},
    ...(transforms.length?{updateTransforms:transforms.map(fieldPath=>({fieldPath,setToServerValue:'REQUEST_TIME'}))}:{})});
function send(cid,uid,mid,effect) {
    return commit([
        {update:{name:root+`/conversations/${cid}/messages/${mid}`,
            fields:fields({senderUid:uid,text:'ok',replyTo:'',reactions:{},...(effect!==undefined?{textEffect:effect}:{})})},
            updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}],
            currentDocument:{exists:false}},
        {update:{name:root+'/conversations/'+cid,
            fields:fields({lastMessageId:mid,lastText:'ok',lastSender:uid})},
            updateMask:{fieldPaths:['lastMessageId','lastText','lastSender']},
            updateTransforms:[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'},
                {fieldPath:'lastAt',setToServerValue:'REQUEST_TIME'}],currentDocument:{exists:true}}
    ],uid);
}
test('Real atomic sends accept authorized students and teachers and reject outsiders',async()=>{
    const profiles=[['a','studente'],['b','studente'],['teacher','docente'],['teacher2','docente']];
    const writes=[];
    for(const [uid,role] of profiles) {
        writes.push(seed('messaging_profiles/'+uid,{name:uid,role,photoData:'',enabled:true},{updatedAt:stamp}));
        if(role==='studente')writes.push(seed('registri/'+uid,{studentId:uid,email:uid+'@school.test'}));
        else writes.push(seed('docenti_autorizzati/'+uid,{enabled:true}));
    }
    const cases=[['a','b'],['a','teacher'],['teacher','a'],['teacher','teacher2']];
    let teacherMessage;
    for(const [sender,recipient] of cases) {
        const cid=[sender,recipient].sort().join('~');
        if(writes.some(w=>w.update.name===root+'/conversations/'+cid))continue;
        writes.push(seed('conversations/'+cid,{members:[sender,recipient].sort(),createdBy:sender,
            lastText:'Foto',lastSender:sender,lastMessageId:'previous'},
            {createdAt:stamp,updatedAt:stamp,lastAt:stamp}));
    }
    assert.equal((await commit(writes)).status,200,'Seed local fixtures');
    for(const [sender,recipient] of cases) {
        const cid=[sender,recipient].sort().join('~'),mid='recovery-'+sender+'-'+Date.now();
        const result=await send(cid,sender,mid);
        assert.equal(result.status,200,`${sender} → ${recipient}: ${JSON.stringify(result.body)}`);
        const saved=await request('/v1/'+root+`/conversations/${cid}/messages/${mid}`,null,identity(sender));
        assert.equal(saved.body.fields.text.stringValue,'ok');
        const parent=await request('/v1/'+root+'/conversations/'+cid,null,identity(sender));
        assert.equal(saved.body.fields.createdAt.timestampValue,parent.body.fields.lastAt.timestampValue);
        if(sender==='teacher'&&recipient==='a')teacherMessage={cid,mid,createdAt:saved.body.fields.createdAt.timestampValue};
    }
    const refused=await send('a~b','teacher','outsider-'+Date.now());
    assert.equal(refused.status,403,'A teacher who is not a participant cannot send into the conversation');
    assert.equal((await request('/v1/'+root+'/conversations/a~b/messages/missing',null,identity('teacher'))).status,403);
    assert.equal((await commit([update('conversations/a~b',{members:['a','b','teacher']})],'a')).status,403,'Direct members cannot be expanded');

    const {cid,mid,createdAt}=teacherMessage;
    const edit=await commit([
        update(`conversations/${cid}/messages/${mid}`,{text:'Testo corretto'},['editedAt']),
        update('conversations/'+cid,{lastText:'Testo corretto'})
    ],'teacher');
    assert.equal(edit.status,200,'Editing the last message still updates its preview');
    const parent=await request('/v1/'+root+'/conversations/'+cid);
    assert.equal(parent.body.fields.lastAt.timestampValue,createdAt,'Editing preserves the original sent time');
    assert.equal((await commit([update(`conversations/${cid}/messages/${mid}`,{text:'Alterato'},['editedAt'])],'a')).status,403,'A recipient cannot edit another person’s text');
    assert.equal((await commit([update('conversations/'+cid,{lastText:'Anteprima inventata'})],'teacher')).status,403,'The preview must correspond to the actual message');

    await commit([update('messaging_profiles/a',{enabled:false})]);
    assert.equal((await send(cid,'teacher','disabled-peer-'+Date.now())).status,403);
    await commit([update('messaging_profiles/a',{enabled:true})]);
    await commit([update('docenti_autorizzati/teacher',{enabled:false})]);
    assert.equal((await send(cid,'teacher','disabled-teacher-'+Date.now())).status,403);
    await commit([update('docenti_autorizzati/teacher',{enabled:true})]);

    for(const name of ['big','small','shake','nod','explode','ripple','bloom','jitter']) {
        const effectId='effect-'+name+'-'+Date.now();
        const result=await send(cid,'teacher',effectId,{name,start:0,end:2});
        assert.equal(result.status,200,'Teacher effect '+name+': '+JSON.stringify(result.body));
        const received=await request('/v1/'+root+`/conversations/${cid}/messages/${effectId}`,null,identity('a'));
        assert.equal(received.body.fields.textEffect.mapValue.fields.name.stringValue,name,'Recipient sees the persisted effect');
        assert.equal((await commit([update(`conversations/${cid}/messages/${effectId}`,{textEffect:{name:name==='shake'?'big':'shake',start:0,end:2}})],'a')).status,403,'A recipient cannot alter the effect');
        const editEffect=await commit([update(`conversations/${cid}/messages/${effectId}`,{text:'Modificato',textEffect:null},['editedAt']),update('conversations/'+cid,{lastText:'Modificato'})],'teacher');
        assert.equal(editEffect.status,200,'Editing safely clears the old range');
    }
    for(const effect of [{name:'flash',start:0,end:2},{name:'big',start:-1,end:2},{name:'big',start:0,end:3},{name:'big',start:1,end:1},{name:'big',start:0,end:2,extra:true}])assert.equal((await send(cid,'teacher','invalid-'+Math.random(),effect)).status,403,'Malformed effect rejected');

    for(const group of ['group-recovery','empty-group-recovery']) {
        const result=await commit([seed('conversations/'+group,{members:['a','teacher','teacher2'],
            createdBy:'teacher',ownerUid:'teacher',kind:'group',title:'Prova locale',
            lastText:'',lastSender:'',lastMessageId:''},{createdAt:stamp,updatedAt:stamp})]);
        assert.equal(result.status,200);
    }
    assert.equal((await send('group-recovery','teacher','group-teacher-'+Date.now())).status,200);
    assert.equal((await send('group-recovery','a','group-student-'+Date.now())).status,200);
    assert.equal((await send('group-recovery','b','group-outsider-'+Date.now())).status,403);
    const closeGroup = group => update('conversations/'+group,{deletedBy:'teacher'},['deletedAt','updatedAt']);
    assert.equal((await commit([closeGroup('empty-group-recovery')],'teacher')).status,200,'An owner can close an empty group');
    assert.equal((await commit([closeGroup('group-recovery')],'a')).status,403,'Only its owner can close a group');
    assert.equal((await commit([closeGroup('group-recovery')],'teacher')).status,200);
    assert.equal((await send('group-recovery','a','closed-'+Date.now())).status,403,'Closed groups cannot receive messages');
    assert.equal((await commit([update('conversations/group-recovery',{deletedAt:null,deletedBy:''},['updatedAt'])],'teacher')).status,200,'Closing a group remains reversible');
    assert.equal((await commit([update('conversations/group-recovery',{members:['a','teacher2'],ownerUid:'teacher2'},['updatedAt'])],'teacher')).status,200,'An owner can leave and transfer ownership');
    assert.equal((await send('group-recovery','teacher','left-'+Date.now())).status,403,'A former member cannot send');
    assert.equal((await send('group-recovery','teacher2','new-owner-'+Date.now())).status,200);
});
