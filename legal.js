function initLegal() {
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

    const trackerText = document.getElementById("dynamic-counter-tracker");
    const consent = localStorage.getItem('harzafi_cookie_consent');
    let isAnalyticsAllowed = false;
    try { if (consent) isAnalyticsAllowed = JSON.parse(consent).analytics; } catch(e){}

    if (trackerText) {
        if (consent && !isAnalyticsAllowed) {
            trackerText.innerText = "Non tracciato";
        } else {
            const getUrl = 'https://firestore.googleapis.com/v1/projects/harzafi---fsl/databases/(default)/documents/statistiche/visualizzazioni';
            
            const fetchCountOnly = () => {
                fetch(getUrl)
                .then(res => res.json())
                .then(data => {
                    if (data && data.fields && data.fields.count) {
                        trackerText.innerText = data.fields.count.integerValue;
                    } else {
                        trackerText.innerText = "Non disponibile";
                    }
                }).catch(() => { trackerText.innerText = "Non disponibile"; });
            };

            if (!sessionStorage.getItem('view_counted')) {
                const commitUrl = 'https://firestore.googleapis.com/v1/projects/harzafi---fsl/databases/(default)/documents:commit';
                
                const payload = {
                    writes:[{
                        transform: {
                            document: "projects/harzafi---fsl/databases/(default)/documents/statistiche/visualizzazioni",
                            fieldTransforms:[{
                                fieldPath: "count",
                                increment: { integerValue: "1" }
                            }]
                        }
                    }]
                };

                fetch(commitUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                })
                .then(res => {
                    if (!res.ok) throw new Error("Write blocked or failed");
                    return res.json();
                })
                .then(data => {
                    sessionStorage.setItem('view_counted', 'true');
                    try {
                        trackerText.innerText = data.writeResults[0].transformResults[0].integerValue;
                    } catch(e) { fetchCountOnly(); }
                })
                .catch(() => { fetchCountOnly(); });
            } else {
                fetchCountOnly();
            }
        }
    }

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
