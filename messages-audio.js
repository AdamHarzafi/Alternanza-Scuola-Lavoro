(function () {
    'use strict';
    const players = new Set();
    const make = (tag, name) => { const element = document.createElement(tag); if (name) element.className = name; return element; };
    const clock = seconds => { const value = Math.max(0, Math.ceil(Number.isFinite(seconds) ? seconds : 0)); return String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0'); };
    function icon(kind) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS(svg.namespaceURI, 'path');
        path.setAttribute('d', kind === 'pause' ? 'M7 5h3v14H7zm7 0h3v14h-3z' : 'M8 4.8c-.7-.4-1.5.1-1.5.9v12.6c0 .8.8 1.3 1.5.9l10.2-6.3a1.1 1.1 0 0 0 0-1.8z');
        svg.append(path); return svg;
    }
    function wave(count = 48) {
        const element = make('span', 'audio-wave'), base = make('span', 'audio-wave-bars'), fill = make('span', 'audio-wave-bars audio-wave-fill');
        element.setAttribute('aria-hidden', 'true');
        const values = Array(count).fill(.06);
        const bars = [base, fill].map(layer => values.map(() => { const bar = make('i'); layer.append(bar); return bar; }));
        element.append(base, fill);
        function set(next) { values.splice(0, count, ...next.slice(0, count)); for (const layer of bars) layer.forEach((bar, i) => { bar.style.height = Math.max(2, (values[i] || .06) * 28) + 'px'; }); }
        set(values);
        return { element, set, push(value) { set([...values.slice(1), Math.max(.06, value)]); }, progress(value) { element.style.setProperty('--played', Math.max(0, Math.min(100, value * 100)) + '%'); } };
    }
    function player({ source, duration = 0, media = window.HarzafiMessageMedia } = {}) {
        const element = make('div', 'audio-player'), audio = make('audio'), play = make('button', 'audio-play'), timeline = make('div', 'audio-timeline'), waveform = wave(), seek = make('input', 'audio-seek'), time = make('span', 'audio-time'), status = make('span', 'audio-player-status sr-only');
        audio.preload = 'auto'; audio.hidden = true; audio.setAttribute('aria-hidden', 'true');
        play.type = 'button'; play.setAttribute('aria-label', 'Riproduci vocale'); play.append(icon('play'));
        seek.type = 'range'; seek.min = '0'; seek.max = '1000'; seek.step = '1'; seek.value = '0'; seek.disabled = true; seek.setAttribute('aria-label', 'Posizione del vocale'); seek.setAttribute('aria-valuetext', '00:00');
        time.textContent = clock(duration); time.setAttribute('aria-hidden', 'true'); status.setAttribute('role', 'status');
        timeline.append(waveform.element, seek); element.append(audio, play, timeline, time, status);
        let prepared, disposed = false, wanted = false, frame, knownDuration = duration;
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
            if (!audio.paused || wanted) { wanted = false; audio.pause(); return; }
            wanted = true;
            try { await prepare(); if (disposed || !wanted) return; if (audio.ended) audio.currentTime = 0; await audio.play(); }
            catch (_) { if (!disposed) status.textContent = 'Non è stato possibile riprodurre il vocale. Tocca per riprovare.'; }
            finally { wanted = false; }
        });
        audio.addEventListener('play', () => { for (const other of players) if (other !== audio) other.pause(); appearance(); });
        for (const name of ['pause', 'ended', 'loadedmetadata', 'durationchange', 'timeupdate']) audio.addEventListener(name, appearance);
        audio.addEventListener('error', () => { if (!disposed) { element.dataset.state = 'error'; status.textContent = 'Questo formato audio non può essere riprodotto dal browser.'; } });
        seek.addEventListener('input', () => { const total = length(); if (total && Number.isFinite(total)) { audio.currentTime = Number(seek.value) / 1000 * total; sync(); } });
        players.add(audio);
        return { element, audio, prepare, destroy() { if (disposed) return; disposed = true; wanted = false; cancelAnimationFrame(frame); players.delete(audio); audio.pause(); audio.removeAttribute('src'); audio.load(); } };
    }
    window.HarzafiMessageAudio = { player, wave, clock };
})();
