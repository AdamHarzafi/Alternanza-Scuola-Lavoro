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

                // --- INIZIO NUOVO CODICE CONTATORE ---
    const trackerText = document.getElementById("dynamic-counter-tracker");
    const consent = localStorage.getItem('harzafi_cookie_consent');
    let isAnalyticsAllowed = false;
    try { if (consent) isAnalyticsAllowed = JSON.parse(consent).analytics; } catch(e){}

    if (trackerText) {
        if (consent && !isAnalyticsAllowed) {
            trackerText.innerText = "Non tracciato (Cookie Rifiutati)";
        } else {
            // Chiamata REST leggerissima per leggere il numero da Firestore
            fetch('https://firestore.googleapis.com/v1/projects/harzafi---fsl/databases/(default)/documents/statistiche/visualizzazioni')
            .then(res => res.json())
            .then(data => {
                if (data && data.fields && data.fields.count) {
                    trackerText.innerText = data.fields.count.integerValue;
                } else {
                    trackerText.innerText = "Non disponibile";
                }
            }).catch(() => {
                trackerText.innerText = "Non disponibile";
            });
        }
    }
    // --- FINE NUOVO CODICE CONTATORE ---
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
