document.addEventListener('DOMContentLoaded', () => {
    const primaryNavbar = document.querySelector('.navbar-wrapper');
    const navShells = document.querySelectorAll('.navbar-wrapper, .dashboard-header');
    let pageScrollY = 0;
    let scrollUnlockTimer = null;

    const lockPageScroll = () => {
        if (document.body.classList.contains('site-nav-scroll-locked')) return;
        pageScrollY = window.scrollY || window.pageYOffset || 0;
        document.body.style.setProperty('--site-nav-lock-top', `-${pageScrollY}px`);
        document.documentElement.classList.add('site-nav-scroll-locked');
        document.body.classList.add('site-nav-scroll-locked');
    };

    const unlockPageScroll = () => {
        if (scrollUnlockTimer) {
            window.clearTimeout(scrollUnlockTimer);
            scrollUnlockTimer = null;
        }
        if (!document.body.classList.contains('site-nav-scroll-locked')) return;
        document.documentElement.classList.remove('site-nav-scroll-locked');
        document.body.classList.remove('site-nav-scroll-locked');
        document.body.style.removeProperty('--site-nav-lock-top');
        const previousScrollBehavior = document.documentElement.style.scrollBehavior;
        document.documentElement.style.scrollBehavior = 'auto';
        void document.documentElement.offsetHeight;
        window.scrollTo(0, pageScrollY);
        document.documentElement.style.scrollBehavior = previousScrollBehavior;
    };

    if (navShells.length) {
        const updateNavbars = () => {
            const awayFromTop = window.scrollY > 40;
            primaryNavbar?.classList.toggle('scrolled', awayFromTop);
        };

        updateNavbars();
        window.addEventListener('scroll', updateNavbars, { passive: true });
    }

    navShells.forEach((navShell) => {
        const toggle = navShell.querySelector('.nav-menu-toggle, .dashboard-menu-toggle');
        const menu = navShell.querySelector('.nav-links, .dashboard-menu');
        if (!toggle || !menu) return;

        // Apple’s compact global navigation morphs each bar through the center
        // before it becomes a diagonal. Keep the same geometry and timing.
        const glyph = toggle.querySelector('.nav-toggle-glyph');
        const appleMenuGlyph = glyph ? (() => {
            const spline = '0.42, 0, 1, 1; 0, 0, 0.58, 1';
            const animation = (name, values) =>
                `<animate data-glyph-${name} attributeName="points" keyTimes="0;0.5;1" dur="0.24s" begin="indefinite" fill="freeze" calcMode="spline" keySplines="${spline}" values="${values}"></animate>`;

            glyph.innerHTML = `
                <polyline class="menu-glyph menu-glyph-top" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" points="2 5, 16 5">
                    ${animation('open', '2 5, 16 5; 2 9, 16 9; 3.5 3.5, 15 15')}
                    ${animation('close', '3.5 3.5, 15 15; 2 9, 16 9; 2 5, 16 5')}
                </polyline>
                <polyline class="menu-glyph menu-glyph-bottom" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" points="2 12, 16 12">
                    ${animation('open', '2 12, 16 12; 2 9, 16 9; 3.5 15, 15 3.5')}
                    ${animation('close', '3.5 15, 15 3.5; 2 9, 16 9; 2 12, 16 12')}
                </polyline>`;

            return (expanded) => {
                const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                const strokes = [...glyph.querySelectorAll('.menu-glyph')];
                if (reducedMotion) {
                    strokes[0]?.setAttribute('points', expanded ? '3.5 3.5, 15 15' : '2 5, 16 5');
                    strokes[1]?.setAttribute('points', expanded ? '3.5 15, 15 3.5' : '2 12, 16 12');
                    return;
                }

                const state = expanded ? 'open' : 'close';
                strokes.forEach((stroke) => stroke.querySelector(`[data-glyph-${state}]`)?.beginElement());
            };
        })() : null;

        const menuItems = [...menu.querySelectorAll(':scope > a:not(.nav-login), :scope > button')];
        menuItems.forEach((item, index) => {
            item.style.setProperty('--nav-enter-delay', `${index * 48}ms`);
            item.style.setProperty('--nav-exit-delay', `${(menuItems.length - index - 1) * 24}ms`);
        });

        const setExpanded = (expanded, { returnFocus = false } = {}) => {
            const wasExpanded = navShell.classList.contains('menu-open');
            const isMobile = window.matchMedia('(max-width: 760px)').matches;
            if (expanded !== wasExpanded) appleMenuGlyph?.(expanded);
            navShell.classList.toggle('menu-open', expanded);
            toggle.setAttribute('aria-expanded', String(expanded));
            toggle.setAttribute('aria-label', expanded ? 'Chiudi il menu' : 'Apri il menu');
            menu.setAttribute('aria-hidden', String(!expanded && isMobile));

            if (isMobile && expanded) {
                if (scrollUnlockTimer) {
                    window.clearTimeout(scrollUnlockTimer);
                    scrollUnlockTimer = null;
                }
                lockPageScroll();
                document.body.classList.remove('site-nav-closing');
                document.body.classList.add('site-nav-open');
            } else if (isMobile && wasExpanded) {
                document.body.classList.remove('site-nav-open');
                document.body.classList.add('site-nav-closing');
                scrollUnlockTimer = window.setTimeout(() => {
                    if (!document.body.classList.contains('site-nav-open')) {
                        document.body.classList.remove('site-nav-closing');
                        unlockPageScroll();
                    }
                    scrollUnlockTimer = null;
                }, 500);
            } else if (!isMobile) {
                document.body.classList.remove('site-nav-open', 'site-nav-closing');
                unlockPageScroll();
            }

            if (expanded) {
                menu.querySelector('a, button')?.focus({ preventScroll: true });
            } else if (returnFocus) {
                toggle.focus({ preventScroll: true });
            }
        };

        toggle.addEventListener('click', () => {
            setExpanded(toggle.getAttribute('aria-expanded') !== 'true');
        });

        navShell.querySelector('.nav-logo')?.addEventListener('click', () => {
            if (navShell.classList.contains('menu-open')) setExpanded(false);
        });

        navShell.addEventListener('click', (event) => {
            const content = navShell.querySelector('.nav-content');
            if (navShell.classList.contains('menu-open') && (event.target === navShell || event.target === content)) {
                setExpanded(false, { returnFocus: true });
            }
        });

        menu.addEventListener('click', (event) => {
            if (event.target.closest('a, button')) setExpanded(false, { returnFocus: true });
        });

        navShell.addEventListener('keydown', (event) => {
            if (!navShell.classList.contains('menu-open')) return;

            if (event.key === 'Escape') {
                event.preventDefault();
                setExpanded(false, { returnFocus: true });
                return;
            }

            if (event.key !== 'Tab') return;
            const utility = navShell.querySelector('.nav-mobile-account');
            const focusable = [toggle, ...menu.querySelectorAll('a[href], button:not([disabled])'), utility]
                .filter((element) => element && !element.hidden && element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0);
            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
            }
        });

        const mobileQuery = window.matchMedia('(max-width: 760px)');
        const syncMenuState = () => {
            if (!mobileQuery.matches) {
                if (navShell.classList.contains('menu-open')) appleMenuGlyph?.(false);
                navShell.classList.remove('menu-open');
                document.body.classList.remove('site-nav-open', 'site-nav-closing');
                unlockPageScroll();
                menu.removeAttribute('aria-hidden');
                toggle.setAttribute('aria-expanded', 'false');
                toggle.setAttribute('aria-label', 'Apri il menu');
            } else if (!navShell.classList.contains('menu-open')) {
                menu.setAttribute('aria-hidden', 'true');
            }
        };

        mobileQuery.addEventListener?.('change', syncMenuState);
        syncMenuState();
    });
});
