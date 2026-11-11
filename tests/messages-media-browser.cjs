const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),{createServer}=require('../server.js');
(async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE});
 try{
  const page=await browser.newPage();await page.goto(origin+'/404.html');
  await page.addScriptTag({path:path.join(__dirname,'../messages-store.js')});await page.addScriptTag({path:path.join(__dirname,'../messages-media.js')});
  const result=await page.evaluate(async()=>{
   const api=HarzafiMessageMedia,records=new Map(),parts=new Map();
   const store={uid:'a',async createUpload(cid,mid,value){records.set(mid,{...value,ownerUid:'a',complete:false});},async putUploadChunk(cid,mid,index,data){if(!parts.has(mid))parts.set(mid,new Map());parts.get(mid).set(index,data);},async completeUpload(cid,mid){records.get(mid).complete=true;},async getUpload(cid,mid){return{exists:records.has(mid),data:()=>records.get(mid)};},async getUploadChunks(cid,mid){return{docs:[...parts.get(mid)].sort((a,b)=>a[0]-b[0]).map(([index,data])=>({data:()=>({index,data})}))};}};
   const raw=new Uint8Array(700000);for(let i=0;i<raw.length;i++)raw[i]=i%251;
   const prepared=await api.prepare(new File([raw],'Percorso.pdf',{type:'application/pdf'})),progress=[];
   const attachment=await api.upload('a~b','one',prepared,value=>progress.push(value),store),url=await api.load(attachment,store),roundtrip=new Uint8Array(await (await fetch(url)).arrayBuffer());
   if(roundtrip.length!==raw.length||roundtrip.some((n,i)=>n!==raw[i]))throw new Error('binary-mismatch');
   const canvas=document.createElement('canvas');canvas.width=3200;canvas.height=2400;const ctx=canvas.getContext('2d');ctx.fillStyle='#008aff';ctx.fillRect(0,0,3200,2400);const image=await new Promise(r=>canvas.toBlob(r,'image/png'));
   const optimized=await api.prepare(new File([image],'Foto.png',{type:'image/png'})),bitmap=await createImageBitmap(optimized.file);const dimensions=[bitmap.width,bitmap.height];bitmap.close();
   let rejected=false;try{await api.prepare(new File(['<svg/>'],'vector.svg',{type:'image/svg+xml'}));}catch(_){rejected=true;}
   api.destroy();let revoked=false;try{await fetch(url);}catch(_){revoked=true;}
   return{chunks:parts.get('one').size,progress,optimized:optimized.size,dimensions,rejected,revoked};
  });
  assert.equal(result.chunks,3);assert.equal(result.progress.at(-1),100);assert.deepEqual(result.dimensions,[1600,1200]);assert.ok(result.optimized<1572864);assert.ok(result.rejected&&result.revoked);
  console.log('PASS: real media compression, exact 700 KB binary upload/download across three chunks, progress, SVG rejection and account-session URL revocation.');
  if(process.env.TEST_ASR==='1'){
   page.on('console',message=>{if(message.type()==='error')console.log('ASR browser:',message.text().slice(0,160));});
   const text=await page.evaluate(async()=>{const response=await fetch('https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav');if(!response.ok)throw new Error('sample-'+response.status);return HarzafiMessageMedia.transcribe(await response.blob());});
   assert.match(text,/country|Americans|ask/i);console.log('PASS: actual on-device Whisper transcription of the public JFK sample:',text.slice(0,160));
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
