(function () {
    'use strict';

    if (!firebase.apps.length) firebase.initializeApp({
        apiKey: 'AIzaSyBisp324W7J5jGwF_s-nbXabOjEutcwMmc',
        authDomain: 'harzafi---fsl.firebaseapp.com',
        projectId: 'harzafi---fsl'
    });
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
    links.forEach(link => {
        link.textContent = 'Account…';
        link.setAttribute('aria-busy', 'true');
    });
    function updateNavigation(user) {
        links.forEach((link, index) => {
            link.href = user ? 'dashboard.html' : 'login.html';
            link.textContent = user ? 'Il mio registro' : originalLabels[index];
            link.removeAttribute('aria-busy');
        });
        if (!user) {
            sessionStorage.removeItem('harzafi_user');
            sessionStorage.removeItem('harzafi_user_uid');
        }
    }
    auth.onAuthStateChanged(updateNavigation);
    // Refresh links when a page is restored from the browser's back/forward cache.
    window.addEventListener('pageshow', event => {
        if (event.persisted) updateNavigation(auth.currentUser);
    });
})();
