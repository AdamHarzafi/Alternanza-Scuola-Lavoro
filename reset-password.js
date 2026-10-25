        // App Check e Firebase sono inizializzati da auth-session.js.
        const auth = firebase.auth();

        const loadingMsg = document.getElementById('loading-msg');
        const resetShell = document.querySelector('.reset-shell');
        const resetForm = document.getElementById('reset-form');
        const successMsg = document.getElementById('success-msg');
        const resetSecurityIcon = document.querySelector('.reset-security-icon');
        const resetTitleText = document.getElementById('reset-title-text');
        const successLogo = document.getElementById('success-logo');
        const errorMsg = document.getElementById('error-msg');
        const subText = document.getElementById('sub-text');
        const matchError = document.getElementById('match-error');
        const newPassword = document.getElementById('new-password');
        const confirmPassword = document.getElementById('confirm-password');
        const btnSave = document.getElementById('btn-save');
        const capsWarnings = new Map([
            [newPassword, document.getElementById('new-password-caps')],
            [confirmPassword, document.getElementById('confirm-password-caps')]
        ]);
        const capsMotionTimers = new Map();

        const urlParams = new URLSearchParams(window.location.search);
        const actionCode = urlParams.get('oobCode');
        const mode = urlParams.get('mode');

        function showLinkError(message) {
            resetShell.classList.add('is-link-invalid');
            loadingMsg.style.display = 'none';
            resetForm.style.display = 'none';
            successMsg.style.display = 'none';
            errorMsg.textContent = message;
            errorMsg.style.display = 'block';
            subText.style.display = 'none';
        }

        function showVerifiedAccount(email) {
            resetShell.classList.remove('is-link-invalid');
            loadingMsg.style.display = 'none';
            errorMsg.style.display = 'none';
            resetForm.style.display = 'block';
            subText.textContent = 'Scegli una nuova password sicura che puoi ricordare.';

            const accountEmail = document.createElement('strong');
            accountEmail.textContent = email;
            subText.appendChild(accountEmail);

            window.requestAnimationFrame(() => newPassword.focus({ preventScroll: true }));
        }

        if (!actionCode || mode !== 'resetPassword') {
            showLinkError('Questo link non è valido. Richiedi un nuovo link dalla pagina di accesso.');
        } else {
            auth.verifyPasswordResetCode(actionCode)
                .then(showVerifiedAccount)
                .catch(error => {
                    const invalidLink = ['auth/expired-action-code', 'auth/invalid-action-code'].includes(error.code);
                    console.warn('[Recupero password] Verifica:', error.code || 'errore di rete');
                    showLinkError(invalidLink
                        ? 'Il link è scaduto o è già stato utilizzato. Richiedine uno nuovo dalla pagina di accesso.'
                        : 'Non è possibile verificare il link in questo momento. Riprova tra poco.');
                });
        }

        [newPassword, confirmPassword].forEach((field) => {
            const capsWarning = capsWarnings.get(field);

            field.addEventListener('input', () => {
                matchError.style.display = 'none';
                confirmPassword.removeAttribute('aria-invalid');
                errorMsg.style.display = 'none';
            });

            const updateCapsLock = (event) => {
                if (typeof event.getModifierState !== 'function') return;
                const capsIsActive = event.getModifierState('CapsLock');
                capsWarning.hidden = !capsIsActive;

                if (capsIsActive && event.type === 'keydown' && event.key.length === 1) {
                    capsWarning.classList.remove('is-typing');
                    void capsWarning.offsetWidth;
                    capsWarning.classList.add('is-typing');
                    clearTimeout(capsMotionTimers.get(field));
                    capsMotionTimers.set(field, setTimeout(() => capsWarning.classList.remove('is-typing'), 170));
                }
            };

            ['keydown', 'keyup'].forEach((eventName) => field.addEventListener(eventName, updateCapsLock));

            field.addEventListener('blur', () => {
                capsWarning.hidden = true;
                capsWarning.classList.remove('is-typing');
                clearTimeout(capsMotionTimers.get(field));
            });
        });

        resetForm.addEventListener('submit', (event) => {
            event.preventDefault();

            if (!resetForm.checkValidity()) {
                resetForm.reportValidity();
                return;
            }

            const pass1 = newPassword.value;
            const pass2 = confirmPassword.value;

            if (pass1 !== pass2) {
                matchError.style.display = 'block';
                confirmPassword.setAttribute('aria-invalid', 'true');
                confirmPassword.focus();
                return;
            }

            matchError.style.display = 'none';
            errorMsg.style.display = 'none';
            btnSave.disabled = true;
            btnSave.textContent = 'Aggiornamento in corso…';

            auth.confirmPasswordReset(actionCode, pass1)
                .then(() => {
                    resetForm.style.display = 'none';
                    errorMsg.style.display = 'none';
                    resetSecurityIcon.hidden = true;
                    resetTitleText.textContent = 'La password del tuo Account Harzafi è stata aggiornata.';
                    successLogo.hidden = false;
                    resetShell.classList.add('is-success');
                    successMsg.style.display = 'block';
                    subText.style.display = 'none';

                    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && Element.prototype.animate) {
                        [
                            [document.getElementById('reset-title'), 0],
                            [successMsg.querySelector('p'), 55],
                            [successMsg.querySelector('a'), 105]
                        ].forEach(([element, delay]) => {
                            element.animate([
                                { opacity: 0, transform: 'translate3d(0, 8px, 0)' },
                                { opacity: 1, transform: 'translate3d(0, 0, 0)' }
                            ], { duration: 420, delay, easing: 'cubic-bezier(.22, .68, 0, 1)', fill: 'both' });
                        });
                    }
                })
                .catch((error) => {
                    const message = error && error.code === 'auth/weak-password'
                        ? 'La password scelta è troppo debole. Prova con una password più lunga e difficile da indovinare.'
                        : 'Non è stato possibile aggiornare la password. Verifica il link o richiedine uno nuovo dalla pagina di accesso.';

                    errorMsg.textContent = message;
                    errorMsg.style.display = 'block';
                    btnSave.disabled = false;
                    btnSave.textContent = 'Continua';
                });
        });
