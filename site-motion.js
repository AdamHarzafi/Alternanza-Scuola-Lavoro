/* Shared, progressive motion: subtle page transitions and scroll reveals. */
(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const canAnimate = typeof Element.prototype.animate === 'function';
    const played = new WeakSet();
    const running = new Map();
    const selector = 'h1, .account-hero-logo, .account-belief > img, .account-belief > h2, .account-belief > p, .legal-editorial-page .privacy-hero-logo, .legal-overview, .legal-editorial-page .privacy-policy-card, .legal-editorial-page .privacy-contact-strip, main article, main details, .harzafi-footer-inner';

    if (!preference.matches && canAnimate) {
        // A short, low-amplitude entrance uses only composited properties.
        if (document.body && document.visibilityState === 'visible') {
            document.body.animate([
                { opacity: .94, transform: 'translate3d(0, 4px, 0)' },
                { opacity: 1, transform: 'translate3d(0, 0, 0)' }
            ], { duration: 320, easing: 'cubic-bezier(.22, .68, 0, 1)', fill: 'none' });
        }

        // Animate the home artwork as soon as its pixels are ready, without
        // waiting for an intersection observer or hiding it during download.
        const heroArtwork = document.querySelector('.hero-cover-image');
        if (heroArtwork) {
            const playHeroEntrance = () => {
                if (preference.matches || !heroArtwork.naturalWidth) return;
                heroArtwork.animate([
                    { opacity: .48, transform: 'translate3d(0, 18px, 0) scale(1.065)' },
                    { opacity: 1, transform: 'translate3d(0, -1px, 0) scale(.998)', offset: .78 },
                    { opacity: 1, transform: 'scale(1)' }
                ], {
                    duration: 820,
                    easing: 'cubic-bezier(.4,0,.2,1)',
                    fill: 'none'
                });
            };

            if (heroArtwork.complete) requestAnimationFrame(playHeroEntrance);
            else heroArtwork.addEventListener('load', playHeroEntrance, { once: true });
        }

        let navigationPending = false;
        let navigationAnimation = null;
        let pendingUrl = '';

        const isEligibleNavigation = (event, anchor) => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
            if (anchor.hasAttribute('download') || anchor.hasAttribute('data-no-page-transition')) return false;
            if (anchor.target && anchor.target.toLowerCase() !== '_self') return false;

            let destination;
            try { destination = new URL(anchor.href, window.location.href); }
            catch { return false; }

            if (destination.origin !== window.location.origin || !['http:', 'https:'].includes(destination.protocol)) return false;
            if (destination.href === window.location.href) return false;
            if (destination.pathname === window.location.pathname && destination.search === window.location.search && destination.hash) return false;
            return true;
        };

        // Listen at window bubble phase so page-specific handlers can cancel first.
        window.addEventListener('click', (event) => {
            const target = event.target instanceof Element ? event.target : event.target?.parentElement;
            const anchor = target?.closest('a[href]');
            if (!anchor || !isEligibleNavigation(event, anchor) || navigationPending) return;

            event.preventDefault();
            navigationPending = true;
            pendingUrl = new URL(anchor.href, window.location.href).href;
            navigationAnimation = document.body.animate([
                { opacity: 1, transform: 'translate3d(0, 0, 0)' },
                { opacity: .94, transform: 'translate3d(0, -3px, 0)' }
            ], { duration: 160, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' });
            navigationAnimation.finished
                .catch(() => {})
                .then(() => {
                    if (!navigationPending) return;
                    const destination = pendingUrl;
                    navigationPending = false;
                    pendingUrl = '';
                    window.location.assign(destination);
                });
        });

        window.addEventListener('pageshow', () => {
            navigationPending = false;
            navigationAnimation = null;
            pendingUrl = '';
        });

        preference.addEventListener('change', (event) => {
            if (!event.matches || !navigationPending) return;
            navigationAnimation?.cancel();
        });
    }

    if (!('IntersectionObserver' in window) || !canAnimate) return;

    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const element = entry.target;
            observer.unobserve(element);
            if (played.has(element) || preference.matches) return;
            played.add(element);
            // Existing reveal components keep their own established animation.
            if (element.classList.contains('reveal')) return;
            const animation = element.animate([
                { opacity: .2, translate: '0 16px' },
                { opacity: 1, translate: '0 0' }
            ], { duration: 600, easing: 'cubic-bezier(.22,.68,0,1)', fill: 'none' });
            running.set(element, animation);
            animation.onfinish = () => running.delete(element);
        });
    }, { threshold: .08 });

    const register = root => {
        if (root.nodeType !== 1 && root !== document) return;
        const elements = [...root.querySelectorAll(selector)];
        if (root.matches?.(selector)) elements.unshift(root);
        elements.forEach(element => {
            if (played.has(element) || element.closest('[hidden], [aria-hidden="true"]') || element.dataset.registerMotion) return;
            // Avoid animating an article and its nested details independently.
            if (element.parentElement?.closest('article, details')) return;
            if (preference.matches) {
                played.add(element);
                return;
            }
            observer.observe(element);
        });
    };

    register(document);
    const changes = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(register)));
    changes.observe(document.body, { childList: true, subtree: true });
    preference.addEventListener('change', event => {
        if (!event.matches) { register(document); return; }
        running.forEach(animation => animation.cancel());
        running.clear();
        observer.disconnect();
    });
    document.addEventListener('focusin', event => {
        // Never move a control while someone is using it with the keyboard.
        running.forEach((animation, element) => {
            if (element.contains(event.target)) { animation.cancel(); running.delete(element); }
        });
    });
})();
