const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),{createServer}=require('../server.js'),fixture=require('./messages-fixture.js');
(async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true});const errors=[];let page;
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1050}});await context.addInitScript(fixture,{unenrolled:true});
  await context.route('**/*',async route=>{
   const url=route.request().url();if(!url.startsWith(origin+'/'))return route.fulfill({contentType:'text/javascript',body:''});
   if(url.includes('/auth-session.js'))return route.fulfill({contentType:'text/javascript',body:''});
   if(url.includes('/account-settings-model.js'))return route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(__dirname,'../account-settings-model.js'),'utf8')+';window.HarzafiAccountSettings.loadProfile=async()=>{await new Promise(r=>setTimeout(r,800));return window.__messagesFixture.createUserProfile();};'});
   if(url.includes('/messages-store.js'))return route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(__dirname,'../messages-store.js'),'utf8')+';window.HarzafiMessages.create=window.__messagesFixture.create;'});
   if(url.includes('/messages-media.js'))return route.fulfill({contentType:'text/javascript',body:'window.HarzafiMessageMedia=window.__messagesFixture.media;'});
   return route.continue();
  });
  page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/messaggi.html');
  await page.locator('#gate-spinner').waitFor({state:'visible'});assert.match(await page.locator('#messages-gate>.message-app-logo').getAttribute('src'),/ICONA-MESSAGGI.webp$/);
  await page.locator('#messages-onboarding').waitFor({state:'visible'});
  assert.match(await page.locator('.onboarding-logo').getAttribute('src'),/ICONA-MESSAGGI.webp$/);
  assert.equal(await page.locator('#messages-gate>.message-app-logo').isVisible(),false,'Only one brand icon appears in the welcome state');
  assert.equal(await page.locator('#messages-gate').getAttribute('role'),'region');
  assert.match(await page.locator('.onboarding-note').textContent(),/^Le informazioni relative all’Account Harzafi vengono utilizzate in Harzafi Messaggi/);
  assert.match(await page.locator('.onboarding-note').textContent(),/il tuo nome, il ruolo e la foto del profilo; la tua email rimane riservata/);
  assert.equal(await page.locator('.onboarding-privacy a').getAttribute('href'),'privacy-account.html');
  for(const [width,height]of [[1920,1080],[1440,1050],[1024,768],[768,1024],[390,844],[320,568]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(40);
   const layout=await page.locator('#messages-onboarding').evaluate(block=>{const b=block.getBoundingClientRect(),title=block.querySelector('.onboarding-title').getBoundingClientRect(),privacy=block.querySelector('.onboarding-privacy-icon').getBoundingClientRect(),note=block.querySelector('.onboarding-note').getBoundingClientRect(),button=block.querySelector('#messages-enable').getBoundingClientRect(),gate=block.parentElement.getBoundingClientRect();return{center:Math.abs(b.left+b.width/2-innerWidth/2),privacyAlign:Math.abs(privacy.left-title.left),noteAlign:Math.abs(note.left-title.left),buttonAlign:Math.abs(button.left-title.left),buttonWidth:Math.abs(button.width-title.width),aboveNote:privacy.bottom<=note.top,alignment:getComputedStyle(block.querySelector('.onboarding-note')).textAlign,overflow:document.documentElement.scrollWidth>innerWidth,gateTop:gate.top,blockTop:b.top,blockBottom:b.bottom};});
   assert.ok(layout.center<1,'The full welcome column is centered: '+JSON.stringify({width,...layout}));assert.ok(layout.privacyAlign<1&&layout.noteAlign<1&&layout.buttonAlign<1&&layout.buttonWidth<1,'All content shares one column');assert.equal(layout.alignment,'left');assert.equal(layout.aboveNote,true);assert.equal(layout.overflow,false);assert.ok(layout.blockTop>=layout.gateTop,'A tall welcome screen stays reachable from its beginning');
   if(width===1440||width===390)await page.screenshot({path:path.join(os.tmpdir(),'harzafi-welcome-'+width+'.png'),fullPage:true});
   await page.locator('#messages-enable').scrollIntoViewIfNeeded();assert.equal(await page.locator('#messages-enable').isVisible(),true);
   await page.evaluate(()=>window.scrollTo(0,0));
  }
  await page.locator('#messages-enable').click();await page.locator('#messages-app').waitFor({state:'visible'});
  assert.match(await page.locator('#conversation-placeholder .message-app-logo').getAttribute('src'),/ICONA-MESSAGGI.webp$/);
  assert.deepEqual(errors,[]);console.log('PASS: shared optimized Messages icon in loading/welcome/empty state, one centered column, left-aligned privacy icon and contextual disclosure, working link and activation, six viewports including short/narrow screens.');await context.close();
 }catch(error){if(page)await page.screenshot({path:path.join(os.tmpdir(),'harzafi-welcome-failure.png'),fullPage:true});throw error;}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
