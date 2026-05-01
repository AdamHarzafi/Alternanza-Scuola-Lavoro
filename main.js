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
    if (window.isWaitingForToken) { window.isWaitingForToken = false; if(typeof window.eseguiAccessoServer === 'function') window.eseguiAccessoServer(); }
};
window.onTurnstileExpired = function() { window.globalTurnstileToken = ""; };
window.onTurnstileError = function() { 
    window.globalTurnstileToken = ""; 
    if (window.isWaitingForToken) { window.isWaitingForToken = false; if(typeof window.eseguiAccessoServer === 'function') window.eseguiAccessoServer(); }
};

window.addEventListener('load', () => {
    if(typeof firebase !== 'undefined') {
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

        try {
            const appCheck = firebase.appCheck();
            appCheck.activate(
                new firebase.appCheck.ReCaptchaEnterpriseProvider('6LejpcksAAAAAEQEVZ602t2PL78MzHE73T4a608-'),
                true
            );
            console.log("App Check inizializzato correttamente.");
        } catch (error) {
            console.error("Attenzione: App Check non caricato (normale se manca lo script o sei in locale).", error);
        }
        
        window.auth = firebase.auth();
        window.db = firebase.firestore();
    }
    
    if(typeof populateUserDropdown === 'function') populateUserDropdown('studente');
});

const scrollBtn = document.getElementById('scrollToTop');
window.addEventListener('scroll', () => {
    if (window.scrollY > 300) scrollBtn.classList.add('visible'); 
    else scrollBtn.classList.remove('visible');
});
scrollBtn.addEventListener('click', () => { window.scrollTo({ top: 0, behavior: 'smooth' }); });

const cookieBanner = document.getElementById('apple-cookie-banner');
const btnAccetto = document.getElementById('btn-accetto-cookie');
const btnRifiuto = document.getElementById('btn-rifiuto-cookie');

function initCookies() {
    const consent = localStorage.getItem('harzafi_cookie_consent');
    if (!consent) setTimeout(() => cookieBanner.classList.add('active'), 500); 
    else applyTracking(JSON.parse(consent).analytics); 
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
                counterRef.update({
                    count: firebase.firestore.FieldValue.increment(1)
                }).then(() => {
                    sessionStorage.setItem('view_counted', 'true');
                    return counterRef.get();
                }).then((doc) => {
                    if(doc.exists) trackerText.innerText = doc.data().count;
                }).catch(err => {
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

btnAccetto.addEventListener('click', () => {
    localStorage.setItem('harzafi_cookie_consent', JSON.stringify({ technical: true, analytics: true }));
    cookieBanner.classList.remove('active'); applyTracking(true);
});

btnRifiuto.addEventListener('click', () => {
    localStorage.setItem('harzafi_cookie_consent', JSON.stringify({ technical: true, analytics: false }));
    cookieBanner.classList.remove('active'); applyTracking(false);
});

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
        e.preventDefault(); loginModal.classList.add('active');
        window.globalTurnstileToken = "";
            if (typeof turnstile !== 'undefined') { try { turnstile.reset(); } catch(err){} }
        });
    });

    document.getElementById('btn-open-maps').addEventListener('click', (e) => { e.preventDefault(); mapsModal.classList.add('active'); });
    document.getElementById('btn-forgot-pass').addEventListener('click', (e) => { e.preventDefault(); loginModal.classList.remove('active'); forgotSheetModal.classList.add('active'); setupForgotView(); });
    document.querySelectorAll('.close-btn').forEach(btn => btn.addEventListener('click', () => { btn.closest('.modal-overlay').classList.remove('active'); }));
    
    document.getElementById('forgot-sheet-close').addEventListener('click', () => {
        forgotSheetModal.classList.remove('active');
        stopScannerSafe();
        document.getElementById('cie-anim-container').classList.remove('flipped');
        document.getElementById('scan-result').style.display = 'none';
    });

    const usernameSelect = document.getElementById('username-select');
    const hiddenUsernameInput = document.getElementById('hidden-username');
    
    window.populateUserDropdown = function(role) {
        const optionsContainer = document.getElementById('username-options');
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
    }

    function creaOpzioneDropdown(nome, datoExtra, container, tipo) {
        const option = document.createElement('div');
        option.className = 'custom-option'; option.textContent = nome;
        option.addEventListener('click', function(e) {
            e.stopPropagation(); document.getElementById(`${tipo}-display`).textContent = nome; document.getElementById(`${tipo}-display`).parentElement.classList.add('selected');
            if(tipo === 'username') { selectedUserValue = nome; selectedUserEmail = datoExtra; hiddenUsernameInput.value = nome; usernameSelect.classList.remove('open'); errorMsg.style.display = 'none'; }
        }); container.appendChild(option);
    }

    function resetDropdownDisplay(id, testo) {
        document.getElementById(id).textContent = testo; document.getElementById(id).parentElement.classList.remove('selected');
        if(id === 'username-display') { selectedUserValue = ""; selectedUserEmail = ""; hiddenUsernameInput.value = ""; }
    }

    document.querySelectorAll('.custom-select-trigger').forEach(trigger => {
        trigger.addEventListener('click', function(e) { 
            e.stopPropagation(); 
            const parent = this.parentElement; 
            const isOpen = parent.classList.contains('open');
            document.querySelectorAll('.custom-select').forEach(s => { if(s !== parent) s.classList.remove('open'); }); 
            parent.classList.toggle('open'); 
            this.setAttribute('aria-expanded', parent.classList.contains('open'));
        });
    });
    document.addEventListener('click', () => {
        document.querySelectorAll('.custom-select').forEach(sel => { 
            sel.classList.remove('open'); 
            sel.querySelector('.custom-select-trigger').setAttribute('aria-expanded', 'false');
        });
    });

    const segBtns = document.querySelectorAll('#role-control .seg-btn');
    const segSlider = document.getElementById('role-slider');
    const loginView = document.getElementById('login-view');
    const rulesView = document.getElementById('rules-view');

    segBtns.forEach((btn, index) => btn.addEventListener('click', (e) => {
        segBtns.forEach(b => b.classList.remove('active')); e.target.classList.add('active');
        selectedRole = e.target.dataset.role; segSlider.style.transform = index === 0 ? 'translateX(0)' : 'translateX(100%)';
        if(typeof window.populateUserDropdown === 'function') window.populateUserDropdown(selectedRole);
        document.getElementById('google-login-error').style.display = 'none';
    }));

    document.getElementById('btn-rules-banner').addEventListener('click', () => { loginView.style.display = 'none'; rulesView.style.display = 'block'; });
    document.querySelectorAll('.btn-back-login').forEach(btn => { btn.addEventListener('click', () => { rulesView.style.display = 'none'; loginView.style.display = 'block'; hidModal.classList.remove('active'); }); });

    const togglePasswordBtn = document.getElementById('toggle-password');
    const eyeIcon = document.getElementById('eye-icon');
    const eyeSlashIcon = document.getElementById('eye-slash-icon');
    togglePasswordBtn.addEventListener('click', () => {
        if (passInput.type === 'password') { 
            passInput.type = 'text'; passInput.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif"; passInput.style.letterSpacing = "normal"; eyeIcon.style.display = 'none'; eyeSlashIcon.style.display = 'block'; 
        } else { 
            passInput.type = 'password'; passInput.style.fontFamily = "Verdana, sans-serif"; passInput.style.letterSpacing = "2px"; eyeIcon.style.display = 'block'; eyeSlashIcon.style.display = 'none'; 
        }
    });
    passInput.addEventListener('copy', (e) => { e.preventDefault(); errorMsg.innerText = 'Operazione negata.'; errorMsg.style.display = 'block'; });
    passInput.addEventListener('paste', (e) => { e.preventDefault(); errorMsg.innerText = 'Operazione negata.'; errorMsg.style.display = 'block'; });

    let html5QrCode = null;

    function startCIEScanner() {
        const readerElement = document.getElementById('reader');
        readerElement.innerHTML = '<div style="color:white; padding: 40px 20px; text-align:center; font-weight:600; display:flex; align-items:center; height:100%; justify-content:center;">Richiesta accesso fotocamera...</div>';
        
        const config = { fps: 15 };
        html5QrCode = new Html5Qrcode("reader");
        html5QrCode.start(
            { facingMode: "environment" },
            config,
            (decodedText, decodedResult) => {
                const cfRegex = /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/i;
                const cfMatchFallback = decodedText.match(/[A-Z0-9]{16}/i); 
                
                let extractedCF = null;
                if (cfRegex.test(decodedText)) { extractedCF = decodedText; } 
                else if (cfMatchFallback) { extractedCF = cfMatchFallback[0]; }

                if (extractedCF && extractedCF.length === 16) {
                    const scannedCF = extractedCF.toUpperCase();
                    stopScannerSafe().then(() => {
                        verifyScannedCF(scannedCF);
                    }).catch(() => {
                        verifyScannedCF(scannedCF);
                    });
                }
            },
            (errorMessage) => { }
        ).catch((err) => {
            readerElement.innerHTML = `<div style="color:var(--danger); padding: 40px 20px; text-align:center; font-weight:600; background:#fff; height:100%; display:flex; align-items:center; justify-content:center; flex-direction:column;">Accesso fotocamera negato.<br><span style="font-size:0.8rem; color:#64748b; font-weight:500; margin-top:5px;">Controlla i permessi del tuo browser o sistema.</span></div>`;
        });
    }

    function stopScannerSafe() {
        return new Promise((resolve) => {
            if (html5QrCode && html5QrCode.isScanning) {
                html5QrCode.stop().then(() => { html5QrCode.clear(); resolve(); }).catch((e) => { resolve(); });
            } else { resolve(); }
        });
    }

    function showErrorScanner(msg) {
        const scanResult = document.getElementById('scan-result');
        scanResult.style.display = 'block';
        scanResult.innerHTML = `<span style="font-weight:900;">Errore</span><br><span style="font-weight:600; display:block; margin-top:5px;">${msg}</span>`; 
        scanResult.style.background = "#fef2f2";
        scanResult.style.border = "1px solid #fecaca";
        scanResult.style.color = "#dc2626";
        setTimeout(() => { startCIEScanner(); scanResult.style.display = 'none'; }, 4000);
    }

    function mostraSuccessoRecuperoCIE() {
        document.getElementById('scanner-container').style.display = 'none';
        const backBtn = document.getElementById('btn-cie-back-selection');
        if(backBtn) backBtn.style.display = 'none';
        
        const scanResult = document.getElementById('scan-result');
        scanResult.style.display = 'block';
        scanResult.innerHTML = `
            <svg viewBox="0 0 24 24" style="width: 48px; height: 48px; fill: var(--success); margin-bottom: 15px; display: block; margin: 0 auto;"><path d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M11,16.5L18,9.5L16.59,8.09L11,13.67L7.91,10.59L6.5,12L11,16.5Z"/></svg>
            <span style="font-weight:900; font-size:1.3rem; display:block; margin-bottom:8px;">Identità Confermata</span>
            <span style="font-weight:500; font-size:1.05rem; display:block; margin-bottom: 25px; line-height: 1.5; color: var(--text-gray);">Abbiamo inviato un link di recupero sicuro all'indirizzo email associato al tuo profilo. Controlla la tua posta.</span>
            <button type="button" class="btn-gradient" onclick="chiudiModaleRecuperoEAproLogin()" style="width: 100%;">← TORNA AL LOGIN</button>
        `;
        scanResult.style.background = "#ecfdf5";
        scanResult.style.border = "2px solid #a7f3d0";
        scanResult.style.color = "#065f46";
    }

    function verifyScannedCF(cfInputVal) {
        const scanResult = document.getElementById('scan-result');
        scanResult.style.display = 'block';
        scanResult.innerHTML = `<div class="btn-loader" style="color: #d97706; width:100%; justify-content:center;"><div class="btn-spinner" style="border-top-color: #d97706; border-color: rgba(217,119,6,0.2);"></div><span style="font-weight:800; margin-left:8px;">Verifica in corso...</span></div>`;
        scanResult.style.background = "#fffbeb";
        scanResult.style.border = "1px solid #fde68a";
        scanResult.style.color = "#d97706";

        if(typeof window.db !== 'undefined' && typeof window.auth !== 'undefined') {
            window.db.collection("studenti").where("cf", "==", cfInputVal).get().then((snap) => {
                if (!snap.empty && snap.docs[0].data().email) {
                    const dbEmail = snap.docs[0].data().email;
                    window.auth.sendPasswordResetEmail(dbEmail).then(() => { mostraSuccessoRecuperoCIE(); }).catch(() => { showErrorScanner("Errore dal server email. Riprova."); });
                } else { showErrorScanner("Documento non associato a nessun account attivo."); }
            }).catch(() => { showErrorScanner("Errore di connessione al database. Riprova."); });
        } else { showErrorScanner("Database non raggiungibile al momento."); }
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
        const pass = passInput.value.trim(); const uName = hiddenUsernameInput.value.trim();
        submitBtn.innerText = "VERIFICA IN CORSO...";
        if(typeof window.auth !== 'undefined') {
            window.auth.signInWithEmailAndPassword(selectedUserEmail, pass).then(() => {
                inviaEmail(selectedUserEmail, 2, { 
                    nome_utente: uName, 
                    email_utente: selectedUserEmail, 
                    orario_accesso: new Date().toLocaleString('it-IT') 
                });
                submitBtn.innerText = "ENTRA"; submitBtn.disabled = false; entraNelPortale(uName);
            }).catch(() => {
                submitBtn.innerText = "ENTRA"; submitBtn.disabled = false; passInput.value = ''; 
                window.globalTurnstileToken = "";
                if (typeof turnstile !== 'undefined') { try { turnstile.reset(); } catch(err){} }

                errorMsg.innerText = "Credenziali errate. Riprova."; 
                errorMsg.style.display = 'block'; 
                attemptsMsgObj.style.display = 'none';
                errorMsg.style.animation = 'none'; 
                void errorMsg.offsetWidth; 
                errorMsg.style.animation = 'shake 0.4s';
            });
        } else {
            errorMsg.innerText = "Servizio temporaneamente offline."; errorMsg.style.display = 'block';
            submitBtn.innerText = "ENTRA"; submitBtn.disabled = false;
        }
    };

    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault(); 
        if (document.activeElement) document.activeElement.blur(); 

        const pass = passInput.value.trim(); const uName = hiddenUsernameInput.value.trim();
        if (typeof window.auth === 'undefined') { errorMsg.innerText = "Database offline."; errorMsg.style.display = 'block'; return; }
        if (!uName || !selectedUserEmail) { errorMsg.innerText = "Seleziona prima un utente dalla lista."; errorMsg.style.display = 'block'; return; }
        if (!pass) { errorMsg.innerText = "Il campo password è obbligatorio."; errorMsg.style.display = 'block'; return; }

        errorMsg.style.display = 'none';
        submitBtn.innerText = "VERIFICA SICUREZZA..."; submitBtn.disabled = true;

        const isVpn = await checkVPN();
        if (isVpn) { errorMsg.innerText = "Disattivare la VPN per continuare."; errorMsg.style.display = 'block'; submitBtn.innerText = "ENTRA"; submitBtn.disabled = false; return; }
        
        if (window.globalTurnstileToken) { window.eseguiAccessoServer(); } 
        else { 
            window.isWaitingForToken = true; 
            if (typeof turnstile !== 'undefined') { try { turnstile.execute(); } catch(err) {} }
            setTimeout(() => { if (window.isWaitingForToken) { window.isWaitingForToken = false; window.eseguiAccessoServer(); } }, 2500);
        }
    });

    const googleBtn = document.getElementById('custom-google-btn');
    const googleErrorMsg = document.getElementById('google-login-error');
    
    googleBtn.addEventListener('click', async () => {
        if (document.activeElement) document.activeElement.blur();
        const originalGoogleBtn = googleBtn.innerHTML;
        googleBtn.innerHTML = `<div class="btn-loader"><div class="btn-spinner"></div><span class="btn-text-main" style="margin-left: 5px;">CARICO...</span></div>`; 
        googleBtn.disabled = true; googleErrorMsg.style.display = 'none';
        
        const isVpn = await checkVPN();
        if (isVpn) { googleErrorMsg.innerText = "Disattivare la VPN per continuare."; googleErrorMsg.style.display = 'block'; googleBtn.innerHTML = originalGoogleBtn; googleBtn.disabled = false; return; }
        if(typeof window.auth === 'undefined') { googleErrorMsg.innerText = "Servizio di autenticazione offline."; googleErrorMsg.style.display = 'block'; googleBtn.innerHTML = originalGoogleBtn; googleBtn.disabled = false; return; }
        
        // Prepariamo il provider di Google
const googleProvider = new firebase.auth.GoogleAuthProvider();

// OPZIONALE: Se la maggior parte degli utenti usa questo dominio, 
// forziamo la schermata di Google a filtrare (graficamente) per questo dominio.
googleProvider.setCustomParameters({
    hd: 'studenti.itisavogadro.it'
});

window.auth.signInWithPopup(googleProvider).then((result) => {
    const email = result.user.email.toLowerCase();
    
    // Il controllo JS rimane come strato visivo (per mostrare l'errore rosso a schermo)
    if (email.endsWith("@studenti.itisavogadro.it") || email.endsWith("@itisavogadro.it")) { 
        inviaEmail(email, 2, { 
            nome_utente: result.user.displayName || "Utente", 
            email_utente: email, 
            orario_accesso: new Date().toLocaleString('it-IT') 
        });
        entraNelPortale(result.user.displayName || "Utente"); 
        googleBtn.innerHTML = originalGoogleBtn; 
        googleBtn.disabled = false; 
    } else { 
        // L'utente ha usato un'email non valida. Anche se avesse manomesso questo step, 
        // le regole Firestore lo bloccherebbero al 100%.
        window.auth.signOut().then(() => { 
            // Mostriamo l'errore a schermo per avvisare l'utente del suo sbaglio
            googleErrorMsg.innerText = "Accesso negato. Devi utilizzare l'email scolastica."; 
            googleErrorMsg.style.display = 'block'; 
            googleBtn.innerHTML = originalGoogleBtn; 
            googleBtn.disabled = false; 
        }); 
    }
}).catch((err) => { 
    console.error(err);
    googleErrorMsg.innerText = "Accesso annullato. Riprova."; 
    googleErrorMsg.style.display = 'block'; 
    googleBtn.innerHTML = originalGoogleBtn; 
    googleBtn.disabled = false; 
});

    document.getElementById('btn-harzafi-id').addEventListener('click', () => { hidModal.classList.add('active'); if (document.activeElement) document.activeElement.blur(); });
    document.getElementById('hid-close-btn').addEventListener('click', () => { hidModal.classList.remove('active'); });
    document.getElementById('hid-cancel-btn').addEventListener('click', () => { hidModal.classList.remove('active'); });
    document.getElementById('hid-open-manual').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('hid-scan-view').style.display = 'none'; document.getElementById('hid-manual-view').style.display = 'block'; document.getElementById('hid-input').focus(); });
    document.getElementById('hid-back-btn').addEventListener('click', () => { document.getElementById('hid-manual-view').style.display = 'none'; document.getElementById('hid-scan-view').style.display = 'block'; document.getElementById('hid-error').style.display = 'none'; });

    document.getElementById('hid-submit-btn').addEventListener('click', async () => { 
        if (document.activeElement) document.activeElement.blur();
        const errorMsg = document.getElementById('hid-error');
        const submitBtn = document.getElementById('hid-submit-btn');
        const originalBtnText = submitBtn.innerHTML;
        const inputHidVal = document.getElementById('hid-input').value.trim();

        const isVpn = await checkVPN();
        if (isVpn) { errorMsg.innerText = "Disattivare la VPN per continuare."; errorMsg.style.display = 'block'; return; }
        
        if (inputHidVal.length === 0) return;

        submitBtn.innerHTML = "VERIFICA IN CORSO...";
        submitBtn.disabled = true;
        errorMsg.style.display = 'none';

        if (typeof window.db !== 'undefined') {
            window.db.collection("studenti").where("HID", "==", inputHidVal).get().then(async (snap) => {
                if (!snap.empty) {
                    const userData = snap.docs[0].data();

                    // Avviamo una sessione anonima su Firebase per ottenere i permessi di lettura
                    if (typeof window.auth !== 'undefined') {
                        try {
                            await window.auth.signInAnonymously();
                        } catch (err) {
                            console.warn("Autenticazione anonima fallita, potrebbero mancare i permessi:", err);
                        }
                    }

                    hidModal.classList.remove('active'); 
                    submitBtn.innerHTML = originalBtnText;
                    submitBtn.disabled = false;
                    document.getElementById('hid-input').value = ""; 
                    entraNelPortale(userData.nome); 
                } else {
                    throw new Error("HID non valido.");
                }
            }).catch(() => {
                errorMsg.innerText = "HID non valido. Riprova."; 
                errorMsg.style.display = 'block'; 
                errorMsg.style.animation = 'none'; void errorMsg.offsetWidth; errorMsg.style.animation = 'shake 0.4s';
                submitBtn.innerHTML = originalBtnText;
                submitBtn.disabled = false;
            });
        } else {
            errorMsg.innerText = "Database offline."; 
            errorMsg.style.display = 'block';
            submitBtn.innerHTML = originalBtnText;
            submitBtn.disabled = false;
        }
    });

    const yearDropdownBtn = document.getElementById('year-dropdown-btn');
    const yearDropdownMenu = document.getElementById('year-dropdown-menu');
    if (yearDropdownBtn && yearDropdownMenu) {
        yearDropdownBtn.addEventListener('click', (e) => { e.stopPropagation(); yearDropdownMenu.classList.toggle('open'); });
        document.addEventListener('click', (e) => { if (!e.target.closest('.year-selector')) yearDropdownMenu.classList.remove('open'); });
    }

    function entraNelPortale(nomeUtente) {
        document.getElementById('login-modal').classList.remove('active');
        const formattedName = nomeUtente.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
        document.getElementById('user-greeting-title').innerText = `Buongiorno, ${formattedName}.`;
        
        const landing = document.getElementById('landing-view'); 
        const dash = document.getElementById('app-dashboard');
        
        isScrolled = false; 
        navbar.classList.remove('scrolled'); 
        landing.style.opacity = '0'; 
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        setTimeout(() => { 
            landing.style.display = 'none'; 
            
            dash.style.display = 'block'; 
            void dash.offsetWidth; 
            dash.style.opacity = '1'; 
            document.body.style.overflow = ''; 
            
            document.getElementById('hour-counter').innerText = finalHoursValue; 
            setTimeout(() => { document.querySelectorAll('.stat-segment').forEach((el, index) => { setTimeout(() => { el.style.transform = 'scaleX(1)'; }, index * 150); }); }, 100);
            scaricaECostruisciCronologia(); 
            
            setTimeout(() => {
                document.getElementById('disclaimer-ministero-modal').classList.add('active');
            }, 800); 
            
        }, 500);
    }

    document.getElementById('btn-logout-dash').addEventListener('click', () => { 
        if(typeof window.auth !== 'undefined') window.auth.signOut();
        window.globalTurnstileToken = "";
        if(typeof turnstile !== 'undefined') { try { turnstile.reset(); } catch(err){} }

        const dash = document.getElementById('app-dashboard'); const landing = document.getElementById('landing-view'); 
        dash.style.opacity = '0'; window.scrollTo({ top: 0, behavior: 'smooth' }); 
        
        passInput.value = ''; hiddenUsernameInput.value = ''; resetDropdownDisplay('username-display', 'Seleziona Utente');
        errorMsg.style.display = 'none'; document.querySelectorAll('.stat-segment').forEach(el=> el.style.transform='scaleX(0)');
        document.getElementById('timeline-container').innerHTML = '';
        submitBtn.innerText = "ENTRA"; submitBtn.disabled = false;

        setTimeout(() => { dash.style.display = 'none'; landing.style.display = 'block'; void landing.offsetWidth; landing.style.opacity = '1'; }, 500); 
    });

    function scaricaECostruisciCronologia() {
        const container = document.getElementById('timeline-container');
        container.innerHTML = '<div style="text-align:center; padding:20px; font-weight:bold; color:var(--primary);">Sincronizzazione dati in corso...</div>';

        if (typeof window.db !== 'undefined') {
            window.db.collection("attivita_pcto").orderBy("ordine", "desc").get()
            .then((querySnapshot) => {
                container.innerHTML = ''; 
                if (querySnapshot.empty) { container.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">Nessuna attività registrata.</div>'; return; }

                querySnapshot.forEach((doc, index) => {
                    const att = doc.data(); const cssCertElement = att.certificato ? 'ac-cert' : ''; const cssDateElement = att.certificato ? 'special-badge-date' : ''; const bgCertInfo = att.certificato ? 'style="background:#ecfdf5; border-color:#a7f3d0;"' : '';
                    const itemHTML = `<div class="timeline-item ${cssCertElement} reveal" style="transition-delay: ${index * 0.1}s;" aria-expanded="false"><div class="tl-header"><div class="tl-content"><span class="tl-date ${cssDateElement}">${att.data}</span><h3>${att.titolo}</h3><p class="tl-meta">${att.meta}</p></div><div class="tl-hours">${att.ore}</div></div><div class="tl-dropdown"><div class="tl-dropdown-inner"><div class="tl-ext-info" ${bgCertInfo}>${att.descrizione || "Dettagli non disponibili."}</div></div></div></div>`;
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
    let activeOTP = null;
    let activeOTPEmail = null;

    const selectionView = document.getElementById('student-selection-view');
    const sharedOtpView = document.getElementById('shared-otp-view');
    const studentCieView = document.getElementById('student-cie-view');
    
    const otpStep1 = document.getElementById('otp-step-1');
    const otpStep2 = document.getElementById('otp-step-2');
    const otpStep3 = document.getElementById('otp-step-3');
    const otpEmailInput = document.getElementById('otp-email-input');
    const otpInputs = document.querySelectorAll('.otp-box');

    window.chiudiModaleRecuperoEAproLogin = function() {
        document.getElementById('forgot-sheet-modal').classList.remove('active');
        document.getElementById('login-modal').classList.add('active');
    }

    function setupForgotView() {
        stopScannerSafe();
        
        selectionView.style.display = 'none';
        sharedOtpView.style.display = 'none';
        studentCieView.style.display = 'none';
        document.getElementById('scan-result').style.display = 'none';
        
        otpStep1.style.display = 'block'; otpStep1.style.opacity = '1';
        otpStep2.style.display = 'none'; otpStep2.style.opacity = '0';
        otpStep3.style.display = 'none'; otpStep3.style.opacity = '0';
        otpEmailInput.value = '';
        otpInputs.forEach(i => { i.value = ''; i.classList.remove('error', 'success'); });

        if(selectedRole === 'studente') { 
            selectionView.style.display = 'block';
            targetCollectionOTP = 'studenti';
        } else { 
            sharedOtpView.style.display = 'block';
            document.getElementById('otp-role-title').innerText = 'Area Docenti';
            targetCollectionOTP = 'docenti';
        }
    }

    document.querySelectorAll('.btn-back-to-login-global').forEach(btn => { btn.addEventListener('click', chiudiModaleRecuperoEAproLogin); });
    
    document.getElementById('btn-otp-back-selection').addEventListener('click', () => {
        if(selectedRole === 'studente') { sharedOtpView.style.display = 'none'; selectionView.style.display = 'block'; } 
        else { chiudiModaleRecuperoEAproLogin(); }
    });
    
    document.getElementById('btn-cie-back-selection').addEventListener('click', () => {
        stopScannerSafe(); studentCieView.style.display = 'none'; selectionView.style.display = 'block';
    });

    document.getElementById('btn-select-otp').addEventListener('click', () => {
        selectionView.style.display = 'none'; sharedOtpView.style.display = 'block';
        document.getElementById('otp-role-title').innerText = 'Area Studenti';
    });

    document.getElementById('btn-select-cie').addEventListener('click', () => {
        selectionView.style.display = 'none'; studentCieView.style.display = 'block';
        
        document.getElementById('scanner-container').style.display = 'flex';
        document.getElementById('scan-result').style.display = 'none';
        const backBtn = document.getElementById('btn-cie-back-selection');
        if(backBtn) backBtn.style.display = 'block';
        
        const cieAnimContainer = document.getElementById('cie-anim-container');
        cieAnimContainer.classList.remove('flipped');
        setTimeout(() => { if(studentCieView.style.display === 'block') cieAnimContainer.classList.add('flipped'); }, 2000);
        
        startCIEScanner();
    });

    document.getElementById('btn-send-otp').addEventListener('click', async function() {
        const emailVal = otpEmailInput.value.trim().toLowerCase();
        const errorDiv = document.getElementById('otp-error-msg');
        const originalBtnText = this.innerHTML;
        
        if(!emailVal || !emailVal.includes('@')) { errorDiv.innerText = "Inserisci un'email valida."; errorDiv.style.display = 'block'; return; }
        
        errorDiv.style.display = 'none';
        this.innerHTML = '<div class="btn-loader"><div class="btn-spinner"></div><span>Verifica in corso...</span></div>';
        this.disabled = true;

        try {
            const snapshot = await window.db.collection(targetCollectionOTP).where('email', '==', emailVal).get();
            if(snapshot.empty) throw new Error("Email non trovata a sistema.");

            activeOTP = Math.floor(100000 + Math.random() * 900000).toString();
            activeOTPEmail = emailVal;

            await inviaEmail(activeOTPEmail, 3, {
                otp_code: activeOTP, 
                orario_richiesta: new Date().toLocaleString('it-IT')
            });

            document.getElementById('display-target-email').innerText = activeOTPEmail;
            otpStep1.style.opacity = '0';
            setTimeout(() => {
                otpStep1.style.display = 'none'; otpStep2.style.display = 'block';
                setTimeout(() => { otpStep2.style.opacity = '1'; otpInputs[0].focus(); }, 50);
            }, 400);

        } catch (err) {
            console.error(err);
            errorDiv.innerText = err.message || "Errore di connessione.";
            errorDiv.style.display = 'block'; errorDiv.style.animation = 'none'; void errorDiv.offsetWidth; errorDiv.style.animation = 'shake 0.4s';
        } finally {
            this.innerHTML = originalBtnText; this.disabled = false;
        }
    });

    otpInputs.forEach((input, index) => {
        input.addEventListener('focus', (e) => e.target.select());
        input.addEventListener('input', (e) => {
            input.value = input.value.replace(/[^0-9]/g, '');
            if (input.value !== '' && index < otpInputs.length - 1) otpInputs[index + 1].focus();
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && input.value === '' && index > 0) otpInputs[index - 1].focus();
        });
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').substring(0, 6);
            for (let i = 0; i < pastedData.length; i++) otpInputs[i].value = pastedData[i];
            if (pastedData.length > 0) {
                const focusIndex = Math.min(5, pastedData.length);
                if(focusIndex < 6) otpInputs[focusIndex].focus(); else otpInputs[5].blur();
            }
        });
    });

    document.getElementById('btn-back-to-email').addEventListener('click', () => {
        otpStep2.style.opacity = '0';
        setTimeout(() => {
            otpStep2.style.display = 'none'; otpStep1.style.display = 'block';
            setTimeout(() => { otpStep1.style.opacity = '1'; }, 50);
        }, 400);
    });

    document.getElementById('btn-verify-otp').addEventListener('click', async function() {
        const enteredOTP = Array.from(otpInputs).map(i => i.value).join('');
        const errorDiv = document.getElementById('otp-verify-error');
        const originalBtnText = this.innerHTML;

        if (enteredOTP.length !== 6) { errorDiv.innerText = "Inserisci tutte le 6 cifre."; errorDiv.style.display = 'block'; return; }

        this.innerHTML = '<div class="btn-loader"><div class="btn-spinner"></div><span>Conferma...</span></div>';
        this.disabled = true;

        if (enteredOTP === activeOTP) {
            errorDiv.style.display = 'none';
            otpInputs.forEach(i => i.classList.add('success'));
            
            try {
                await window.auth.sendPasswordResetEmail(activeOTPEmail);
                setTimeout(() => {
                    otpStep2.style.opacity = '0';
                    setTimeout(() => {
                        otpStep2.style.display = 'none'; otpStep3.style.display = 'block';
                        setTimeout(() => { otpStep3.style.opacity = '1'; }, 50);
                    }, 400);
                }, 800);
            } catch (err) {
                errorDiv.innerText = "Errore durante l'invio del link. Riprova."; errorDiv.style.display = 'block';
                this.innerHTML = originalBtnText; this.disabled = false;
                otpInputs.forEach(i => { i.classList.remove('success'); i.classList.add('error'); });
            }
        } else {
            errorDiv.innerText = "Codice OTP errato. Riprova."; errorDiv.style.display = 'block';
            this.innerHTML = originalBtnText; this.disabled = false;
            otpInputs.forEach(i => i.classList.add('error'));
            setTimeout(() => { otpInputs.forEach(i => i.classList.remove('error')); }, 500);
        }
    });
    
    document.getElementById('btn-cie-avviso').addEventListener('click', () => { document.getElementById('avviso-cie-modal').classList.add('active'); });
    document.getElementById('close-avviso-modal').addEventListener('click', () => { document.getElementById('avviso-cie-modal').classList.remove('active'); });
    document.getElementById('btn-close-avviso-full').addEventListener('click', () => { document.getElementById('avviso-cie-modal').classList.remove('active'); });

    document.getElementById('close-disclaimer-modal').addEventListener('click', () => { 
        document.getElementById('disclaimer-ministero-modal').classList.remove('active'); 
        
        const dash = document.getElementById('app-dashboard');
        if(dash) { dash.style.display = 'block'; dash.style.opacity = '1'; }
        document.body.style.overflow = '';
    });

});
