// Sistema di protezione
        (function() {
            document.addEventListener('contextmenu', e => e.preventDefault());
            document.addEventListener('keydown', e => {
                if (e.key === 'F12' || e.keyCode === 123 || 
                   (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) || 
                   (e.ctrlKey && (e.key === 'u' || e.key === 'U'))) {
                    e.preventDefault();
                    return false;
                }
            });
            setInterval(() => {
                const prima = new Date().getTime();
                debugger;
                if (new Date().getTime() - prima > 100) {
                    document.body.innerHTML = '<h1 style="color:red; text-align:center; margin-top:20vh;">Accesso Negato: Strumenti sviluppatore bloccati.</h1>';
                    window.location.replace("about:blank");
                }
            }, 1000);
        })();

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
            
            // Lettura del counter delle views per il footer
            const localViewsStr = localStorage.getItem("visits-tracker-pcto-avgd-adam") || "508";
            document.getElementById("dynamic-counter-tracker").innerText = localViewsStr;

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