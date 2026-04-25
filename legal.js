        // Animazioni super-performanti
        document.addEventListener("DOMContentLoaded", function() {
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

            // Fallback sicurezza per mobile (elementi troppo lunghi)
            setTimeout(() => {
                const mainBox = document.querySelector('.legal-box.reveal');
                if (mainBox) mainBox.classList.add('active');
            }, 150);
        });

        // Logica Scroll Navbar
        const navbar = document.querySelector('.navbar-wrapper');
        let isScrolled = false;
        window.addEventListener('scroll', () => {
            const shouldBeScrolled = window.scrollY > 40;
            if (shouldBeScrolled !== isScrolled) {
                isScrolled = shouldBeScrolled;
                if (isScrolled) { navbar.classList.add('scrolled'); } 
                else { navbar.classList.remove('scrolled'); }
            }
        }, { passive: true });
