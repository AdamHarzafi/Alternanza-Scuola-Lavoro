(function () {
    'use strict';
    const urls = new Map(), resolvedUrls = new Set(); let generation = 0, recorder, worker, rejectTranscript;
    const model = () => window.HarzafiMessages;
    const fail = code => Object.assign(new Error(code), {code});
    const filename = value => String(value || 'Allegato').replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 180);
    async function prepare(file) {
        let mime = file.type.split(';')[0].toLowerCase(), kind = model().mediaKind(mime);
        if (!kind || !file.size || file.size > 30 * 1024 * 1024) throw fail('unsupported-file');
        if (kind === 'image') {
            const bitmap = await createImageBitmap(file), scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
            const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close();
            let blob; for (const quality of [.84,.72,.58]) { blob = await new Promise(resolve => canvas.toBlob(resolve,'image/jpeg',quality)); if (blob && blob.size <= 1.5*1024*1024) break; }
            if (!blob) throw fail('image-unavailable');
            file = new File([blob], filename(file.name).replace(/\.[^.]+$/, '') + '.jpg', {type:'image/jpeg'}); mime = file.type;
        }
        if (file.size > model().MEDIA_LIMITS[kind]) throw fail('file-too-large');
        return {file, name:filename(file.name), mime, size:file.size, type:kind};
    }
    function base64(bytes) { let binary = ''; for (let i=0;i<bytes.length;i+=8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192)); return btoa(binary); }
    async function upload(cid,mid,prepared,onProgress,store) {
        const epoch = generation, bytes = new Uint8Array(await prepared.file.arrayBuffer()), chunkSize=model().RAW_CHUNK_BYTES, totalChunks=Math.ceil(bytes.length/chunkSize);
        const check = () => { if (epoch !== generation) throw fail('cancelled'); }; check();
        await store.createUpload(cid,mid,{kind:prepared.type,name:prepared.name,mime:prepared.mime,size:bytes.length,totalChunks});
        for (let index=0;index<totalChunks;index++) { check(); await store.putUploadChunk(cid,mid,index,base64(bytes.subarray(index*chunkSize,(index+1)*chunkSize))); onProgress?.(Math.round((index+1)/totalChunks*100)); }
        check(); await store.completeUpload(cid,mid); check();
        const safeName=prepared.name.replace(/[^A-Za-z0-9_.-]/g,'_');
        return {backend:'firestore',path:`message_media/${cid}/${mid}/${safeName}`,name:prepared.name,mime:prepared.mime,size:bytes.length,...(prepared.duration?{duration:prepared.duration}:{})};
    }
    async function load(attachment,store) {
        const epoch=generation, parts=String(attachment.path).split('/');
        if (parts.length!==4 || parts[0]!=='message_media' || !parts[1] || !parts[2]) throw fail('invalid-attachment');
        const key=store.uid+':'+attachment.path; if(urls.has(key))return urls.get(key);
        const promise=(async()=>{
            const saved=await store.getUpload(parts[1],parts[2]), metadata=saved.data();
            if(!saved.exists || !metadata.complete || metadata.size!==attachment.size || metadata.mime!==attachment.mime || metadata.totalChunks>model().MAX_CHUNKS) throw fail('attachment-unavailable');
            const chunks=await store.getUploadChunks(parts[1],parts[2]);
            if(chunks.docs.length!==metadata.totalChunks)throw fail('attachment-incomplete');
            const output=new Uint8Array(metadata.size);let offset=0;
            chunks.docs.forEach((doc,index)=>{const value=doc.data();if(value.index!==index || value.data.length>model().BASE64_CHUNK_CHARS)throw fail('invalid-chunk');const binary=atob(value.data);if(offset+binary.length>output.length)throw fail('invalid-chunk');for(let i=0;i<binary.length;i++)output[offset++]=binary.charCodeAt(i);});
            if(offset!==output.length || epoch!==generation)throw fail('cancelled');
            const url=URL.createObjectURL(new Blob([output],{type:metadata.mime}));resolvedUrls.add(url);return url;
        })(); urls.set(key,promise);try{return await promise;}catch(error){urls.delete(key);throw error;}
    }
    async function startRecording({onTick,onLimit}={}) {
        if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw fail('recording-unsupported');
        const epoch=generation, stream=await navigator.mediaDevices.getUserMedia({audio:true});
        if(epoch!==generation){stream.getTracks().forEach(t=>t.stop());throw fail('cancelled');}
        const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(value=>MediaRecorder.isTypeSupported(value));
        const recording=new MediaRecorder(stream,mime?{mimeType:mime}:undefined),chunks=[];let seconds=0,finished=false;
        const timer=setInterval(()=>{onTick?.(++seconds);if(seconds>=120)onLimit?.();},1000);
        recording.addEventListener('dataavailable',event=>{if(event.data.size)chunks.push(event.data);});
        const cleanup=()=>{clearInterval(timer);stream.getTracks().forEach(t=>t.stop());if(recorder===controller)recorder=null;};
        const controller={
            stop(){if(finished)return Promise.reject(fail('recording-ended'));finished=true;return new Promise((resolve,reject)=>{recording.addEventListener('stop',async()=>{cleanup();try{const type=recording.mimeType.split(';')[0],ext=type.includes('mp4')?'m4a':type.includes('ogg')?'ogg':'webm';const result=await prepare(new File(chunks,'Messaggio vocale.'+ext,{type}));resolve({...result,duration:Math.max(1,seconds)});}catch(error){reject(error);}},{once:true});recording.stop();});},
            cancel(){if(!finished){finished=true;recording.stop();}cleanup();}
        }; recorder=controller; recording.start(250);return controller;
    }
    async function transcribe(source,onProgress) {
        if(worker)throw fail('transcription-busy');const epoch=generation;
        const blob=source instanceof Blob?source:await (await fetch(source)).blob();
        const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw fail('transcription-unsupported');
        const ctx=new Audio();let decoded;try{decoded=await ctx.decodeAudioData(await blob.arrayBuffer());}finally{await ctx.close();}
        if(decoded.duration>300)throw fail('audio-too-long');
        const offline=new OfflineAudioContext(1,Math.ceil(decoded.duration*16000),16000),buffer=offline.createBufferSource();buffer.buffer=decoded;buffer.connect(offline.destination);buffer.start();const pcm=(await offline.startRendering()).getChannelData(0);
        if(epoch!==generation)throw fail('cancelled');
        return new Promise((resolve,reject)=>{
            worker=new Worker('messages-transcription-worker.js?v=20261111',{type:'module'});rejectTranscript=reject;
            const finish=()=>{worker?.terminate();worker=null;rejectTranscript=null;};
            worker.onmessage=event=>{if(event.data.type==='progress')onProgress?.(event.data.value);else if(event.data.type==='result'){finish();resolve(event.data.text);}else if(event.data.type==='error'){finish();reject(fail('transcription-failed'));}};
            worker.onerror=()=>{finish();reject(fail('transcription-failed'));};worker.postMessage({audio:pcm},[pcm.buffer]);
        });
    }
    function destroy(){++generation;recorder?.cancel();worker?.terminate();worker=null;rejectTranscript?.(fail('cancelled'));rejectTranscript=null;for(const url of resolvedUrls)URL.revokeObjectURL(url);resolvedUrls.clear();urls.clear();}
    window.HarzafiMessageMedia={prepare,upload,load,startRecording,transcribe,destroy,canRecord:()=>!!(navigator.mediaDevices?.getUserMedia&&window.MediaRecorder)};
})();
