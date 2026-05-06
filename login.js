/* ============================================================
   login.js — logica esclusiva della pagina login.html
   ============================================================ */

// ── Email tramite Cloudflare Worker ──────────────────────────
async function inviaEmail(emailDestinatario, idModelloBrevo, parametriMail) {
    const WORKER_URL = "https://harzafi-email.allorasonoadam.workers.dev/";
    try {
        const response = await fetch(WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ emailDestinatario, idModelloBrevo, parametriMail })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Errore sconosciuto");
    } catch (err) {
        console.error("❌ Email error:", err);
    }
}

// ── Cloudflare Turnstile callbacks ───────────────────────────
window.globalTurnstileToken = "";
window.isWaitingForToken    = false;

window.onTurnstileSuccess = function (token) {
    window.globalTurnstileToken = token;
    if (window.isWaitingForToken) {
        window.isWaitingForToken      = false;
        window.turnstileCallbackFired = true;
        if (typeof window.eseguiAccessoServer === 'function') window.eseguiAccessoServer();
    }
};
window.onTurnstileExpired = function () { window.globalTurnstileToken = ""; };
window.onTurnstileError   = function () {
    window.globalTurnstileToken = "";
    if (window.isWaitingForToken) {
        window.isWaitingForToken = false;
        if (typeof window.eseguiAccessoServer === 'function') window.eseguiAccessoServer();
    }
};

// ── Attesa Firebase ───────────────────────────────────────────
function waitForFirebase(callback) {
    if (typeof firebase !== 'undefined') {
        const firebaseConfig = {
            apiKey:            "AIzaSyBisp324W7J5jGwF_s-nbXabOjEutcwMmc",
            authDomain:        "harzafi---fsl.firebaseapp.com",
            projectId:         "harzafi---fsl",
            storageBucket:     "harzafi---fsl.firebasestorage.app",
            messagingSenderId: "743942918497",
            appId:             "1:743942918497:web:6d6e44ba348760ce137520"
        };
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
            self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
        }
        window.auth = firebase.auth();
        window.db   = firebase.firestore();
        callback();
    } else {
        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            if (typeof firebase !== 'undefined') { clearInterval(interval); waitForFirebase(callback); }
            else if (attempts > 50)              { clearInterval(interval); console.error("Firebase non disponibile."); }
        }, 100);
    }
}

window.addEventListener('load', () => {
    waitForFirebase(() => {
        if (typeof populateUserDropdown === 'function') populateUserDropdown('studente');
    });
});

// ── VPN check ────────────────────────────────────────────────
async function checkVPN() {
    try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 2000);
        const res  = await fetch('https://ipapi.co/json/', { signal: controller.signal });
        clearTimeout(tid);
        if (!res.ok) return false;
        const data = await res.json();
        const org  = (data.org || "").toLowerCase();
        return org.includes('vpn') || org.includes('hosting') || org.includes('cloud') || org.includes('datacenter');
    } catch { return false; }
}

// ── Redirect alla dashboard dopo login riuscito ───────────────
function entraNelPortale(nomeUtente) {
    // Salviamo il nome in sessionStorage (SOLO A SCOPO ESTETICO: la vera sicurezza ora è in dashboard.html via Firebase Auth)
    sessionStorage.setItem('harzafi_user', nomeUtente);
    window.location.href = 'dashboard.html';
}

// ── DOMContentLoaded ─────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {

    // Navbar scroll
    const navbar = document.querySelector('.navbar-wrapper');
    let isScrolled = false;
    window.addEventListener('scroll', () => {
        const should = window.scrollY > 40;
        if (should !== isScrolled) {
            isScrolled = should;
            navbar.classList.toggle('scrolled', isScrolled);
        }
    }, { passive: true });

    // ── Dropdown utenti ──────────────────────────────────────
    let selectedRole       = 'studente';
    let selectedUserValue  = "";
    let selectedUserEmail  = "";

    const submitBtn        = document.getElementById('login-submit');
    const passInput        = document.getElementById('password-input');
    const errorMsg         = document.getElementById('login-error');
    const hiddenUsernameInput = document.getElementById('hidden-username');
    const usernameSelect   = document.getElementById('username-select');

    window.populateUserDropdown = function (role) {
        const optionsContainer = document.getElementById('username-options');
        optionsContainer.innerHTML = '<div class="custom-option" style="color:var(--text-light);text-align:center;">Caricamento utenti...</div>';
        const collectionName = role === 'studente' ? 'studenti' : 'docenti';

        if (typeof window.db !== 'undefined') {
            window.db.collection(collectionName).orderBy("nome", "asc").get()
                .then(snapshot => {
                    optionsContainer.innerHTML = '';
                    snapshot.forEach(doc => creaOpzioneDropdown(doc.data().nome, doc.data().email || "email_mancante@scuola.it", optionsContainer));
                })
                .catch(() => {
                    optionsContainer.innerHTML = '<div class="custom-option" style="color:var(--danger);">Errore di connessione al server</div>';
                });
        } else {
            optionsContainer.innerHTML = '<div class="custom-option" style="color:var(--text-light);text-align:center;">In attesa di connessione...</div>';
        }
        resetDropdownDisplay();
    };

    function creaOpzioneDropdown(nome, email, container) {
        const option = document.createElement('div');
        option.className  = 'custom-option';
        option.textContent = nome;
        option.addEventListener('click', function (e) {
            e.stopPropagation();
            document.getElementById('username-display').textContent = nome;
            document.getElementById('username-display').parentElement.classList.add('selected');
            selectedUserValue = nome;
            selectedUserEmail = email;
            hiddenUsernameInput.value = nome;
            usernameSelect.classList.remove('open');
            errorMsg.style.display = 'none';
        });
        container.appendChild(option);
    }

    function resetDropdownDisplay() {
        document.getElementById('username-display').textContent = 'Seleziona Utente';
        document.getElementById('username-display').parentElement.classList.remove('selected');
        selectedUserValue = "";
        selectedUserEmail = "";
        hiddenUsernameInput.value = "";
    }

    document.querySelectorAll('.custom-select-trigger').forEach(trigger => {
        trigger.addEventListener('click', function (e) {
            e.stopPropagation();
            const parent = this.parentElement;
            const isOpen = parent.classList.contains('open');
            document.querySelectorAll('.custom-select').forEach(s => { if (s !== parent) s.classList.remove('open'); });
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

    // ── Segmented control ruolo ──────────────────────────────
    const segBtns   = document.querySelectorAll('#role-control .seg-btn');
    const segSlider = document.getElementById('role-slider');
    const loginView = document.getElementById('login-view');
    const rulesView = document.getElementById('rules-view');

    segBtns.forEach((btn, index) => btn.addEventListener('click', e => {
        segBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        selectedRole = e.target.dataset.role;
        segSlider.style.transform = index === 0 ? 'translateX(0)' : 'translateX(100%)';
        if (typeof window.populateUserDropdown === 'function') window.populateUserDropdown(selectedRole);
        document.getElementById('google-login-error').style.display = 'none';
    }));

    document.getElementById('btn-rules-banner').addEventListener('click', () => {
        loginView.style.display = 'none';
        rulesView.style.display = 'block';
    });
    document.querySelectorAll('.btn-back-login').forEach(btn => {
        btn.addEventListener('click', () => {
            rulesView.style.display = 'none';
            loginView.style.display = 'block';
        });
    });

    // ── Toggle password visibilità ───────────────────────────
    const togglePasswordBtn = document.getElementById('toggle-password');
    const eyeIcon      = document.getElementById('eye-icon');
    const eyeSlashIcon = document.getElementById('eye-slash-icon');

    togglePasswordBtn.addEventListener('click', () => {
        if (passInput.type === 'password') {
            passInput.type = 'text';
            passInput.style.fontFamily  = "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif";
            passInput.style.letterSpacing = "normal";
            eyeIcon.style.display      = 'none';
            eyeSlashIcon.style.display = 'block';
        } else {
            passInput.type = 'password';
            passInput.style.fontFamily  = "Verdana, sans-serif";
            passInput.style.letterSpacing = "2px";
            eyeIcon.style.display      = 'block';
            eyeSlashIcon.style.display = 'none';
        }
    });

    passInput.addEventListener('copy',  e => { e.preventDefault(); errorMsg.innerText = 'Operazione negata.'; errorMsg.style.display = 'block'; });
    passInput.addEventListener('paste', e => { e.preventDefault(); errorMsg.innerText = 'Operazione negata.'; errorMsg.style.display = 'block'; });

    // ── Login con credenziali ────────────────────────────────
    window.eseguiAccessoServer = function () {
        const pass  = passInput.value.trim();
        const uName = hiddenUsernameInput.value.trim();
        submitBtn.innerText = "VERIFICA IN CORSO...";

        if (typeof window.auth !== 'undefined') {
            window.auth.signInWithEmailAndPassword(selectedUserEmail, pass)
                .then(() => {
                    inviaEmail(selectedUserEmail, 2, {
                        nome_utente:    uName,
                        email_utente:   selectedUserEmail,
                        orario_accesso: new Date().toLocaleString('it-IT')
                    });
                    submitBtn.innerText = "ENTRA";
                    submitBtn.disabled  = false;
                    entraNelPortale(uName);
                })
                .catch((error) => {
                    submitBtn.innerText = "ENTRA";
                    submitBtn.disabled  = false;
                    passInput.value = '';
                    window.globalTurnstileToken = "";
                    if (typeof turnstile !== 'undefined') { try { turnstile.reset(); } catch (e) {} }
                    
                    // Gestione rate-limit nativo di Firebase Auth per bloccare gli attacchi brute-force
                    if(error.code === 'auth/too-many-requests') {
                        errorMsg.innerText = "Troppi tentativi falliti. Riprova più tardi.";
                    } else {
                        errorMsg.innerText = "Credenziali errate. Riprova.";
                    }
                    
                    errorMsg.style.display = 'block';
                    errorMsg.style.animation = 'none';
                    void errorMsg.offsetWidth;
                    errorMsg.style.animation = 'shake 0.4s';
                });
        } else {
            errorMsg.innerText = "Servizio temporaneamente offline.";
            errorMsg.style.display = 'block';
            submitBtn.innerText = "ENTRA";
            submitBtn.disabled  = false;
        }
    };

    document.getElementById('login-form').addEventListener('submit', async e => {
        e.preventDefault();
        if (document.activeElement) document.activeElement.blur();

        const pass  = passInput.value.trim();
        const uName = hiddenUsernameInput.value.trim();

        if (typeof window.auth === 'undefined') { errorMsg.innerText = "Database offline."; errorMsg.style.display = 'block'; return; }
        if (!uName || !selectedUserEmail)       { errorMsg.innerText = "Seleziona prima un utente dalla lista."; errorMsg.style.display = 'block'; return; }
        if (!pass)                              { errorMsg.innerText = "Il campo password è obbligatorio."; errorMsg.style.display = 'block'; return; }

        errorMsg.style.display = 'none';
        submitBtn.innerText    = "VERIFICA SICUREZZA...";
        submitBtn.disabled     = true;

        const isVpn = await checkVPN();
        if (isVpn) {
            errorMsg.innerText  = "Disattivare la VPN per continuare.";
            errorMsg.style.display = 'block';
            submitBtn.innerText = "ENTRA";
            submitBtn.disabled  = false;
            return;
        }

        if (window.globalTurnstileToken) {
            window.eseguiAccessoServer();
        } else {
            window.isWaitingForToken      = true;
            window.turnstileCallbackFired = false;
            if (typeof turnstile !== 'undefined') { try { turnstile.execute(); } catch (e) {} }
            setTimeout(() => {
                if (window.isWaitingForToken && !window.turnstileCallbackFired) {
                    window.isWaitingForToken = false;
                    window.eseguiAccessoServer();
                }
            }, 2500);
        }
    });

    // ── Login con Google ─────────────────────────────────────
    const googleBtn      = document.getElementById('custom-google-btn');
    const googleErrorMsg = document.getElementById('google-login-error');

    googleBtn.addEventListener('click', async () => {
        if (document.activeElement) document.activeElement.blur();
        const originalHTML = googleBtn.innerHTML;
        googleBtn.innerHTML  = `<div class="btn-loader"><div class="btn-spinner"></div><span class="btn-text-main" style="margin-left:5px;">CARICO...</span></div>`;
        googleBtn.disabled   = true;
        googleErrorMsg.style.display = 'none';

        const isVpn = await checkVPN();
        if (isVpn) {
            googleErrorMsg.innerText = "Disattivare la VPN per continuare.";
            googleErrorMsg.style.display = 'block';
            googleBtn.innerHTML = originalHTML;
            googleBtn.disabled  = false;
            return;
        }
        if (typeof window.auth === 'undefined') {
            googleErrorMsg.innerText = "Servizio di autenticazione offline.";
            googleErrorMsg.style.display = 'block';
            googleBtn.innerHTML = originalHTML;
            googleBtn.disabled  = false;
            return;
        }

        const provider = new firebase.auth.GoogleAuthProvider();
        
        // Seleziona il dominio dinamicamente
        const targetDomain = selectedRole === 'studente' ? 'studenti.itisavogadro.it' : 'itisavogadro.it';
        provider.setCustomParameters({ hd: targetDomain });

        window.auth.signInWithPopup(provider)
            .then(result => {
                const email = result.user.email.toLowerCase();
                
                // Controlla dinamicamente che finisca con il dominio corretto in base al ruolo
                if (email.endsWith("@" + targetDomain)) {
                    inviaEmail(email, 2, {
                        nome_utente:    result.user.displayName || "Utente",
                        email_utente:   email,
                        orario_accesso: new Date().toLocaleString('it-IT')
                    });
                    googleBtn.innerHTML = originalHTML;
                    googleBtn.disabled  = false;
                    entraNelPortale(result.user.displayName || "Utente");
                } else {
                    window.auth.signOut().then(() => {
                        googleErrorMsg.innerText = `Accesso negato. Usa l'email corretta per il tuo ruolo (@${targetDomain}).`;
                        googleErrorMsg.style.display = 'block';
                        googleBtn.innerHTML = originalHTML;
                        googleBtn.disabled  = false;
                    });
                }
            })
            .catch(() => {
                googleErrorMsg.innerText = "Accesso annullato. Riprova.";
                googleErrorMsg.style.display = 'block';
                googleBtn.innerHTML = originalHTML;
                googleBtn.disabled  = false;
            });
    });

    // ── Harzafi ID ───────────────────────────────────────────
    document.getElementById('btn-harzafi-id').addEventListener('click', () => {
        document.getElementById('hid-modal').classList.add('active');
        if (document.activeElement) document.activeElement.blur();
    });
    document.getElementById('hid-close-btn').addEventListener('click', ()  => document.getElementById('hid-modal').classList.remove('active'));
    document.getElementById('hid-cancel-btn').addEventListener('click', () => document.getElementById('hid-modal').classList.remove('active'));
    document.getElementById('hid-open-manual').addEventListener('click', e => {
        e.preventDefault();
        document.getElementById('hid-scan-view').style.display   = 'none';
        document.getElementById('hid-manual-view').style.display = 'block';
        document.getElementById('hid-input').focus();
    });
    document.getElementById('hid-back-btn').addEventListener('click', () => {
        document.getElementById('hid-manual-view').style.display = 'none';
        document.getElementById('hid-scan-view').style.display   = 'block';
        document.getElementById('hid-error').style.display       = 'none';
    });

    document.getElementById('hid-submit-btn').addEventListener('click', async () => {
        if (document.activeElement) document.activeElement.blur();
        const hidErrorEl  = document.getElementById('hid-error');
        const hidSubmitBtn = document.getElementById('hid-submit-btn');
        const origText    = hidSubmitBtn.innerHTML;
        const inputVal    = document.getElementById('hid-input').value.trim();

        const isVpn = await checkVPN();
        if (isVpn) { hidErrorEl.innerText = "Disattivare la VPN per continuare."; hidErrorEl.style.display = 'block'; return; }
        if (!inputVal.length) return;

        hidSubmitBtn.innerHTML = "VERIFICA IN CORSO...";
        hidSubmitBtn.disabled  = true;
        hidErrorEl.style.display = 'none';

        if (typeof window.db !== 'undefined') {
            window.db.collection("studenti").where("HID", "==", inputVal).get()
                .then(async snap => {
                    if (!snap.empty) {
                        const userData = snap.docs[0].data();
                        if (typeof window.auth !== 'undefined') {
                            try { await window.auth.signInAnonymously(); } catch (err) { console.warn(err); }
                        }
                        document.getElementById('hid-modal').classList.remove('active');
                        hidSubmitBtn.innerHTML = origText;
                        hidSubmitBtn.disabled  = false;
                        document.getElementById('hid-input').value = "";
                        entraNelPortale(userData.nome);
                    } else { throw new Error("HID non valido."); }
                })
                .catch(() => {
                    hidErrorEl.innerText = "HID non valido. Riprova.";
                    hidErrorEl.style.display = 'block';
                    hidErrorEl.style.animation = 'none';
                    void hidErrorEl.offsetWidth;
                    hidErrorEl.style.animation = 'shake 0.4s';
                    hidSubmitBtn.innerHTML = origText;
                    hidSubmitBtn.disabled  = false;
                });
        } else {
            hidErrorEl.innerText = "Database offline.";
            hidErrorEl.style.display = 'block';
            hidSubmitBtn.innerHTML = origText;
            hidSubmitBtn.disabled  = false;
        }
    });

    // ── Recupero Password ────────────────────────────────────
    let targetCollectionOTP = 'studenti';
    const forgotModal = document.getElementById('forgot-sheet-modal');
    const otpStep1    = document.getElementById('otp-step-1');
    const otpStep3    = document.getElementById('otp-step-3');
    const otpEmailInput = document.getElementById('otp-email-input');

    document.getElementById('btn-forgot-pass').addEventListener('click', e => {
        e.preventDefault();
        otpStep1.style.display  = 'block';
        otpStep1.style.opacity  = '1';
        otpStep3.style.display  = 'none';
        otpStep3.style.opacity  = '0';
        otpEmailInput.value     = '';
        document.getElementById('otp-error-msg').style.display = 'none';
        document.getElementById('otp-role-title').innerText =
            selectedRole === 'studente' ? 'Area Studenti' : 'Area Docenti';
        targetCollectionOTP = selectedRole === 'studente' ? 'studenti' : 'docenti';
        forgotModal.classList.add('active');
    });

    document.getElementById('forgot-sheet-close').addEventListener('click', () => forgotModal.classList.remove('active'));
    document.getElementById('btn-otp-back-selection').addEventListener('click', () => forgotModal.classList.remove('active'));

    document.getElementById('btn-send-otp').addEventListener('click', async function () {
        const emailVal   = otpEmailInput.value.trim().toLowerCase();
        const errorDiv   = document.getElementById('otp-error-msg');
        const origBtnTxt = this.innerHTML;

        if (!emailVal || !emailVal.includes('@')) {
            errorDiv.innerText = "Inserisci un'email valida.";
            errorDiv.style.display = 'block';
            return;
        }
        errorDiv.style.display = 'none';
        this.innerHTML  = '<div class="btn-loader"><div class="btn-spinner"></div><span>Invio in corso...</span></div>';
        this.disabled   = true;

        try {
            const snapshot = await window.db.collection(targetCollectionOTP).where('email', '==', emailVal).get();
            if (snapshot.empty) throw new Error("Email non trovata a sistema.");
            await window.auth.sendPasswordResetEmail(emailVal);
            otpStep1.style.opacity = '0';
            setTimeout(() => {
                otpStep1.style.display = 'none';
                otpStep3.style.display = 'block';
                setTimeout(() => { otpStep3.style.opacity = '1'; }, 50);
            }, 400);
        } catch (err) {
            errorDiv.innerText = err.message || "Errore di connessione. Riprova.";
            errorDiv.style.display   = 'block';
            errorDiv.style.animation = 'none';
            void errorDiv.offsetWidth;
            errorDiv.style.animation = 'shake 0.4s';
        } finally {
            this.innerHTML = origBtnTxt;
            this.disabled  = false;
        }
    });

    // ── Focus trap per i modali ───────────────────────────────
    function trapFocus(modal) {
        const focusable = modal.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
        const first = focusable[0];
        const last  = focusable[focusable.length - 1];
        function onKey(e) {
            if (e.key !== 'Tab') return;
            if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
            else            { if (document.activeElement === last)  { e.preventDefault(); first.focus(); } }
        }
        modal.addEventListener('keydown', onKey);
        if (first) first.focus();
        return () => modal.removeEventListener('keydown', onKey);
    }

    const modalObserver = new MutationObserver(() => {
        const anyOpen = document.querySelectorAll('.modal-overlay.active').length > 0;
        if (anyOpen) {
            const sw = window.innerWidth - document.documentElement.clientWidth;
            document.body.style.overflow    = 'hidden';
            document.body.style.paddingRight = `${sw}px`;
        } else {
            document.body.style.overflow    = '';
            document.body.style.paddingRight = '';
        }
    });
    document.querySelectorAll('.modal-overlay').forEach(m => modalObserver.observe(m, { attributes: true, attributeFilter: ['class'] }));

    const focusTrapObserver = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type !== 'attributes') return;
            const modal = mutation.target;
            if (modal.classList.contains('active')) {
                if (!modal._ftCleanup) modal._ftCleanup = trapFocus(modal);
            } else {
                if (modal._ftCleanup) { modal._ftCleanup(); delete modal._ftCleanup; }
            }
        });
    });
    document.querySelectorAll('.modal-overlay').forEach(m => focusTrapObserver.observe(m, { attributes: true, attributeFilter: ['class'] }));

}); // fine DOMContentLoaded
