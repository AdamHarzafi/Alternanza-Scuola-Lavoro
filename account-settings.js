(() => {
    'use strict';
    const byId = id => document.getElementById(id);
    const content = byId('settings-content');
    const state = byId('settings-state');
    const stateTitle = byId('settings-state-title');
    const stateCopy = byId('settings-state-copy');
    const spinner = state.querySelector('.settings-spinner');
    const retry = byId('settings-retry');
    const securityStatus = byId('settings-security-status');
    const pageStatus = byId('settings-page-status');
    const resetButton = byId('settings-reset-password');
    const verifyButton = byId('settings-verify-email');
    const logoutButton = byId('settings-logout');
    const downloadButton = byId('settings-download');
    const refreshButton = byId('settings-refresh');
    const backButton = byId('settings-back');
    const sidebar = byId('settings-sidebar');
    const views = byId('settings-views');
    const viewButtons = [...document.querySelectorAll('[data-settings-view]')];
    const desktopQuery = window.matchMedia('(min-width:960px)');
    const sections = Object.fromEntries(viewButtons.map(button => [button.dataset.settingsView, byId(button.getAttribute('aria-controls'))]));
    const timers = new Set();
    const model = window.HarzafiAccountSettings;
    const preferencesStore = window.HarzafiAccountPreferences;
    const photoTools = window.HarzafiProfilePhoto;
    const auth = window.HarzafiSession?.auth;
    const db = typeof window.firebase?.firestore === 'function' ? window.firebase.firestore() : null;
    let account = null;
    let generation = 0;
    let activeView = null;
    let profileRecord = null;
    let preferences = { givenName:'', familyName:'', photoData:'' };
    let preferencesReady = false, profileWritePending = false, photoEditor = null;
    const photoStatus = byId('settings-photo-status');
    const nameDialog = byId('settings-name-dialog');
    const nameSave = byId('settings-name-save'), nameCancel = byId('settings-name-cancel');
    const givenNameInput = byId('settings-given-name'), familyNameInput = byId('settings-family-name');
    let nameOwner = null, nameOperation = 0;
    let downloadOperation = 0, downloadPending = false;
    let viewNavigation = 0;
    let popstateHash = null, viewHistoryIndex = Number.isFinite(history.state?.harzafiSettingsIndex) ? history.state.harzafiSettingsIndex : 0;

    function profileControls() {
        const disabled = !preferencesReady || profileWritePending || !currentAccount();
        byId('settings-photo-edit').disabled = disabled;
        refreshButton.disabled = profileWritePending;
        const button = byId('settings-edit-name');
        if (button) button.disabled = disabled;
    }
    function closeName() {
        ++nameOperation; nameOwner = null;
        if (nameDialog.open) nameDialog.close();
        givenNameInput.value = familyNameInput.value = '';
        givenNameInput.setCustomValidity(''); familyNameInput.setCustomValidity('');
        nameSave.disabled = false; nameSave.textContent = 'Salva'; nameCancel.textContent = 'Annulla';
        message(byId('settings-name-status'), '');
    }
    function editName() {
        const value = currentAccount();
        if (!value || !preferencesReady || profileWritePending) return;
        closeName(); nameOwner = { uid:value.uid, version:generation };
        givenNameInput.value = value.givenName.length <= 80 ? value.givenName : '';
        familyNameInput.value = value.familyName.length <= 80 ? value.familyName : '';
        nameDialog.showModal();
    }
    async function saveProfilePatch(patch) {
        const value = currentAccount(), user = auth?.currentUser, version = generation;
        if (!value || !preferencesReady || profileWritePending) throw new Error('account-unavailable');
        profileWritePending = true; profileControls();
        try {
            await preferencesStore.save(db, user, patch, () => window.firebase.firestore.FieldValue.serverTimestamp());
            if (version !== generation || auth.currentUser?.uid !== value.uid) throw new Error('account-changed');
            preferences = preferencesStore.normalize({ ...preferences, ...patch });
            render(model.describe(user, profileRecord, preferences), user);
        } finally {
            if (version === generation && auth?.currentUser?.uid === value.uid) { profileWritePending = false; profileControls(); }
        }
    }
    nameCancel.addEventListener('click', closeName);
    nameDialog.addEventListener('cancel', event => { event.preventDefault(); closeName(); });
    for (const input of [givenNameInput, familyNameInput]) input.addEventListener('input', () => input.setCustomValidity(''));
    byId('settings-name-form').addEventListener('submit', async event => {
        event.preventDefault();
        if (!nameOwner || profileWritePending || nameOwner.uid !== currentAccount()?.uid || nameOwner.version !== generation) return;
        const givenName = givenNameInput.value.trim(), familyName = familyNameInput.value.trim();
        if (!givenName || !familyName) {
            const missing = !givenName ? givenNameInput : familyNameInput;
            missing.setCustomValidity(!givenName ? 'Inserisci il nome.' : 'Inserisci il cognome.'); missing.reportValidity(); return;
        }
        const id = nameOperation;
        nameSave.disabled = true; nameSave.textContent = 'Salvo…'; nameCancel.textContent = 'Chiudi';
        message(byId('settings-name-status'), 'Salvataggio in corso…');
        try {
            await saveProfilePatch({ givenName, familyName });
            if (id !== nameOperation || !nameOwner || nameOwner.version !== generation) return;
            closeName(); message(photoStatus, 'Nome aggiornato.');
        } catch (_) {
            if (id !== nameOperation || !nameOwner || nameOwner.version !== generation) return;
            nameSave.disabled = false; nameSave.textContent = 'Salva'; nameCancel.textContent = 'Annulla';
            message(byId('settings-name-status'), 'Non è stato possibile salvare il nome. Riprova tra qualche istante.', true);
        }
    });
    if (photoTools) photoEditor = photoTools.attach({
        getAccount: () => {
            const value = currentAccount();
            return value && preferencesReady ? { uid:value.uid, initials:value.initials, photoData:value.photoData, version:generation } : null;
        },
        savePhoto: async photoData => {
            await saveProfilePatch({ photoData });
            message(photoStatus, photoData ? 'Foto del profilo aggiornata.' : 'Foto rimossa. Ora il tuo account mostra le tue iniziali.');
        }
    });

    function updateNavigation({ focus = false } = {}) {
        const previous = activeView;
        const requested = Object.keys(sections).find(key => '#' + sections[key].id === window.location.hash);
        activeView = account ? requested || (desktopQuery.matches ? 'personal' : null) : null;
        if (previous !== activeView) message(pageStatus, '');
        if (activeView) sections[activeView].append(pageStatus);
        else content.after(pageStatus);
        sidebar.hidden = !!activeView && !desktopQuery.matches;
        views.hidden = !activeView;
        content.dataset.view = activeView || 'overview';
        byId('settings-toolbar-title').textContent = activeView && !desktopQuery.matches
            ? sections[activeView].querySelector('h2').textContent : 'Account Harzafi';
        for (const [key, panel] of Object.entries(sections)) panel.hidden = key !== activeView;
        for (const button of viewButtons) {
            if (button.dataset.settingsView === activeView) button.setAttribute('aria-current', 'true');
            else button.removeAttribute('aria-current');
        }
        backButton.setAttribute('aria-label', activeView && !desktopQuery.matches ? 'Torna alle impostazioni' : 'Torna al mio registro');
        if (focus && account) {
            if (activeView) sections[activeView].querySelector('h2').focus({ preventScroll: true });
            else viewButtons.find(button => button.dataset.settingsView === previous)?.focus({ preventScroll: true });
            if (!desktopQuery.matches) window.scrollTo(0, 0);
        }
        return activeView ? sections[activeView] : sidebar;
    }
    function animateNavigation({ focus = true, back = false } = {}) {
        if (!account || !window.HarzafiMotion) return updateNavigation({focus});
        const requested = Object.keys(sections).find(key => '#' + sections[key].id === window.location.hash);
        const next = requested || (desktopQuery.matches ? 'personal' : null);
        if (next === activeView) {
            ++viewNavigation; window.HarzafiMotion.cancel();
            return updateNavigation({focus});
        }
        const version = generation, uid = account.uid, operation = ++viewNavigation;
        const guard = () => version === generation && operation === viewNavigation && currentAccount()?.uid === uid;
        window.HarzafiMotion.transition(() => updateNavigation({focus}), {back,guard,scope:desktopQuery.matches ? 'panel' : null});
    }
    viewButtons.forEach(button => button.addEventListener('click', () => {
        if (!currentAccount()) return;
        const hash = '#' + sections[button.dataset.settingsView].id;
        if (activeView === button.dataset.settingsView && (!window.location.hash || window.location.hash === hash)) return;
        if (window.location.hash !== hash) history.pushState({ harzafiSettingsView: true, harzafiSettingsIndex:++viewHistoryIndex }, '', hash);
        animateNavigation();
    }));
    backButton.addEventListener('click', event => {
        if (!account || desktopQuery.matches || !activeView) return;
        event.preventDefault();
        if (history.state?.harzafiSettingsView) history.back();
        else {
            history.replaceState(null, '', window.location.pathname + window.location.search);
            animateNavigation({back:true});
        }
    });
    window.addEventListener('popstate', () => {
        const nextIndex = Number.isFinite(history.state?.harzafiSettingsIndex) ? history.state.harzafiSettingsIndex : 0;
        const back = nextIndex < viewHistoryIndex;
        viewHistoryIndex = nextIndex; popstateHash = window.location.hash;
        animateNavigation({back});
    });
    window.addEventListener('hashchange', () => {
        const handled = popstateHash === window.location.hash; popstateHash = null;
        if (handled) return;
        viewHistoryIndex = Number.isFinite(history.state?.harzafiSettingsIndex) ? history.state.harzafiSettingsIndex : 0;
        animateNavigation({back:!Object.keys(sections).some(key => '#' + sections[key].id === window.location.hash)});
    });
    desktopQuery.addEventListener('change', () => {
        ++viewNavigation; window.HarzafiMotion?.cancel();
        updateNavigation();
    });

    function message(element, value, error = false) {
        element.textContent = value;
        element.dataset.error = String(error);
    }
    function clearAccount() {
        ++viewNavigation; window.HarzafiMotion?.cancel();
        ++downloadOperation; downloadPending = false;
        downloadButton.disabled = false; downloadButton.textContent = 'Scarica i dati dell’account';
        downloadButton.removeAttribute('aria-busy');
        account = null;
        profileRecord = null;
        preferences = { givenName:'', familyName:'', photoData:'' };
        preferencesReady = false; profileWritePending = false;
        photoEditor?.reset(); closeName();
        content.hidden = true;
        refreshButton.hidden = true;
        updateNavigation();
        timers.forEach(timer => clearTimeout(timer));
        timers.clear();
        for (const id of ['settings-avatar', 'settings-personal-avatar', 'settings-name', 'settings-email', 'settings-role', 'settings-provider', 'settings-verification', 'settings-created', 'settings-last-login', 'settings-uid', 'settings-profile-id']) byId(id).textContent = '';
        byId('settings-profile-data').replaceChildren();
        byId('settings-password-action').hidden = true;
        byId('settings-provider-note').hidden = true;
        if (byId('settings-photo-sharing')) byId('settings-photo-sharing').hidden = true;
        verifyButton.hidden = true;
        resetButton.disabled = false;
        resetButton.textContent = 'Modifica password';
        verifyButton.disabled = false;
        verifyButton.textContent = 'Verifica il tuo indirizzo email';
        message(securityStatus, '');
        message(pageStatus, '');
        message(photoStatus, ''); profileControls();
    }
    function showError(error) {
        window.HarzafiMotion?.complete(spinner, state);
        state.hidden = false;
        state.setAttribute('aria-busy', 'false');
        spinner.hidden = true;
        stateTitle.textContent = 'Non riusciamo a caricare il tuo account.';
        stateCopy.textContent = ['profile-unavailable', 'profile-ambiguous'].includes(error?.code)
            ? 'Il profilo del tuo account deve essere verificato. Contatta l’assistenza per ricevere aiuto.'
            : 'Controlla la connessione e riprova. Le tue informazioni saranno visibili dopo la verifica dell’accesso.';
        retry.hidden = false;
    }
    function formatDate(value) {
        if (!value) return 'Non disponibile';
        return new Intl.DateTimeFormat('it-IT', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value));
    }
    function render(value, user) {
        account = value;
        for (const id of ['settings-avatar','settings-personal-avatar']) {
            if (photoTools) photoTools.renderAvatar(byId(id), value);
            else byId(id).textContent = value.initials;
        }
        byId('settings-name').textContent = value.name;
        byId('settings-email').textContent = value.email;
        byId('settings-role').textContent = value.role === 'docente' ? 'Docente autorizzato' : 'Studente';
        if (byId('settings-photo-sharing')) byId('settings-photo-sharing').hidden = value.role !== 'studente';
        const rows = value.fields.map(field => {
            const row = document.createElement('div');
            const label = document.createElement('dt'); label.textContent = field.label;
            const data = document.createElement('dd'); data.textContent = field.value;
            if (field.label === 'Nome') {
                row.className = 'settings-name-row'; label.className = 'settings-visually-hidden';
                const button = document.createElement('button'); button.type = 'button'; button.id = 'settings-edit-name';
                button.setAttribute('aria-label', 'Modifica nome');
                const caption = document.createElement('span'); caption.textContent = 'Nome';
                const name = document.createElement('span'); name.textContent = field.value;
                button.append(caption, name); button.addEventListener('click', editName); data.replaceChildren(button);
            }
            row.append(label, data);
            return row;
        });
        byId('settings-profile-data').replaceChildren(...rows);
        byId('settings-provider').textContent = value.providers.join(' · ') || 'Non disponibile';
        byId('settings-verification').textContent = value.emailVerified ? 'Indirizzo verificato' : 'Indirizzo non ancora verificato';
        byId('settings-created').textContent = formatDate(value.createdAt);
        byId('settings-last-login').textContent = formatDate(value.lastSignInAt);
        byId('settings-uid').textContent = value.uid;
        byId('settings-profile-id').textContent = value.profileId;
        byId('settings-password-action').hidden = !value.passwordAccess;
        byId('settings-provider-note').hidden = value.passwordAccess;
        verifyButton.hidden = value.emailVerified || !value.passwordAccess || typeof user.sendEmailVerification !== 'function';
        if (!state.hidden) window.HarzafiMotion?.complete(spinner, content);
        state.setAttribute('aria-busy', 'false');
        state.hidden = true;
        content.hidden = false;
        refreshButton.hidden = false;
        updateNavigation();
        profileControls();
    }
    async function load(user, refresh = false) {
        const version = ++generation;
        clearAccount();
        state.hidden = false;
        spinner.hidden = false;
        retry.hidden = true;
        state.setAttribute('aria-busy', 'true');
        stateTitle.textContent = 'Carico il tuo account…';
        stateCopy.textContent = 'Un momento, stiamo recuperando le tue informazioni.';
        window.HarzafiMotion?.enter(state,{distance:6,opacity:.65,duration:220});
        if (!user || user.isAnonymous || !user.email) {
            window.location.replace('login.html');
            return;
        }
        const uid = user.uid;
        try {
            if (refresh) {
                await user.reload();
                if (version !== generation || auth.currentUser?.uid !== uid) return;
                user = auth.currentUser;
            }
            let preferredRole = null;
            try {
                if (sessionStorage.getItem('harzafi_user_uid') === uid) preferredRole = sessionStorage.getItem('harzafi_user_role');
            } catch (_) { /* The account still works when browser storage is unavailable. */ }
            const profile = await model.loadProfile(db, user, preferredRole);
            if (version !== generation || auth.currentUser?.uid !== uid) return;
            let personal = { givenName:'', familyName:'', photoData:'' }, personalReady = false;
            if (preferencesStore && photoTools) {
                try { personal = await preferencesStore.load(db, user); personalReady = true; }
                catch (_) { /* Core account information stays available when personal preferences cannot be read. */ }
            }
            if (version !== generation || auth.currentUser?.uid !== uid) return;
            profileRecord = profile; preferences = personal; preferencesReady = personalReady;
            render(model.describe(user, profile, personal), user);
            if (!personalReady) message(photoStatus, 'Non è possibile modificare il profilo in questo momento. Prova ad aggiornare i dati.', true);
            if (refresh) message(pageStatus, 'Le informazioni del tuo account sono aggiornate.');
        } catch (error) {
            if (version !== generation || auth.currentUser?.uid !== uid) return;
            if (['auth/user-disabled', 'auth/user-token-expired', 'auth/invalid-user-token'].includes(error.code)) {
                window.location.replace('login.html');
                return;
            }
            clearAccount();
            showError(error);
        }
    }
    function currentAccount() {
        return account && auth?.currentUser?.uid === account.uid && !auth.currentUser.isAnonymous ? account : null;
    }
    async function requestEmail(kind) {
        const value = currentAccount();
        if (!value || !value.passwordAccess) return;
        const button = kind === 'verify' ? verifyButton : resetButton;
        if (button.disabled) return;
        const version = generation;
        const user = auth.currentUser;
        const originalLabel = button.textContent;
        button.disabled = true;
        button.textContent = 'Invio in corso…';
        message(securityStatus, '');
        try {
            auth.languageCode = 'it';
            if (kind === 'verify') await user.sendEmailVerification();
            else await auth.sendPasswordResetEmail(value.email);
            if (version !== generation || !currentAccount()) return;
            button.textContent = 'Richiesta inviata';
            message(securityStatus, kind === 'verify'
                ? 'Controlla la tua email e apri il link di verifica. Quando hai finito, usa il pulsante di aggiornamento in alto.'
                : 'Richiesta inviata. Controlla la tua email per scegliere una nuova password, anche nella cartella spam.');
            const timer = setTimeout(() => {
                timers.delete(timer);
                if (version !== generation || !currentAccount()) return;
                button.textContent = originalLabel;
                button.disabled = false;
            }, 60000);
            timers.add(timer);
        } catch (error) {
            if (version !== generation || !currentAccount()) return;
            button.disabled = false;
            button.textContent = originalLabel;
            const copy = error.code === 'auth/too-many-requests' ? 'Hai effettuato diverse richieste. Attendi qualche minuto e riprova.'
                : error.code === 'auth/requires-recent-login' ? 'Per continuare, esci e accedi di nuovo al tuo account.'
                    : 'Non è stato possibile inviare la richiesta. Controlla la connessione e riprova.';
            message(securityStatus, copy, true);
        }
    }
    resetButton.addEventListener('click', () => requestEmail('password'));
    verifyButton.addEventListener('click', () => requestEmail('verify'));
    retry.addEventListener('click', () => {
        if (auth && db && model) load(auth.currentUser, true);
        else window.location.reload();
    });
    refreshButton.addEventListener('click', () => load(auth.currentUser, true));
    byId('settings-copy-id').addEventListener('click', async () => {
        const value = currentAccount();
        if (!value) return;
        const version = generation;
        try {
            await navigator.clipboard.writeText(value.uid);
            if (version === generation && currentAccount()) message(pageStatus, 'Identificativo account copiato.');
        } catch {
            if (version !== generation || !currentAccount()) return;
            const range = document.createRange(); range.selectNodeContents(byId('settings-uid'));
            const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
            message(pageStatus, 'L’identificativo è selezionato: puoi copiarlo dal tuo dispositivo.');
        }
    });
    downloadButton.addEventListener('click', async () => {
        const value = currentAccount();
        if (!value || downloadPending) return;
        const operation = ++downloadOperation, version = generation;
        const isCurrent = () => operation === downloadOperation && version === generation && currentAccount() === value;
        downloadPending = true; downloadButton.disabled = true;
        downloadButton.innerHTML = window.HarzafiLoading ? window.HarzafiLoading.buttonMarkup('Preparo il PDF…') : 'Preparo il PDF…';
        downloadButton.setAttribute('aria-busy', 'true');
        message(pageStatus, 'Sto preparando il documento PDF con le informazioni del tuo account.');
        try {
            if (!window.HarzafiAccountPdf) throw new Error('PDF unavailable');
            const result = await window.HarzafiAccountPdf.generate(model.exportSummary(value), { isCurrent });
            if (!isCurrent()) return;
            const url = URL.createObjectURL(new Blob([result.bytes], { type:'application/pdf' }));
            const link = document.createElement('a');
            link.href = url; link.download = result.filename; link.hidden = true;
            document.body.appendChild(link); link.click(); link.remove();
            // Keep the object URL alive long enough for mobile browsers to consume it.
            setTimeout(() => URL.revokeObjectURL(url), 60000);
            message(pageStatus, 'Il documento PDF con i dati del tuo account è pronto. Il download è stato avviato.');
        } catch (error) {
            if (version !== generation || !currentAccount() || operation !== downloadOperation) return;
            message(pageStatus, error.code === 'export-cancelled'
                ? 'Le informazioni sono cambiate. Premi di nuovo Scarica per creare un PDF aggiornato.'
                : 'Non è stato possibile preparare il PDF. Controlla la connessione e riprova.', true);
        } finally {
            if (operation === downloadOperation && version === generation) {
                window.HarzafiMotion?.complete(downloadButton,pageStatus);
                downloadPending = false; downloadButton.disabled = false;
                downloadButton.textContent = 'Scarica i dati dell’account'; downloadButton.removeAttribute('aria-busy');
            }
        }
    });
    const signOutButtons = [logoutButton, ...document.querySelectorAll('[data-settings-logout]')];
    document.querySelectorAll('[data-settings-logout]').forEach(button => button.addEventListener('click', () => logoutButton.click()));
    function pendingSignOut(pending) {
        signOutButtons.forEach(button => {
            button.disabled = pending;
            button.textContent = pending ? 'Esco…' : button === logoutButton ? 'Esci' : 'Esci dall’account';
        });
    }
    logoutButton.addEventListener('click', async () => {
        if (!auth || logoutButton.disabled) return;
        pendingSignOut(true);
        try {
            await auth.signOut();
            ++generation;
            clearAccount();
            window.location.replace('login.html');
        } catch {
            pendingSignOut(false);
            message(pageStatus, 'Non è stato possibile terminare la sessione. Riprova.', true);
        }
    });
    window.addEventListener('pagehide', () => { ++generation; clearAccount(); });
    window.addEventListener('pageshow', event => {
        if (event.persisted && auth && db && model) load(auth.currentUser, true);
    });
    if (!auth || !db || !model) {
        clearAccount();
        showError();
        return;
    }
    auth.onAuthStateChanged(user => load(user), () => { ++generation; clearAccount(); showError(); });
})();
