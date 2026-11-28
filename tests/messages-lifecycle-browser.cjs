const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),{createServer}=require('../server.js'),fixture=require('./messages-fixture.js');
(async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true});const errors=[];
 try{
  const context=await browser.newContext({viewport:{width:1280,height:1000}});await context.addInitScript(fixture,{});
  await context.route('**/*',async route=>{
   const url=route.request().url();if(!url.startsWith(origin+'/'))return route.fulfill({contentType:'text/javascript',body:''});
   for(const [file,tail]of [['auth-session.js',''],['account-settings-model.js',';window.HarzafiAccountSettings.loadProfile=window.__messagesFixture.createUserProfile;'],['messages-store.js',';window.HarzafiMessages.create=window.__messagesFixture.create;'],['messages-media.js','window.HarzafiMessageMedia=window.__messagesFixture.media;']])if(url.includes('/'+file))return route.fulfill({contentType:'text/javascript',body:tail&&file!=='messages-media.js'?await fs.readFile(path.join(__dirname,'../'+file),'utf8')+tail:tail});
   return route.continue();
  });
  const page=await context.newPage();page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.stack||e.message));
  await page.goto(origin+'/messaggi.html');await page.locator('[data-conversation="a~teacher"]').waitFor();
  await page.evaluate(()=>{
   window.__inboxRow=document.querySelector('[data-conversation="a~teacher"]');__inboxRow.focus();
   window.__inboxChanges=0;window.__inboxObserver=new MutationObserver(records=>__inboxChanges+=records.filter(r=>r.type==='childList').length);__inboxObserver.observe(document.querySelector('#conversation-list'),{childList:true,subtree:true});
  });
  await page.waitForTimeout(1700);
  assert.equal(await page.evaluate(()=>document.querySelector('[data-conversation="a~teacher"]')===__inboxRow),true,'An idle refresh preserves the actual row and avatar');
  assert.equal(await page.evaluate(()=>__inboxChanges),0,'The inbox has no idle DOM reconstruction');
  assert.equal(await page.evaluate(()=>document.activeElement===__inboxRow),true,'Keyboard focus remains stable');
  await page.evaluate(()=>{const f=__messagesFixture;f.states.get('a~teacher').set('teacher',{isTyping:true,updatedAt:f.ts(Date.now())});f.emit('states','a~teacher');});
  await page.locator('[data-conversation="a~teacher"] .conversation-typing').waitFor();
  await page.evaluate(()=>window.__typingPreview=document.querySelector('.conversation-typing'));
  await page.waitForTimeout(1700);assert.equal(await page.evaluate(()=>document.querySelector('.conversation-typing')===__typingPreview),true,'Typing dots keep their animation across inbox refreshes');
  await page.locator('[data-conversation="a~teacher"]').click();
  await page.evaluate(()=>{
   window.__hiddenForTest=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>__hiddenForTest});
   document.dispatchEvent(new Event('visibilitychange'));
   window.__effectId=__messagesFixture.peerText('Un effetto al ritorno','a~teacher','teacher','',{name:'bloom',start:0,end:10});
  });
  const effect=page.locator('.message-text').filter({hasText:'Un effetto al ritorno'});await effect.waitFor();await page.waitForTimeout(150);
  assert.equal(await effect.evaluate(e=>e.classList.contains('effect-playing')),false);
  await page.evaluate(()=>{__hiddenForTest=false;document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>document.querySelector(`[data-message-id="${__effectId}"] .message-text`).classList.contains('effect-playing'));
  await page.waitForTimeout(1450);assert.equal(await effect.locator('.effect-unit').count(),0);
  await page.evaluate(()=>{document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(100);
  assert.equal(await effect.evaluate(e=>e.classList.contains('effect-playing')),false,'Returning again does not replay an already shown effect');
  await page.evaluate(()=>{
   const f=__messagesFixture;f.media.load=()=>new Promise(resolve=>window.__finishAudioLoad=resolve);
   f.rows.get('a~teacher').set('delayed-audio',{id:'delayed-audio',senderUid:'teacher',type:'audio',text:'',replyTo:'',reactions:{},attachment:{path:'message_media/a~teacher/delayed-audio/audio.wav',name:'audio.wav',mime:'audio/wav',size:44,duration:1},createdAt:f.ts(Date.now())});f.emit('messages','a~teacher');
  });
  const audio=page.locator('[data-message-id="delayed-audio"]');await audio.waitFor();await audio.locator('summary').click();await audio.locator('.transcribe-audio').click();
  await page.waitForFunction(()=>!!window.__finishAudioLoad);
  await page.locator('#new-conversation').click();await page.getByRole('button',{name:'Scrivi a Marco Bianchi',exact:true}).click();await page.locator('#conversation-name').filter({hasText:'Marco Bianchi'}).waitFor();
  await page.evaluate(()=>__finishAudioLoad('blob:cancelled-fixture'));await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>__messagesFixture.transcriptionCount||0),0,'A previous chat cannot start a new transcription after its attachment finishes loading');
  assert.equal(await page.locator('#composer-status').textContent(),'');
  await page.locator('[data-conversation="a~teacher"]').click();
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise(resolve=>window.__finishClipboard=resolve)}}));
  await page.locator('[data-message-id="m1"] .bubble-actions').click();await page.locator('#copy-message').click();
  await page.waitForFunction(()=>!!window.__finishClipboard);await page.keyboard.press('Escape');await page.locator('#message-actions').waitFor({state:'hidden'});
  await page.locator('[data-conversation="a~b"]').click();await page.locator('#conversation-name').filter({hasText:'Marco Bianchi'}).waitFor();
  await page.evaluate(()=>__finishClipboard());await page.waitForTimeout(350);
  assert.equal(await page.locator('#composer-status').textContent(),'','Delayed clipboard completion never changes a different conversation');
  const result=await page.evaluate(async()=>{
   const realPlay=HTMLMediaElement.prototype.play;let calls=[];HTMLMediaElement.prototype.play=function(){calls.push(this);return Promise.resolve();};
   const a=HarzafiMessageAudio.player({source:()=>new Promise(r=>window.__audioA=r)}),b=HarzafiMessageAudio.player({source:()=>new Promise(r=>window.__audioB=r)});
   document.body.append(a.element,b.element);a.element.querySelector('button').click();await Promise.resolve();b.element.querySelector('button').click();await Promise.resolve();
   __audioB('data:audio/wav;base64,');await new Promise(r=>setTimeout(r,20));__audioA('data:audio/wav;base64,');await new Promise(r=>setTimeout(r,20));
   const outcome={count:calls.length,lastRequested:calls[0]===b.audio};a.destroy();b.destroy();a.element.remove();b.element.remove();HTMLMediaElement.prototype.play=realPlay;return outcome;
  });
  assert.deepEqual(result,{count:1,lastRequested:true},'Only the last requested voice message may start when previous loading is delayed');
  assert.deepEqual(errors,[]);console.log('PASS: stable inbox and typing animations, effects after background return, cancelled stale transcription/clipboard work, last-requested voice playback.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
