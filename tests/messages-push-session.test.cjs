const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../messages-push.js'),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
async function until(check){for(let i=0;i<100;i++){if(check())return;await new Promise(setImmediate);}assert.fail('The asynchronous push operation did not finish');}
function setup(){
 const requests=[],subscriptions=[];let current,permission='granted',tokenGate;
 const registration={pushManager:{async getSubscription(){return current;},async subscribe(){const subscription={active:true,toJSON:()=>({endpoint:'https://push.test/'+subscriptions.length}),async unsubscribe(){this.active=false;if(current===this)current=null;}};subscriptions.push(subscription);return current=subscription;}}};
 const worker={ready:Promise.resolve(registration),async register(url){assert.equal(url,'messages-notification-sw.js?v=20261128');return registration;},async getRegistration(){return registration;}};
 const window={PushManager:function(){},Notification:{get permission(){return permission;},requestPermission:async()=>permission}};
 const context={window,navigator:{serviceWorker:worker},Notification:window.Notification,Uint8Array,atob,JSON,Map,Promise,firebase:{appCheck:()=>({getToken:async()=>({token:'attestation'})})},fetch:async(url,options)=>{
  if(url.endsWith('/config'))return {ok:true,json:async()=>({publicKey:'AQID'})};
  const request={url,uid:options.headers.Authorization.slice(7),...JSON.parse(options.body)};requests.push(request);
  if(request.cid==='blocked'&&requests.filter(r=>r.cid==='blocked').length===1)throw new Error('unavailable');
  return {ok:true,json:async()=>({ok:true})};
 }};
 vm.runInNewContext(source,context);
 return {api:window.HarzafiMessagePush,requests,subscriptions,setPermission:value=>permission=value,user:(uid,gate)=>({uid,async getIdToken(){if(gate)await gate.promise;return uid;}})};
}
test('A delayed notification subscription cannot bind to the next account or unsubscribe its browser',async()=>{
 const f=setup(),gate=deferred(),a=f.user('a',gate),b=f.user('b');f.api.start(a);
 await until(()=>f.subscriptions.length===1);
 f.api.clear();f.api.start(b);assert.equal(f.api.enabled(),false);
 gate.resolve();await until(()=>f.api.enabled());
 assert.deepEqual(f.requests.filter(r=>r.url.endsWith('/subscribe')).map(r=>r.uid),['b']);
 assert.equal(f.subscriptions.length,2);assert.equal(f.subscriptions[0].active,false);assert.equal(f.subscriptions[1].active,true);
});
test('Concurrent permission requests reuse one current subscription and preservation keeps push enabled on return',async()=>{
 const f=setup();f.api.start(f.user('a'));await Promise.all([f.api.enable(),f.api.enable()]);
 assert.equal(f.requests.filter(r=>r.url.endsWith('/subscribe')).length,1);assert.equal(f.subscriptions.length,1);
 f.api.clear(false);assert.equal(f.api.enabled(),false);f.api.start(f.user('a'));await until(()=>f.api.enabled());
 assert.equal(f.subscriptions.length,1);assert.equal(f.subscriptions[0].active,true);
});
test('Muting changes are saved in order and an old failure does not erase the newest choice',async()=>{
 const f=setup();f.setPermission('default');const gate=deferred();f.api.start(f.user('a',gate));
 const first=f.api.preferences('blocked',false).catch(()=>{}),second=f.api.preferences('blocked',true),third=f.api.preferences('blocked',false);
 gate.resolve();await Promise.all([first,second,third]);await f.api.preferences('blocked',false);
 assert.deepEqual(f.requests.map(r=>r.muted),[false,true,false]);
});
test('A preference waiting for identity cannot be written after sign-out',async()=>{
 const f=setup();f.setPermission('default');const gate=deferred();f.api.start(f.user('a',gate));
 const result=f.api.preferences('private-chat',true);await new Promise(setImmediate);f.api.clear();gate.resolve();await result;
 assert.equal(f.requests.length,0);
});
