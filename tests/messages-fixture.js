module.exports = function (options = {}) {
    const ts = value => ({ toMillis:() => value, toDate:() => new Date(value) });
    const doc = (id, data) => ({ id, exists:data !== undefined, data:() => data, metadata:{fromCache:false,hasPendingWrites:false} });
    const a = { uid:'a',email:'giulia@example.test',isAnonymous:false }, b = { uid:'b',email:'marco@example.test',isAnonymous:false };
    const listeners = [], now = Date.now(), people = new Map([
        ['a',{name:'Giulia Rossi',role:'studente',photoData:'',enabled:!options.unenrolled}],
        ['b',{name:'Marco Bianchi',role:'studente',photoData:'',enabled:true}],
        ['teacher',{name:'Claudia Verdi',role:'docente',photoData:'',enabled:true}]
    ]);
    const chats = new Map([['a~teacher',{members:['a','teacher'],createdBy:'a',updatedAt:ts(now-60000),lastText:'Perfetto, grazie professoressa!',lastSender:'a',lastMessageId:'m5'}]]);
    const rows = new Map(), states = new Map(), authListeners = []; let messageCounter=100;
    const history = options.history ? Array.from({length:60},(_,i)=>({id:'old'+i,senderUid:i%2?'a':'teacher',text:'Messaggio precedente '+i,replyTo:'',reactions:{},createdAt:ts(now-86400000+(i*10000))})) : [];
    rows.set('a~teacher',new Map([...history,
        {id:'m1',senderUid:'teacher',text:'Ciao Giulia, hai ritrovato l’attestato dell’incontro di orientamento?',replyTo:'',reactions:{},createdAt:ts(now-600000)},
        {id:'m2',senderUid:'a',text:'Sì, è tutto nel mio registro. Posso inviarle il riepilogo domani?',replyTo:'',reactions:{teacher:'👍'},createdAt:ts(now-480000)},
        {id:'m3',senderUid:'teacher',text:'Certamente. Controlla che siano presenti tutte le ore svolte.',replyTo:'m2',reactions:{},createdAt:ts(now-360000)},
        {id:'m4',senderUid:'teacher',text:'Se ti serve una mano, scrivimi qui.',replyTo:'',reactions:{},createdAt:ts(now-300000)},
        {id:'m5',senderUid:'a',text:'Perfetto, grazie professoressa!',replyTo:'m4',reactions:{},createdAt:ts(now-60000)}
    ].map(row=>[row.id,row])));
    function snapshot(type,id){
        if(type==='contacts') return {docs:[...people].filter(([,v])=>v.enabled).map(([id,value])=>doc(id,value))};
        if(type==='chats') return {docs:[...chats].filter(([,c])=>c.members.includes(auth.currentUser.uid)).map(([id,value])=>doc(id,value)),metadata:{fromCache:false}};
        if(type==='states') return {docs:[...(states.get(id)||new Map())].map(([id,value])=>doc(id,value))};
        return {docs:[...(rows.get(id)||new Map())].map(([id,value])=>doc(id,value)).sort((a,b)=>b.data().createdAt.toMillis()-a.data().createdAt.toMillis()).slice(0,50),metadata:{fromCache:false}};
    }
    function emit(type,id){listeners.filter(l=>l.active&&l.type===type&&(!id||l.id===id)).forEach(l=>setTimeout(()=>{if(l.active)l.receive(snapshot(type,l.id));},0));}
    function listen(type,id,receive,fail){const listener={type,id,receive,fail,active:true};listeners.push(listener);setTimeout(()=>{if(listener.active)receive(snapshot(type,id));},0);return()=>listener.active=false;}
    const auth = {currentUser:a,onAuthStateChanged(receive){authListeners.push(receive);setTimeout(()=>receive(auth.currentUser),0);return()=>{};}};
    const db = { collection(name) { return { doc(uid) { return { async get() { return doc(uid, name === 'registri' ? {studentId:'profile-'+uid,email:auth.currentUser.email} : {}); } }; } }; } };
    function firestore(){return db;} firestore.FieldValue={serverTimestamp:()=>ts(Date.now())};
    window.firebase={firestore};window.HarzafiSession={auth};
    const state=window.__messagesFixture={auth,people,chats,rows,states,listeners,sendCount:0,typed:[],failNextSend:false,failNextReaction:false,ts,doc,
        async createUserProfile(){return {id:'profile-'+auth.currentUser.uid,role:'studente',data:{nome:people.get(auth.currentUser.uid).name}};},
        emit,peerText(text){const id='incoming'+messageCounter++;rows.get('a~teacher').set(id,{id,senderUid:'teacher',text,replyTo:'',reactions:{},createdAt:ts(Date.now())});emit('messages','a~teacher');},
        peerState(value){if(!states.has('a~teacher'))states.set('a~teacher',new Map());states.get('a~teacher').set('teacher',{...value,updatedAt:value.updatedAt||ts(Date.now())});emit('states','a~teacher');},
        changeUser(uid){auth.currentUser=uid==='b'?b:a;authListeners.forEach(fn=>fn(auth.currentUser));},
        create(db,user){const uid=user.uid;return {
            uid,now:()=>ts(Date.now()),profile:async()=>doc(uid,people.get(uid)?.enabled?people.get(uid):undefined),
            enroll:async value=>{people.set(uid,{...value,enabled:true});emit('contacts');},disable:async()=>{people.get(uid).enabled=false;emit('contacts');},
            contacts:(receive,fail)=>listen('contacts','',receive,fail),conversations:(receive,fail)=>listen('chats','',receive,fail),
            open:async other=>{const id=[uid,other].sort().join('~');if(!chats.has(id)){chats.set(id,{members:[uid,other],createdAt:ts(Date.now()),updatedAt:ts(Date.now()),lastText:'',lastSender:''});rows.set(id,new Map());emit('chats');}return id;},
            listen:(id,receive,fail)=>listen('messages',id,receive,fail),states:(id,receive,fail)=>listen('states',id,receive,fail),
            state:async(id,patch)=>{state.typed.push({id,uid,patch});if(!states.has(id))states.set(id,new Map());const map=states.get(id);map.set(uid,{...map.get(uid),...patch,updatedAt:ts(Date.now())});emit('states',id);},
            older:async(id,cursor)=>({docs:[...rows.get(id)].map(([id,v])=>doc(id,v)).sort((a,b)=>b.data().createdAt.toMillis()-a.data().createdAt.toMillis()).filter(d=>d.data().createdAt.toMillis()<cursor.data().createdAt.toMillis()).slice(0,50)}),
            newMessageId:()=> 'sent'+messageCounter++,
            send:async(id,messageId,text,replyTo)=>{state.sendCount++;await new Promise(r=>setTimeout(r,25));if(state.failNextSend){state.failNextSend=false;throw new Error('network');}rows.get(id).set(messageId,{id:messageId,senderUid:uid,text,replyTo,reactions:{},createdAt:ts(Date.now())});Object.assign(chats.get(id),{lastText:text,lastSender:uid,lastMessageId:messageId,updatedAt:ts(Date.now())});emit('messages',id);emit('chats');},
            react:async(id,messageId,emoji)=>{if(state.failNextReaction){state.failNextReaction=false;throw new Error('network');}const row=rows.get(id).get(messageId);if(row.reactions[uid]===emoji)delete row.reactions[uid];else row.reactions[uid]=emoji;emit('messages',id);},
            getMessage:async(id,messageId)=>doc(messageId,rows.get(id).get(messageId))
        };}
    };
};
