document.addEventListener('DOMContentLoaded', () => {
    const primaryNavbar = document.querySelector('.navbar-wrapper');
    const navShells = document.querySelectorAll('.navbar-wrapper, .dashboard-header');
    if (navShells.length) {
        const updateNavbars = () => {
            const awayFromTop = window.scrollY > 40;
            primaryNavbar?.classList.toggle('scrolled', awayFromTop);
            navShells.forEach((navShell) => navShell.classList.toggle('scroll-away', awayFromTop));
        };

        updateNavbars();
        window.addEventListener('scroll', updateNavbars, { passive: true });
    }

    navShells.forEach((navShell) => {
        const toggle = navShell.querySelector('.nav-menu-toggle, .dashboard-menu-toggle');
        const menu = navShell.querySelector('.nav-links, .dashboard-menu');
        if (!toggle || !menu) return;

        const setExpanded = (expanded, { returnFocus = false } = {}) => {
            navShell.classList.toggle('menu-open', expanded);
            toggle.setAttribute('aria-expanded', String(expanded));
            toggle.setAttribute('aria-label', expanded ? 'Chiudi il menu' : 'Apri il menu');
            menu.setAttribute('aria-hidden', String(!expanded && window.matchMedia('(max-width: 760px)').matches));
            document.body.classList.toggle('site-nav-open', expanded && window.matchMedia('(max-width: 760px)').matches);

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
                document.body.classList.remove('site-nav-open');
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
