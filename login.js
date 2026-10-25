// Shared visual indicator; the status remains available to screen readers.
function loginLoadingIndicator(status = "Accesso in corso") {
    return `<svg class="hid-spinner" viewBox="0 0 32 32" aria-hidden="true"><g stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M16 3v5"/><path d="M22.5 4.7 20 9" opacity=".92"/><path d="m27.3 9.5-4.3 2.5" opacity=".84"/><path d="M29 16h-5" opacity=".76"/><path d="m27.3 22.5-4.3-2.5" opacity=".68"/><path d="M22.5 27.3 20 23" opacity=".6"/><path d="M16 29v-5" opacity=".52"/><path d="m9.5 27.3 2.5-4.3" opacity=".44"/><path d="m4.7 22.5 4.3-2.5" opacity=".36"/><path d="M3 16h5" opacity=".28"/><path d="m4.7 9.5 4.3 2.5" opacity=".2"/><path d="m9.5 4.7 2.5 4.3" opacity=".12"/></g></svg><span class="sr-only">${status}</span>`;
}

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
            body: JSON.stringify({ emailDestinatario, idModelloBrevo, parametriMail }),
            keepalive: true
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Errore sconosciuto");
    } catch (err) {
        console.error("❌ Email error:", err);
    }
}

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

// Deferred after the Firebase SDK: do not wait for images and third-party widgets.
waitForFirebase(() => {});

// ── Redirect alla dashboard dopo login riuscito ───────────────
function entraNelPortale(nomeUtente, profile = null) {
    // Salviamo il nome in sessionStorage (SOLO A SCOPO ESTETICO: la vera sicurezza ora è in dashboard.html via Firebase Auth)
    sessionStorage.setItem('harzafi_user', nomeUtente);
    sessionStorage.setItem('harzafi_user_uid', window.auth.currentUser.uid);
    const userEmail = window.auth.currentUser.email?.trim().toLowerCase();
    if (profile && profile.email === userEmail && ['studente', 'docente'].includes(profile.role)) {
        sessionStorage.setItem('harzafi_user_role', profile.role);
        if (profile.role === 'studente' && profile.id) sessionStorage.setItem('harzafi_student_profile_id', profile.id);
        else sessionStorage.removeItem('harzafi_student_profile_id');
    } else {
        sessionStorage.removeItem('harzafi_user_role');
        sessionStorage.removeItem('harzafi_student_profile_id');
    }
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
    let verifiedProfile = null;
    let pendingCredentials = null;
    const submitBtn = document.getElementById('login-submit');
    const passInput = document.getElementById('password-input');
    const errorMsg = document.getElementById('login-error');
    const emailInput = document.getElementById('email-input');
    const emailError = document.getElementById('email-error');
    const emailStep = document.getElementById('login-email-step');
    const passwordStep = document.getElementById('login-password-step');
    const emailHelpLink = emailStep?.querySelector('.email-help-link');
    const continueBtn = document.getElementById('login-continue');
    const emailHome = emailInput.parentElement;
    const selectedEmail = document.getElementById('selected-email-display');
    const subtitle = document.querySelector('#login-page-wrapper .auth-subtitle');
    const panel = document.querySelector('#login-page-wrapper .login-panel');
    const emailSubtitle = subtitle?.textContent;

    function showEmailStep() {
        verifiedProfile = null;
        if (!emailStep) return;
        emailHome.prepend(emailInput);
        if (emailHelpLink) emailStep.insertBefore(emailHelpLink, emailStep.querySelector('.login-privacy'));
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

    function showPasswordStep() {
        if (continueBtn.disabled || submitBtn.disabled) return;
        const email = emailInput.value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            emailError.textContent = 'Inserisci un indirizzo email valido.';
            emailError.style.display = 'block';
            emailInput.focus();
            return;
        }
        emailError.style.display = 'none';
        verifiedProfile = null;
        selectedUserEmail = email;
        emailInput.value = email;
        // Ask for the password without querying the administrator-managed roster.
        // The profile is checked only after Firebase has authenticated the user.
        selectedEmail.appendChild(emailInput);
        emailInput.setAttribute('aria-describedby', 'login-error');
        emailStep.hidden = true;
        if (emailHelpLink) passwordStep.insertBefore(emailHelpLink, submitBtn);
        passwordStep.hidden = false;
        passwordStep.classList.add('is-active');
        panel?.classList.add('is-password-step');
        if (subtitle) subtitle.textContent = 'Inserisci la password';
        passInput.focus();
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
    const passwordTransition = document.getElementById('password-visibility-transition');
    const passwordField = passInput?.closest('.auth-password-field');
    let passwordTransitionTimer;

    if (togglePasswordBtn && passInput) {
        togglePasswordBtn.addEventListener('click', () => {
            const willShowPassword = passInput.type !== 'text';
            const currentPassword = passInput.value;
            const previousRepresentation = passInput.type === 'password'
                ? Array.from(currentPassword, () => '●').join('')
                : currentPassword;
            let selection = null;
            try {
                if (Number.isInteger(passInput.selectionStart) && Number.isInteger(passInput.selectionEnd)) {
                    selection = [passInput.selectionStart, passInput.selectionEnd];
                }
            } catch (_) {
                // Password selection APIs are unavailable in a few older browser versions.
            }

            window.clearTimeout(passwordTransitionTimer);
            passwordField?.classList.remove('password-visibility-switching');
            if (passwordTransition && currentPassword) {
                passwordTransition.textContent = previousRepresentation;
                passwordTransition.scrollLeft = passInput.scrollLeft;
            } else if (passwordTransition) {
                passwordTransition.textContent = '';
            }
            if (passwordField) void passwordField.offsetWidth;

            passInput.setAttribute('type', willShowPassword ? 'text' : 'password');
            if (passInput.value !== currentPassword) passInput.value = currentPassword;
            if (selection) {
                try { passInput.setSelectionRange(selection[0], selection[1]); } catch (_) {}
            }
            if (passwordTransition && passwordField && currentPassword) {
                passwordField.classList.add('password-visibility-switching');
                passwordTransitionTimer = window.setTimeout(() => {
                    passwordField.classList.remove('password-visibility-switching');
                    passwordTransition.textContent = '';
                }, 360);
            }
            togglePasswordBtn.classList.toggle('is-visible', willShowPassword);
            togglePasswordBtn.setAttribute('aria-label', willShowPassword ? 'Nascondi password' : 'Mostra password');
            togglePasswordBtn.setAttribute('aria-pressed', String(willShowPassword));
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
    window.eseguiAccessoServer = async function () {
        if (!pendingCredentials) return;
        const { email, password: pass, role } = pendingCredentials;
        pendingCredentials = null;
        if (submitBtn) submitBtn.innerHTML = loginLoadingIndicator();

        if (typeof window.auth !== 'undefined') {
            let authenticatedUser = null;
            try {
                const credential = await window.auth.signInWithEmailAndPassword(email, pass);
                authenticatedUser = credential.user;
                const authenticatedEmail = authenticatedUser.email?.trim().toLowerCase();
                if (!authenticatedEmail || authenticatedEmail !== email) throw new Error('profile-unavailable');

                const collection = role === 'studente' ? 'studenti' : 'docenti';
                const snapshot = await window.db.collection(collection)
                    .where('email', '==', authenticatedEmail).limit(1).get();
                if (snapshot.empty) throw new Error('profile-unavailable');

                const profile = snapshot.docs[0].data() || {};
                if (role === 'docente') {
                    const authorization = await window.db.collection('docenti_autorizzati')
                        .doc(authenticatedUser.uid).get();
                    if (!authorization.exists || authorization.data().enabled !== true) {
                        throw new Error('profile-unavailable');
                    }
                }
                verifiedProfile = {
                    email: authenticatedEmail,
                    role,
                    id: snapshot.docs[0].id,
                    name: typeof profile.nome === 'string' ? profile.nome.trim() : ''
                };
                const providerName = typeof authenticatedUser.displayName === 'string'
                    ? authenticatedUser.displayName.trim()
                    : '';
                const uName = verifiedProfile.name || providerName || 'Utente';

                // Keep the important access notification, sending it only after
                // both authentication and the role-specific profile check succeed.
                void inviaEmail(authenticatedEmail, 2, {
                    nome_utente: uName,
                    email_utente: authenticatedEmail,
                    orario_accesso: new Date().toLocaleString('it-IT')
                });
                if (submitBtn) {
                    submitBtn.innerText = 'Accedi';
                    submitBtn.disabled = false;
                }
                entraNelPortale(uName, verifiedProfile);
            } catch {
                if (authenticatedUser && window.auth.currentUser?.uid === authenticatedUser.uid) {
                    try { await window.auth.signOut(); } catch (_) {}
                }
                if (submitBtn) {
                    submitBtn.innerText = 'Accedi';
                    submitBtn.disabled = false;
                }
                if (passInput) passInput.value = '';
                if (errorMsg) {
                    errorMsg.innerText = 'Accesso non riuscito. Verifica email e password e riprova.';
                    errorMsg.style.display = 'block';
                    errorMsg.style.animation = 'none';
                    void errorMsg.offsetWidth;
                    errorMsg.style.animation = 'shake 0.4s';
                }
            }
        } else {
            if (errorMsg) {
                errorMsg.innerText = 'Accesso non riuscito. Verifica email e password e riprova.';
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
            if (errorMsg) errorMsg.style.display = 'none';
            if (submitBtn) {
                submitBtn.innerHTML = loginLoadingIndicator();
                submitBtn.disabled     = true;
            }

            pendingCredentials = { email: selectedUserEmail, password: pass, role: selectedRole };
            window.eseguiAccessoServer();
        });
    }

    const sheetResizes = new WeakMap();
    const compactMotion = matchMedia('(max-width: 1024px), (hover: none) and (pointer: coarse)');
    function resizeSheet(modal, update) {
        const sheet = modal?.querySelector('.modal-content');
        const before = sheet?.getBoundingClientRect().height;
        sheetResizes.get(sheet)?.cancel();
        update();
        if (!sheet?.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const after = sheet.getBoundingClientRect().height;
        if (Math.abs(before - after) < 1) return;
        const effect = sheet.animate([{ height: before + 'px' }, { height: after + 'px' }], { duration: compactMotion.matches ? 260 : 360, easing: 'cubic-bezier(.22,1,.36,1)' });
        sheetResizes.set(sheet, effect);
        effect.onfinish = () => sheetResizes.delete(sheet);
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
            resizeSheet(hidModalEl, () => {
                hidModalEl.classList.add('is-manual');
                if (sView) sView.style.display = 'none';
                if (mView) mView.style.display = 'block';
            });
            // On touch screens, let the sheet settle before the user opens the keyboard.
            const focusTarget = compactMotion.matches ? mView?.querySelector('h2') : hInput;
            if (focusTarget) {
                if (compactMotion.matches) focusTarget.setAttribute('tabindex', '-1');
                focusTarget.focus({ preventScroll: true });
            }
        });
    }
    const hidBackBtnEl = document.getElementById('hid-back-btn');
    if (hidBackBtnEl) {
        hidBackBtnEl.addEventListener('click', () => {
            const sView = document.getElementById('hid-scan-view');
            const mView = document.getElementById('hid-manual-view');
            const hErr = document.getElementById('hid-error');
            resizeSheet(hidModalEl, () => {
                hidModalEl.classList.remove('is-manual');
                if (mView) mView.style.display = 'none';
                if (sView) sView.style.display = 'block';
            });
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

            if (!inputVal.length) return;

            hidSubmitBtnEl.innerHTML = loginLoadingIndicator();
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
    const forgotModal = document.getElementById('forgot-sheet-modal');
    const otpStep1    = document.getElementById('otp-step-1');
    const otpStep3    = document.getElementById('otp-step-3');
    const otpEmailInput = document.getElementById('otp-email-input');

    const forgotPassLinks = document.querySelectorAll('#btn-forgot-pass-email');
    if (forgotPassLinks.length && forgotModal) {
        forgotPassLinks.forEach(btn => btn.addEventListener('click', e => {
            e.preventDefault();
            if (otpStep1) { otpStep1.style.display  = 'block'; otpStep1.style.opacity  = '1'; }
            if (otpStep3) { otpStep3.style.display  = 'none'; otpStep3.style.opacity  = '0'; }
            if (otpEmailInput) otpEmailInput.value = emailInput.value.trim().toLowerCase();
            const otpErr = document.getElementById('otp-error-msg');
            if (otpErr) otpErr.style.display = 'none';
            const roleTitle = document.getElementById('otp-role-title');
            if (roleTitle) roleTitle.innerText = 'Password dimenticata?';
            forgotModal.classList.add('active');
        }));
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
            if (this.disabled) return;
            const emailVal   = otpEmailInput.value.trim().toLowerCase();
            const errorDiv   = document.getElementById('otp-error-msg');
            const origBtnTxt = this.innerHTML;

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
                if (errorDiv) {
                    errorDiv.innerText = "Inserisci un'email valida.";
                    errorDiv.style.display = 'block';
                }
                return;
            }
            if (errorDiv) errorDiv.style.display = 'none';
            this.innerHTML = loginLoadingIndicator('Invio in corso');
            this.disabled   = true;

            try {
                try {
                    await window.auth.sendPasswordResetEmail(emailVal);
                } catch (error) {
                    // Do not disclose whether an email has a Firebase account.
                    if (error.code !== 'auth/user-not-found') throw error;
                }
                resizeSheet(forgotModal, () => {
                    if (otpStep1) otpStep1.style.display = 'none';
                    if (otpStep3) { otpStep3.style.display = 'block'; otpStep3.style.opacity = '1'; }
                });
                if (forgotModal.classList.contains('active')) otpStep3?.focus();
            } catch (err) {
                if (errorDiv) {
                    errorDiv.innerText = 'Non è stato possibile inviare la richiesta. Controlla la connessione e riprova.';
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
        const previousFocus = document.activeElement;
        const focusSelector = 'button,[href],input,select,textarea,[tabindex]';
        const isVisible = element => {
            if (!element?.isConnected || element.matches(':disabled') || element.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
            const style = window.getComputedStyle(element);
            return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
        };
        const getFocusable = () => [...modal.querySelectorAll(focusSelector)]
            .filter(element => element.tabIndex >= 0 && isVisible(element));

        function onKey(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                const closeButton = getFocusable().find(element => element.matches('.close-btn,[data-modal-close]'));
                if (closeButton) closeButton.click();
                else modal.classList.remove('active');
                return;
            }
            if (e.key !== 'Tab') return;

            const focusable = getFocusable();
            if (!focusable.length) { e.preventDefault(); return; }
            const currentIndex = focusable.indexOf(document.activeElement);
            if (e.shiftKey && currentIndex <= 0) {
                e.preventDefault();
                focusable[focusable.length - 1].focus();
            } else if (!e.shiftKey && (currentIndex === -1 || currentIndex === focusable.length - 1)) {
                e.preventDefault();
                focusable[0].focus();
            }
        }
        modal.addEventListener('keydown', onKey);
        getFocusable()[0]?.focus();
        return () => {
            modal.removeEventListener('keydown', onKey);
            if (isVisible(previousFocus)) previousFocus.focus();
        };
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
