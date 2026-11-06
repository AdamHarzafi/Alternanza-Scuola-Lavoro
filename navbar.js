document.addEventListener('DOMContentLoaded', () => {
    const NAV_PANEL_DURATION = 520;
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

    if (primaryNavbar) {
        const updateNavbars = () => {
            const awayFromTop = window.scrollY > 40;
            primaryNavbar?.classList.toggle('scrolled', awayFromTop);
        };

        updateNavbars();
        window.addEventListener('scroll', updateNavbars, { passive: true });
    }

    const initSectionNavigation = (navShell) => {
        const links = [...navShell.querySelectorAll('.nav-links > a[href]')];
        const pagePath = pathname => pathname.replace(/\/index\.html$/, '/');
        const updateUnderlineMetrics = () => {
            links.forEach((link) => {
                const range = document.createRange();
                range.selectNodeContents(link);
                const textRect = range.getBoundingClientRect();
                const linkRect = link.getBoundingClientRect();
                if (!textRect.width) return;
                link.style.setProperty('--nav-underline-left', `${textRect.left - linkRect.left}px`);
                link.style.setProperty('--nav-underline-width', `${textRect.width}px`);
            });
        };

        updateUnderlineMetrics();
        window.addEventListener('resize', updateUnderlineMetrics);
        document.fonts?.ready?.then(updateUnderlineMetrics);

        const sections = links.map((link) => {
            try {
                const url = new URL(link.getAttribute('href'), window.location.href);
                if (url.origin !== window.location.origin || pagePath(url.pathname) !== pagePath(window.location.pathname) || !url.hash) return null;
                const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
                return target ? { link, target } : null;
            } catch {
                return null;
            }
        }).filter(Boolean).sort((first, second) =>
            first.target.getBoundingClientRect().top - second.target.getBoundingClientRect().top
        );

        if (!sections.length) return;

        let sectionFrame = null;
        const updateCurrentSection = () => {
            sectionFrame = null;
            const activationPoint = window.scrollY + Math.min(window.innerHeight * .42, 340);
            let activeSection = null;

            sections.forEach((section) => {
                if (section.target.getBoundingClientRect().top + window.scrollY <= activationPoint) {
                    activeSection = section;
                }
            });

            const isAtPageEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
            if (isAtPageEnd) activeSection = sections[sections.length - 1];

            navShell.classList.toggle('has-section-active', Boolean(activeSection));
            sections.forEach(({ link }) => link.classList.toggle('is-section-active', link === activeSection?.link));
        };

        updateCurrentSection();
        window.addEventListener('scroll', () => {
            if (sectionFrame === null) sectionFrame = requestAnimationFrame(updateCurrentSection);
        }, { passive: true });
        window.addEventListener('resize', updateCurrentSection);
        window.addEventListener('hashchange', updateCurrentSection);
        window.addEventListener('pageshow', updateCurrentSection);
    };

    navShells.forEach(initSectionNavigation);

    navShells.forEach((navShell) => {
        const toggle = navShell.querySelector('.nav-menu-toggle, .dashboard-menu-toggle');
        const menu = navShell.querySelector('.nav-links, .dashboard-menu');
        if (!toggle || !menu) return;
        const mobileQuery = window.matchMedia('(max-width: 833px)');
        let backdrop = document.querySelector('.site-nav-backdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.className = 'site-nav-backdrop';
            backdrop.setAttribute('aria-hidden', 'true');
            document.body.appendChild(backdrop);
        }

        // Apple’s compact global navigation morphs each bar through the center
        // before it becomes a diagonal. Keep the same geometry and timing.
        const glyph = toggle.querySelector('.nav-toggle-glyph');
        const isChevronToggle = toggle.classList.contains('home-nav-chevron');
        const appleMenuGlyph = glyph && !isChevronToggle ? (() => {
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
            item.style.setProperty('--nav-enter-delay', `${80 + index * 55}ms`);
            item.style.setProperty('--nav-exit-delay', `${(menuItems.length - index - 1) * 22}ms`);
        });

        const utility = navShell.querySelector('.nav-mobile-account');
        const setExpanded = (expanded, { returnFocus = false, immediate = false } = {}) => {
            const wasExpanded = navShell.classList.contains('menu-open');
            const isMobile = mobileQuery.matches;
            if (expanded !== wasExpanded) appleMenuGlyph?.(expanded);
            navShell.classList.toggle('menu-open', expanded);
            toggle.setAttribute('aria-expanded', String(expanded));
            toggle.setAttribute('aria-label', expanded ? 'Chiudi il menu' : 'Apri il menu');
            menu.setAttribute('aria-hidden', String(!expanded && isMobile));
            menu.inert = !expanded && isMobile;
            if (utility) {
                if (expanded && isMobile) {
                    utility.setAttribute('aria-hidden', 'true');
                    utility.setAttribute('tabindex', '-1');
                } else {
                    utility.removeAttribute('aria-hidden');
                    utility.removeAttribute('tabindex');
                }
            }

            if (isMobile && expanded) {
                if (scrollUnlockTimer) {
                    window.clearTimeout(scrollUnlockTimer);
                    scrollUnlockTimer = null;
                }
                lockPageScroll();
                document.body.classList.remove('site-nav-closing');
                document.body.classList.add('site-nav-open');
            } else if (immediate) {
                document.body.classList.remove('site-nav-open', 'site-nav-closing');
                unlockPageScroll();
            } else if (isMobile && wasExpanded) {
                document.body.classList.remove('site-nav-open');
                document.body.classList.add('site-nav-closing');
                scrollUnlockTimer = window.setTimeout(() => {
                    if (!document.body.classList.contains('site-nav-open')) {
                        document.body.classList.remove('site-nav-closing');
                        unlockPageScroll();
                    }
                    scrollUnlockTimer = null;
                }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : NAV_PANEL_DURATION);
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

        backdrop.addEventListener('click', () => setExpanded(false, { returnFocus: true }));

        toggle.addEventListener('click', () => {
            setExpanded(toggle.getAttribute('aria-expanded') !== 'true');
        });

        navShell.querySelector('.nav-logo')?.addEventListener('click', () => {
            if (navShell.classList.contains('menu-open')) setExpanded(false, { immediate: true });
        });

        navShell.addEventListener('click', (event) => {
            const content = navShell.querySelector('.nav-content');
            if (navShell.classList.contains('menu-open') && (event.target === navShell || event.target === content)) {
                setExpanded(false, { returnFocus: true });
            }
        });

        menu.addEventListener('click', (event) => {
            const item = event.target.closest('a, button');
            if (item) setExpanded(false, { returnFocus: item.tagName !== 'A', immediate: item.tagName === 'A' });
        }, true); // Unlock before a link's own smooth-scroll handler computes its target.

        navShell.addEventListener('keydown', (event) => {
            if (!navShell.classList.contains('menu-open')) return;

            if (event.key === 'Escape') {
                event.preventDefault();
                setExpanded(false, { returnFocus: true });
                return;
            }

            if (event.key !== 'Tab') return;
            const focusable = [toggle, ...menu.querySelectorAll('a[href], button:not([disabled])'), utility]
                .filter((element) => {
                    if (!element || element.hidden || element.getAttribute('aria-hidden') === 'true' || !element.getClientRects().length) return false;
                    const style = window.getComputedStyle(element);
                    return style.display !== 'none' && style.visibility !== 'hidden';
                });
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

        const syncMenuState = () => {
            if (!mobileQuery.matches) {
                if (navShell.classList.contains('menu-open')) appleMenuGlyph?.(false);
                navShell.classList.remove('menu-open');
                document.body.classList.remove('site-nav-open', 'site-nav-closing');
                unlockPageScroll();
                menu.removeAttribute('aria-hidden');
                menu.inert = false;
                toggle.setAttribute('aria-expanded', 'false');
                toggle.setAttribute('aria-label', 'Apri il menu');
                utility?.removeAttribute('aria-hidden');
                utility?.removeAttribute('tabindex');
            } else if (!navShell.classList.contains('menu-open')) {
                menu.setAttribute('aria-hidden', 'true');
                menu.inert = true;
                utility?.removeAttribute('aria-hidden');
                utility?.removeAttribute('tabindex');
            }
        };

        mobileQuery.addEventListener?.('change', syncMenuState);
        window.addEventListener('pagehide', () => setExpanded(false, { immediate: true }));
        window.addEventListener('pageshow', event => {
            if (event.persisted) setExpanded(false, { immediate: true });
            syncMenuState();
        });
        syncMenuState();
    });
});
