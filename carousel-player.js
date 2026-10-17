// Controllo unificato in stile Apple: timeline reattiva in tempo reale, autoplay, pausa e riavvio.
window.setupHarzafiCarousel = ({
    trackId,
    itemSelector,
    playerId,
    edgeContainerId = null,
    label = null,
    pauseOnFocus = false,
    onlyWhenOverflow = false,
    skipRepeatedPositions = false,
    suspendWhile = null,
    activeItemClass = null
}) => {
    const track = document.getElementById(trackId);
    const player = document.getElementById(playerId);
    const edgeContainer = edgeContainerId ? document.getElementById(edgeContainerId) : null;
    if (!track || !player) return;

    const items = Array.from(track.querySelectorAll(itemSelector));
    const steps = Array.from(player.querySelectorAll('.carousel-timeline-step'));
    const toggle = player.querySelector('.carousel-play-toggle');
    if (!items.length || items.length !== steps.length || !toggle) return;

    // Icone vettoriali Apple (viewBox 56x56)
    toggle.innerHTML = `<svg class="carousel-toggle-icons" viewBox="0 0 56 56" aria-hidden="true" focusable="false">
        <path class="carousel-icon carousel-icon-pause" d="m 21.7334 36.67 h 2.5342 c 1.1483 0 1.7324 -0.5796 1.7324 -1.7193 v -13.9015 c 0 -1.12 -0.5841 -1.6898 -1.7324 -1.7193 h -2.5342 c -1.1483 0 -1.7324 0.5698 -1.7324 1.7193 v 13.9015 c -0.0297 1.1396 0.5544 1.7193 1.7324 1.7193 Z m 9.9992 0 h 2.5347 c 1.1485 0 1.7327 -0.5796 1.7327 -1.7193 v -13.9015 c 0 -1.12 -0.5842 -1.7193 -1.7327 -1.7193 h -2.5347 c -1.1485 0 -1.7327 0.5698 -1.7327 1.7193 v 13.9015 c 0 1.1396 0.5545 1.7193 1.7327 1.7193 Z"/>
        <path class="carousel-icon carousel-icon-play" d="m 23.7555 36.6237 c 0.4478 0 0.8598 -0.1343 1.4241 -0.4568 l 10.9178 -6.3322 c 0.8598 -0.5016 1.3614 -1.021 1.3614 -1.8361 c 0 -0.8061 -0.5016 -1.3255 -1.3614 -1.8271 l -10.9178 -6.3322 c -0.5643 -0.3314 -0.9762 -0.4657 -1.4241 -0.4657 c -0.9315 0 -1.7555 0.7165 -1.7555 1.9435 v 13.3629 c 0 1.227 0.824 1.9435 1.7555 1.9435 Z"/>
        <path class="carousel-icon carousel-icon-replay" d="m 36.2448 26.6447 c -1.1073 0 -2.0052 0.8978 -2.0052 2.0052 c 0 3.4405 -2.7992 6.2397 -6.2397 6.2397 s -6.2397 -2.7992 -6.2397 -6.2397 s 2.7992 -6.2397 6.2397 -6.2397 c 0.0283 0 0.0546 -0.0072 0.0825 -0.0083 l -1.2839 1.2841 c -0.7833 0.7828 -0.7833 2.0526 0 2.8354 c 0.3911 0.3916 0.9047 0.5874 1.4177 0.5874 s 1.0266 -0.1958 1.4177 -0.5874 l 4.4406 -4.4406 c 0.7833 -0.7828 0.7833 -2.0526 0 -2.8354 l -4.657 -4.657 c -0.7823 -0.7833 -2.0531 -0.7833 -2.8354 0 c -0.7833 0.7828 -0.7833 2.0526 0 2.8354 l 0.9973 0.9974 c -5.4561 0.223 -9.8295 4.7189 -9.8295 10.2287 c 0 5.6517 4.5983 10.25 10.25 10.25 s 10.25 -4.5983 10.25 -10.25 c 0 -1.1073 -0.8978 -2.0052 -2.0052 -2.0052 Z"/>
    </svg>`;

    const duration = parseFloat(getComputedStyle(player).getPropertyValue('--carousel-duration')) || 6500;
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = motionPreference.matches;
    const playerName = label || (playerId.includes('features') ? 'funzionalità' : 'riquadri di supporto');
    player.hidden = false;

    let activeIndex = 0;
    let cycleTimer = null;
    let scrollTimer = null;
    let programmaticScroll = false;
    let isPaused = reducedMotion;
    let isEnded = false;
    let isCarouselVisible = false;

    // Dimensioni per il morphing
    const REST_WIDTH = 8;
    const ACTIVE_WIDTH = 40;
    const DELTA_WIDTH = ACTIVE_WIDTH - REST_WIDTH; // 32px

    // CORREZIONE COLORE: Stesso identico grigio (#86868b) per evitare 3 tonalità
    const COLOR_REST = [134, 134, 139, 1]; 
    const COLOR_ACTIVE = [134, 134, 139, 1];

    const HOP_MS = 750;
    const MULTI_HOP_BASE_MS = 650;
    const MULTI_HOP_PER_CARD_MS = 380;
    const MAX_TRAVEL_MS = 2500;
    const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

    const SCROLL_SETTLE_MS = 100;
    let scrollFrame = null;
    let scrollAnimation = null;
    let isDragging = false;
    let isTouching = false;
    let targets = [];
    let renderedKeys = new Array(steps.length).fill('');

    const clamp01 = (v) => Math.min(1, Math.max(0, v));

    const mixRgb = (from, to, weight) => {
        const r = Math.round(from[0] + (to[0] - from[0]) * weight);
        const g = Math.round(from[1] + (to[1] - from[1]) * weight);
        const b = Math.round(from[2] + (to[2] - from[2]) * weight);
        const a = from[3] + (to[3] - from[3]) * weight;
        return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
    };

    const maxScroll = () => Math.max(0, track.scrollWidth - track.clientWidth);

    // SISTEMA DI SICUREZZA: Spegne il JS se il player è nascosto dal CSS (PC)
    const isPlayerHiddenByCSS = () => {
        return player.offsetParent === null;
    };

    const updateOverflowStatus = () => {
        if (!track || isPlayerHiddenByCSS()) return false;
        const overflow = maxScroll() > 5;
        track.classList.toggle('has-overflow', overflow);
        if (!overflow) {
            player.classList.add('is-hidden-by-overflow');
        } else {
            player.classList.remove('is-hidden-by-overflow');
        }
        return overflow;
    };

    // Calcolo esatto delle coordinate di snap
    const computeTargets = () => {
        if (!items.length) return [0];
        const max = maxScroll();
        const trackRect = track.getBoundingClientRect();
        const currentScroll = track.scrollLeft;
        // Il padding laterale della track coincide con lo scroll-padding: lo sottraggo,
        // così il target combacia con la posizione di snap (card allineata al titolo).
        const padStart = parseFloat(getComputedStyle(track).paddingLeft) || 0;
        return items.map((item) => {
            const itemRect = item.getBoundingClientRect();
            const offset = (itemRect.left - trackRect.left) + currentScroll - padStart;
            return Math.min(max, Math.max(0, Math.round(offset)));
        });
    };

    const updateEdges = () => {
        if (!edgeContainer) return;
        const current = Math.max(0, track.scrollLeft);
        const maximum = maxScroll();
        edgeContainer.classList.toggle('can-scroll-left', current > 8);
        edgeContainer.classList.toggle('can-scroll-right', current < maximum - 8);
    };

    const syncToggle = () => {
        player.classList.toggle('is-paused', isPaused || !isCarouselVisible || document.hidden);
        player.classList.toggle('is-user-paused', isPaused && !isEnded);
        const state = isEnded ? 'ended' : (isPaused ? 'paused' : 'playing');
        toggle.dataset.state = state;
        if (isEnded) {
            toggle.removeAttribute('aria-pressed');
            toggle.setAttribute('aria-label', `Riavvia il carosello delle ${playerName}`);
        } else {
            toggle.setAttribute('aria-pressed', isPaused ? 'true' : 'false');
            toggle.setAttribute('aria-label', isPaused
                ? `Riprendi il carosello delle ${playerName}`
                : `Metti in pausa il carosello delle ${playerName}`);
        }
    };

    const syncSteps = (restartProgress = false) => {
        steps.forEach((step, index) => {
            const isActive = index === activeIndex;
            step.classList.toggle('is-active', isActive);
            step.setAttribute('aria-current', isActive ? 'true' : 'false');
            if (activeItemClass) items[index].classList.toggle(activeItemClass, isActive);
        });

        if (restartProgress) {
            const activeStep = steps[activeIndex];
            activeStep.classList.remove('is-active');
            void activeStep.offsetWidth;
            activeStep.classList.add('is-active');
        }
    };

    const fractionalIndex = (x) => {
        if (!targets || targets.length < 2) return 0;
        const last = targets.length - 1;
        if (x <= targets[0]) return 0;
        if (x >= targets[last]) return last;

        for (let i = 0; i < last; i++) {
            const from = targets[i];
            const to = targets[i + 1];
            const span = to - from;
            if (span < 1) continue;
            if (x >= from && x <= to) {
                return i + (x - from) / span;
            }
        }
        return last;
    };

    const clearStepStyles = () => {
        steps.forEach((step) => {
            step.style.flex = '';
            step.style.width = '';
            step.style.backgroundColor = '';
        });
        renderedKeys.fill('');
    };

    const startDragMode = () => {
        if (!updateOverflowStatus() || isPlayerHiddenByCSS()) return;
        if (isDragging) return;
        targets = computeTargets();
        isDragging = true;
        player.classList.add('is-dragging');
        clearTimeout(cycleTimer);
        if (isEnded) {
            isEnded = false;
            syncToggle();
        }
    };

    const leaveDragMode = () => {
        if (scrollFrame !== null) {
            cancelAnimationFrame(scrollFrame);
            scrollFrame = null;
        }
        if (!isDragging) return;
        isDragging = false;
        player.classList.remove('is-dragging');
        clearStepStyles();
    };

    const renderMorph = (scrollX) => {
        scrollFrame = null;
        if (!isDragging && !scrollAnimation) return;

        const x = typeof scrollX === 'number' ? scrollX : Math.max(0, track.scrollLeft);
        const position = fractionalIndex(x);

        steps.forEach((step, index) => {
            const dist = Math.abs(position - index);
            const weight = clamp01(1 - dist);

            const width = Math.round((REST_WIDTH + DELTA_WIDTH * weight) * 10) / 10;
            const bg = mixRgb(COLOR_REST, COLOR_ACTIVE, weight);

            const key = `${width}|${bg}`;
            if (renderedKeys[index] === key) return;
            renderedKeys[index] = key;

            step.style.flex = `0 0 ${width}px`;
            step.style.width = `${width}px`;
            step.style.backgroundColor = bg;
        });
    };

    const commitMorph = (finalIndex) => {
        activeIndex = Math.max(0, Math.min(items.length - 1, finalIndex));
        leaveDragMode();
        syncSteps(true);
        if (!isPaused && !isEnded) {
            scheduleNext(duration);
        }
    };

    const cancelScrollAnimation = () => {
        if (!scrollAnimation) return;
        cancelAnimationFrame(scrollAnimation.frame);
        scrollAnimation = null;
        player.classList.remove('is-animating');
        track.style.scrollSnapType = '';
        track.style.scrollBehavior = '';
    };

    const runScrollAnimation = (targetIndex) => {
        targets = computeTargets();
        const from = Math.max(0, track.scrollLeft);
        const to = targets[targetIndex];
        const distance = to - from;
        const hops = Math.max(1, Math.abs(targetIndex - fractionalIndex(from)));
        const total = hops <= 1.5 ? HOP_MS : Math.min(MAX_TRAVEL_MS, MULTI_HOP_BASE_MS + MULTI_HOP_PER_CARD_MS * hops);
        const easing = hops <= 1.5 ? easeInOutCubic : easeInOutSine;

        track.style.scrollSnapType = 'none';
        track.style.scrollBehavior = 'auto';
        player.classList.add('is-animating');

        const state = { frame: 0 };
        scrollAnimation = state;
        let startedAt = null;

        const tick = (now) => {
            if (scrollAnimation !== state) return;
            if (startedAt === null) startedAt = now;
            const progress = clamp01((now - startedAt) / total);
            const currentX = from + distance * easing(progress);

            track.scrollLeft = currentX;
            renderMorph(currentX);

            if (progress < 1) {
                state.frame = requestAnimationFrame(tick);
                return;
            }

            scrollAnimation = null;
            player.classList.remove('is-animating');
            track.style.scrollSnapType = '';
            track.style.scrollBehavior = '';
            commitMorph(targetIndex);
            window.setTimeout(() => { programmaticScroll = false; }, 100);
        };

        state.frame = requestAnimationFrame(tick);
    };

    const nextAutoplayIndex = () => {
        let next = activeIndex + 1;
        if (skipRepeatedPositions && targets.length) {
            while (next < items.length && Math.abs(targets[next] - targets[activeIndex]) < 2) next++;
        }
        return next < items.length ? next : -1;
    };

    const enterEnded = () => {
        isEnded = true;
        clearTimeout(cycleTimer);
        syncToggle();
    };

    const scheduleNext = (wait = duration) => {
        clearTimeout(cycleTimer);
        if (!updateOverflowStatus() || isPlayerHiddenByCSS()) return; // Spegne il JS se non serve
        if (isPaused || isEnded || !isCarouselVisible || document.hidden || items.length < 2 || suspendWhile?.()) return;
        cycleTimer = setTimeout(() => {
            const nextIndex = nextAutoplayIndex();
            if (nextIndex < 0) {
                enterEnded();
                return;
            }
            goTo(nextIndex);
        }, wait);
    };

    const goTo = (index) => {
        if (!updateOverflowStatus() || isPlayerHiddenByCSS()) return;
        const target = Math.max(0, Math.min(items.length - 1, index));
        clearTimeout(cycleTimer);
        cancelScrollAnimation();
        if (isEnded) {
            isEnded = false;
            syncToggle();
        }

        if (reducedMotion) {
            leaveDragMode();
            activeIndex = target;
            programmaticScroll = true;
            targets = computeTargets();
            track.scrollTo({ left: targets[target], behavior: 'auto' });
            syncSteps(true);
            scheduleNext();
            window.setTimeout(() => { programmaticScroll = false; }, 0);
            return;
        }

        programmaticScroll = true;
        runScrollAnimation(target);
    };

    const replay = () => {
        if (!reducedMotion) isPaused = false;
        goTo(0);
    };

    const onScrollSettled = () => {
        if (programmaticScroll || isTouching) return;
        targets = computeTargets();
        const current = Math.max(0, track.scrollLeft);
        let nearestIndex = 0;
        let nearestDistance = Infinity;

        targets.forEach((t, i) => {
            const dist = Math.abs(t - current);
            if (dist < nearestDistance) {
                nearestDistance = dist;
                nearestIndex = i;
            }
        });

        commitMorph(nearestIndex);
    };

    const scheduleScrollEnd = () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(onScrollSettled, SCROLL_SETTLE_MS);
    };

    steps.forEach((step, index) => {
        step.addEventListener('click', () => goTo(index));
    });

    toggle.addEventListener('click', () => {
        if (isEnded) {
            replay();
            return;
        }
        isPaused = !isPaused;
        clearTimeout(cycleTimer);
        syncToggle();
        if (!isPaused) {
            syncSteps(true);
            scheduleNext();
        }
    });

    track.addEventListener('touchstart', () => {
        if (!updateOverflowStatus() || isPlayerHiddenByCSS()) return;
        isTouching = true;
        cancelScrollAnimation();
        startDragMode();
    }, { passive: true });

    const onTouchEnd = () => {
        isTouching = false;
        scheduleScrollEnd();
    };
    track.addEventListener('touchend', onTouchEnd, { passive: true });
    track.addEventListener('touchcancel', onTouchEnd, { passive: true });

    track.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') return;
        if (!updateOverflowStatus() || isPlayerHiddenByCSS()) return;
        cancelScrollAnimation();
        startDragMode();
    }, { passive: true });

    track.addEventListener('scroll', () => {
        if (!updateOverflowStatus() || isPlayerHiddenByCSS()) return;
        updateEdges();
        if (!programmaticScroll) {
            if (!isDragging) startDragMode();
            if (scrollFrame === null) {
                scrollFrame = requestAnimationFrame(() => renderMorph());
            }
        }
        scheduleScrollEnd();
    }, { passive: true });

    track.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        if (!updateOverflowStatus() || isPlayerHiddenByCSS()) return;
        event.preventDefault();
        goTo(activeIndex + (event.key === 'ArrowRight' ? 1 : -1));
    });

    if (pauseOnFocus) track.addEventListener('focusin', () => {
        isPaused = true;
        clearTimeout(cycleTimer);
        syncToggle();
    });

    motionPreference.addEventListener('change', (event) => {
        reducedMotion = event.matches;
        if (reducedMotion) {
            isPaused = true;
            clearTimeout(cycleTimer);
            syncToggle();
        }
    });

    window.addEventListener('resize', () => {
        const isActive = updateOverflowStatus() && !isPlayerHiddenByCSS();
        targets = computeTargets();
        cancelScrollAnimation();
        if (isDragging) leaveDragMode();
        
        if (isActive) {
            programmaticScroll = true;
            track.scrollTo({ left: targets[activeIndex] || 0, behavior: 'auto' });
            window.setTimeout(() => { programmaticScroll = false; }, 150);
            updateEdges();
            syncToggle();
            scheduleNext();
        } else {
            clearTimeout(cycleTimer);
        }
    }, { passive: true });

    document.addEventListener('visibilitychange', () => {
        clearTimeout(cycleTimer);
        syncToggle();
        if (!document.hidden && !isPaused && !isEnded) scheduleNext();
    });

    if (typeof suspendWhile === 'function') {
        document.addEventListener('accessmodalchange', () => {
            clearTimeout(cycleTimer);
            if (!suspendWhile() && !isPaused && !isEnded) scheduleNext();
        });
    }

    if ('IntersectionObserver' in window) {
        const carouselVisibilityObserver = new IntersectionObserver((entries) => {
            const nextVisibility = entries.some(entry => entry.isIntersecting);
            if (nextVisibility === isCarouselVisible) return;

            isCarouselVisible = nextVisibility;
            clearTimeout(cycleTimer);
            syncToggle();

            if (isCarouselVisible && !isPaused && !isEnded) {
                syncSteps(true);
                scheduleNext();
            }
        }, { threshold: 0.35 });
        carouselVisibilityObserver.observe(edgeContainer || track);
    } else {
        isCarouselVisible = true;
    }

    // Player sovrapposto alle foto (sticky) che a fine corsa resta SOTTO la scheda.
    // Visibile se: almeno il 20% della scheda è in vista, oppure la scheda è finita
    // sopra il bordo basso dello schermo e il player (fermo sotto di lei) è ancora in vista.
    if (edgeContainer && edgeContainer.contains(player)) {
        player.classList.add('is-overlay', 'is-offscreen');
        const navbar = document.querySelector('.navbar-wrapper');
        let overlayFrame = null;

        const updateOverlay = () => {
            overlayFrame = null;
            const cards = track.getBoundingClientRect();
            const viewportH = document.documentElement.clientHeight || window.innerHeight;
            const shown = Math.max(0, Math.min(cards.bottom, viewportH) - Math.max(cards.top, 0));
            const cardsVisible = cards.height > 0 && shown / cards.height >= 0.2;
            const navBottom = navbar ? Math.max(0, navbar.getBoundingClientRect().bottom) : 0;
            const restingBelowCards = cards.bottom <= viewportH &&
                                      player.getBoundingClientRect().bottom > navBottom + 8;
            player.classList.toggle('is-offscreen', !(cardsVisible || restingBelowCards));
        };

        const queueOverlay = () => {
            if (overlayFrame === null) overlayFrame = requestAnimationFrame(updateOverlay);
        };

        window.addEventListener('scroll', queueOverlay, { passive: true });
        window.addEventListener('resize', queueOverlay, { passive: true });
        updateOverlay();
    }

    targets = computeTargets();
    updateOverflowStatus(); // Spegne subito se non serve
    syncToggle();
    syncSteps(true);
    updateEdges();
    scheduleNext();

    return {
        pause() {
            isPaused = true;
            clearTimeout(cycleTimer);
            syncToggle();
        }
    };
};
