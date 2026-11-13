const {test}=require('node:test'),assert=require('node:assert/strict');
test('Push validates identity, conversation membership, subscriptions, duplicate delivery and muting without reading message text',async()=>{
 const {default:worker,validSubscription}=await import('../push/worker.bundle.mjs');
 const key=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),jwk=await crypto.subtle.exportKey('jwk',key.privateKey),raw=await crypto.subtle.exportKey('raw',key.publicKey),publicKey=Buffer.from(raw).toString('base64url');
 const subscription={endpoint:'https://web.push.apple.com/test',expirationTime:null,keys:{p256dh:publicKey,auth:Buffer.alloc(16,7).toString('base64url')}};
 assert.ok(validSubscription(subscription));assert.equal(validSubscription({...subscription,endpoint:'https://127.0.0.1/private'}),false);assert.equal(validSubscription({...subscription,endpoint:'http://web.push.apple.com/test'}),false);
 const subscriptions=new Map(),deliveries=new Set(),prefs=new Map();let dbCalls=0,pushes=0,forbidden=false;const masks=[];
 const db={prepare(sql){let args=[];return{bind(...values){args=values;return this;},async first(){dbCalls++;if(sql.includes('COUNT'))return{n:[...subscriptions.values()].filter(s=>s.uid===args[0]&&s.id!==args[2]).length};if(sql.includes('muted'))return{muted:prefs.get(args[0]+'/'+args[1])||0};},async all(){dbCalls++;return{results:[...subscriptions.values()].filter(s=>s.uid===args[0])};},async run(){dbCalls++;if(sql.startsWith('INSERT INTO subscriptions'))subscriptions.set(args[0],{id:args[0],uid:args[1],subscription:args[2]});if(sql.startsWith('INSERT INTO chat_preferences'))prefs.set(args[0]+'/'+args[1],args[2]);if(sql.startsWith('INSERT OR IGNORE')){const previous=deliveries.has(args[0]);deliveries.add(args[0]);return{meta:{changes:previous?0:1}};}return{meta:{changes:1}};}};}};
 const actualFetch=global.fetch;global.fetch=async(url,options)=>{url=String(url);if(url.startsWith('https://web.push.apple.com/')){pushes++;assert.match(options.headers.Authorization||options.headers.authorization,/vapid/);assert.ok(options.body.byteLength>=4096);return new Response('',{status:201});}if(forbidden)return new Response('{}',{status:403});const u=new URL(url);masks.push(u.searchParams.getAll('mask.fieldPaths'));const f=value=>Object.fromEntries(Object.entries(value).map(([k,v])=>[k,Array.isArray(v)?{arrayValue:{values:v.map(s=>({stringValue:s}))}}:typeof v==='boolean'?{booleanValue:v}:k==='createdAt'?{timestampValue:v}:{stringValue:v}]));const value=u.pathname.includes('/messages/')?{senderUid:'a',createdAt:new Date().toISOString()}:u.pathname.includes('/conversations/')?{members:['a','b'],lastMessageId:'m1'}:{enabled:true};return Response.json({fields:f(value)});};
 const token=uid=>'x.'+Buffer.from(JSON.stringify({sub:uid,aud:'harzafi---fsl',iss:'https://securetoken.google.com/harzafi---fsl'})).toString('base64url')+'.x';
 const request=(path,body,uid='a',origin='https://adamharzafi.github.io')=>new Request('https://push.test'+path,{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+token(uid),'Content-Type':'application/json'},body:JSON.stringify(body)});
 const env={PUSH_DB:db,VAPID_PUBLIC_KEY:publicKey,VAPID_PRIVATE_KEY:jwk.d};
 try{
  assert.equal((await worker.fetch(request('/subscribe',{subscription},'b'),env)).status,200);assert.equal(subscriptions.size,1);
  assert.equal((await worker.fetch(request('/notify',{cid:'a~b',mid:'m1',recipient:'b'}),env)).status,200);assert.equal(pushes,1);
  await worker.fetch(request('/notify',{cid:'a~b',mid:'m1',recipient:'b'}),env);assert.equal(pushes,1,'A retry never duplicates the same push');
  assert.equal((await worker.fetch(request('/notify',{cid:'a~b',mid:'m1',recipient:'outsider'}),env)).status,403);
  assert.equal((await worker.fetch(request('/notify',{cid:'a~b',mid:'old',recipient:'b'}),env)).status,403);
  assert.equal((await worker.fetch(request('/subscribe',{subscription},'b','https://evil.test'),env)).status,403);
  await worker.fetch(request('/preferences',{cid:'a~b',muted:true},'b'),env);deliveries.clear();await worker.fetch(request('/notify',{cid:'a~b',mid:'m1',recipient:'b'}),env);assert.equal(pushes,1,'A muted conversation produces no push');
  forbidden=true;const before=dbCalls;assert.equal((await worker.fetch(request('/subscribe',{subscription}),env)).status,403);assert.equal(dbCalls,before,'A failed authorization never touches subscription storage');
  assert.ok(masks.every(mask=>mask.length&&mask.every(field=>['enabled','members','lastMessageId','senderUid','createdAt'].includes(field))),'The push server requests only authorization and delivery metadata');
 }finally{global.fetch=actualFetch;}
});
