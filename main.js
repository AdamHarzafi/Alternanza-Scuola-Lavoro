async function inviaEmail(emailDestinatario, idModelloBrevo, parametriMail) {
    const WORKER_URL = "https://harzafi-email.allorasonoadam.workers.dev/"; 

    const dataToSend = {
        emailDestinatario: emailDestinatario,
        idModelloBrevo: idModelloBrevo,
        parametriMail: parametriMail
    };

    try {
        const response = await fetch(WORKER_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(dataToSend)
        });

        const responseData = await response.json();

        if (!response.ok) {
            console.error("❌ ERRORE DA BREVO:", responseData.error);
            throw new Error(responseData.error || "Errore sconosciuto");
        }
        
        console.log("✅ Email inviata in modo SUPER SICURO tramite Cloudflare e Brevo!");
    } catch (err) {
        console.error("❌ Dettagli errore di rete:", err);
    }
}

window.globalTurnstileToken = "";
window.isWaitingForToken = false;
window.onTurnstileSuccess = function(token) {
    window.globalTurnstileToken = token;
    if (window.isWaitingForToken) {
        window.isWaitingForToken = false;
        window.turnstileCallbackFired = true;
        if (typeof window.eseguiAccessoServer === 'function') window.eseguiAccessoServer();
    }
};
window.onTurnstileExpired = function() { window.globalTurnstileToken = ""; };
window.onTurnstileError = function() { 
    window.globalTurnstileToken = ""; 
    if (window.isWaitingForToken) { window.isWaitingForToken = false; if(typeof window.eseguiAccessoServer === 'function') window.eseguiAccessoServer(); }
};

function waitForFirebase(callback) {
    if (typeof firebase !== 'undefined') {
        const firebaseConfig = {
            apiKey: "AIzaSyBisp324W7J5jGwF_s-nbXabOjEutcwMmc",
            authDomain: "harzafi---fsl.firebaseapp.com",
            projectId: "harzafi---fsl",
            storageBucket: "harzafi---fsl.firebasestorage.app",
            messagingSenderId: "743942918497",
            appId: "1:743942918497:web:6d6e44ba348760ce137520"
        };

        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

        if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
            self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
        }

        window.auth = firebase.auth();
        window.db = firebase.firestore();
        callback();
    } else {
        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            if (typeof firebase !== 'undefined') {
                clearInterval(interval);
                waitForFirebase(callback);
            } else if (attempts > 50) {
                clearInterval(interval);
                console.error("Firebase non disponibile dopo 5 secondi.");
            }
        }, 100);
    }
}

window.addEventListener('load', () => {
    waitForFirebase(() => {
        if (typeof populateUserDropdown === 'function') populateUserDropdown('studente');
    });
});

const scrollBtn = document.getElementById('scrollToTop');
if (scrollBtn) {
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) scrollBtn.classList.add('visible'); 
        else scrollBtn.classList.remove('visible');
    });
    scrollBtn.addEventListener('click', () => { window.scrollTo({ top: 0, behavior: 'smooth' }); });
}

const cookieBanner = document.getElementById('apple-cookie-banner');
const btnAccetto = document.getElementById('btn-accetto-cookie');
const btnRifiuto = document.getElementById('btn-rifiuto-cookie');

function initCookies() {
    const consent = localStorage.getItem('harzafi_cookie_consent');
    if (!consent && cookieBanner) setTimeout(() => cookieBanner.classList.add('active'), 500); 
    else if (consent) applyTracking(JSON.parse(consent).analytics); 
}

function applyTracking(isAnalyticsAllowed) {
    const trackerText = document.getElementById("dynamic-counter-tracker");
    if (!trackerText) return;

    if (!isAnalyticsAllowed) {
        trackerText.innerText = "Non tracciato";
        return;
    }

    const executeTracking = () => {
        if (typeof window.db !== 'undefined' && typeof firebase !== 'undefined') {
            const counterRef = window.db.collection('statistiche').doc('visualizzazioni');
            
            if (!sessionStorage.getItem('view_counted')) {
    sessionStorage.setItem('view_counted', 'true');
    counterRef.update({
        count: firebase.firestore.FieldValue.increment(1)
    }).then(() => {
        return counterRef.get();
    }).then((doc) => {
        if(doc.exists) trackerText.innerText = doc.data().count;
    }).catch(err => {
        sessionStorage.removeItem('view_counted');
        trackerText.innerText = "Non disponibile";
    });
            } else {
                counterRef.get().then((doc) => {
                    if(doc.exists) trackerText.innerText = doc.data().count;
                }).catch(() => {
                    trackerText.innerText = "Non disponibile";
                });
            }
        } else {
            trackerText.innerText = "Non disponibile";
        }
    };

    if (typeof window.db !== 'undefined') {
        executeTracking();
    } else {
        window.addEventListener('load', executeTracking);
    }
}

if (btnAccetto) {
    btnAccetto.addEventListener('click', () => {
        localStorage.setItem('harzafi_cookie_consent', JSON.stringify({ technical: true, analytics: true }));
        if (cookieBanner) cookieBanner.classList.remove('active'); 
        applyTracking(true);
    });
}

if (btnRifiuto) {
    btnRifiuto.addEventListener('click', () => {
        localStorage.setItem('harzafi_cookie_consent', JSON.stringify({ technical: true, analytics: false }));
        if (cookieBanner) cookieBanner.classList.remove('active'); 
        applyTracking(false);
    });
}

document.addEventListener("DOMContentLoaded", function() {
    initCookies();
    const observerOptions = { root: null, rootMargin: '0px', threshold: 0.15 };
    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('active'); observer.unobserve(entry.target); } });
    }, observerOptions);
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

    const navbar = document.querySelector('.navbar-wrapper');
    let isScrolled = false;
    window.addEventListener('scroll', () => {
        const shouldBeScrolled = window.scrollY > 40;
        if (shouldBeScrolled !== isScrolled) {
            isScrolled = shouldBeScrolled;
            if (isScrolled) navbar.classList.add('scrolled'); else navbar.classList.remove('scrolled');
        }
    }, { passive: true });

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            const targetElement = document.querySelector(targetId);
            if (targetElement) { const offsetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - 80; window.scrollTo({ top: offsetPosition, behavior: 'smooth' }); }
        });
    });

    // Carosello funzionalità: indicatori e sfocatura sui bordi
    const featuresCarousel = document.getElementById('apple-features-carousel');
    const featuresTrack = document.getElementById('apple-features-track');
    const featureDots = Array.from(document.querySelectorAll('.apple-feature-dot'));
    const featureBtnPrev = document.getElementById('apple-features-prev');
    const featureBtnNext = document.getElementById('apple-features-next');

    if (featuresCarousel && featuresTrack && featureDots.length) {
        let featureScrollFrame = null;

        const getFeatureState = () => {
            const maxScroll = Math.max(0, featuresTrack.scrollWidth - featuresTrack.clientWidth);
            const currentScroll = Math.max(0, featuresTrack.scrollLeft);
            const lastIndex = featureDots.length - 1;
            const activeIndex = maxScroll > 0
                ? Math.round((currentScroll / maxScroll) * lastIndex)
                : 0;
            return { maxScroll, currentScroll, activeIndex, lastIndex };
        };

        const scrollFeaturesToIndex = (index) => {
            const { maxScroll, lastIndex } = getFeatureState();
            const safeIndex = Math.max(0, Math.min(lastIndex, index));
            const targetLeft = lastIndex > 0 ? maxScroll * (safeIndex / lastIndex) : 0;
            featuresTrack.scrollTo({ left: targetLeft, behavior: 'smooth' });
        };

        const updateFeaturesCarousel = () => {
            const { maxScroll, currentScroll, activeIndex, lastIndex } = getFeatureState();
            featuresCarousel.classList.toggle('can-scroll-left', currentScroll > 8);
            featuresCarousel.classList.toggle('can-scroll-right', currentScroll < maxScroll - 8);

            if (featureBtnPrev) featureBtnPrev.disabled = activeIndex <= 0;
            if (featureBtnNext) featureBtnNext.disabled = activeIndex >= lastIndex;

            featureDots.forEach((dot, index) => {
                const isActive = index === activeIndex;
                dot.classList.toggle('active', isActive);
                dot.setAttribute('aria-current', isActive ? 'true' : 'false');
            });
        };

        const requestFeaturesUpdate = () => {
            if (featureScrollFrame) cancelAnimationFrame(featureScrollFrame);
            featureScrollFrame = requestAnimationFrame(updateFeaturesCarousel);
        };

        featureDots.forEach((dot, index) => {
            dot.addEventListener('click', () => scrollFeaturesToIndex(index));
        });

        if (featureBtnPrev) {
            featureBtnPrev.addEventListener('click', () => {
                const { activeIndex } = getFeatureState();
                scrollFeaturesToIndex(activeIndex - 1);
            });
        }

        if (featureBtnNext) {
            featureBtnNext.addEventListener('click', () => {
                const { activeIndex } = getFeatureState();
                scrollFeaturesToIndex(activeIndex + 1);
            });
        }

        featuresTrack.addEventListener('keydown', (event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const direction = event.key === 'ArrowRight' ? 1 : -1;
            const { activeIndex } = getFeatureState();
            scrollFeaturesToIndex(activeIndex + direction);
        });

        featuresTrack.addEventListener('scroll', requestFeaturesUpdate, { passive: true });
        window.addEventListener('resize', requestFeaturesUpdate, { passive: true });
        setTimeout(updateFeaturesCarousel, 100);
    }

    // Inizializzazione Carosello Riquadri di supporto
    const appleCarousel = document.getElementById('apple-cards-carousel');
    const appleBtnPrev = document.getElementById('apple-carousel-prev');
    const appleBtnNext = document.getElementById('apple-carousel-next');

    if (appleCarousel && appleBtnPrev && appleBtnNext) {
        const updateCarouselButtons = () => {
            const scrollLeft = appleCarousel.scrollLeft;
            const maxScroll = appleCarousel.scrollWidth - appleCarousel.clientWidth;
            appleBtnPrev.disabled = scrollLeft <= 8;
            appleBtnNext.disabled = scrollLeft >= maxScroll - 8;
        };

        const getScrollStep = () => {
            const firstCard = appleCarousel.querySelector('.apple-card');
            return firstCard ? (firstCard.offsetWidth + 24) : 400;
        };

        appleBtnPrev.addEventListener('click', () => {
            appleCarousel.scrollBy({ left: -getScrollStep(), behavior: 'smooth' });
        });

        appleBtnNext.addEventListener('click', () => {
            appleCarousel.scrollBy({ left: getScrollStep(), behavior: 'smooth' });
        });

        appleCarousel.addEventListener('scroll', updateCarouselButtons, { passive: true });
        window.addEventListener('resize', updateCarouselButtons, { passive: true });
        setTimeout(updateCarouselButtons, 100);
    }

    function trapFocus(modal) {
        const focusableElements = modal.querySelectorAll('button, [href], input, select, textarea,[tabindex]:not([tabindex="-1"])');
        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        function handleKeyDown(e) {
            if (e.key === 'Tab') {
                if (e.shiftKey) {
                    if (document.activeElement === firstFocusable) {
                        e.preventDefault();
                        lastFocusable.focus();
                    }
                } else {
                    if (document.activeElement === lastFocusable) {
                        e.preventDefault();
                        firstFocusable.focus();
                    }
                }
            }
        }

        modal.addEventListener('keydown', handleKeyDown);
        if (firstFocusable) firstFocusable.focus();

        return () => modal.removeEventListener('keydown', handleKeyDown);
    }

    const modalObserver = new MutationObserver(() => {
        const isAnyModalOpen = document.querySelectorAll('.modal-overlay.active').length > 0;
        if (isAnyModalOpen) {
            const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
            document.body.style.overflow = 'hidden'; document.body.style.paddingRight = `${scrollbarWidth}px`;
        } else {
            document.body.style.overflow = ''; document.body.style.paddingRight = '';
        }
    });
    document.querySelectorAll('.modal-overlay').forEach(modal => { modalObserver.observe(modal, { attributes: true, attributeFilter: ['class'] }); });

    const focusTrapObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const modal = mutation.target;
                if (modal.classList.contains('active')) {
                    if (!modal._focusTrapCleanup) {
                        modal._focusTrapCleanup = trapFocus(modal);
                    }
                } else {
                    if (modal._focusTrapCleanup) {
                        modal._focusTrapCleanup();
                        delete modal._focusTrapCleanup;
                    }
                }
            }
        });
    });
    document.querySelectorAll('.modal-overlay').forEach(modal => { focusTrapObserver.observe(modal, { attributes: true, attributeFilter:['class'] }); });

    const finalHoursValue = "113.30";
    let selectedRole = 'studente'; let selectedUserValue = ""; let selectedUserEmail = ""; 

    const submitBtn = document.getElementById('login-submit');
    const passInput = document.getElementById('password-input');
    const errorMsg = document.getElementById('login-error');
    const attemptsMsgObj = document.getElementById('login-attempts');

    const loginModal = document.getElementById('login-modal');
    const mapsModal = document.getElementById('maps-modal');
    const forgotSheetModal = document.getElementById('forgot-sheet-modal');
    const hidModal = document.getElementById('hid-modal');
    
    document.querySelectorAll('.btn-open-login').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (loginModal) loginModal.classList.add('active');
            window.globalTurnstileToken = "";
            if (typeof turnstile !== 'undefined') { try { turnstile.reset(); } catch(err){} }
        });
    });

    const btnOpenMaps = document.getElementById('btn-open-maps');
    if (btnOpenMaps && mapsModal) {
        btnOpenMaps.addEventListener('click', (e) => { e.preventDefault(); mapsModal.classList.add('active'); });
    }

    const btnForgotPass = document.getElementById('btn-forgot-pass');
    if (btnForgotPass) {
        btnForgotPass.addEventListener('click', (e) => { 
            e.preventDefault(); 
            if (loginModal) loginModal.classList.remove('active'); 
            if (forgotSheetModal) forgotSheetModal.classList.add('active'); 
            setupForgotView(); 
        });
    }

    document.querySelectorAll('.close-btn').forEach(btn => btn.addEventListener('click', () => { 
        const parentModal = btn.closest('.modal-overlay');
        if (parentModal) parentModal.classList.remove('active'); 
    }));
    
    const forgotSheetClose = document.getElementById('forgot-sheet-close');
    if (forgotSheetClose && forgotSheetModal) {
        forgotSheetClose.addEventListener('click', () => {
            forgotSheetModal.classList.remove('active');
        });
    }

    const usernameSelect = document.getElementById('username-select');
    const hiddenUsernameInput = document.getElementById('hidden-username');
    
    window.populateUserDropdown = function(role) {
        const optionsContainer = document.getElementById('username-options');
        if (!optionsContainer) return;
        optionsContainer.innerHTML = '<div class="custom-option" style="color:var(--text-light); text-align:center;">Caricamento utenti...</div>';
        const collectionName = role === 'studente' ? 'studenti' : 'docenti';
        
        if (typeof window.db !== 'undefined') {
            window.db.collection(collectionName).orderBy("nome", "asc").get().then((querySnapshot) => {
                optionsContainer.innerHTML = ''; 
                querySnapshot.forEach((doc) => creaOpzioneDropdown(doc.data().nome, doc.data().email || "email_mancante@scuola.it", optionsContainer, 'username'));
            }).catch(() => { optionsContainer.innerHTML = '<div class="custom-option" style="color:var(--danger);">Errore di connessione al server</div>'; });
        } else {
            optionsContainer.innerHTML = '<div class="custom-option" style="color:var(--text-light); text-align:center;">In attesa di connessione...</div>';
        }
        resetDropdownDisplay('username-display', 'Seleziona Utente');
    };

    function creaOpzioneDropdown(nome, datoExtra, container, tipo) {
        if (!container) return;
        const option = document.createElement('div');
        option.className = 'custom-option'; option.textContent = nome;
        option.addEventListener('click', function(e) {
            e.stopPropagation(); 
            const displayEl = document.getElementById(`${tipo}-display`);
            if (displayEl) {
                displayEl.textContent = nome; 
                if (displayEl.parentElement) displayEl.parentElement.classList.add('selected');
            }
            if(tipo === 'username') { 
                selectedUserValue = nome; 
                selectedUserEmail = datoExtra; 
                if (hiddenUsernameInput) hiddenUsernameInput.value = nome; 
                if (usernameSelect) usernameSelect.classList.remove('open'); 
                if (errorMsg) errorMsg.style.display = 'none'; 
            }
        }); 
        container.appendChild(option);
    }

    function resetDropdownDisplay(id, testo) {
        const displayEl = document.getElementById(id);
        if (displayEl) {
            displayEl.textContent = testo; 
            if (displayEl.parentElement) displayEl.parentElement.classList.remove('selected');
        }
        if(id === 'username-display') { 
            selectedUserValue = ""; 
            selectedUserEmail = ""; 
            if (hiddenUsernameInput) hiddenUsernameInput.value = ""; 
        }
    }

    document.querySelectorAll('.custom-select-trigger').forEach(trigger => {
        trigger.addEventListener('click', function(e) { 
            e.stopPropagation(); 
            const parent = this.parentElement; 
            if (!parent) return;
            const isOpen = parent.classList.contains('open');
            document.querySelectorAll('.custom-select').forEach(s => { if(s !== parent) s.classList.remove('open'); }); 
            parent.classList.toggle('open'); 
            this.setAttribute('aria-expanded', parent.classList.contains('open'));
        });
    });
    document.addEventListener('click', () => {
        document.querySelectorAll('.custom-select').forEach(sel => { 
            sel.classList.remove('open'); 
            const trig = sel.querySelector('.custom-select-trigger');
            if (trig) trig.setAttribute('aria-expanded', 'false');
        });
    });

    const segBtns = document.querySelectorAll('#role-control .seg-btn');
    const segSlider = document.getElementById('role-slider');
    const loginView = document.getElementById('login-view');
    const rulesView = document.getElementById('rules-view');

    segBtns.forEach((btn, index) => btn.addEventListener('click', (e) => {
        segBtns.forEach(b => b.classList.remove('active')); e.target.classList.add('active');
        selectedRole = e.target.dataset.role; 
        if (segSlider) segSlider.style.transform = index === 0 ? 'translateX(0)' : 'translateX(100%)';
        if(typeof window.populateUserDropdown === 'function') window.populateUserDropdown(selectedRole);
        const gErr = document.getElementById('google-login-error');
        if (gErr) gErr.style.display = 'none';
    }));

    const btnRulesBanner = document.getElementById('btn-rules-banner');
    if (btnRulesBanner) {
        btnRulesBanner.addEventListener('click', () => { 
            if (loginView) loginView.style.display = 'none'; 
            if (rulesView) rulesView.style.display = 'block'; 
        });
    }

    document.querySelectorAll('.btn-back-login').forEach(btn => { 
        btn.addEventListener('click', () => { 
            if (rulesView) rulesView.style.display = 'none'; 
            if (loginView) loginView.style.display = 'block'; 
            if (hidModal) hidModal.classList.remove('active'); 
        }); 
    });

    const togglePasswordBtn = document.getElementById('toggle-password');
    const eyeIcon = document.getElementById('eye-icon');
    const eyeSlashIcon = document.getElementById('eye-slash-icon');
    if (togglePasswordBtn && passInput) {
        togglePasswordBtn.addEventListener('click', () => {
            if (passInput.type === 'password') { 
                passInput.type = 'text'; passInput.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif"; passInput.style.letterSpacing = "normal"; 
                if (eyeIcon) eyeIcon.style.display = 'none'; 
                if (eyeSlashIcon) eyeSlashIcon.style.display = 'block'; 
            } else { 
                passInput.type = 'password'; passInput.style.fontFamily = "Verdana, sans-serif"; passInput.style.letterSpacing = "2px"; 
                if (eyeIcon) eyeIcon.style.display = 'block'; 
                if (eyeSlashIcon) eyeSlashIcon.style.display = 'none'; 
            }
        });
    }

    if (passInput) {
        passInput.addEventListener('copy', (e) => { 
            e.preventDefault(); 
            if (errorMsg) { errorMsg.innerText = 'Operazione negata.'; errorMsg.style.display = 'block'; }
        });
        passInput.addEventListener('paste', (e) => { 
            e.preventDefault(); 
            if (errorMsg) { errorMsg.innerText = 'Operazione negata.'; errorMsg.style.display = 'block'; }
        });
    }


    async function checkVPN() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000); 
            const res = await fetch('https://ipapi.co/json/', { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!res.ok) return false;
            const data = await res.json();
            const org = (data.org || "").toLowerCase();
            if (org.includes('vpn') || org.includes('hosting') || org.includes('cloud') || org.includes('datacenter')) return true; 
            return false;
        } catch (e) { return false; }
    }

    window.eseguiAccessoServer = function() {
        const pass = passInput ? passInput.value.trim() : ''; 
        const uName = hiddenUsernameInput ? hiddenUsernameInput.value.trim() : '';
        if (submitBtn) submitBtn.innerText = "VERIFICA IN CORSO...";
        if(typeof window.auth !== 'undefined') {
            window.auth.signInWithEmailAndPassword(selectedUserEmail, pass).then(() => {
                inviaEmail(selectedUserEmail, 2, { 
                    nome_utente: uName, 
                    email_utente: selectedUserEmail, 
                    orario_accesso: new Date().toLocaleString('it-IT') 
                });
                if (submitBtn) { submitBtn.innerText = "ENTRA"; submitBtn.disabled = false; }
                entraNelPortale(uName);
            }).catch(() => {
                if (submitBtn) { submitBtn.innerText = "ENTRA"; submitBtn.disabled = false; }
                if (passInput) passInput.value = ''; 
                window.globalTurnstileToken = "";
                if (typeof turnstile !== 'undefined') { try { turnstile.reset(); } catch(err){} }

                if (errorMsg) {
                    errorMsg.innerText = "Credenziali errate. Riprova."; 
                    errorMsg.style.display = 'block'; 
                    errorMsg.style.animation = 'none'; 
                    void errorMsg.offsetWidth; 
                    errorMsg.style.animation = 'shake 0.4s';
                }
                if (attemptsMsgObj) attemptsMsgObj.style.display = 'none';
            });
        } else {
            if (errorMsg) { errorMsg.innerText = "Servizio temporaneamente offline."; errorMsg.style.display = 'block'; }
            if (submitBtn) { submitBtn.innerText = "ENTRA"; submitBtn.disabled = false; }
        }
    };

    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault(); 
            if (document.activeElement) document.activeElement.blur(); 

            const pass = passInput ? passInput.value.trim() : ''; 
            const uName = hiddenUsernameInput ? hiddenUsernameInput.value.trim() : '';
            if (typeof window.auth === 'undefined') { if (errorMsg) { errorMsg.innerText = "Database offline."; errorMsg.style.display = 'block'; } return; }
            if (!uName || !selectedUserEmail) { if (errorMsg) { errorMsg.innerText = "Seleziona prima un utente dalla lista."; errorMsg.style.display = 'block'; } return; }
            if (!pass) { if (errorMsg) { errorMsg.innerText = "Il campo password è obbligatorio."; errorMsg.style.display = 'block'; } return; }

            if (errorMsg) errorMsg.style.display = 'none';
            if (submitBtn) { submitBtn.innerText = "VERIFICA SICUREZZA..."; submitBtn.disabled = true; }

            const isVpn = await checkVPN();
            if (isVpn) { 
                if (errorMsg) { errorMsg.innerText = "Disattivare la VPN per continuare."; errorMsg.style.display = 'block'; }
                if (submitBtn) { submitBtn.innerText = "ENTRA"; submitBtn.disabled = false; }
                return; 
            }
            
            if (window.globalTurnstileToken) {
                window.eseguiAccessoServer();
            } else {
                window.isWaitingForToken = true;
                window.turnstileCallbackFired = false;
                if (typeof turnstile !== 'undefined') { try { turnstile.execute(); } catch(err) {} }
                setTimeout(() => {
                    if (window.isWaitingForToken && !window.turnstileCallbackFired) {
                        window.isWaitingForToken = false;
                        window.eseguiAccessoServer();
                    }
                }, 2500);
            }
        });
    }

    const googleBtn = document.getElementById('custom-google-btn');
    const googleErrorMsg = document.getElementById('google-login-error');
    
    if (googleBtn) {
        googleBtn.addEventListener('click', async () => {
            if (document.activeElement) document.activeElement.blur();
            const originalGoogleBtn = googleBtn.innerHTML;
            googleBtn.innerHTML = `<div class="btn-loader"><div class="btn-spinner"></div><span class="btn-text-main" style="margin-left: 5px;">CARICO...</span></div>`; 
            googleBtn.disabled = true; 
            if (googleErrorMsg) googleErrorMsg.style.display = 'none';
            
            const isVpn = await checkVPN();
            if (isVpn) { 
                if (googleErrorMsg) { googleErrorMsg.innerText = "Disattivare la VPN per continuare."; googleErrorMsg.style.display = 'block'; }
                googleBtn.innerHTML = originalGoogleBtn; googleBtn.disabled = false; return; 
            }
            if(typeof window.auth === 'undefined') { 
                if (googleErrorMsg) { googleErrorMsg.innerText = "Servizio di autenticazione offline."; googleErrorMsg.style.display = 'block'; }
                googleBtn.innerHTML = originalGoogleBtn; googleBtn.disabled = false; return; 
            }
            
            const googleProvider = new firebase.auth.GoogleAuthProvider();
            const targetDomain = selectedRole === 'studente' ? 'studenti.itisavogadro.it' : 'itisavogadro.it';
            
            googleProvider.setCustomParameters({
                hd: targetDomain
            });

            window.auth.signInWithPopup(googleProvider).then((result) => {
                const email = result.user.email.toLowerCase();
                
                if (email.endsWith("@" + targetDomain)) {
                    inviaEmail(email, 2, { 
                        nome_utente: result.user.displayName || "Utente", 
                        email_utente: email, 
                        orario_accesso: new Date().toLocaleString('it-IT') 
                    });
                    entraNelPortale(result.user.displayName || "Utente"); 
                    googleBtn.innerHTML = originalGoogleBtn; 
                    googleBtn.disabled = false; 
                } else { 
                    window.auth.signOut().then(() => { 
                        if (googleErrorMsg) {
                            googleErrorMsg.innerText = "Accesso negato. Devi utilizzare l'email scolastica."; 
                            googleErrorMsg.style.display = 'block'; 
                        }
                        googleBtn.innerHTML = originalGoogleBtn; 
                        googleBtn.disabled = false; 
                    }); 
                }
            }).catch((err) => { 
                console.error(err);
                if (googleErrorMsg) {
                    googleErrorMsg.innerText = "Accesso annullato. Riprova."; 
                    googleErrorMsg.style.display = 'block'; 
                }
                googleBtn.innerHTML = originalGoogleBtn; 
                googleBtn.disabled = false; 
            });
        });
    }

    const btnHarzafiId = document.getElementById('btn-harzafi-id');
    if (btnHarzafiId && hidModal) {
        btnHarzafiId.addEventListener('click', () => { hidModal.classList.add('active'); if (document.activeElement) document.activeElement.blur(); });
    }
    const hidCloseBtn = document.getElementById('hid-close-btn');
    if (hidCloseBtn && hidModal) {
        hidCloseBtn.addEventListener('click', () => { hidModal.classList.remove('active'); });
    }
    const hidCancelBtn = document.getElementById('hid-cancel-btn');
    if (hidCancelBtn && hidModal) {
        hidCancelBtn.addEventListener('click', () => { hidModal.classList.remove('active'); });
    }
    const hidOpenManual = document.getElementById('hid-open-manual');
    if (hidOpenManual) {
        hidOpenManual.addEventListener('click', (e) => { 
            e.preventDefault(); 
            const scanView = document.getElementById('hid-scan-view');
            const manualView = document.getElementById('hid-manual-view');
            const hidInput = document.getElementById('hid-input');
            if (scanView) scanView.style.display = 'none'; 
            if (manualView) manualView.style.display = 'block'; 
            if (hidInput) hidInput.focus(); 
        });
    }
    const hidBackBtn = document.getElementById('hid-back-btn');
    if (hidBackBtn) {
        hidBackBtn.addEventListener('click', () => { 
            const scanView = document.getElementById('hid-scan-view');
            const manualView = document.getElementById('hid-manual-view');
            const hidError = document.getElementById('hid-error');
            if (manualView) manualView.style.display = 'none'; 
            if (scanView) scanView.style.display = 'block'; 
            if (hidError) hidError.style.display = 'none'; 
        });
    }

    const hidSubmitBtn = document.getElementById('hid-submit-btn');
    if (hidSubmitBtn) {
        hidSubmitBtn.addEventListener('click', async () => { 
            if (document.activeElement) document.activeElement.blur();
            const errorMsg = document.getElementById('hid-error');
            const originalBtnText = hidSubmitBtn.innerHTML;
            const hidInputEl = document.getElementById('hid-input');
            const inputHidVal = hidInputEl ? hidInputEl.value.trim() : '';

            const isVpn = await checkVPN();
            if (isVpn) { if (errorMsg) { errorMsg.innerText = "Disattivare la VPN per continuare."; errorMsg.style.display = 'block'; } return; }
            
            if (inputHidVal.length === 0) return;

            hidSubmitBtn.innerHTML = "VERIFICA IN CORSO...";
            hidSubmitBtn.disabled = true;
            if (errorMsg) errorMsg.style.display = 'none';

            if (typeof window.db !== 'undefined') {
                window.db.collection("studenti").where("HID", "==", inputHidVal).get().then(async (snap) => {
                    if (!snap.empty) {
                        const userData = snap.docs[0].data();

                        if (typeof window.auth !== 'undefined') {
                            try {
                                await window.auth.signInAnonymously();
                            } catch (err) {
                                console.warn("Autenticazione anonima fallita, potrebbero mancare i permessi:", err);
                            }
                        }

                        if (hidModal) hidModal.classList.remove('active'); 
                        hidSubmitBtn.innerHTML = originalBtnText;
                        hidSubmitBtn.disabled = false;
                        if (hidInputEl) hidInputEl.value = ""; 
                        entraNelPortale(userData.nome); 
                    } else {
                        throw new Error("HID non valido.");
                    }
                }).catch(() => {
                    if (errorMsg) {
                        errorMsg.innerText = "HID non valido. Riprova."; 
                        errorMsg.style.display = 'block'; 
                        errorMsg.style.animation = 'none'; void errorMsg.offsetWidth; errorMsg.style.animation = 'shake 0.4s';
                    }
                    hidSubmitBtn.innerHTML = originalBtnText;
                    hidSubmitBtn.disabled = false;
                });
            } else {
                if (errorMsg) {
                    errorMsg.innerText = "Database offline."; 
                    errorMsg.style.display = 'block';
                }
                hidSubmitBtn.innerHTML = originalBtnText;
                hidSubmitBtn.disabled = false;
            }
        });
    }

    const yearDropdownBtn = document.getElementById('year-dropdown-btn');
    const yearDropdownMenu = document.getElementById('year-dropdown-menu');
    if (yearDropdownBtn && yearDropdownMenu) {
        yearDropdownBtn.addEventListener('click', (e) => { e.stopPropagation(); yearDropdownMenu.classList.toggle('open'); });
        document.addEventListener('click', (e) => { if (!e.target.closest('.year-selector')) yearDropdownMenu.classList.remove('open'); });
    }

    function entraNelPortale(nomeUtente) {
        if (loginModal) loginModal.classList.remove('active');
        const formattedName = nomeUtente.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
        const greetingEl = document.getElementById('user-greeting-title');
        if (greetingEl) greetingEl.innerText = `Buongiorno, ${formattedName}.`;
        
        const landing = document.getElementById('landing-view'); 
        const dash = document.getElementById('app-dashboard');
        
        isScrolled = false; 
        if (navbar) navbar.classList.remove('scrolled'); 
        if (landing) landing.style.opacity = '0'; 
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        setTimeout(() => { 
            if (landing) landing.style.display = 'none'; 
            
            if (dash) {
                dash.style.display = 'block'; 
                void dash.offsetWidth; 
                dash.style.opacity = '1'; 
            }
            document.body.style.overflow = ''; 
            
            const hourCounter = document.getElementById('hour-counter');
            if (hourCounter) hourCounter.innerText = finalHoursValue; 
            setTimeout(() => { document.querySelectorAll('.stat-segment').forEach((el, index) => { setTimeout(() => { el.style.transform = 'scaleX(1)'; }, index * 150); }); }, 100);
            scaricaECostruisciCronologia(); 
            
            setTimeout(() => {
                const discModal = document.getElementById('disclaimer-ministero-modal');
                if (discModal) discModal.classList.add('active');
            }, 800); 
            
        }, 500);
    }

    const btnLogoutDash = document.getElementById('btn-logout-dash');
    if (btnLogoutDash) {
        btnLogoutDash.addEventListener('click', async () => { 
            const dash = document.getElementById('app-dashboard');
            const landing = document.getElementById('landing-view');

            if (dash) dash.style.opacity = '0';
            window.scrollTo({ top: 0, behavior: 'smooth' });

            try {
                if (typeof window.auth !== 'undefined') await window.auth.signOut();
            } catch(err) {
                console.error("Errore durante il logout:", err);
            }

            window.globalTurnstileToken = "";
            if (typeof turnstile !== 'undefined') { try { turnstile.reset(); } catch(err){} }

            if (passInput) passInput.value = '';
            if (hiddenUsernameInput) hiddenUsernameInput.value = '';
            resetDropdownDisplay('username-display', 'Seleziona Utente');
            if (errorMsg) errorMsg.style.display = 'none';
            document.querySelectorAll('.stat-segment').forEach(el => el.style.transform = 'scaleX(0)');
            const tlContainer = document.getElementById('timeline-container');
            if (tlContainer) tlContainer.innerHTML = '';
            if (submitBtn) {
                submitBtn.innerText = "ENTRA";
                submitBtn.disabled = false;
            }

            setTimeout(() => {
                if (dash) dash.style.display = 'none';
                if (landing) {
                    landing.style.display = 'block';
                    void landing.offsetWidth;
                    landing.style.opacity = '1';
                }
            }, 500);
        });
    }

    function scaricaECostruisciCronologia() {
        const container = document.getElementById('timeline-container');
        if (!container) return;
        container.innerHTML = '<div style="text-align:center; padding:20px; font-weight:bold; color:var(--primary);">Sincronizzazione dati in corso...</div>';

        if (typeof window.db !== 'undefined') {
            window.db.collection("attivita_pcto").orderBy("ordine", "desc").get()
            .then((querySnapshot) => {
                container.innerHTML = ''; 
                if (querySnapshot.empty) { container.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">Nessuna attività registrata.</div>'; return; }

                querySnapshot.forEach((doc, index) => {
                    const att = doc.data(); const cssCertElement = att.certificato ? 'ac-cert' : ''; const cssDateElement = att.certificato ? 'special-badge-date' : ''; const bgCertInfo = att.certificato ? 'style="background:#ecfdf5; border-color:#a7f3d0;"' : '';
                    const itemHTML = `<div class="timeline-item ${cssCertElement} reveal" aria-expanded="false"><div class="tl-header"><div class="tl-content"><span class="tl-date ${cssDateElement}">${att.data}</span><h3>${att.titolo}</h3><p class="tl-meta">${att.meta}</p></div><div class="tl-hours">${att.ore}</div></div><div class="tl-dropdown"><div class="tl-dropdown-inner"><div class="tl-ext-info" ${bgCertInfo}>${att.descrizione || "Dettagli non disponibili."}</div></div></div></div>`;
                    container.insertAdjacentHTML('beforeend', itemHTML);
                });

                const observerOptions = { root: null, rootMargin: '0px', threshold: 0.15 };
                const tlObserver = new IntersectionObserver((entries, obs) => { entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('active'); obs.unobserve(entry.target); } }); }, observerOptions);
                container.querySelectorAll('.reveal').forEach(el => tlObserver.observe(el));
                container.querySelectorAll('.timeline-item').forEach(currElMap => { currElMap.addEventListener('click', function() { const isOpen = this.getAttribute('aria-expanded') === 'true'; this.setAttribute('aria-expanded', String(!isOpen)); }); });
            }).catch((error) => { container.innerHTML = '<div style="color:var(--danger); text-align:center; padding:20px;">ERRORE: Impossibile recuperare i dati. Assicurati di essere autenticato e di avere i permessi.</div>'; });
        } else { container.innerHTML = '<div style="color:var(--warning); text-align:center; padding:20px; font-weight:700;">Dati temporaneamente offline.</div>'; }
    }


    let targetCollectionOTP = 'studenti';
    const sharedOtpView = document.getElementById('shared-otp-view');
    const otpStep1 = document.getElementById('otp-step-1');
    const otpStep3 = document.getElementById('otp-step-3');
    const otpEmailInput = document.getElementById('otp-email-input');

    window.chiudiModaleRecuperoEAproLogin = function() {
        if (forgotSheetModal) forgotSheetModal.classList.remove('active');
        if (loginModal) loginModal.classList.add('active');
    };

    function setupForgotView() {
        if (otpStep1) { otpStep1.style.display = 'block'; otpStep1.style.opacity = '1'; }
        if (otpStep3) { otpStep3.style.display = 'none'; otpStep3.style.opacity = '0'; }
        if (otpEmailInput) otpEmailInput.value = '';
        const otpErr = document.getElementById('otp-error-msg');
        if (otpErr) otpErr.style.display = 'none';

        const roleTitle = document.getElementById('otp-role-title');
        if(selectedRole === 'studente') { 
            if (roleTitle) roleTitle.innerText = 'Area Studenti';
            targetCollectionOTP = 'studenti';
        } else { 
            if (roleTitle) roleTitle.innerText = 'Area Docenti';
            targetCollectionOTP = 'docenti';
        }
    }

    const btnOtpBack = document.getElementById('btn-otp-back-selection');
    if (btnOtpBack) {
        btnOtpBack.addEventListener('click', () => {
            chiudiModaleRecuperoEAproLogin();
        });
    }

    const btnSendOtp = document.getElementById('btn-send-otp');
    if (btnSendOtp && otpEmailInput) {
        btnSendOtp.addEventListener('click', async function() {
            const emailVal = otpEmailInput.value.trim().toLowerCase();
            const errorDiv = document.getElementById('otp-error-msg');
            const originalBtnText = this.innerHTML;
            
            if(!emailVal || !emailVal.includes('@')) { 
                if (errorDiv) {
                    errorDiv.innerText = "Inserisci un'email valida."; 
                    errorDiv.style.display = 'block'; 
                }
                return; 
            }
            
            if (errorDiv) errorDiv.style.display = 'none';
            this.innerHTML = '<div class="btn-loader"><div class="btn-spinner"></div><span>Invio in corso...</span></div>';
            this.disabled = true;

            try {
                const snapshot = await window.db.collection(targetCollectionOTP).where('email', '==', emailVal).get();
                if(snapshot.empty) throw new Error("Email non trovata a sistema.");

                await window.auth.sendPasswordResetEmail(emailVal);

                if (otpStep1) otpStep1.style.opacity = '0';
                setTimeout(() => {
                    if (otpStep1) otpStep1.style.display = 'none'; 
                    if (otpStep3) {
                        otpStep3.style.display = 'block';
                        setTimeout(() => { otpStep3.style.opacity = '1'; }, 50);
                    }
                }, 400);

            } catch (err) {
                console.error(err);
                if (errorDiv) {
                    errorDiv.innerText = err.message || "Errore di connessione. Riprova.";
                    errorDiv.style.display = 'block'; 
                    errorDiv.style.animation = 'none'; 
                    void errorDiv.offsetWidth; 
                    errorDiv.style.animation = 'shake 0.4s';
                }
            } finally {
                this.innerHTML = originalBtnText; 
                this.disabled = false;
            }
        });
    }

    const closeDiscModal = document.getElementById('close-disclaimer-modal');
    if (closeDiscModal) {
        closeDiscModal.addEventListener('click', () => { 
            const discModal = document.getElementById('disclaimer-ministero-modal');
            if (discModal) discModal.classList.remove('active'); 
            const dash = document.getElementById('app-dashboard');
            if(dash) { dash.style.display = 'block'; dash.style.opacity = '1'; }
            document.body.style.overflow = '';
        });
    }

});
