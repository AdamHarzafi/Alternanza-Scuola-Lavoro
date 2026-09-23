(function () {
    'use strict';

    if (!firebase.apps.length) firebase.initializeApp({
        apiKey: 'AIzaSyBisp324W7J5jGwF_s-nbXabOjEutcwMmc',
        authDomain: 'harzafi---fsl.firebaseapp.com',
        projectId: 'harzafi---fsl',
        storageBucket: 'harzafi---fsl.firebasestorage.app',
        messagingSenderId: '743942918497',
        appId: '1:743942918497:web:6d6e44ba348760ce137520'
    });

    // Activate before Auth/Firestore: their SDKs attach and refresh the token.
    // This is a public site key, restricted to the production domains in Google Cloud.
    const localPreview = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
    if (!localPreview) {
        try {
            const appCheck = firebase.appCheck();
            appCheck.activate(new firebase.appCheck.ReCaptchaEnterpriseProvider(
                '6LejpcksAAAAAEQEVz602t2PL78MzHE73T4a608-'
            ), true);
            appCheck.getToken(false).then(() => {
                console.info('[App Check] Attestazione verificata.');
            }).catch(error => {
                console.warn('[App Check] Attestazione non disponibile:', error.code || 'errore di rete');
            });
        } catch (error) {
            console.error('[App Check] Inizializzazione non riuscita:', error.code || 'SDK non disponibile');
        }
    }
    const auth = firebase.auth();

    // Names always come from profile fields, never email prefixes or document IDs.
    async function profileName(user, preferredRole) {
        if (!user) return 'Utente';
        const fallback = typeof user.displayName === 'string' && user.displayName.trim() || 'Utente';
        if (!user.email || typeof firebase.firestore !== 'function') return fallback;
        const collections = preferredRole === 'docente' ? ['docenti', 'studenti'] : ['studenti', 'docenti'];
        for (const collection of collections) {
            try {
                const snapshot = await firebase.firestore().collection(collection)
                    .where('email', '==', user.email.trim().toLowerCase()).limit(1).get();
                const name = snapshot.empty ? null : snapshot.docs[0].data().nome;
                if (typeof name === 'string' && name.trim()) return name.trim();
            } catch (error) {
                console.warn('Profilo non disponibile:', error.code || 'errore di lettura');
            }
        }
        return fallback;
    }

    window.HarzafiSession = { auth, profileName };
    const links = Array.from(document.querySelectorAll('a[href="login.html"]'));
    const originalLabels = links.map(link => link.textContent);
    function updateNavigation(user) {
        links.forEach((link, index) => {
            link.href = user ? 'dashboard.html' : 'login.html';
            link.textContent = user ? 'Il mio registro' : originalLabels[index];
            link.removeAttribute('data-auth-pending');
        });
        if (!user) {
            sessionStorage.removeItem('harzafi_user');
            sessionStorage.removeItem('harzafi_user_uid');
        }
    }
    auth.onAuthStateChanged(updateNavigation, () => updateNavigation(null));
    // Refresh links when a page is restored from the browser's back/forward cache.
    window.addEventListener('pageshow', event => {
        if (event.persisted) updateNavigation(auth.currentUser);
    });
})();
