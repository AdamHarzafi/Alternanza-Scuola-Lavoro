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
    const rows = new Map(), states = new Map(), preferences = new Map(), uploads = new Map(), authListeners = []; let messageCounter=100;
    states.set('a~teacher',new Map([['a',{readAt:ts(now-60000),isTyping:false,updatedAt:ts(now-60000)}],['teacher',{readAt:ts(now-120000),isTyping:false,updatedAt:ts(now-120000)}]]));
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
        if(type==='settings') return {docs:[...(preferences.get(id)||new Map())].map(([id,value])=>doc(id,value))};
        return {docs:[...(rows.get(id)||new Map())].map(([id,value])=>doc(id,value)).sort((a,b)=>b.data().createdAt.toMillis()-a.data().createdAt.toMillis()).slice(0,50),metadata:{fromCache:false}};
    }
    function emit(type,id){listeners.filter(l=>l.active&&l.type===type&&(!id||l.id===id)).forEach(l=>setTimeout(()=>{if(l.active)l.receive(snapshot(type,l.id));},0));}
    function listen(type,id,receive,fail){const listener={type,id,receive,fail,active:true};listeners.push(listener);setTimeout(()=>{if(listener.active)receive(snapshot(type,id));},0);return()=>listener.active=false;}
    const auth = {currentUser:a,onAuthStateChanged(receive){authListeners.push(receive);setTimeout(()=>receive(auth.currentUser),0);return()=>{};}};
    const db = { collection(name) { return { doc(uid) { return { async get() { return doc(uid, name === 'registri' ? {studentId:'profile-'+uid,email:auth.currentUser.email} : {}); } }; } }; } };
    function firestore(){return db;} firestore.FieldValue={serverTimestamp:()=>ts(Date.now())};
    function storage(){return {ref(storagePath){return {
        fullPath:storagePath,
        put(file){const item={file,url:URL.createObjectURL(file),metadata:{fullPath:storagePath,name:file.name,size:file.size,contentType:file.type}};uploads.set(storagePath,item);const snapshot={ref:{fullPath:storagePath,getDownloadURL:async()=>item.url},metadata:item.metadata,bytesTransferred:file.size,totalBytes:file.size};const task=Promise.resolve(snapshot);task.on=(event,progress,error,complete)=>{setTimeout(()=>{progress?.(snapshot);complete?.();},0);return()=>{};};task.snapshot=snapshot;task.cancel=()=>true;return task;},
        async getDownloadURL(){const item=uploads.get(storagePath);if(!item)throw new Error('object-not-found');return item.url;},
        async getMetadata(){return uploads.get(storagePath)?.metadata||{};},async delete(){uploads.delete(storagePath);}
    };}};}
    window.firebase={firestore,storage};window.HarzafiSession={auth};
    function touchChat(id,message){Object.assign(chats.get(id),{lastText:message.text||({image:'Foto',audio:'Messaggio vocale',video:'Video',file:'File'}[message.type])||message.poll?.question||'',lastSender:message.senderUid,lastMessageId:message.id,lastAt:message.createdAt,updatedAt:message.createdAt});emit('messages',id);emit('chats');}
    const state=window.__messagesFixture={auth,people,chats,rows,states,preferences,uploads,listeners,sendCount:0,typed:[],failNextSend:false,failNextReaction:false,failNextEdit:false,failNextUpload:false,ts,doc,
        async createUserProfile(){return {id:'profile-'+auth.currentUser.uid,role:'studente',data:{nome:people.get(auth.currentUser.uid).name}};},
        emit,peerText(text,conversationId='a~teacher',senderUid='teacher'){const id='incoming'+messageCounter++;const message={id,senderUid,text,replyTo:'',reactions:{},createdAt:ts(Date.now())};rows.get(conversationId).set(id,message);touchChat(conversationId,message);return id;},
        peerState(value,conversationId='a~teacher',senderUid='teacher'){if(!states.has(conversationId))states.set(conversationId,new Map());const map=states.get(conversationId);map.set(senderUid,{...map.get(senderUid),...value,updatedAt:value.updatedAt||ts(Date.now())});emit('states',conversationId);},
        changeUser(uid){auth.currentUser=uid==='b'?b:a;authListeners.forEach(fn=>fn(auth.currentUser));},
        create(db,user){const uid=user.uid;return {
            uid,now:()=>ts(Date.now()),profile:async()=>doc(uid,people.get(uid)?.enabled?people.get(uid):undefined),
            enroll:async value=>{people.set(uid,{...value,enabled:true});emit('contacts');},disable:async()=>{people.get(uid).enabled=false;emit('contacts');},
            contacts:(receive,fail)=>listen('contacts','',receive,fail),conversations:(receive,fail)=>listen('chats','',receive,fail),
            open:async other=>{const id=[uid,other].sort().join('~');if(!chats.has(id)){chats.set(id,{members:[uid,other],createdAt:ts(Date.now()),updatedAt:ts(Date.now()),lastText:'',lastSender:''});rows.set(id,new Map());emit('chats');}return id;},
            createGroup:async(members,title)=>{const id='group-'+messageCounter++;chats.set(id,{kind:'group',title,members:[...new Set([uid,...members])],createdBy:uid,createdAt:ts(Date.now()),updatedAt:ts(Date.now()),lastText:'',lastSender:'',lastMessageId:''});rows.set(id,new Map());emit('chats');return id;},
            listen:(id,receive,fail)=>listen('messages',id,receive,fail),states:(id,receive,fail)=>listen('states',id,receive,fail),
            inboxState:(id,receive,fail)=>listen('states',id,receive,fail),
            settings:(receive,fail)=>listen('settings',uid,receive,fail),
            saveConversationSettings:async(id,patch)=>{if(patch.background&&!window.HarzafiMessages.BACKGROUNDS.includes(patch.background))throw new Error('invalid-preferences');if(!preferences.has(uid))preferences.set(uid,new Map());const map=preferences.get(uid);map.set(id,{...map.get(id),...patch,updatedAt:ts(Date.now())});emit('settings',uid);},
            state:async(id,patch)=>{state.typed.push({id,uid,patch});if(!states.has(id))states.set(id,new Map());const map=states.get(id);map.set(uid,{...map.get(uid),...patch,updatedAt:ts(Date.now())});if(patch.readAt){if(!preferences.has(uid))preferences.set(uid,new Map());const own=preferences.get(uid);own.set(id,{...own.get(id),readAt:patch.readAt,updatedAt:ts(Date.now())});emit('settings',uid);}emit('states',id);},
            authorizeMedia:async conversationId=>({uid,conversationId,role:people.get(uid).role,expiresAt:ts(Date.now()+240000)}),
            older:async(id,cursor)=>({docs:[...rows.get(id)].map(([id,v])=>doc(id,v)).sort((a,b)=>b.data().createdAt.toMillis()-a.data().createdAt.toMillis()).filter(d=>d.data().createdAt.toMillis()<cursor.data().createdAt.toMillis()).slice(0,50)}),
            newMessageId:()=> 'sent'+messageCounter++,
            send:async(id,messageId,text,replyTo)=>{state.sendCount++;await new Promise(r=>setTimeout(r,25));if(state.failNextSend){state.failNextSend=false;throw new Error('network');}const message={id:messageId,senderUid:uid,text,replyTo,reactions:{},createdAt:ts(Date.now())};rows.get(id).set(messageId,message);touchChat(id,message);},
            edit:async(id,messageId,text)=>{if(state.failNextEdit){state.failNextEdit=false;throw new Error('network');}const message=rows.get(id).get(messageId);if(message.senderUid!==uid)throw new Error('permission-denied');message.text=text;message.editedAt=ts(Date.now());if(chats.get(id).lastMessageId===messageId){chats.get(id).lastText=text;if(!chats.get(id).lastAt)chats.get(id).lastAt=message.createdAt;}emit('messages',id);emit('chats');},
            saveTranscript:async(id,messageId,text)=>{const message=rows.get(id).get(messageId);if(message.senderUid!==uid)throw new Error('permission-denied');message.transcript=text;message.transcribedAt=ts(Date.now());emit('messages',id);},
            sendMedia:async(id,messageId,attachment,caption='',replyTo='')=>{const type=attachment.mime.startsWith('image/')?'image':attachment.mime.startsWith('audio/')?'audio':attachment.mime.startsWith('video/')?'video':'file';const message={id:messageId,senderUid:uid,type,text:caption,attachment,replyTo,reactions:{},createdAt:ts(Date.now())};rows.get(id).set(messageId,message);touchChat(id,message);},
            sendPoll:async(id,messageId,question,options,replyTo='')=>{const message={id:messageId,senderUid:uid,type:'poll',text:question,poll:{question,options,votes:{}},replyTo,reactions:{},createdAt:ts(Date.now())};rows.get(id).set(messageId,message);touchChat(id,message);},
            vote:async(id,messageId,optionIndex)=>{const message=rows.get(id).get(messageId);if(optionIndex===null||message.poll.votes[uid]===optionIndex)delete message.poll.votes[uid];else message.poll.votes[uid]=optionIndex;emit('messages',id);},
            react:async(id,messageId,emoji)=>{if(state.failNextReaction){state.failNextReaction=false;throw new Error('network');}const row=rows.get(id).get(messageId);if(row.reactions[uid]===emoji)delete row.reactions[uid];else row.reactions[uid]=emoji;emit('messages',id);},
            getMessage:async(id,messageId)=>doc(messageId,rows.get(id).get(messageId))
        };}
    };
    state.media={
        supported:true,
        async prepare(file){return {file,blob:file,name:file.name||'Allegato',mime:file.type||'application/octet-stream',size:file.size,type:file.type?.startsWith('image/')?'image':file.type?.startsWith('audio/')?'audio':file.type?.startsWith('video/')?'video':'file'};},
        async upload(conversationId,messageId,prepared,onProgress,authorize){
            if(typeof authorize === "function")await authorize(conversationId);
            if(state.failNextUpload){state.failNextUpload=false;throw new Error('upload-failed');}
            const file=prepared.file||prepared.blob||prepared,name=prepared.name||file.name||'Allegato',mime=prepared.mime||file.type||'application/octet-stream',objectName=name.replace(/[^A-Za-z0-9_.-]/g,'_').slice(0,160)||'attachment',storagePath=`message_media/${conversationId}/${messageId}/${objectName}`;
            uploads.set(storagePath,{file,url:URL.createObjectURL(file),metadata:{fullPath:storagePath,name,size:file.size,contentType:mime}});onProgress?.(100);
            return {path:storagePath,name,mime,size:file.size,...(prepared.duration?{duration:prepared.duration}:{})};
        },
        async load(attachment,authorize){if(typeof authorize === 'function')await authorize(attachment.path.split('/')[1]);const item=uploads.get(attachment.path);if(!item)throw new Error('object-not-found');return item.url;},
        release(){},
        canRecord:()=>true,
        async startRecording({onTick}={}){
            state.recording=true;onTick?.(1);
            return {async stop(){state.recording=false;const data=new Uint8Array(44+16000),view=new DataView(data.buffer),put=(at,value)=>{for(let i=0;i<value.length;i++)data[at+i]=value.charCodeAt(i);};put(0,'RIFF');view.setUint32(4,data.length-8,true);put(8,'WAVE');put(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);put(36,'data');view.setUint32(40,16000,true);const file=new File([data],'Messaggio vocale.wav',{type:'audio/wav'});return {...await state.media.prepare(file),duration:1};},cancel(){state.recording=false;}};
        },
        async transcribe(){state.transcriptionCount=(state.transcriptionCount||0)+1;if(state.failNextTranscript){state.failNextTranscript=false;throw new Error('transcription-failed');}return 'Questo è un messaggio vocale di prova.';},
        destroy(){}
    };
};
