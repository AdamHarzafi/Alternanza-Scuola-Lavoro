const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),{createServer}=require('../server.js'),fixture=require('./messages-fixture.js');
(async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE});const errors=[];
 try{
  async function open(options={},viewport={width:1440,height:1000}){
   const context=await browser.newContext({viewport});await context.addInitScript(fixture,options);
   await context.route('**/*',async route=>{
    const url=route.request().url();
    if(!url.startsWith(origin+'/'))return route.fulfill({contentType:'text/javascript',body:''});
    if(url.includes('/auth-session.js'))return route.fulfill({contentType:'text/javascript',body:''});
    if(url.includes('/account-settings-model.js'))return route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(__dirname,'../account-settings-model.js'),'utf8')+';window.HarzafiAccountSettings.loadProfile=window.__messagesFixture.createUserProfile;'});
    if(url.includes('/messages-store.js'))return route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(__dirname,'../messages-store.js'),'utf8')+';window.HarzafiMessages.create=window.__messagesFixture.create;'});
    return route.continue();
   });
   const page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',error=>errors.push(error.message));await page.goto(origin+'/messaggi.html');return{context,page};
  }
  const {context,page}=await open();await page.getByRole('button',{name:'Apri la conversazione con Claudia Verdi'}).click();await page.locator('.message-row').first().waitFor();
  for(const [width,height]of [[320,740],[390,844],[834,1194],[1440,1000]]){
   await page.setViewportSize({width,height});
   await page.waitForFunction(()=>Math.abs(parseFloat(document.documentElement.style.getPropertyValue('--messages-height'))-innerHeight)<1);
   const geometry=await page.evaluate(()=>{const pane=document.querySelector('.conversation-pane'),form=document.querySelector('#message-form'),body=document.body;return{overflow:body.scrollWidth>innerWidth+1,paneOverflow:pane.scrollWidth>pane.clientWidth+1,formBottom:form.getBoundingClientRect().bottom,height:innerHeight};});
   assert.equal(geometry.overflow,false);assert.equal(geometry.paneOverflow,false);assert.ok(geometry.formBottom<=height+1,JSON.stringify({width,height,...geometry}));
   await page.screenshot({path:path.join(os.tmpdir(),`harzafi-messages-${width}.png`)});
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-message-id="m4"] .bubble-actions').click();await page.getByRole('button',{name:'Rispondi',exact:true}).click();
  await page.locator('#message-actions').waitFor({state:'hidden'});assert.equal(await page.locator('#reply-preview').isVisible(),true);await page.getByRole('textbox',{name:'Scrivi un messaggio'}).fill('Grazie, tutto chiaro!');await page.getByRole('button',{name:'Invia messaggio',exact:true}).click();
  await page.waitForFunction(()=>[...__messagesFixture.rows.get('a~teacher').values()].some(m=>m.text==='Grazie, tutto chiaro!'&&m.replyTo==='m4'));
  await page.evaluate(()=>__messagesFixture.peerState({readAt:__messagesFixture.ts(Date.now()),isTyping:false}));await page.getByText('Letto',{exact:true}).waitFor();
  assert.equal(await page.locator('#reply-preview').isVisible(),false);assert.ok(await page.locator('.own .reply-quote').count()>=1);
  await page.locator('[data-message-id="m1"] .bubble-actions').click();await page.getByRole('button',{name:'Cuore',exact:true}).click();await page.locator('#message-actions').waitFor({state:'hidden'});await page.locator('[data-message-id="m1"] .reaction-chip').waitFor();
  await page.locator('[data-message-id="m1"] .reaction-chip').click();await page.getByRole('button',{name:'Cuore',exact:true}).click();await page.locator('#message-actions').waitFor({state:'hidden'});await page.waitForFunction(()=>!__messagesFixture.rows.get('a~teacher').get('m1').reactions.a);
  await page.evaluate(()=>__messagesFixture.peerState({isTyping:true}));await page.locator('#typing-indicator').waitFor({state:'visible'});
  await page.evaluate(()=>__messagesFixture.peerState({isTyping:true,updatedAt:__messagesFixture.ts(Date.now()-9000)}));await page.locator('#typing-indicator').waitFor({state:'hidden'});
  await page.locator('#message-input').fill('Questa è una bozza riservata');await page.waitForFunction(()=>__messagesFixture.typed.some(s=>s.patch.isTyping));
  assert.ok((await page.evaluate(()=>__messagesFixture.typed)).every(s=>!JSON.stringify(s).includes('bozza riservata')),'Typing signals never contain the draft');
  await page.getByRole('button',{name:'Torna alle conversazioni',exact:true}).click();await page.getByRole('button',{name:'Apri la conversazione con Claudia Verdi'}).click();assert.equal(await page.locator('#message-input').inputValue(),'Questa è una bozza riservata');
  await page.evaluate(()=>__messagesFixture.failNextSend=true);await page.locator('#message-input').fill('Non perdermi');await page.locator('#send-message').click();await page.getByRole('button',{name:'Riprova',exact:true}).waitFor();await page.getByRole('button',{name:'Riprova',exact:true}).click();
  await page.waitForFunction(()=>[...__messagesFixture.rows.get('a~teacher').values()].some(m=>m.text==='Non perdermi'));assert.equal(await page.locator('.message-text').filter({hasText:'Non perdermi'}).count(),1);
  await page.getByRole('button',{name:'Torna alle conversazioni',exact:true}).click();await page.getByRole('button',{name:'Nuovo messaggio',exact:true}).click();await page.getByRole('searchbox',{name:'Cerca una persona'}).fill('Marco');await page.getByRole('button',{name:'Scrivi a Marco Bianchi',exact:true}).click();
  await page.locator('#message-input').fill('<img src=x onerror=alert(1)>');await page.locator('#send-message').click();await page.getByText('<img src=x onerror=alert(1)>',{exact:true}).waitFor();assert.equal(await page.locator('.message-text img').count(),0);
  await context.setOffline(true);assert.equal(await page.locator('#send-message').isDisabled(),true);await context.setOffline(false);
  await page.getByRole('button',{name:'Torna alle conversazioni',exact:true}).click();await page.getByRole('button',{name:'Impostazioni messaggi',exact:true}).click();await page.getByRole('button',{name:'Disattiva Messaggi',exact:true}).click();await page.getByRole('button',{name:'Attiva Messaggi',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>__messagesFixture.people.get('a').enabled),false);
  await page.getByRole('button',{name:'Attiva Messaggi',exact:true}).click();await page.getByRole('button',{name:'Apri la conversazione con Claudia Verdi'}).waitFor();
  await page.evaluate(()=>__messagesFixture.changeUser('b'));await page.getByRole('button',{name:'Apri la conversazione con Giulia Rossi'}).waitFor();assert.equal(await page.locator('.message-text').count(),0,'Account switches remove the previous message DOM');
  await context.close();
  const older=await open({history:true});await older.page.getByRole('button',{name:'Apri la conversazione con Claudia Verdi'}).click();await older.page.locator('.message-row').first().waitFor();
  assert.equal(await older.page.locator('.message-row').count(),50);await older.page.locator('#load-older').click();await older.page.waitForFunction(()=>document.querySelectorAll('.message-row').length===65);assert.equal(await older.page.locator('#load-older').isVisible(),false);
  await older.page.locator('#message-scroll').evaluate(e=>e.scrollTop=0);await older.page.evaluate(()=>__messagesFixture.peerText('Un nuovo messaggio in tempo reale'));await older.page.locator('#new-messages-indicator').waitFor({state:'visible'});assert.ok(await older.page.locator('#message-scroll').evaluate(e=>e.scrollTop<50),'A new message does not move someone reading older messages');await older.page.locator('#new-messages-indicator').click();await older.context.close();
  const enrollment=await open({unenrolled:true});await enrollment.page.getByRole('button',{name:'Attiva Messaggi',exact:true}).waitFor();assert.equal(await enrollment.page.locator('#messages-app').isVisible(),false);await enrollment.context.close();
  assert.deepEqual(errors,[]);console.log('PASS: messaging UI, four viewports, replies, reactions, typing expiry, drafts, retry, contact search, safe text, offline state, opt-out, account isolation and pagination.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
