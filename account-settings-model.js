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
    function identity(data, user, preferences = {}) {
        const raw = text(data.nome) || text(user.displayName);
        let givenName = text(preferences.givenName) || text(data.nomeProprio) || text(data.givenName) || text(data.firstName);
        let familyName = text(preferences.familyName) || text(data.cognome) || text(data.familyName) || text(data.lastName);
        const without = (full, part) => {
            const value = full.replace(/\s+/g, ' '), known = part.replace(/\s+/g, ' ');
            const lower = value.toLocaleLowerCase('it-IT'), key = known.toLocaleLowerCase('it-IT');
            if (lower.startsWith(key + ' ')) return value.slice(known.length + 1).trim();
            if (lower.endsWith(' ' + key)) return value.slice(0, -known.length - 1).trim();
            return '';
        };
        if (givenName && !familyName) familyName = without(raw, givenName);
        if (familyName && !givenName) givenName = without(raw, familyName);
        const structured = !!givenName && !!familyName;
        const words = raw.split(/\s+/).filter(Boolean);
        const name = structured ? givenName + ' ' + familyName : raw;
        if (!givenName && !familyName) {
            givenName = words[0] || '';
            familyName = words.slice(1).join(' ');
        }
        const first = value => Array.from(value)[0] || '';
        const initials = structured ? first(givenName) + first(familyName)
            : words.length ? first(words[0]) + (words.length > 1 ? first(words.at(-1)) : '') : 'H';
        return { name, givenName, familyName, initials: initials.toLocaleUpperCase('it-IT') };
    }
    function describe(user, profile, preferences = {}) {
        const person = identity(profile.data, user, preferences);
        const name = person.name;
        const email = emailOf(user);
        const providerIds = [...new Set((user.providerData || []).map(provider => provider?.providerId).filter(Boolean))];
        const providerNames = { password: 'Email e password', 'google.com': 'Account Google', 'apple.com': 'Account Apple', phone: 'Numero di telefono', 'microsoft.com': 'Account Microsoft' };
        const fields = [{ label: 'Nome', value: name || 'Non disponibile' }, { label: 'Email', value: email }, { label: 'Ruolo', value: profile.role === 'docente' ? 'Docente autorizzato' : 'Studente' }];
        for (const [label, keys] of [
            ['Classe', ['classe']], ['Sezione', ['sezione']],
            ['Anno scolastico', ['annoScolastico', 'anno_scolastico']], ['Istituto', ['istituto', 'scuola']],
            ['Telefono del profilo', ['telefono', 'phoneNumber']]
        ]) {
            const value = keys.map(key => typeof profile.data[key] === 'number' && Number.isFinite(profile.data[key]) ? String(profile.data[key]) : text(profile.data[key])).find(Boolean);
            if (value) fields.push({ label, value });
        }
        const phone = text(user.phoneNumber);
        if (phone) fields.push({ label: 'Numero per l’accesso', value: phone });
        return {
            uid: text(user.uid), profileId: text(profile.id), role: profile.role, name: name || 'Il tuo account',
            email, initials: person.initials, givenName:person.givenName, familyName:person.familyName, fields,
            photoData: typeof preferences.photoData === 'string' ? preferences.photoData : '',
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
            profilo: { riferimento: account.profileId, informazioni: account.fields.map(field => ({ ...field })), foto: account.photoData || null }
        };
    }
    return { loadProfile, describe, exportSummary, identity };
});
