const { test } = require('node:test');
const assert = require('node:assert/strict');
const messages = require('../messages-store.js');
test('Messages preserve text and reject empty or overlong payloads', () => {
 assert.equal(messages.messageText('  Ciao!\r\nA domani.  '),'Ciao!\nA domani.');
 assert.throws(()=>messages.messageText(' \n '),{code:'empty-message'});
 assert.throws(()=>messages.messageText('x'.repeat(2001)),{code:'message-too-long'});
 assert.equal(messages.messageText('<script>alert(1)</script>'),'<script>alert(1)</script>');
});
test('Direct conversation keys are deterministic and cannot mix identities', () => {
 assert.equal(messages.conversationId('b','a'),'a~b');
 assert.equal(messages.conversationId('a','b'),'a~b');
 assert.throws(()=>messages.conversationId('a','a'),{code:'invalid-recipient'});
 assert.throws(()=>messages.conversationId('a/b','c'),{code:'invalid-recipient'});
 assert.throws(()=>messages.conversationId('a~b','c'),{code:'invalid-recipient'});
});
test('Messaging clients require a real authenticated user', () => {
 assert.throws(()=>messages.create({},null,()=>null),{code:'account-unavailable'});
 assert.throws(()=>messages.create({},{uid:'anonymous',isAnonymous:true},()=>null),{code:'account-unavailable'});
});

test('Text effects validate named ranges without splitting emoji sequences', () => {
 const text='Ciao 👨‍👩‍👧‍👦 👍🏽!';
 for(const name of messages.TEXT_EFFECTS)assert.deepEqual(messages.textEffect({name,start:5,end:text.length-1},text),{name,start:5,end:text.length-1});
 for(const value of [{name:'flash',start:0,end:2},{name:'big',start:-1,end:2},{name:'big',start:0,end:99},{name:'big',start:5,end:7},{name:'big',start:6,end:16},{name:'big',start:0,end:1,url:'x'},{name:'big',start:0,end:1.5}])assert.throws(()=>messages.textEffect(value,text),{code:'invalid-text-effect'});
 assert.equal(messages.textEffect(undefined,text),null);
 assert.equal(messages.textEffect(null,text),null);
});

test('Retries preserve effect metadata and cannot reuse a message id for a different effect',async()=>{
 const documents=new Map();let writes=0;
 function ref(path){return {path,doc:id=>ref(path+'/'+id),collection:name=>ref(path+'/'+name)};}
 const db={collection:ref,runTransaction:async work=>work({get:async target=>({exists:documents.has(target.path),data:()=>documents.get(target.path)}),set:(target,value)=>{documents.set(target.path,value);writes++;},update:()=>{}})};
 const store=messages.create(db,{uid:'a'},()=>123);
 await store.send('a~b','same','Ciao 👍','',{name:'ripple',start:0,end:7});
 const saved=documents.get('conversations/a~b/messages/same');
 assert.deepEqual(saved.textEffect,{name:'ripple',start:0,end:7});
 saved.textEffect={end:7,name:'ripple',start:0};
 await store.send('a~b','same','Ciao 👍','',{name:'ripple',start:0,end:7});
 assert.equal(writes,1);
 await assert.rejects(store.send('a~b','same','Ciao 👍','',{name:'shake',start:0,end:7}),{code:'message-conflict'});
});

test('Group management follows the current owner while keeping legacy creator records compatible',()=>{assert.equal(messages.groupOwner({createdBy:'original'}),'original');assert.equal(messages.groupOwner({createdBy:'original',ownerUid:'successor'}),'successor');assert.equal(messages.groupOwner(null),'');});
