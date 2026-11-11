import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
self.onmessage = async event => {
    try {
        const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {device:'wasm',dtype:'q8',progress_callback:value=>self.postMessage({type:'progress',value:value.progress || 0})});
        const result = await transcriber(event.data.audio, {chunk_length_s:25,stride_length_s:5,task:'transcribe'});
        self.postMessage({type:'result',text:String(result.text || '').trim()});
        await transcriber.dispose();
    } catch (_) { self.postMessage({type:'error'}); }
};
