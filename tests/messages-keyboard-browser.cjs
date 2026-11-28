// Isolated Safari viewport/keyboard scenarios: synthetic accounts, no remote requests or real sends.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const pw=require(process.env.PLAYWRIGHT_MODULE||'playwright'),{createServer}=require('../server.js'),fixture=require('./messages-fixture.js');
(async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const engine=process.env.TEST_WEBKIT==='1'?'webkit':'chromium',browser=await pw[engine].launch({headless:true}),errors=[];
 try{
  for(const size of [{width:320,height:740},{width:390,height:844},{width:393,height:852},{width:430,height:932},{width:844,height:390}]){
   const context=await browser.newContext({viewport:size,isMobile:true,hasTouch:true,deviceScaleFactor:3});
   await context.addInitScript(fixture,{history:true});
   await context.addInitScript(size=>{
    const metrics={height:size.height,width:size.width,offsetTop:0,offsetLeft:0,scale:1},visual=new EventTarget();
    for(const name of Object.keys(metrics))Object.defineProperty(visual,name,{get:()=>metrics[name]});
    Object.defineProperty(window,'visualViewport',{configurable:true,value:visual});
    window.__keyboardViewport=patch=>{Object.assign(metrics,patch);if('height' in patch||'width' in patch||'scale' in patch)visual.dispatchEvent(new Event('resize'));visual.dispatchEvent(new Event('scroll'));};
   },size);
   await context.route('**/*',async route=>{
    const url=route.request().url();if(!url.startsWith(origin+'/'))return route.fulfill({contentType:'text/javascript',body:''});
    for(const [file,tail]of [['auth-session.js',''],['account-settings-model.js',';window.HarzafiAccountSettings.loadProfile=window.__messagesFixture.createUserProfile;'],['messages-store.js',';window.HarzafiMessages.create=window.__messagesFixture.create;'],['messages-media.js','window.HarzafiMessageMedia=window.__messagesFixture.media;']])if(url.includes('/'+file))return route.fulfill({contentType:'text/javascript',body:tail&&file!=='messages-media.js'?await fs.readFile(path.join(__dirname,'../'+file),'utf8')+tail:tail});
    if(url.includes('/messages.css')){let css=await fs.readFile(path.join(__dirname,'../messages.css'),'utf8');css=css.replace(/env\(safe-area-inset-(top|bottom|left|right)(?:,\s*0px)?\)/g,(_,side)=>(side==='bottom'?34:side==='left'||side==='right'?size.width>700?47:0:0)+'px');return route.fulfill({contentType:'text/css',body:css});}
    return route.continue();
   });
   const page=await context.newPage();page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.stack||e.message));
   await page.goto(origin+'/messaggi.html');await page.locator('[data-conversation="a~teacher"]').click();await page.locator('.message-row').first().waitFor();
   await page.waitForFunction(()=>!document.querySelector('#active-conversation').getAnimations({subtree:true}).some(a=>a.playState==='running'&&a.effect?.getTiming().iterations!==Infinity));
   const input=page.locator('#message-input');await input.focus();
   const before=await page.locator('.composer-field').boundingBox();
   async function setViewport(patch){await page.evaluate(p=>__keyboardViewport(p),patch);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
   async function geometry(){return page.evaluate(()=>{const form=document.querySelector('#message-form').getBoundingClientRect(),field=document.querySelector('.composer-field').getBoundingClientRect(),send=document.querySelector('#send-message'),voice=document.querySelector('#voice-message'),action=(send.hidden?voice:send).getBoundingClientRect(),nav=document.querySelector('.messages-site-nav').getBoundingClientRect(),pane=document.querySelector('.conversation-pane').getBoundingClientRect(),vv=visualViewport;return{formTop:form.top,formBottom:form.bottom,field:{x:field.x,width:field.width,height:field.height,bottom:field.bottom},actionBottom:action.bottom,actionTop:action.top,navTop:nav.top,paneTop:pane.top,visibleTop:vv.offsetTop,visibleBottom:vv.offsetTop+vv.height,keyboard:document.body.classList.contains('messages-keyboard-open'),overflow:document.documentElement.scrollWidth>innerWidth+1,padding:parseFloat(getComputedStyle(document.querySelector('#message-form')).paddingBottom),focused:document.activeElement===document.querySelector('#message-input'),scrollTop:document.querySelector('#message-scroll').scrollTop};});}
   const openHeight=Math.round(size.height*(size.width>700?.52:.47));
   for(const [height,offsetTop]of [[size.height-70,0],[Math.round((size.height+openHeight)/2),12],[openHeight,36]]){
    await setViewport({height,offsetTop});const g=await geometry();
    assert.ok(Math.abs(g.formBottom-g.visibleBottom)<1,`Composer must end at the visible viewport edge: ${JSON.stringify({engine,size,...g})}`);
    assert.ok(!g.overflow&&g.formTop>=g.visibleTop&&g.field.bottom<=g.visibleBottom-6&&g.actionTop>=g.formTop);
    assert.ok(Math.abs(g.field.x-before.x)<1&&Math.abs(g.field.width-before.width)<1&&Math.abs(g.field.height-before.height)<1,'Keyboard changes preserve capsule width, height and alignment');
    assert.ok(Math.abs(g.navTop-g.visibleTop)<1,'Navigation follows Safari viewport panning');
   }
   let g=await geometry();assert.equal(g.keyboard,true);assert.equal(g.padding,10,'The home-indicator inset is replaced by a quiet gap above the keyboard');assert.equal(g.focused,true);
   await setViewport({offsetTop:58});g=await geometry();assert.ok(Math.abs(g.formBottom-g.visibleBottom)<1,'Scroll-only Safari viewport changes reposition the bar');
   await input.fill('Prima riga\nSeconda riga\nTerza riga\nQuarta riga\nQuinta riga');g=await geometry();assert.ok(g.field.bottom<=g.visibleBottom-6&&g.formTop>=g.visibleTop&&g.field.height<=openHeight*.25+46,'A long draft grows upward within the visible space');
   await input.fill('Una bozza con 👍🏽 e 👨‍👩‍👧‍👦');await page.waitForFunction(()=>!document.querySelector('#send-message').hidden);
   const style=await page.locator('.composer-field').evaluate(e=>({background:getComputedStyle(e).backgroundColor,border:getComputedStyle(e).borderWidth}));assert.deepEqual(style,{background:'rgb(242, 242, 247)',border:'0px'});
   if(size.width===390){
    // Shade the keyboard area only in this local screenshot; it is not site content.
    await page.evaluate(()=>{const shade=document.createElement('div');shade.id='keyboard-test-overlay';Object.assign(shade.style,{position:'fixed',inset:`${visualViewport.offsetTop+visualViewport.height}px 0 0`,background:'#d2d5db',zIndex:'99999',pointerEvents:'none',borderTop:'1px solid #c5c7cc'});document.body.append(shade);});
    await page.screenshot({path:path.join(os.tmpdir(),`harzafi-iphone-keyboard-${engine}.png`)});await page.locator('#keyboard-test-overlay').evaluate(e=>e.remove());
    const selected=page.locator('[data-message-id="m5"] .message-bubble');await selected.evaluate(e=>e.scrollIntoView({block:'end',behavior:'instant'}));
    await page.locator('[data-message-id="m5"] .bubble-actions').click();await page.locator('#message-actions').waitFor({state:'visible'});
    await page.waitForFunction(()=>!document.querySelector('#message-actions').getAnimations({subtree:true}).some(a=>a.playState==='running'));
    assert.equal(await page.locator('#action-message-text').evaluate(e=>getComputedStyle(e).alignSelf),'flex-end','A lifted sent message keeps its alignment');
    assert.equal(await page.getByRole('button',{name:'Chiudi azioni',exact:true}).evaluate(e=>getComputedStyle(e).outlineStyle),'none','A touch opening does not add a keyboard focus ring');
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'solid','Keyboard navigation still has a visible focus indicator');
    const menu=await page.locator('#message-actions').boundingBox();assert.ok(menu.x>=11&&menu.x+menu.width<=size.width-11&&menu.y>=58+11&&menu.y+menu.height<=58+openHeight-11,'The lifted message and reaction sheet fit above the keyboard, within both sides');
    assert.match(await page.locator('#message-actions').evaluate(e=>getComputedStyle(e,'::backdrop').backdropFilter||getComputedStyle(e,'::backdrop').webkitBackdropFilter),/blur\(2px\)/);
    await setViewport({height:size.height,offsetTop:0});const expanded=await page.locator('#message-actions').boundingBox();assert.ok(expanded.y>=11&&expanded.y+expanded.height<=size.height-11,'The menu remains visible while the keyboard closes');
    await page.screenshot({path:path.join(os.tmpdir(),`harzafi-imessage-actions-${engine}.png`)});
    await page.getByRole('button',{name:'Chiudi azioni',exact:true}).click();await page.locator('#message-actions').waitFor({state:'hidden'});await input.focus();await setViewport({height:openHeight,offsetTop:58});
   }
   await input.blur();await setViewport({height:openHeight+25,offsetTop:30});assert.equal((await geometry()).keyboard,true,'Blur does not prematurely restore the bottom inset during dismissal');
   await setViewport({height:size.height,offsetTop:0});g=await geometry();assert.equal(g.keyboard,false);assert.equal(g.padding,34);assert.ok(Math.abs(g.formBottom-size.height)<1);
   await setViewport({offsetTop:24});g=await geometry();assert.ok(Math.abs(g.formBottom-size.height)<1&&Math.abs(g.navTop)<1,'A stale Safari offset after dismissal cannot push the interface below the screen');await setViewport({offsetTop:0});
   await input.focus();await page.locator('#message-scroll').evaluate(e=>e.scrollTop=0);await setViewport({height:openHeight,offsetTop:20});
   assert.ok((await geometry()).scrollTop<2,'Opening the keyboard preserves the position while reading older messages');
   if(size.width===390){
    await page.setViewportSize({width:844,height:390});await setViewport({width:844,height:200,offsetTop:24});g=await geometry();
    assert.ok(Math.abs(g.formBottom-g.visibleBottom)<1&&!g.overflow&&g.field.bottom<=g.visibleBottom-6,'Rotation with the keyboard open keeps the composer visible');
    await page.setViewportSize(size);await setViewport({width:size.width,height:openHeight,offsetTop:28});g=await geometry();
    assert.ok(Math.abs(g.formBottom-g.visibleBottom)<1&&!g.overflow);assert.equal(await input.inputValue(),'Una bozza con 👍🏽 e 👨‍👩‍👧‍👦','Rotation preserves the complete draft');
   }
   await setViewport({height:size.height,offsetTop:0});await input.blur();await page.getByRole('button',{name:'Torna alle conversazioni',exact:true}).click();
   await page.waitForFunction(()=>!document.body.classList.contains('messages-mobile-chat'));assert.equal(await page.locator('.messages-site-footer').isVisible(),true);
   await context.close();
  }
  assert.deepEqual(errors,[]);console.log(`PASS (${engine}): five iPhone sizes/orientations, Safari resize and scroll offsets, stable composer and actions, safe areas, multiline/emoji drafts, keyboard dismissal, preserved reading and restored footer.`);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
