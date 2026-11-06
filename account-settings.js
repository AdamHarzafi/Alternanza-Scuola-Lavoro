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
    const refreshButton = byId('settings-refresh');
    const backButton = byId('settings-back');
    const sidebar = byId('settings-sidebar');
    const views = byId('settings-views');
    const viewButtons = [...document.querySelectorAll('[data-settings-view]')];
    const desktopQuery = window.matchMedia('(min-width:960px)');
    const sections = Object.fromEntries(viewButtons.map(button => [button.dataset.settingsView, byId(button.getAttribute('aria-controls'))]));
    const timers = new Set();
    const model = window.HarzafiAccountSettings;
    const auth = window.HarzafiSession?.auth;
    const db = typeof window.firebase?.firestore === 'function' ? window.firebase.firestore() : null;
    let account = null;
    let generation = 0;
    let activeView = null;

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
    }
    viewButtons.forEach(button => button.addEventListener('click', () => {
        if (!currentAccount()) return;
        const hash = '#' + sections[button.dataset.settingsView].id;
        if (window.location.hash !== hash) history.pushState({ harzafiSettingsView: true }, '', hash);
        updateNavigation({ focus: true });
    }));
    backButton.addEventListener('click', event => {
        if (!account || desktopQuery.matches || !activeView) return;
        event.preventDefault();
        if (history.state?.harzafiSettingsView) history.back();
        else {
            history.replaceState(null, '', window.location.pathname + window.location.search);
            updateNavigation({ focus: true });
        }
    });
    window.addEventListener('popstate', () => updateNavigation({ focus: true }));
    window.addEventListener('hashchange', () => updateNavigation({ focus: true }));
    desktopQuery.addEventListener('change', () => updateNavigation());

    function message(element, value, error = false) {
        element.textContent = value;
        element.dataset.error = String(error);
    }
    function clearAccount() {
        account = null;
        content.hidden = true;
        refreshButton.hidden = true;
        updateNavigation();
        timers.forEach(timer => clearTimeout(timer));
        timers.clear();
        for (const id of ['settings-avatar', 'settings-name', 'settings-email', 'settings-role', 'settings-provider', 'settings-verification', 'settings-created', 'settings-last-login', 'settings-uid', 'settings-profile-id']) byId(id).textContent = '';
        byId('settings-profile-data').replaceChildren();
        byId('settings-password-action').hidden = true;
        byId('settings-provider-note').hidden = true;
        verifyButton.hidden = true;
        resetButton.disabled = false;
        resetButton.textContent = 'Modifica password';
        verifyButton.disabled = false;
        verifyButton.textContent = 'Verifica il tuo indirizzo email';
        message(securityStatus, '');
        message(pageStatus, '');
    }
    function showError(error) {
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
        byId('settings-avatar').textContent = value.initials;
        byId('settings-name').textContent = value.name;
        byId('settings-email').textContent = value.email;
        byId('settings-role').textContent = value.role === 'docente' ? 'Docente autorizzato' : 'Studente';
        const rows = value.fields.map(field => {
            const row = document.createElement('div');
            const label = document.createElement('dt'); label.textContent = field.label;
            const data = document.createElement('dd'); data.textContent = field.value;
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
        state.setAttribute('aria-busy', 'false');
        state.hidden = true;
        content.hidden = false;
        refreshButton.hidden = false;
        updateNavigation();
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
            render(model.describe(user, profile), user);
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
    byId('settings-download').addEventListener('click', () => {
        const value = currentAccount();
        if (!value) return;
        const url = URL.createObjectURL(new Blob([JSON.stringify(model.exportSummary(value), null, 2)], { type: 'application/json;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url; link.download = 'harzafi-fsl-account.json'; link.hidden = true;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        message(pageStatus, 'Il riepilogo dell’account è pronto per il download.');
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
