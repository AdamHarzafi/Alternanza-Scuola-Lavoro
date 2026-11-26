(function () {
    'use strict';
    const labels = {big:'Grande', small:'Piccolo', shake:'Scossa', nod:'Cenno', explode:'Esplosione', ripple:'Onda', bloom:'Fioritura', jitter:'Tremolio'};
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const played = new Set(), running = new Map(), waiting = new Map();
    const observer = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
            observer.unobserve(entry.target);
            const pending = waiting.get(entry.target); waiting.delete(entry.target);
            if (pending) play(entry.target, pending.effect, pending.key);
        }
    }, {threshold:0.2});
    function normalized(effect, text) {
        try { return window.HarzafiMessages.textEffect(effect, text); } catch (_) { return null; }
    }
    function text(element, value) {
        if (window.HarzafiEmoji) window.HarzafiEmoji.render(element, value);
        else element.textContent = value;
    }
    function render(element, value, effect) {
        element.replaceChildren();
        const selected = normalized(effect, value);
        if (!selected) { text(element, value); return; }
        const before = document.createElement('span'), range = document.createElement('span'), after = document.createElement('span');
        range.className = 'effect-range';
        text(before, value.slice(0, selected.start)); text(range, value.slice(selected.start, selected.end)); text(after, value.slice(selected.end));
        element.append(before, range, after);
    }
    function stop(element) {
        const item = running.get(element);
        if (!item) return;
        running.delete(element);
        for (const animation of item.animations) animation.cancel();
        text(item.range, item.value);
        element.classList.remove('effect-playing');
    }
    function frames(name, index, count) {
        const direction = index % 2 ? 1 : -1;
        switch (name) {
            case 'big': return [{transform:'scale(1)'},{transform:'scale(1.65)',offset:.4},{transform:'scale(1)'}];
            case 'small': return [{transform:'scale(1)'},{transform:'scale(.55)',offset:.4},{transform:'scale(1)'}];
            case 'shake': return [0,-5,5,-4,4,-2,2,0].map(x=>({transform:`translateX(${x}px) rotate(${x/2}deg)`}));
            case 'nod': return [0,7,-3,6,0].map(y=>({transform:`translateY(${y}px)`}));
            case 'explode': { const angle = index * 2.39996, distance = 12 + index % 4 * 5; return [{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${Math.cos(angle)*distance}px,${Math.sin(angle)*distance}px) rotate(${direction*16}deg) scale(1.2)`,opacity:.5,offset:.45},{transform:'translate(0,0) scale(1)',opacity:1}]; }
            case 'ripple': return [{transform:'translateY(0)'},{transform:'translateY(-7px)',offset:.3},{transform:'translateY(3px)',offset:.6},{transform:'translateY(0)'}];
            case 'bloom': return [{transform:'scale(1)',filter:'blur(0)'},{transform:'scale(1.35)',filter:'blur(.35px)',offset:.45},{transform:'scale(1)',filter:'blur(0)'}];
            case 'jitter': return [0,-2,2,-1,1,-2,2,0].map((v,i)=>({transform:`translate(${v}px,${i%2?v:0}px) rotate(${v*direction}deg)`}));
            default: return [{opacity:1},{opacity:1}];
        }
    }
    function play(element, effect, key = '') {
        if (!element.isConnected || document.hidden || reduced.matches || !element.animate) return;
        if (key && played.has(key)) return;
        const range = element.querySelector('.effect-range'); if (!range || !effect) return;
        stop(element);
        if (key) played.add(key);
        const value = range.textContent;
        const segments = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter(undefined, {granularity:'word'}).segment(value)].map(x=>x.segment) : value.split(/(\s+)/);
        // Bound the number of animated nodes even for a long message.
        const units = [];
        range.replaceChildren();
        for (const segment of segments) {
            if (!segment.trim() || units.length >= 80) {range.append(document.createTextNode(segment));continue;}
            const unit = document.createElement('span'); unit.className = 'effect-unit';
            text(unit, segment); range.append(unit); units.push(unit);
        }
        const animations = units.map((unit,i)=>unit.animate(frames(effect.name,i,units.length), {
            duration:effect.name==='jitter'?650:950,
            delay:['ripple','bloom','explode'].includes(effect.name) ? Math.min(i*28,420) : 0,
            easing:'cubic-bezier(.22,.7,.25,1)', fill:'backwards'
        }));
        const item = {animations, range, value}; running.set(element,item); element.classList.add('effect-playing');
        Promise.allSettled(animations.map(a=>a.finished)).then(()=>{if(running.get(element)===item)stop(element);});
    }
    function schedule(element, effect, key) {
        if (!effect || played.has(key) || reduced.matches) return;
        waiting.set(element,{effect,key}); observer.observe(element);
    }
    function cancelWithin(root) {
        for (const element of [...running.keys()]) if (root.contains(element)) stop(element);
        for (const element of [...waiting.keys()]) if (root.contains(element)) {observer.unobserve(element);waiting.delete(element);}
    }
    function clear() {
        for (const element of [...running.keys()]) stop(element);
        observer.disconnect(); waiting.clear(); played.clear();
    }
    reduced.addEventListener('change',()=>{if(reduced.matches){for(const element of [...running.keys()])stop(element);observer.disconnect();waiting.clear();}});
    window.HarzafiTextEffects = {labels, render, play, schedule, cancelWithin, clear};
})();
