(function () {
    'use strict';
    const urls = new Map(),
        resolvedUrls = new Set();
    let generation = 0,
        activityGeneration = 0,
        recorder,
        worker,
        rejectTranscript,
        transcriptionBusy = false;
    const model = () => window.HarzafiMessages;
    const fail = (code) => Object.assign(new Error(code), { code });
    const filename = (value) =>
        String(value || 'Allegato')
            .replace(/[\x00-\x1f\x7f/\\]/g, '_')
            .slice(0, 180);
    async function prepare(file) {
        let mime = file.type.split(';')[0].toLowerCase(),
            kind = model().mediaKind(mime);
        if (!kind || !file.size || file.size > 30 * 1024 * 1024) throw fail('unsupported-file');
        if (kind === 'image') {
            const bitmap = await createImageBitmap(file),
                scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            bitmap.close();
            let blob;
            for (const quality of [0.84, 0.72, 0.58]) {
                blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
                if (blob && blob.size <= 1.5 * 1024 * 1024) break;
            }
            if (!blob) throw fail('image-unavailable');
            file = new File([blob], filename(file.name).replace(/\.[^.]+$/, '') + '.jpg', {
                type: 'image/jpeg',
            });
            mime = file.type;
        }
        if (file.size > model().MEDIA_LIMITS[kind]) throw fail('file-too-large');
        return { file, name: filename(file.name), mime, size: file.size, type: kind };
    }
    function base64(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192)
            binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return btoa(binary);
    }
    async function upload(cid, mid, prepared, onProgress, store) {
        const epoch = activityGeneration,
            bytes = new Uint8Array(await prepared.file.arrayBuffer()),
            chunkSize = model().RAW_CHUNK_BYTES,
            totalChunks = Math.ceil(bytes.length / chunkSize);
        const check = () => {
            if (epoch !== activityGeneration) throw fail('cancelled');
        };
        check();
        await store.createUpload(cid, mid, {
            kind: prepared.type,
            name: prepared.name,
            mime: prepared.mime,
            size: bytes.length,
            totalChunks,
        });
        for (let index = 0; index < totalChunks; index++) {
            check();
            await store.putUploadChunk(
                cid,
                mid,
                index,
                base64(bytes.subarray(index * chunkSize, (index + 1) * chunkSize)),
            );
            onProgress?.(Math.round(((index + 1) / totalChunks) * 100));
        }
        check();
        await store.completeUpload(cid, mid);
        check();
        const safeName = prepared.name.replace(/[^A-Za-z0-9_.-]/g, '_');
        const attachment = {
            backend: 'firestore',
            path: `message_media/${cid}/${mid}/${safeName}`,
            name: prepared.name,
            mime: prepared.mime,
            size: bytes.length,
            ...(prepared.duration ? { duration: prepared.duration } : {}),
        };
        // The sender already has the bytes. Reuse them for immediate playback after sending.
        const url = URL.createObjectURL(prepared.file);
        resolvedUrls.add(url);
        urls.set(store.uid + ':' + attachment.path, Promise.resolve(url));
        return attachment;
    }
    async function load(attachment, store) {
        const epoch = generation,
            parts = String(attachment.path).split('/');
        if (parts.length !== 4 || parts[0] !== 'message_media' || !parts[1] || !parts[2])
            throw fail('invalid-attachment');
        const key = store.uid + ':' + attachment.path;
        if (urls.has(key)) return urls.get(key);
        const promise = (async () => {
            const saved = await store.getUpload(parts[1], parts[2]),
                metadata = saved.data();
            if (
                !saved.exists ||
                !metadata.complete ||
                metadata.size !== attachment.size ||
                metadata.mime !== attachment.mime ||
                metadata.totalChunks > model().MAX_CHUNKS
            )
                throw fail('attachment-unavailable');
            const chunks = await store.getUploadChunks(parts[1], parts[2]);
            if (chunks.docs.length !== metadata.totalChunks) throw fail('attachment-incomplete');
            const output = new Uint8Array(metadata.size);
            let offset = 0;
            chunks.docs.forEach((doc, index) => {
                const value = doc.data();
                if (value.index !== index || value.data.length > model().BASE64_CHUNK_CHARS)
                    throw fail('invalid-chunk');
                const binary = atob(value.data);
                if (offset + binary.length > output.length) throw fail('invalid-chunk');
                for (let i = 0; i < binary.length; i++) output[offset++] = binary.charCodeAt(i);
            });
            if (offset !== output.length || epoch !== generation) throw fail('cancelled');
            const url = URL.createObjectURL(new Blob([output], { type: metadata.mime }));
            resolvedUrls.add(url);
            return url;
        })();
        urls.set(key, promise);
        try {
            return await promise;
        } catch (error) {
            urls.delete(key);
            throw error;
        }
    }
    async function decodeAudio(source) {
        const blob = source instanceof Blob ? source : await (await fetch(source)).blob();
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) throw fail('audio-unsupported');
        const context = new Audio();
        try { return await context.decodeAudioData(await blob.arrayBuffer()); }
        finally { await context.close(); }
    }
    async function waveform(source, count = 48) {
        const buffer = await decodeAudio(source), samples = buffer.getChannelData(0), values = [];
        for (let i = 0; i < count; i++) {
            const start = Math.floor(i * samples.length / count), end = Math.floor((i + 1) * samples.length / count);
            let sum = 0, n = 0;
            for (let j = start; j < end; j += Math.max(1, Math.floor((end - start) / 300))) { sum += samples[j] ** 2; n++; }
            values.push(Math.sqrt(sum / Math.max(1, n)));
        }
        const peak = Math.max(.001, ...values);
        return { values:values.map(value => Math.max(.06, value / peak)), duration:buffer.duration };
    }
    async function mergeRecordings(segments) {
        if (segments.length === 1) return segments[0];
        const buffers = [];
        for (const segment of segments) buffers.push(await decodeAudio(segment.file));
        const duration = buffers.reduce((sum, buffer) => sum + buffer.duration, 0), rate = 16000;
        if (!duration || duration > 122) throw fail('audio-too-long');
        const context = new OfflineAudioContext(1, Math.ceil(duration * rate), rate);
        let offset = 0;
        for (const buffer of buffers) { const source = context.createBufferSource(); source.buffer = buffer; source.connect(context.destination); source.start(offset); offset += buffer.duration; }
        const samples = (await context.startRendering()).getChannelData(0), output = new ArrayBuffer(44 + samples.length * 2), view = new DataView(output);
        const write = (at, value) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
        write(0, 'RIFF'); view.setUint32(4, output.byteLength - 8, true); write(8, 'WAVE'); write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, samples.length * 2, true);
        samples.forEach((value, index) => view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, value)) * (value < 0 ? 32768 : 32767), true));
        return { ...await prepare(new File([output], 'Messaggio vocale.wav', { type:'audio/wav' })), duration };
    }
    async function startRecording({ onTick, onLevel, onLimit, maxSeconds = 120 } = {}) {
        if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
            throw fail('recording-unsupported');
        const epoch = generation,
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (epoch !== generation) {
            stream.getTracks().forEach((t) => t.stop());
            throw fail('cancelled');
        }
        const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((value) =>
            MediaRecorder.isTypeSupported(value),
        );
        let recording;
        try { recording = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
        catch (error) { stream.getTracks().forEach(track => track.stop()); throw error; }
        const chunks = [];
        let seconds = 0, finished = false, audioContext, analyser, frame;
        const started = performance.now();
        try {
            const Audio = window.AudioContext || window.webkitAudioContext;
            audioContext = new Audio(); analyser = audioContext.createAnalyser(); analyser.fftSize = 512;
            audioContext.createMediaStreamSource(stream).connect(analyser);
            await audioContext.resume();
            const samples = new Float32Array(analyser.fftSize); let lastLevel = 0;
            const draw = now => {
                if (finished) return;
                if (now - lastLevel > 60) { analyser.getFloatTimeDomainData(samples); let sum = 0; for (const value of samples) sum += value * value; onLevel?.(Math.min(1, Math.sqrt(sum / samples.length) * 5)); lastLevel = now; }
                frame = requestAnimationFrame(draw);
            };
            frame = requestAnimationFrame(draw);
        } catch (_) { audioContext?.close().catch(() => {}); audioContext = null; }
        let limitReached = false;
        const timer = setInterval(() => {
            seconds = Math.min(maxSeconds, (performance.now() - started) / 1000);
            onTick?.(seconds);
            if (seconds >= maxSeconds && !limitReached) { limitReached = true; onLimit?.(); }
        }, 100);
        recording.addEventListener('dataavailable', (event) => {
            if (event.data.size) chunks.push(event.data);
        });
        const cleanup = () => {
            clearInterval(timer);
            cancelAnimationFrame(frame);
            audioContext?.close().catch(() => {});
            stream.getTracks().forEach((t) => t.stop());
            if (recorder === controller) recorder = null;
        };
        const controller = {
            stop() {
                if (finished) return Promise.reject(fail('recording-ended'));
                finished = true;
                return new Promise((resolve, reject) => {
                    recording.addEventListener(
                        'stop',
                        async () => {
                            cleanup();
                            try {
                                const type = recording.mimeType.split(';')[0],
                                    ext = type.includes('mp4')
                                        ? 'm4a'
                                        : type.includes('ogg')
                                          ? 'ogg'
                                          : 'webm';
                                const result = await prepare(
                                    new File(chunks, 'Messaggio vocale.' + ext, { type }),
                                );
                                resolve({ ...result, duration: Math.max(.1, Math.min(maxSeconds, (performance.now() - started) / 1000)) });
                            } catch (error) {
                                reject(error);
                            }
                        },
                        { once: true },
                    );
                    try { recording.stop(); } catch (error) { cleanup(); reject(error); }
                });
            },
            cancel() {
                if (!finished) {
                    finished = true;
                    if (recording.state !== 'inactive') recording.stop();
                }
                cleanup();
            },
        };
        recorder = controller;
        try { recording.start(250); } catch (error) { finished = true; cleanup(); throw error; }
        return controller;
    }
    async function transcribe(source, onProgress, { language = 'italian' } = {}) {
        if (transcriptionBusy) throw fail('transcription-busy');
        const epoch = activityGeneration;
        transcriptionBusy = true;
        try {
            const blob = source instanceof Blob ? source : await (await fetch(source)).blob();
            const Audio = window.AudioContext || window.webkitAudioContext;
            if (!Audio) throw fail('transcription-unsupported');
            const ctx = new Audio();
            let decoded;
            try {
                decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
            } finally {
                await ctx.close();
            }
            if (decoded.duration > 300) throw fail('audio-too-long');
            const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000),
                buffer = offline.createBufferSource();
            buffer.buffer = decoded;
            buffer.connect(offline.destination);
            buffer.start();
            const pcm = (await offline.startRendering()).getChannelData(0);
            if (epoch !== activityGeneration) throw fail('cancelled');
            return await new Promise((resolve, reject) => {
                worker = new Worker('messages-transcription-worker.js?v=20261113', { type: 'module' });
                rejectTranscript = reject;
                const finish = () => {
                    worker?.terminate();
                    worker = null;
                    rejectTranscript = null;
                };
                worker.onmessage = (event) => {
                    if (event.data.type === 'progress') onProgress?.(event.data.value);
                    else if (event.data.type === 'result') {
                        finish();
                        resolve(event.data.text);
                    } else if (event.data.type === 'error') {
                        finish();
                        reject(fail('transcription-failed'));
                    }
                };
                worker.onerror = () => {
                    finish();
                    reject(fail('transcription-failed'));
                };
                worker.postMessage({ audio: pcm, language }, [pcm.buffer]);
            });
        } finally {
            if (epoch === activityGeneration) transcriptionBusy = false;
        }
    }
    function cancelActivity() {
        ++activityGeneration;
        transcriptionBusy = false;
        recorder?.cancel();
        worker?.terminate();
        worker = null;
        rejectTranscript?.(fail('cancelled'));
        rejectTranscript = null;
    }
    function destroy() {
        ++generation;
        cancelActivity();
        for (const url of resolvedUrls) URL.revokeObjectURL(url);
        resolvedUrls.clear();
        urls.clear();
    }
    window.HarzafiMessageMedia = {
        prepare,
        upload,
        load,
        startRecording,
        transcribe,
        waveform,
        mergeRecordings,
        cancelActivity,
        destroy,
        canRecord: () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder),
    };
})();
