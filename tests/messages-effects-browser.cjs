const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),{createServer}=require('../server.js'),fixture=require('./messages-fixture.js');
(async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true});const errors=[];let page;
 try{
  const context=await browser.newContext({viewport:{width:1280,height:1000}});await context.addInitScript(fixture,{});
  await context.route('**/*',async route=>{
   const url=route.request().url();if(!url.startsWith(origin+'/'))return route.fulfill({contentType:'text/javascript',body:''});
   for(const [file,tail]of [['auth-session.js',''],['account-settings-model.js',';window.HarzafiAccountSettings.loadProfile=window.__messagesFixture.createUserProfile;'],['messages-store.js',';window.HarzafiMessages.create=window.__messagesFixture.create;'],['messages-media.js','window.HarzafiMessageMedia=window.__messagesFixture.media;']])if(url.includes('/'+file))return route.fulfill({contentType:'text/javascript',body:tail&&(file!=='messages-media.js')?await fs.readFile(path.join(__dirname,'../'+file),'utf8')+tail:tail});
   return route.continue();
  });
  page=await context.newPage();page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.stack||e.message));
  await page.goto(origin+'/messaggi.html');await page.locator('[data-conversation="a~teacher"]').click();
  await page.waitForFunction(()=>document.documentElement.classList.contains('emoji-ready'));
  const draft='Ciao 👨‍👩‍👧‍👦 👍🏽!';await page.locator('#message-input').fill(draft);
  assert.equal(await page.locator('#message-input').inputValue(),draft);
  assert.equal(await page.locator('.composer-emoji-mirror .apple-emoji').count(),2,'A family and skin tone remain whole emoji');
  assert.equal(await page.locator('.composer-emoji-mirror').getAttribute('aria-hidden'),'true');
  assert.match(await page.locator('.composer-emoji-mirror .apple-emoji-art').first().evaluate(e=>getComputedStyle(e).backgroundImage),/emoji-apple-16.webp/);
  async function picker(){await page.locator('#attach-message').click();await page.locator('#choose-text-effects').click();await page.locator('#text-effects-dialog').waitFor({state:'visible'});}
  await picker();assert.equal(await page.locator('.effect-choice').count(),8);
  for(const name of ['big','small','shake','nod','explode','ripple','bloom','jitter']){
   await page.locator(`[data-effect="${name}"]`).click();assert.equal(await page.locator(`[data-effect="${name}"]`).getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('#effect-preview').textContent(),draft);
  }
  await page.locator('[data-effect="ripple"]').click();
  await page.screenshot({path:path.join(os.tmpdir(),'harzafi-effects-desktop.png')});
  await page.locator('#effect-done').click();await page.locator('#text-effects-dialog').waitFor({state:'hidden'});
  await page.locator('#send-message').click();
  await page.waitForFunction(()=>[...window.__messagesFixture.rows.get('a~teacher').values()].some(m=>m.textEffect?.name==='ripple'));
  const sent=await page.evaluate(()=>[...window.__messagesFixture.rows.get('a~teacher').values()].find(m=>m.textEffect?.name==='ripple'));
  assert.deepEqual(sent.textEffect,{name:'ripple',start:0,end:draft.length});
  const body=page.locator(`[data-message-id="${sent.id}"] .message-text`);
  await page.waitForTimeout(250);assert.equal(await body.evaluate(e=>e.classList.contains('effect-playing')),true,'Acknowledgement must not interrupt the sender effect');
  assert.equal(await body.textContent(),draft);
  await page.waitForTimeout(1400);assert.equal(await body.locator('.effect-unit').count(),0,'Temporary animation spans are cleaned up');
  await page.evaluate(()=>window.__messagesFixture.emit('states','a~teacher'));await page.waitForTimeout(80);
  assert.equal(await body.evaluate(e=>e.getAnimations({subtree:true}).length),0,'Read updates do not replay effects');
  await page.locator(`[data-message-id="${sent.id}"] .effect-replay`).click();await page.waitForTimeout(100);
  assert.equal(await body.evaluate(e=>e.classList.contains('effect-playing')),true);
  const incoming=await page.evaluate(()=>window.__messagesFixture.peerText('Che bello! 👍','a~teacher','teacher','',{name:'bloom',start:0,end:3}));
  const peer=page.locator(`[data-message-id="${incoming}"] .message-text`);await peer.waitFor();await page.waitForTimeout(180);
  assert.equal(await peer.locator('.effect-range').textContent(),'Che');assert.equal(await peer.evaluate(e=>e.classList.contains('effect-playing')),true,'Recipient plays the saved range');
  assert.equal(await peer.locator('.apple-emoji').count(),1);
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(id=>!document.querySelector('[data-message-id="'+id+'"] .message-text').getAnimations({subtree:true}).length,incoming);assert.equal(await peer.evaluate(e=>e.getAnimations({subtree:true}).length),0);
  await page.locator('#message-input').fill('Solo 👍🏽 qui');await page.locator('#message-input').evaluate(e=>e.setSelectionRange(5,9));
  await picker();await page.locator('[data-effect="shake"]').click();assert.equal(await page.locator('#effect-preview .effect-range').textContent(),'👍🏽');
  assert.equal(await page.locator('#effect-preview').evaluate(e=>e.getAnimations({subtree:true}).length),0);
  await page.locator('#effect-done').click();await page.locator('#text-effects-dialog').waitFor({state:'hidden'});
  await page.evaluate(()=>window.__messagesFixture.failNextSend=true);await page.locator('#send-message').click();await page.getByRole('button',{name:'Riprova',exact:true}).click();
  await page.waitForFunction(()=>[...window.__messagesFixture.rows.get('a~teacher').values()].some(m=>m.text==='Solo 👍🏽 qui'));
  assert.deepEqual(await page.evaluate(()=>[...window.__messagesFixture.rows.get('a~teacher').values()].find(m=>m.text==='Solo 👍🏽 qui').textEffect),{name:'shake',start:5,end:9});
  assert.equal(await page.locator('#message-input').inputValue(),'');assert.equal(await page.locator('.composer-emoji-mirror').isVisible(),false);
  for(const [width,height]of [[320,740],[390,844],[834,1194],[1440,1000]]){
   await page.setViewportSize({width,height});await page.locator('#message-input').fill('Un’anteprima 👍');await picker();await page.locator('[data-effect="big"]').click();
   const box=await page.locator('#text-effects-dialog').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1,'Effect panel fits '+width);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No page overflow');
   if(width===390)await page.screenshot({path:path.join(os.tmpdir(),'harzafi-effects-mobile.png')});
   await page.locator('#effect-done').click();await page.locator('#text-effects-dialog').waitFor({state:'hidden'});
  }
  await page.locator('#clear-text-effect').click();await page.locator('#message-input').fill('<img src=x onerror=alert(1)> 👍');
  await page.locator('#send-message').click();await page.waitForTimeout(100);assert.equal(await page.locator('.message-text img[src="x"]').count(),0,'Plain text cannot insert markup');
  assert.deepEqual(errors,[]);await context.close();console.log('PASS: eight effects, selected emoji ranges, optimistic send, recipient playback, replay, retry preservation, reduced motion, Unicode and local Apple emoji assets, safe text, four responsive viewports.');
 }catch(error){console.error(errors);if(page){await page.screenshot({path:path.join(os.tmpdir(),"harzafi-effects-failure.png")});console.error(await page.evaluate(()=>({body:document.body.innerText.slice(0,1200),app:document.querySelector("#messages-app").outerHTML.slice(0,350),gate:document.querySelector("#messages-gate")?.outerHTML.slice(0,600)})));}throw error;}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
