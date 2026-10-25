function initAccessibilita() {
    const observerOptions = { root: null, rootMargin: '0px', threshold: 0.15 };
    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => { 
            if (entry.isIntersecting) { 
                entry.target.classList.add('active'); 
                observer.unobserve(entry.target); 
            } 
        });
    }, observerOptions);
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

    // GESTIONE SCROLL NAVBAR SPOSTATA QUI
    const navbar = document.querySelector('.navbar-wrapper');
    if (navbar) {
        let isScrolled = false;
        window.addEventListener('scroll', () => {
            const shouldBeScrolled = window.scrollY > 40;
            if (shouldBeScrolled !== isScrolled) {
                isScrolled = shouldBeScrolled;
                if (isScrolled) { navbar.classList.add('scrolled'); } 
                else { navbar.classList.remove('scrolled'); }
            }
        }, { passive: true });
    }

    const setupCarousel = window.setupHarzafiCarousel;
    if (typeof setupCarousel === 'function') {
        const sharedCarouselOptions = {
            itemSelector: '.access-info-card',
            onlyWhenOverflow: true,
            pauseOnFocus: true,
            activeItemClass: 'is-current',
            suspendWhile: () => document.body.classList.contains('access-modal-open')
        };

        setupCarousel({ ...sharedCarouselOptions, trackId: 'access-features-track', playerId: 'access-features-player', label: 'funzioni di accessibilità' });
        setupCarousel({ ...sharedCarouselOptions, trackId: 'access-standards-track', playerId: 'access-standards-player', label: 'standard di accessibilità' });
    }

    const modal = document.getElementById('access-detail-modal');
    const modalPanel = modal?.querySelector('.access-modal-panel');
    const modalScroll = modal?.querySelector('.access-modal-scroll');
    const modalClose = modal?.querySelector('.access-modal-close');
    const modalEyebrow = document.getElementById('access-modal-eyebrow');
    const modalTitle = document.getElementById('access-modal-title');
    const modalContent = document.getElementById('access-modal-content');
    let lastModalTrigger = null;

    const closeAccessModal = () => {
        if (!modal?.classList.contains('is-open')) return;
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('access-modal-open');
        document.dispatchEvent(new CustomEvent('accessmodalchange'));
        window.requestAnimationFrame(() => lastModalTrigger?.focus());
    };

    const openAccessModal = (trigger) => {
        const template = document.getElementById(trigger.dataset.accessDetail);
        if (!(template instanceof HTMLTemplateElement) || !modal || !modalTitle || !modalContent || !modalEyebrow) return;

        lastModalTrigger = trigger;
        modalEyebrow.textContent = trigger.dataset.modalEyebrow || '';
        modalTitle.textContent = trigger.dataset.modalTitle || '';
        modalContent.replaceChildren(template.content.cloneNode(true));
        modalScroll.scrollTop = 0;
        modal.setAttribute('aria-hidden', 'false');
        modal.classList.add('is-open');
        document.body.classList.add('access-modal-open');
        document.dispatchEvent(new CustomEvent('accessmodalchange'));
        window.requestAnimationFrame(() => modalClose.focus());
    };

    document.querySelectorAll('[data-access-detail]').forEach((button) => {
        button.addEventListener('click', () => openAccessModal(button));
    });

    modalClose?.addEventListener('click', closeAccessModal);
    modal?.addEventListener('click', (event) => {
        if (event.target === modal) closeAccessModal();
    });

    modal?.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeAccessModal();
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = Array.from(modalPanel.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])'))
            .filter((element) => !element.hasAttribute('disabled'));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAccessibilita);
} else {
    initAccessibilita();
}
