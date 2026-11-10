const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {createServer}=require('../server.js'),fixture=require('./messages-fixture.js');
const root=path.resolve(__dirname,'..'),fallback=createServer();
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://local').pathname;
 if(pathname==='/messages-preview'){
  let html=fs.readFileSync(path.join(root,'messaggi.html'),'utf8').replace(/<script[^>]*src="https:\/\/www\.gstatic\.com[^>]*><\/script>/g,'').replace(/<script[^>]*src="auth-session\.js[^>]*><\/script>/,'');
  html=html.replace('<title>Messaggi — Harzafi FSL</title>','<title>Messaggi — Anteprima con dati dimostrativi</title>').replace('<body class="messages-page">','<body class="messages-page"><script>('+fixture.toString()+')({});</script>');
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(html);
 }
 if(pathname==='/account-settings-model.js'||pathname==='/messages-store.js'){
  const suffix=pathname.includes('model')?';window.HarzafiAccountSettings.loadProfile=window.__messagesFixture.createUserProfile;':';window.HarzafiMessages.create=window.__messagesFixture.create;';
  res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});return res.end(fs.readFileSync(path.join(root,pathname.slice(1)),'utf8')+suffix);
 }
 fallback.emit('request',req,res);
});
server.listen(3004,'127.0.0.1',()=>console.log('Anteprima dimostrativa locale: http://127.0.0.1:3004/messages-preview'));
