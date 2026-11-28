(function () {
    'use strict';
    const players = new Set();
    const make = (tag, name) => { const element = document.createElement(tag); if (name) element.className = name; return element; };
    const clock = seconds => { const value = Math.max(0, Math.ceil(Number.isFinite(seconds) ? seconds : 0)); return String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0'); };
    const playbackPaths = {"play":"m 23.7555 36.6237 c 0.4478 0 0.8598 -0.1343 1.4241 -0.4568 l 10.9178 -6.3322 c 0.8598 -0.5016 1.3614 -1.021 1.3614 -1.8361 c 0 -0.8061 -0.5016 -1.3255 -1.3614 -1.8271 l -10.9178 -6.3322 c -0.5643 -0.3314 -0.9762 -0.4657 -1.4241 -0.4657 c -0.9315 0 -1.7555 0.7165 -1.7555 1.9435 v 13.3629 c 0 1.227 0.824 1.9435 1.7555 1.9435 Z","pause":"m 21.7334 36.67 h 2.5342 c 1.1483 0 1.7324 -0.5796 1.7324 -1.7193 v -13.9015 c 0 -1.12 -0.5841 -1.6898 -1.7324 -1.7193 h -2.5342 c -1.1483 0 -1.7324 0.5698 -1.7324 1.7193 v 13.9015 c -0.0297 1.1396 0.5544 1.7193 1.7324 1.7193 Z m 9.9992 0 h 2.5347 c 1.1485 0 1.7327 -0.5796 1.7327 -1.7193 v -13.9015 c 0 -1.12 -0.5842 -1.7193 -1.7327 -1.7193 h -2.5347 c -1.1485 0 -1.7327 0.5698 -1.7327 1.7193 v 13.9015 c 0 1.1396 0.5545 1.7193 1.7327 1.7193 Z"};
    function icon(kind) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 56 56'); svg.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS(svg.namespaceURI, 'path');
        path.setAttribute('d', playbackPaths[kind] || playbackPaths.play);
        svg.append(path); return svg;
    }
    function wave(count = 48) {
        const element = make('span', 'audio-wave'), base = make('span', 'audio-wave-bars'), fill = make('span', 'audio-wave-bars audio-wave-fill');
        element.style.setProperty('--wave-count', count);
        element.setAttribute('aria-hidden', 'true');
        const values = Array(count).fill(.06);
        const bars = [base, fill].map(layer => values.map(() => { const bar = make('i'); layer.append(bar); return bar; }));
        element.append(base, fill);
        function set(next) { values.splice(0, count, ...next.slice(0, count)); for (const layer of bars) layer.forEach((bar, i) => { bar.style.height = Math.max(2, (values[i] || .06) * 28) + 'px'; }); }
        set(values);
        return { element, set, push(value) { set([...values.slice(1), Math.max(.06, value)]); }, progress(value) { element.style.setProperty('--played', Math.max(0, Math.min(100, value * 100)) + '%'); } };
    }
    let playbackRequest = 0;
    function player({ source, duration = 0, media = window.HarzafiMessageMedia } = {}) {
        const element = make('div', 'audio-player'), audio = make('audio'), play = make('button', 'audio-play'), timeline = make('div', 'audio-timeline'), waveform = wave(), seek = make('input', 'audio-seek'), time = make('span', 'audio-time'), status = make('span', 'audio-player-status sr-only');
        audio.preload = 'auto'; audio.hidden = true; audio.setAttribute('aria-hidden', 'true');
        play.type = 'button'; play.setAttribute('aria-label', 'Riproduci vocale'); play.append(icon('play'));
        seek.type = 'range'; seek.min = '0'; seek.max = '1000'; seek.step = '1'; seek.value = '0'; seek.disabled = true; seek.setAttribute('aria-label', 'Posizione del vocale'); seek.setAttribute('aria-valuetext', '00:00');
        time.textContent = clock(duration); time.setAttribute('aria-hidden', 'true'); status.setAttribute('role', 'status');
        timeline.append(waveform.element, seek); element.append(audio, play, timeline, time, status);
        let prepared, disposed = false, wanted = false, frame, knownDuration = duration, playIntent = 0;
        const length = () => Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : knownDuration;
        const sync = () => { const total = length(), position = audio.currentTime || 0; waveform.progress(total ? position / total : 0); seek.value = String(total ? Math.round(position / total * 1000) : 0); seek.setAttribute('aria-valuetext', clock(position) + ' di ' + clock(total)); time.textContent = clock(audio.ended ? total : total - position); };
        const tick = () => { sync(); if (!audio.paused && !disposed) frame = requestAnimationFrame(tick); };
        const appearance = () => { const playing = !audio.paused && !audio.ended; play.replaceChildren(icon(playing ? 'pause' : 'play')); play.setAttribute('aria-label', playing ? 'Metti in pausa il vocale' : 'Riproduci vocale'); element.classList.toggle('is-playing', playing); cancelAnimationFrame(frame); if (playing) tick(); else sync(); };
        async function prepare() {
            if (prepared) return prepared;
            element.dataset.state = 'loading'; status.textContent = 'Preparo il vocale…';
            prepared = Promise.resolve().then(source).then(url => {
                if (disposed) return;
                audio.src = url; audio.load(); seek.disabled = false; element.dataset.state = 'ready'; status.textContent = '';
                media?.waveform?.(url).then(result => { if (!disposed) { waveform.set(result.values); knownDuration = result.duration || knownDuration; sync(); } }).catch(() => {});
                return url;
            }).catch(error => { prepared = null; if (!disposed) { element.dataset.state = 'error'; status.textContent = 'Vocale non disponibile. Premi Riproduci per riprovare.'; } throw error; });
            return prepared;
        }
        play.addEventListener('click', async () => {
            if (!audio.paused || wanted) { ++playIntent; wanted = false; audio.pause(); return; }
            wanted = true;
            const request = ++playbackRequest, intent = ++playIntent;
            try { await prepare(); if (disposed || !wanted || intent !== playIntent || request !== playbackRequest) return; if (audio.ended) audio.currentTime = 0; await audio.play(); }
            catch (_) { if (!disposed && intent === playIntent && request === playbackRequest) status.textContent = 'Non è stato possibile riprodurre il vocale. Tocca per riprovare.'; }
            finally { if (intent === playIntent) wanted = false; }
        });
        audio.addEventListener('play', () => { for (const other of players) if (other !== audio) other.pause(); appearance(); });
        for (const name of ['pause', 'ended', 'loadedmetadata', 'durationchange', 'timeupdate']) audio.addEventListener(name, appearance);
        audio.addEventListener('error', () => { if (!disposed) { element.dataset.state = 'error'; status.textContent = 'Questo formato audio non può essere riprodotto dal browser.'; } });
        seek.addEventListener('input', () => { const total = length(); if (total && Number.isFinite(total)) { audio.currentTime = Number(seek.value) / 1000 * total; sync(); } });
        players.add(audio);
        return { element, audio, prepare, destroy() { if (disposed) return; disposed = true; ++playIntent; wanted = false; cancelAnimationFrame(frame); players.delete(audio); audio.pause(); audio.removeAttribute('src'); audio.load(); } };
    }
    window.HarzafiMessageAudio = { player, wave, clock };
})();
