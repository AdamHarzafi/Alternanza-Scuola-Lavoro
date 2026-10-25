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

        const menuItems = [...menu.querySelectorAll(':scope > a:not(.nav-login), :scope > button')];
        menuItems.forEach((item, index) => {
            item.style.setProperty('--nav-enter-delay', `${index * 48}ms`);
            item.style.setProperty('--nav-exit-delay', `${(menuItems.length - index - 1) * 24}ms`);
        });

        const setExpanded = (expanded, { returnFocus = false } = {}) => {
            const wasExpanded = navShell.classList.contains('menu-open');
            const isMobile = window.matchMedia('(max-width: 760px)').matches;
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
