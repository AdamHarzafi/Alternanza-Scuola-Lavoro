/* Loaded early: pagereveal must be registered before the first render. */
(() => {
    'use strict';
    const root = document.documentElement;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const nativePages = typeof document.startViewTransition === 'function' && 'onpagereveal' in window && 'onpageswap' in window;
    const running = new Map(), ghosts = new Set();
    const HINT = 'harzafi_page_motion';
    let arrival = false, activeView = null, epoch = 0;
    const enabled = () => !preference.matches && document.visibilityState !== 'hidden' && typeof Element.prototype.animate === 'function';
    const direction = value => { root.dataset.pageMotionDirection = value === 'back' ? 'back' : 'forward'; };
    const historyDirection = activation => {
        const from = activation?.from?.index, to = activation?.entry?.index;
        return activation?.navigationType === 'traverse' && Number.isFinite(from) && Number.isFinite(to) && to < from ? 'back' : 'forward';
    };
    function remember(target, value) {
        try {
            if (target.origin === location.origin) sessionStorage.setItem(HINT, JSON.stringify({to:target.pathname,direction:value,at:Date.now()}));
        } catch (_) { /* Motion works when browser storage is disabled. */ }
    }
    function readHint() {
        try {
            const value = JSON.parse(sessionStorage.getItem(HINT) || 'null'); sessionStorage.removeItem(HINT);
            const age = Date.now() - value?.at;
            if (value?.to === location.pathname && age >= 0 && age < 12000) return value.direction;
        } catch (_) { /* No navigation state is required for readable content. */ }
        return null;
    }
    const initialHint = readHint();
    direction(initialHint);
    function cancel() {
        ++epoch;
        running.forEach(animation => animation.cancel()); running.clear();
        ghosts.forEach(element => element.remove()); ghosts.clear();
        activeView?.skipTransition(); activeView = null;
    }
    function animate(element, frames, options) {
        if (!element || !enabled() || !element.isConnected) return null;
        running.get(element)?.cancel();
        const animation = element.animate(frames, {duration:420,easing:'cubic-bezier(.22,1,.36,1)',fill:'none',...options});
        running.set(element, animation);
        const done = () => { if (running.get(element) === animation) running.delete(element); };
        animation.finished.then(done, done);
        return animation;
    }
    function enter(element, {distance=10,opacity=.3,duration=420,axis='y',back=false} = {}) {
        if (!element || !element.getClientRects().length) return;
        const offset = distance * (back ? -1 : 1);
        const from = {opacity}, to = {opacity:1};
        if (element !== document.body && window.CSS?.supports('translate','0 1px')) {
            from.translate = axis === 'x' ? offset + 'px 0' : '0 ' + offset + 'px'; to.translate = '0 0';
        }
        animate(element, [from,to], {duration});
    }
    function fadeSpinner(host) {
        if (!enabled() || !document.body) return;
        const spinner = host?.matches('.apple-ios14-spinner') ? host : host?.querySelector('.apple-ios14-spinner');
        if (!spinner || !spinner.getClientRects().length) return;
        const rect = spinner.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        // Only the decorative eight-blade glyph is cloned, never account text or inputs.
        const ghost = spinner.cloneNode(true);
        ghost.classList.add('page-loading-ghost'); ghost.setAttribute('aria-hidden','true'); ghost.inert = true;
        ghost.style.left = rect.left + 'px'; ghost.style.top = rect.top + 'px';
        ghost.style.setProperty('--apple-spinner-size', rect.width + 'px');
        ghost.style.color = getComputedStyle(spinner).color;
        ghost.style.animation = 'none';
        document.body.appendChild(ghost); ghosts.add(ghost);
        try {
            const old = spinner.getAnimations({subtree:true}), fresh = ghost.getAnimations({subtree:true});
            fresh.forEach((animation,index) => { if (old[index]?.currentTime != null) animation.currentTime = old[index].currentTime; });
        } catch (_) { /* Decorative phase sync is optional. */ }
        const animation = animate(ghost, [{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.82)'}], {duration:160,easing:'ease-out'});
        const remove = () => { ghosts.delete(ghost); ghost.remove(); };
        if (animation) animation.finished.then(remove,remove); else remove();
    }
    function complete(host, content) {
        if (!enabled()) return;
        fadeSpinner(host);
        const version = epoch;
        requestAnimationFrame(() => { if (version === epoch) enter(content,{duration:460,distance:12,opacity:.35}); });
    }
    function transition(update, {back=false,guard=()=>true} = {}) {
        if (!guard()) return;
        activeView?.skipTransition(); activeView = null;
        direction(back ? 'back' : 'forward');
        if (enabled() && typeof document.startViewTransition === 'function') {
            try {
                const view = document.startViewTransition(() => { if (guard()) update(); });
                activeView = view;
                view.ready.catch(() => {});
                view.updateCallbackDone.catch(() => {});
                view.finished.then(() => { if (activeView === view) activeView = null; }, () => { if (activeView === view) activeView = null; });
                return;
            } catch (_) { /* Standard navigation remains available without native transitions. */ }
        }
        const target = update();
        if (guard()) enter(target,{axis:'x',back,distance:12});
    }
    window.HarzafiMotion = {enter,complete,transition,cancel};
    window.addEventListener('pageswap', event => {
        const activation = event.activation;
        const value = historyDirection(activation); direction(value);
        if (activation?.entry?.url) { try { remember(new URL(activation.entry.url),value); } catch (_) {} }
        if (preference.matches) event.viewTransition?.skipTransition();
        event.viewTransition?.ready.catch(() => {});
    });
    window.addEventListener('pagereveal', event => {
        const activation = window.navigation?.activation;
        const hint = readHint() || initialHint;
        direction(activation?.from ? historyDirection(activation) : hint || 'forward');
        arrival = !!event.viewTransition && !preference.matches;
        if (preference.matches) event.viewTransition?.skipTransition();
        event.viewTransition?.ready.catch(() => {});
    });
    window.addEventListener('pageshow', event => {
        if (event.persisted) cancel();
        if (!arrival) enter(document.body,{distance:0,opacity:.8,duration:320});
    });
    window.addEventListener('pagehide', () => { cancel(); arrival = false; });
    preference.addEventListener('change', event => { if (event.matches) cancel(); });
    window.addEventListener('scroll', () => { ghosts.forEach(element => element.remove()); ghosts.clear(); }, {passive:true,capture:true});
    document.addEventListener('focusin', event => {
        running.forEach((animation,element) => { if (element.contains(event.target)) { animation.cancel(); running.delete(element); } });
    });
    document.addEventListener('click', event => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
        const link = event.target.closest?.('a[href]');
        if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
        let url;
        try { url = new URL(link.href,location.href); } catch (_) { return; }
        if (!/^https?:$/.test(url.protocol) || url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
        if (!url.pathname.endsWith('/') && !/\.html$/i.test(url.pathname)) return;
        const back = /torna|indietro/i.test(link.getAttribute('aria-label') || link.textContent || '');
        remember(url,back ? 'back' : 'forward');
        // No click interception, synthetic history entries or navigation delay.
        if (!nativePages && enabled()) animate(document.body,[{opacity:1},{opacity:.7}],{duration:150,easing:'ease-out'});
    });
})();
