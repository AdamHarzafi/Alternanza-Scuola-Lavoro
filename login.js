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
    waitForFirebase(() => {});
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
    sessionStorage.setItem('harzafi_user_uid', window.auth.currentUser.uid);
    window.location.href = 'dashboard.html';
}

// ── DOMContentLoaded ─────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {

    // 1. Blocca lo scatto del browser durante i ricaricamenti (Scroll Restoration)
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);

    // 2. Fix animazione Navbar (verifica che esista per non creare errori nel Login)
    const navbar = document.querySelector('.navbar-wrapper');
    if (navbar) {
        let isScrolled = false;
        const handleScroll = () => {
            const should = window.scrollY > 40;
            if (should !== isScrolled) {
                isScrolled = should;
                navbar.classList.toggle('scrolled', isScrolled);
            }
        };
        handleScroll();
        window.addEventListener('scroll', handleScroll, { passive: true });
    }

    // Due passaggi visivi, un solo modulo e gli stessi campi per l'autofill.
    let selectedRole = 'studente';
    let selectedUserEmail = '';
    let pendingCredentials = null;
    const submitBtn = document.getElementById('login-submit');
    const passInput = document.getElementById('password-input');
    const errorMsg = document.getElementById('login-error');
    const emailInput = document.getElementById('email-input');
    const emailError = document.getElementById('email-error');
    const emailStep = document.getElementById('login-email-step');
    const passwordStep = document.getElementById('login-password-step');
    const continueBtn = document.getElementById('login-continue');
    const emailHome = emailInput.parentElement;
    const selectedEmail = document.getElementById('selected-email-display');
    const subtitle = document.querySelector('#login-page-wrapper .auth-subtitle');
    const panel = document.querySelector('#login-page-wrapper .login-panel');
    const emailSubtitle = subtitle?.textContent;
    let verificationAttempt = 0;

    function showEmailStep() {
        verificationAttempt++;
        if (!emailStep) return;
        emailHome.prepend(emailInput);
        emailInput.setAttribute('aria-describedby', 'email-error');
        emailStep.hidden = false;
        passwordStep.hidden = true;
        passwordStep.classList.remove('is-active');
        panel?.classList.remove('is-password-step');
        if (subtitle) subtitle.textContent = emailSubtitle;
        continueBtn.disabled = false;
        continueBtn.textContent = 'Continua';
        continueBtn.removeAttribute('aria-busy');
        emailInput.focus();
    }

    async function showPasswordStep() {
        if (continueBtn.disabled || submitBtn.disabled) return;
        const email = emailInput.value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            emailError.textContent = 'Inserisci un indirizzo email valido.';
            emailError.style.display = 'block';
            emailInput.focus();
            return;
        }
        const attempt = ++verificationAttempt;
        const role = selectedRole;
        continueBtn.disabled = true;
        continueBtn.textContent = 'Verifica…';
        continueBtn.setAttribute('aria-busy', 'true');
        emailError.style.display = 'none';
        try {
            const snapshot = await window.db.collection(role === 'studente' ? 'studenti' : 'docenti')
                .where('email', '==', email).limit(1).get();
            if (attempt !== verificationAttempt) return;
            if (emailInput.value.trim().toLowerCase() !== email) return;
            if (snapshot.empty) throw new Error('role-not-enabled');
            selectedUserEmail = email;
            emailInput.value = email;
            // Move the actual username input instead of replacing it with text.
            // Keep any password already filled by the manager before Continue.
            selectedEmail.appendChild(emailInput);
            emailInput.setAttribute('aria-describedby', 'login-error');
            emailStep.hidden = true;
            passwordStep.hidden = false;
            passwordStep.classList.add('is-active');
            panel?.classList.add('is-password-step');
            if (subtitle) subtitle.textContent = 'Inserisci la password';
            passInput.focus();
        } catch (error) {
            if (attempt !== verificationAttempt) return;
            emailError.textContent = error.message === 'role-not-enabled'
                ? 'Questo indirizzo non è abilitato per il ruolo selezionato.'
                : 'Non è possibile verificare l’indirizzo adesso. Riprova tra poco.';
            emailError.style.display = 'block';
        } finally {
            if (attempt === verificationAttempt) {
                continueBtn.disabled = false;
                continueBtn.textContent = 'Continua';
                continueBtn.removeAttribute('aria-busy');
            }
        }
    }
    continueBtn?.addEventListener('click', showPasswordStep);
    document.getElementById('change-email')?.addEventListener('click', () => {
        if (!submitBtn.disabled) showEmailStep();
    });

    emailInput.addEventListener('input', () => { emailError.style.display = 'none'; });

    // ── Segmented control ruolo ──────────────────────────────
    const segBtns   = document.querySelectorAll('#role-control .seg-btn');
    const segSlider = document.getElementById('role-slider');
    const loginView = document.getElementById('login-view');
    const rulesView = document.getElementById('rules-view');

    segBtns.forEach((btn, index) => btn.addEventListener('click', e => {
        if (submitBtn.disabled) return;
        segBtns.forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-pressed', 'false');
        });
        e.currentTarget.classList.add('active');
        e.currentTarget.setAttribute('aria-pressed', 'true');
        selectedRole = e.currentTarget.dataset.role;
        showEmailStep();
        if (segSlider) segSlider.style.transform = index === 0 ? 'translateX(0)' : 'translateX(100%)';
        if (errorMsg) errorMsg.style.display = 'none';
        const gErr = document.getElementById('google-login-error');
        if (gErr) gErr.style.display = 'none';
    }));

    const btnRules = document.getElementById('btn-rules-banner');
    if (btnRules) {
        btnRules.addEventListener('click', () => {
            if (loginView) loginView.style.display = 'none';
            if (rulesView) rulesView.style.display = 'block';
        });
    }
    document.querySelectorAll('.btn-back-login').forEach(btn => {
        btn.addEventListener('click', () => {
            if (rulesView) rulesView.style.display = 'none';
            if (loginView) loginView.style.display = 'block';
        });
    });

    // ── Toggle password visibilità ───────────────────────────
    const togglePasswordBtn = document.getElementById('toggle-password');

    if (togglePasswordBtn && passInput) {
        togglePasswordBtn.addEventListener('click', () => {
            const willShowPassword = passInput.type === 'password';
            passInput.type = willShowPassword ? 'text' : 'password';
            togglePasswordBtn.classList.toggle('is-visible', willShowPassword);
            togglePasswordBtn.setAttribute('aria-label', willShowPassword ? 'Nascondi password' : 'Mostra password');
        });
    }

    if (passInput) {
        const capsLockWarning = document.getElementById('caps-lock-warning');
        let capsMotionTimer;
        const updateCapsLock = event => {
            if (capsLockWarning && typeof event.getModifierState === 'function') {
                const capsIsActive = event.getModifierState('CapsLock');
                capsLockWarning.hidden = !capsIsActive;
                if (capsIsActive && event.type === 'keydown' && event.key.length === 1) {
                    capsLockWarning.classList.remove('is-typing');
                    void capsLockWarning.offsetWidth;
                    capsLockWarning.classList.add('is-typing');
                    clearTimeout(capsMotionTimer);
                    capsMotionTimer = setTimeout(() => capsLockWarning.classList.remove('is-typing'), 170);
                }
            }
        };
        passInput.addEventListener('keydown', updateCapsLock);
        passInput.addEventListener('keyup', updateCapsLock);
        passInput.addEventListener('blur', () => {
            if (capsLockWarning) {
                capsLockWarning.hidden = true;
                capsLockWarning.classList.remove('is-typing');
            }
        });

    }

    // ── Login con credenziali ────────────────────────────────
    window.eseguiAccessoServer = function () {
        if (!pendingCredentials) return;
        const { email, password: pass, role } = pendingCredentials;
        pendingCredentials = null;
        if (submitBtn) submitBtn.innerText = "Verifica in corso…";

        if (typeof window.auth !== 'undefined') {
            window.auth.signInWithEmailAndPassword(email, pass)
                .then(async credential => {
                    const uName = await window.HarzafiSession.profileName(credential.user, role);
                    await inviaEmail(email, 2, {
                        nome_utente:    uName,
                        email_utente:   email,
                        orario_accesso: new Date().toLocaleString('it-IT')
                    });
                    
                    if (submitBtn) {
                        submitBtn.innerText = "Accedi";
                        submitBtn.disabled  = false;
                    }
                    entraNelPortale(uName);
                })
                .catch((error) => {
                    if (submitBtn) {
                        submitBtn.innerText = "Accedi";
                        submitBtn.disabled  = false;
                    }
                    if (passInput) passInput.value = '';
                    window.globalTurnstileToken = "";
                    if (typeof turnstile !== 'undefined') { try { turnstile.reset(); } catch (e) {} }
                    
                    if (errorMsg) {
                        if(error.code === 'auth/too-many-requests') {
                            errorMsg.innerText = "Troppi tentativi falliti. Riprova più tardi.";
                        } else {
                            errorMsg.innerText = "Credenziali errate. Riprova.";
                        }
                        errorMsg.style.display = 'block';
                        errorMsg.style.animation = 'none';
                        void errorMsg.offsetWidth;
                        errorMsg.style.animation = 'shake 0.4s';
                    }
                });
        } else {
            if (errorMsg) {
                errorMsg.innerText = "Servizio temporaneamente offline.";
                errorMsg.style.display = 'block';
            }
            if (submitBtn) {
                submitBtn.innerText = "Accedi";
                submitBtn.disabled  = false;
            }
        }
    };

    const loginFormEl = document.getElementById('login-form');
    if (loginFormEl) {
        loginFormEl.addEventListener('submit', async e => {
            e.preventDefault();
            if (submitBtn.disabled) return;

            if (passwordStep?.hidden) {
                await showPasswordStep();
                return;
            }

            const pass  = passInput ? passInput.value : '';

            if (typeof window.auth === 'undefined') { if (errorMsg) { errorMsg.innerText = "Database offline."; errorMsg.style.display = 'block'; } return; }
            selectedUserEmail = emailInput.value.trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(selectedUserEmail)) {
                const visibleError = passwordStep && !passwordStep.hidden ? errorMsg : emailError;
                visibleError.textContent = 'Inserisci un indirizzo email valido.';
                visibleError.style.display = 'block';
                emailInput.focus();
                return;
            }
            if (!pass)                              { if (errorMsg) { errorMsg.innerText = "Il campo password è obbligatorio."; errorMsg.style.display = 'block'; } return; }
            pendingCredentials = { email: selectedUserEmail, password: pass, role: selectedRole };

            if (errorMsg) errorMsg.style.display = 'none';
            if (submitBtn) {
                submitBtn.innerText    = "Verifica sicurezza…";
                submitBtn.disabled     = true;
            }

            // Preserve the existing role eligibility check, including autofilled values.
            const roleButtons = document.querySelectorAll('#role-control .seg-btn');
            roleButtons.forEach(button => { button.disabled = true; });
            try {
                const collection = selectedRole === 'studente' ? 'studenti' : 'docenti';
                const snapshot = await window.db.collection(collection)
                    .where('email', '==', selectedUserEmail).limit(1).get();
                if (snapshot.empty) throw new Error('role-not-enabled');
            } catch (error) {
                pendingCredentials = null;
                errorMsg.textContent = error.message === 'role-not-enabled'
                    ? 'Questo indirizzo non è abilitato per il ruolo selezionato.'
                    : 'Non è possibile verificare l’indirizzo adesso. Riprova tra poco.';
                errorMsg.style.display = 'block';
                submitBtn.innerText = 'Accedi';
                submitBtn.disabled = false;
                return;
            } finally {
                roleButtons.forEach(button => { button.disabled = false; });
            }

            const isVpn = await checkVPN();
            if (isVpn) {
                pendingCredentials = null;
                if (errorMsg) {
                    errorMsg.innerText  = "Disattivare la VPN per continuare.";
                    errorMsg.style.display = 'block';
                }
                if (submitBtn) {
                    submitBtn.innerText = "Accedi";
                    submitBtn.disabled  = false;
                }
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
    }

    // ── Login con Google ─────────────────────────────────────
    const googleBtn      = document.getElementById('custom-google-btn');
    const googleErrorMsg = document.getElementById('google-login-error');

    if (googleBtn) {
        googleBtn.addEventListener('click', async () => {
            if (submitBtn.disabled) return;
            if (document.activeElement) document.activeElement.blur();
            const originalHTML = googleBtn.innerHTML;
            googleBtn.innerHTML  = `<div class="btn-loader"><div class="btn-spinner"></div><span class="btn-text-main" style="margin-left:5px;">CARICO...</span></div>`;
            googleBtn.disabled   = true;
            if (googleErrorMsg) googleErrorMsg.style.display = 'none';

            const isVpn = await checkVPN();
            if (isVpn) {
                if (googleErrorMsg) {
                    googleErrorMsg.innerText = "Disattivare la VPN per continuare.";
                    googleErrorMsg.style.display = 'block';
                }
                googleBtn.innerHTML = originalHTML;
                googleBtn.disabled  = false;
                return;
            }
            if (typeof window.auth === 'undefined') {
                if (googleErrorMsg) {
                    googleErrorMsg.innerText = "Servizio di autenticazione offline.";
                    googleErrorMsg.style.display = 'block';
                }
                googleBtn.innerHTML = originalHTML;
                googleBtn.disabled  = false;
                return;
            }

            const provider = new firebase.auth.GoogleAuthProvider();
            const targetDomain = selectedRole === 'studente' ? 'studenti.itisavogadro.it' : 'itisavogadro.it';
            provider.setCustomParameters({ hd: targetDomain });

            window.auth.signInWithPopup(provider)
                .then(async result => {
                    const email = result.user.email.toLowerCase();
                    
                    if (email.endsWith("@" + targetDomain)) {
                        const profileName = await window.HarzafiSession.profileName(result.user, selectedRole);
                        await inviaEmail(email, 2, {
                            nome_utente:    profileName,
                            email_utente:   email,
                            orario_accesso: new Date().toLocaleString('it-IT')
                        });
                        
                        googleBtn.innerHTML = originalHTML;
                        googleBtn.disabled  = false;
                        entraNelPortale(profileName);
                    } else {
                        window.auth.signOut().then(() => {
                            if (googleErrorMsg) {
                                googleErrorMsg.innerText = `Accesso negato. Usa l'email corretta per il tuo ruolo (@${targetDomain}).`;
                                googleErrorMsg.style.display = 'block';
                            }
                            googleBtn.innerHTML = originalHTML;
                            googleBtn.disabled  = false;
                        });
                    }
                })
                .catch(() => {
                    if (googleErrorMsg) {
                        googleErrorMsg.innerText = "Accesso annullato. Riprova.";
                        googleErrorMsg.style.display = 'block';
                    }
                    googleBtn.innerHTML = originalHTML;
                    googleBtn.disabled  = false;
                });
        });
    }

    // ── Harzafi ID ───────────────────────────────────────────
    const btnHid = document.getElementById('btn-harzafi-id');
    const hidModalEl = document.getElementById('hid-modal');
    if (btnHid && hidModalEl) {
        btnHid.addEventListener('click', () => {
            hidModalEl.classList.add('active');
            if (document.activeElement) document.activeElement.blur();
        });
    }
    const hidCloseBtnEl = document.getElementById('hid-close-btn');
    if (hidCloseBtnEl && hidModalEl) {
        hidCloseBtnEl.addEventListener('click', () => hidModalEl.classList.remove('active'));
    }
    const hidCancelBtnEl = document.getElementById('hid-cancel-btn');
    if (hidCancelBtnEl && hidModalEl) {
        hidCancelBtnEl.addEventListener('click', () => hidModalEl.classList.remove('active'));
    }
    const hidOpenManualEl = document.getElementById('hid-open-manual');
    if (hidOpenManualEl) {
        hidOpenManualEl.addEventListener('click', e => {
            e.preventDefault();
            const sView = document.getElementById('hid-scan-view');
            const mView = document.getElementById('hid-manual-view');
            const hInput = document.getElementById('hid-input');
            if (sView) sView.style.display   = 'none';
            if (mView) mView.style.display = 'block';
            if (hInput) hInput.focus();
        });
    }
    const hidBackBtnEl = document.getElementById('hid-back-btn');
    if (hidBackBtnEl) {
        hidBackBtnEl.addEventListener('click', () => {
            const sView = document.getElementById('hid-scan-view');
            const mView = document.getElementById('hid-manual-view');
            const hErr = document.getElementById('hid-error');
            if (mView) mView.style.display = 'none';
            if (sView) sView.style.display   = 'block';
            if (hErr) hErr.style.display       = 'none';
        });
    }

    const hidSubmitBtnEl = document.getElementById('hid-submit-btn');
    if (hidSubmitBtnEl) {
        hidSubmitBtnEl.addEventListener('click', async () => {
            if (document.activeElement) document.activeElement.blur();
            const hidErrorEl  = document.getElementById('hid-error');
            const origText    = hidSubmitBtnEl.innerHTML;
            const inputEl     = document.getElementById('hid-input');
            const inputVal    = inputEl ? inputEl.value.trim() : '';

            const isVpn = await checkVPN();
            if (isVpn) { if (hidErrorEl) { hidErrorEl.innerText = "Disattivare la VPN per continuare."; hidErrorEl.style.display = 'block'; } return; }
            if (!inputVal.length) return;

            hidSubmitBtnEl.innerHTML = "VERIFICA IN CORSO...";
            hidSubmitBtnEl.disabled  = true;
            if (hidErrorEl) hidErrorEl.style.display = 'none';

            if (typeof window.db !== 'undefined') {
                window.db.collection("studenti").where("HID", "==", inputVal).get()
                    .then(async snap => {
                        if (!snap.empty) {
                            const userData = snap.docs[0].data();
                            if (typeof window.auth !== 'undefined') {
                                await window.auth.signInAnonymously();
                            }
                            if (hidModalEl) hidModalEl.classList.remove('active');
                            hidSubmitBtnEl.innerHTML = origText;
                            hidSubmitBtnEl.disabled  = false;
                            if (inputEl) inputEl.value = "";
                            entraNelPortale(userData.nome);
                        } else { throw new Error("HID non valido."); }
                    })
                    .catch(() => {
                        if (hidErrorEl) {
                            hidErrorEl.innerText = "HID non valido. Riprova.";
                            hidErrorEl.style.display = 'block';
                            hidErrorEl.style.animation = 'none';
                            void hidErrorEl.offsetWidth;
                            hidErrorEl.style.animation = 'shake 0.4s';
                        }
                        hidSubmitBtnEl.innerHTML = origText;
                        hidSubmitBtnEl.disabled  = false;
                    });
            } else {
                if (hidErrorEl) {
                    hidErrorEl.innerText = "Database offline.";
                    hidErrorEl.style.display = 'block';
                }
                hidSubmitBtnEl.innerHTML = origText;
                hidSubmitBtnEl.disabled  = false;
            }
        });
    }

    // ── Recupero Password ────────────────────────────────────
    let targetCollectionOTP = 'studenti';
    const forgotModal = document.getElementById('forgot-sheet-modal');
    const otpStep1    = document.getElementById('otp-step-1');
    const otpStep3    = document.getElementById('otp-step-3');
    const otpEmailInput = document.getElementById('otp-email-input');

    const btnForgotPassEl = document.getElementById('btn-forgot-pass');
    if (btnForgotPassEl && forgotModal) {
        btnForgotPassEl.addEventListener('click', e => {
            e.preventDefault();
            if (otpStep1) { otpStep1.style.display  = 'block'; otpStep1.style.opacity  = '1'; }
            if (otpStep3) { otpStep3.style.display  = 'none'; otpStep3.style.opacity  = '0'; }
            if (otpEmailInput) otpEmailInput.value = emailInput.value.trim().toLowerCase();
            const otpErr = document.getElementById('otp-error-msg');
            if (otpErr) otpErr.style.display = 'none';
            const roleTitle = document.getElementById('otp-role-title');
            if (roleTitle) roleTitle.innerText = selectedRole === 'studente' ? 'Area Studenti' : 'Area Docenti';
            targetCollectionOTP = selectedRole === 'studente' ? 'studenti' : 'docenti';
            forgotModal.classList.add('active');
        });
    }

    const forgotSheetCloseEl = document.getElementById('forgot-sheet-close');
    if (forgotSheetCloseEl && forgotModal) {
        forgotSheetCloseEl.addEventListener('click', () => forgotModal.classList.remove('active'));
    }
    const btnOtpBackEl = document.getElementById('btn-otp-back-selection');
    if (btnOtpBackEl && forgotModal) {
        btnOtpBackEl.addEventListener('click', () => forgotModal.classList.remove('active'));
    }

    const btnSendOtpEl = document.getElementById('btn-send-otp');
    if (btnSendOtpEl && otpEmailInput) {
        btnSendOtpEl.addEventListener('click', async function () {
            const emailVal   = otpEmailInput.value.trim().toLowerCase();
            const errorDiv   = document.getElementById('otp-error-msg');
            const origBtnTxt = this.innerHTML;

            if (!emailVal || !emailVal.includes('@')) {
                if (errorDiv) {
                    errorDiv.innerText = "Inserisci un'email valida.";
                    errorDiv.style.display = 'block';
                }
                return;
            }
            if (errorDiv) errorDiv.style.display = 'none';
            this.innerHTML  = '<div class="btn-loader"><div class="btn-spinner"></div><span>Invio in corso...</span></div>';
            this.disabled   = true;

            try {
                const snapshot = await window.db.collection(targetCollectionOTP).where('email', '==', emailVal).get();
                if (snapshot.empty) throw new Error("Email non trovata a sistema.");
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
                if (errorDiv) {
                    errorDiv.innerText = err.message || "Errore di connessione. Riprova.";
                    errorDiv.style.display   = 'block';
                    errorDiv.style.animation = 'none';
                    void errorDiv.offsetWidth;
                    errorDiv.style.animation = 'shake 0.4s';
                }
            } finally {
                this.innerHTML = origBtnTxt;
                this.disabled  = false;
            }
        });
    }

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
