function initLegal() {
    const legalBox = document.querySelector('.legal-box');
    if (legalBox && !legalBox.querySelector('.legal-card-grid')) {
        const originalChildren = Array.from(legalBox.children);
        const firstSectionIndex = originalChildren.findIndex((element) => element.tagName === 'H2');

        if (firstSectionIndex > 0) {
            const documentHero = document.createElement('header');
            documentHero.className = 'legal-document-hero';
            originalChildren.slice(0, firstSectionIndex).forEach((element) => documentHero.appendChild(element));

            const cardGrid = document.createElement('div');
            cardGrid.className = 'legal-card-grid';
            let currentCard = null;

            originalChildren.slice(firstSectionIndex).forEach((element) => {
                if (element.tagName === 'H2') {
                    currentCard = document.createElement('section');
                    currentCard.className = 'legal-content-card';
                    cardGrid.appendChild(currentCard);
                }
                if (currentCard) currentCard.appendChild(element);
            });

            legalBox.replaceChildren(documentHero, cardGrid);
        }
    }

    const observerOptions = { root: null, rootMargin: '20px', threshold: 0 };
    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

    setTimeout(() => {
        const mainBox = document.querySelector('.legal-box.reveal');
        if (mainBox) mainBox.classList.add('active');
    }, 150);

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
}

// Esegui la funzione correttamente in base allo stato di caricamento della pagina
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLegal);
} else {
    initLegal();
}
