document.addEventListener('DOMContentLoaded', () => {
    const navbar = document.querySelector('.navbar-wrapper');
    if (!navbar) return;

    let isScrolled = false;
    const updateNavbar = () => {
        const nextState = window.scrollY > 40;
        if (nextState === isScrolled) return;
        isScrolled = nextState;
        navbar.classList.toggle('scrolled', isScrolled);
    };

    updateNavbar();
    window.addEventListener('scroll', updateNavbar, { passive: true });
});
