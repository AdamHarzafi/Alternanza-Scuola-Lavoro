(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.HarzafiAccountSettings = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const text = value => typeof value === 'string' ? value.trim().slice(0, 2000) : '';
    const emailOf = user => text(user?.email).toLowerCase();
    function failure(code) { return Object.assign(new Error(code), { code }); }

    async function loadProfile(db, user, preferredRole) {
        const email = emailOf(user);
        if (!user?.uid || user.isAnonymous || !email) throw failure('account-unavailable');
        const roles = ['studente', 'docente'].includes(preferredRole) ? [preferredRole] : ['studente', 'docente'];
        for (const role of roles) {
            let snapshot;
            try {
                snapshot = await db.collection(role === 'docente' ? 'docenti' : 'studenti')
                    .where('email', '==', email).limit(2).get({ source: 'server' });
            } catch (error) {
                if (error.code === 'permission-denied' && roles.length > 1) continue;
                throw error;
            }
            if (snapshot.empty) continue;
            if (snapshot.docs.length !== 1) throw failure('profile-ambiguous');
            const document = snapshot.docs[0];
            const data = document.data() || {};
            if (text(data.email).toLowerCase() !== email) throw failure('profile-unavailable');
            if (role === 'docente') {
                const authorization = await db.collection('docenti_autorizzati').doc(user.uid).get({ source: 'server' });
                if (!authorization.exists || authorization.data()?.enabled !== true) throw failure('profile-unavailable');
            }
            return { id: document.id, role, data };
        }
        throw failure('profile-unavailable');
    }

    function isoDate(value) {
        if (!value || typeof value !== 'string') return null;
        const date = new Date(value);
        return Number.isFinite(date.getTime()) ? date.toISOString() : null;
    }
    function describe(user, profile) {
        const name = text(profile.data.nome) || text(user.displayName);
        const email = emailOf(user);
        const providerIds = [...new Set((user.providerData || []).map(provider => provider?.providerId).filter(Boolean))];
        const providerNames = { password: 'Email e password', 'google.com': 'Account Google', 'apple.com': 'Account Apple', phone: 'Numero di telefono', 'microsoft.com': 'Account Microsoft' };
        const fields = [{ label: 'Nome del profilo', value: name || 'Non disponibile' }, { label: 'Email', value: email }, { label: 'Ruolo', value: profile.role === 'docente' ? 'Docente autorizzato' : 'Studente' }];
        for (const [label, keys] of [
            ['Cognome', ['cognome']], ['Classe', ['classe']], ['Sezione', ['sezione']],
            ['Anno scolastico', ['annoScolastico', 'anno_scolastico']], ['Istituto', ['istituto', 'scuola']],
            ['Telefono del profilo', ['telefono', 'phoneNumber']]
        ]) {
            const value = keys.map(key => typeof profile.data[key] === 'number' && Number.isFinite(profile.data[key]) ? String(profile.data[key]) : text(profile.data[key])).find(Boolean);
            if (value) fields.push({ label, value });
        }
        const phone = text(user.phoneNumber);
        if (phone) fields.push({ label: 'Numero per l’accesso', value: phone });
        const words = name.split(/\s+/).filter(Boolean);
        const initials = words.length ? Array.from(words[0])[0] + (words.length > 1 ? Array.from(words.at(-1))[0] : '') : 'H';
        return {
            uid: text(user.uid), profileId: text(profile.id), role: profile.role, name: name || 'Il tuo account',
            email, initials: initials.toLocaleUpperCase('it-IT'), fields,
            emailVerified: user.emailVerified === true,
            providers: providerIds.map(id => providerNames[id] || 'Altro servizio di accesso'),
            passwordAccess: providerIds.includes('password'),
            createdAt: isoDate(user.metadata?.creationTime), lastSignInAt: isoDate(user.metadata?.lastSignInTime)
        };
    }
    function exportSummary(account, at = new Date()) {
        return {
            servizio: 'Harzafi FSL', esportatoIl: at.toISOString(),
            account: { identificativo: account.uid, nome: account.name, email: account.email, ruolo: account.role,
                emailVerificata: account.emailVerified, metodiDiAccesso: [...account.providers],
                creatoIl: account.createdAt, ultimoAccesso: account.lastSignInAt },
            profilo: { riferimento: account.profileId, informazioni: account.fields.map(field => ({ ...field })) }
        };
    }
    return { loadProfile, describe, exportSummary };
});
