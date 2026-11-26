const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),{createServer}=require('../server.js'),fixture=require('./messages-fixture.js');
(async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true});let page;const errors=[];
 try{
  const context=await browser.newContext({viewport:{width:1280,height:1000}});await context.addInitScript(fixture,{});
  await context.route('**/*',async route=>{
   const url=route.request().url();if(!url.startsWith(origin+'/'))return route.fulfill({contentType:'text/javascript',body:''});
   for(const [file,tail]of [['auth-session.js',''],['account-settings-model.js',';window.HarzafiAccountSettings.loadProfile=window.__messagesFixture.createUserProfile;'],['messages-store.js',';window.HarzafiMessages.create=window.__messagesFixture.create;'],['messages-media.js','window.HarzafiMessageMedia=window.__messagesFixture.media;']])if(url.includes('/'+file))return route.fulfill({contentType:'text/javascript',body:tail&&(file!=='messages-media.js')?await fs.readFile(path.join(__dirname,'../'+file),'utf8')+tail:tail});
   return route.continue();
  });
  page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/messaggi.html');await page.locator('[data-conversation="a~teacher"]').click();
  await page.waitForFunction(()=>document.documentElement.classList.contains('emoji-ready'));await page.evaluate(()=>document.fonts.ready);
  async function geometry(){return page.locator('#message-input').evaluate(input=>{
   const surface=document.querySelector('.composer-emoji-mirror'),s=getComputedStyle(input),probe=document.createElement('div');
   for(const property of s)probe.style.setProperty(property,s.getPropertyValue(property));
   Object.assign(probe.style,{position:'fixed',left:'-10000px',top:'0',margin:'0',height:'auto',minHeight:'0',maxHeight:'none',overflow:'visible',transform:'none',width:(parseFloat(s.width)-Math.max(0,input.offsetWidth-input.clientWidth))+'px'});
   probe.textContent=input.value+'\u200b';document.body.append(probe);
   const a=surface.getBoundingClientRect(),b=probe.getBoundingClientRect(),segments=[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(input.value)],scaleX=input.getBoundingClientRect().width/parseFloat(s.width),scaleY=input.getBoundingClientRect().height/parseFloat(s.height);
   function locate(root,offset){const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while((n=walker.nextNode())){if(offset<=n.length)return[n,offset];offset-=n.length;}throw new Error('Missing text offset');}
   const result=[];
   for(const {index,segment}of segments){const expected=document.createRange();expected.setStart(probe.firstChild,index);expected.setEnd(probe.firstChild,index+segment.length);const actual=document.createRange(),start=locate(surface,index),end=locate(surface,index+segment.length);actual.setStart(...start);actual.setEnd(...end);const e=expected.getBoundingClientRect(),r=actual.getBoundingClientRect();result.push({segment,dx:(r.left-a.left)/scaleX+surface.scrollLeft-(e.left-b.left),dy:(r.top-a.top)/scaleY+surface.scrollTop-(e.top-b.top),dw:r.width/scaleX-e.width,dh:r.height/scaleY-e.height});}
   probe.remove();return result;
  });}
  for(const [width,height]of [[1280,1000],[390,844],[320,740]]){
   await page.setViewportSize({width,height});
   for(const text of ['🔥😭😭😭👍👍😉','🔥😭😭😭👍👍😉D','Ciao 👨‍👩‍👧‍👦, a domani 👍🏽!','Una riga 😊\nUn’altra riga 🇮🇹 1️⃣','مرحبا 😊 ciao 👍',('Una prova 😊 con più parole e spazi. ').repeat(14)]){
    await page.locator('#message-input').fill(text);await page.waitForTimeout(30);
    for(const part of await geometry())for(const key of ['dx','dy','dw','dh'])assert.ok(Math.abs(part[key])<0.8,`${width}px ${JSON.stringify(part)}: native text and emoji preview must share cursor geometry`);
   }
  }
  await page.setViewportSize({width:1280,height:1000});await page.locator('#message-input').fill('Bozza 👍🏽');
  await page.evaluate(()=>{const f=window.__messagesFixture;f.chats.set('a~b',{members:['a','b'],createdBy:'a',lastText:'',lastSender:'',lastMessageId:'',createdAt:f.ts(Date.now()),updatedAt:f.ts(Date.now())});f.rows.set('a~b',new Map());f.emit('chats');});
  await page.locator('[data-conversation="a~b"]').click();await page.locator('[data-conversation="a~teacher"]').click();assert.equal(await page.locator('#message-input').inputValue(),'Bozza 👍🏽');assert.equal(await page.locator('.composer-emoji-mirror .draft-emoji').count(),1,'Emoji drafts restore when the conversation becomes visible');
  const originalFont=await page.locator('#message-input').evaluate(e=>e.style.fontFamily);
  for(const font of ['Arial, sans-serif','"Segoe UI", sans-serif']){
   await page.locator('#message-input').evaluate((e,font)=>e.style.fontFamily=font,font);await page.locator('#message-input').fill('🔥😭👍🏽D');
   for(const part of await geometry())for(const key of ['dx','dy','dw','dh'])assert.ok(Math.abs(part[key])<0.8,'Caret geometry follows the actual font');
  }
  await page.locator('#message-input').evaluate((e,font)=>e.style.fontFamily=font,originalFont);
  for(const settings of [{transform:'scale(.87)',transformOrigin:'top left',zoom:'1'},{transform:'none',zoom:'1.25'}]){
   await page.locator('.composer-field').evaluate((e,styles)=>Object.assign(e.style,styles),settings);await page.locator('#message-input').fill('🔥😭👍D');
   for(const part of await geometry())for(const key of ['dx','dy','dw','dh'])assert.ok(Math.abs(part[key])<0.8,'Caret remains aligned during scaling');
  }
  await page.locator('.composer-field').evaluate(e=>{e.style.transform='';e.style.transformOrigin='';e.style.zoom='';});
  await page.setViewportSize({width:1280,height:1000});await page.locator('#message-input').fill('🔥😭😭😭👍👍😉');await page.locator('#message-input').press('End');await page.locator('#message-input').pressSequentially('D');
  assert.equal(await page.locator('#message-input').inputValue(),'🔥😭😭😭👍👍😉D');await page.locator('#message-input').press('Backspace');await page.locator('#message-input').press('Backspace');assert.equal(await page.locator('#message-input').inputValue(),'🔥😭😭😭👍👍');
  await page.locator('#message-input').evaluate(e=>e.setSelectionRange(0,2));await page.locator('#message-input').pressSequentially('A');assert.equal(await page.locator('#message-input').inputValue(),'A😭😭😭👍👍');
  await page.locator('#message-input').fill('🔥😭😭😭👍👍😉D');await page.locator('#message-input').press('End');
  await page.locator('.composer-row').screenshot({path:path.join(os.tmpdir(),'harzafi-emoji-caret.png'),caret:'initial'});
  await page.locator('#message-input').fill('');
  const reactionId=await page.evaluate(()=>{const f=window.__messagesFixture,id=f.peerText('Ho la ricetta perfetta per l’impasto della pizza.');f.rows.get('a~teacher').get(id).reactions={a:'❤️'};f.emit('messages','a~teacher');return id;});
  const reactionRow=page.locator(`[data-message-id="${reactionId}"]`),chip=reactionRow.locator('.reaction-chip');await chip.waitFor({state:'visible'});await page.waitForTimeout(350);
  assert.equal(await chip.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(26, 150, 254)');
  for(const [width,height]of [[1280,1000],[390,844],[320,740]]){
   await page.setViewportSize({width,height});
   const position=await reactionRow.evaluate(row=>{const bubble=row.querySelector('.message-bubble').getBoundingClientRect(),chip=row.querySelector('.reaction-chip').getBoundingClientRect(),art=row.querySelector('.reaction-chip .apple-emoji-art').getBoundingClientRect(),scroll=document.querySelector('#message-scroll').getBoundingClientRect();return{above:bubble.top-chip.top,overlap:chip.bottom-bubble.top,left:chip.left-scroll.left,right:scroll.right-chip.right,corner:bubble.right-(chip.left+chip.width/2),cx:Math.abs(art.left+art.width/2-chip.left-chip.width/2),cy:Math.abs(art.top+art.height/2-chip.top-chip.height/2),mask:getComputedStyle(row.querySelector('.reaction-chip'),'::before').maskImage};});
   assert.ok(Math.abs(position.corner-4)<.6&&Math.abs(position.above-28)<.6,'Reaction center sits slightly above and left of the bubble corner: '+JSON.stringify(position));assert.ok(position.left>=0&&position.right>=8,'Complete Tapback shape stays inside the conversation');assert.ok(position.cx<1&&position.cy<1,'Emoji is centered inside the reaction bubble');assert.match(position.mask,/message-tapback-shape.svg/);
  }
  await reactionRow.screenshot({path:path.join(os.tmpdir(),'harzafi-tapback-mobile.png')});
  await chip.click();await page.locator('#reaction-picker').getByRole('button',{name:'Cuore',exact:true}).click();await page.locator('#message-actions').waitFor({state:'hidden'});await reactionRow.locator('.message-reactions').waitFor({state:'detached'});
  await page.evaluate(id=>{const f=window.__messagesFixture,reactions={};['❤️','👍','👎','😂','‼️','❓'].forEach((emoji,i)=>{for(let n=0;n<5;n++)reactions['local-'+i+'-'+n]=emoji;});for(const key of [id,'m2'])f.rows.get('a~teacher').get(key).reactions=reactions;f.emit('messages','a~teacher');},reactionId);
  await reactionRow.locator('.reaction-chip').nth(5).waitFor({state:'visible'});await page.waitForTimeout(300);
  for(const id of [reactionId,'m2']){const bounds=await page.locator(`[data-message-id="${id}"] .message-reactions`).evaluate(e=>{const r=e.getBoundingClientRect(),s=document.querySelector('#message-scroll').getBoundingClientRect();return{left:r.left-s.left,right:s.right-r.right,height:r.height};});assert.ok(bounds.left>=-1&&bounds.right>=8&&bounds.height<=80,JSON.stringify(bounds));}
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(30);assert.equal(await reactionRow.locator('.message-reactions').evaluate(e=>e.getAnimations().length),0);
  assert.deepEqual(errors,[]);console.log('PASS: native caret geometry, emoji and mixed text, multiline and RTL, scrolling, fonts and draft restore, insertion/deletion/selection; anchored tapbacks, centered emoji, six reaction types, counts, removal, narrow screens and reduced motion.');
  await context.close();
 }catch(error){if(page)await page.screenshot({path:path.join(os.tmpdir(),'harzafi-emoji-caret-failure.png'),caret:'initial'});throw error;}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
