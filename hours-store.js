(function (root) {
    'use strict';
    const categories = ['formazione', 'certificazioni'];
    function validate(input) {
        const titolo = String(input.titolo || '').trim();
        const descrizione = String(input.descrizione || '').trim();
        const ore = Number(String(input.ore).replace(',', '.'));
        const data = String(input.data || '');
        if (!titolo || titolo.length > 120) throw new Error('Inserisci un titolo di massimo 120 caratteri.');
        if (!Number.isFinite(ore) || ore <= 0 || ore > 10000 || Math.abs(ore * 100 - Math.round(ore * 100)) > 1e-8) throw new Error('Inserisci una durata tra 0,01 e 10.000 ore, con massimo due decimali.');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !Number.isFinite(Date.parse(data)) || new Date(data).toISOString().slice(0, 10) !== data) throw new Error('Inserisci una data valida.');
        if (!categories.includes(input.categoria)) throw new Error('Scegli una categoria valida.');
        if (descrizione.length > 2000) throw new Error('La descrizione può contenere al massimo 2000 caratteri.');
        return { titolo, descrizione, ore, data, categoria: input.categoria };
    }
    function create(db, auth, timestamp) {
        function user() {
            const current = auth.currentUser;
            if (!current || current.isAnonymous) throw new Error('Accedi con email e password per usare il registro personale.');
            return current;
        }
        function collection() { return db.collection('attivita_pcto'); }
        function overrides(uid) { return db.collection('registri').doc(uid).collection('predefinite'); }
        return {
            subscribeDefaults(next, error) {
                const uid = user().uid;
                let templates, personal;
                let stopped = false;
                function publish() {
                    if (stopped || auth.currentUser?.uid !== uid || !templates || !personal) return;
                    const changes = new Map(personal.docs.map(doc => [doc.id, doc.data()]));
                    const rows = templates.docs.flatMap(doc => {
                        const change = changes.get(doc.id);
                        if (change?.deleted) return [];
                        return [{ ...(change || doc.data()), id: doc.id, predefined: true }];
                    });
                    next(rows, templates.metadata.fromCache || personal.metadata.fromCache);
                }
                const stopTemplates = db.collection('attivita_predefinite').onSnapshot({ includeMetadataChanges: true }, snapshot => {
                    templates = snapshot; publish();
                }, error);
                const stopPersonal = overrides(uid).onSnapshot({ includeMetadataChanges: true }, snapshot => {
                    if (snapshot.metadata.hasPendingWrites) return;
                    personal = snapshot; publish();
                }, error);
                return () => { stopped = true; stopTemplates(); stopPersonal(); };
            },
            edit(id, input, predefined = false) {
                const uid = user().uid;
                if (typeof id !== 'string' || !id || id.includes('/')) throw new Error('Attività non valida.');
                const values = validate(input);
                if (predefined) {
                    const ref = overrides(uid).doc(id);
                    return db.runTransaction(async transaction => {
                        const snapshot = await transaction.get(ref);
                        if (snapshot.exists && snapshot.data().deleted) throw new Error('Questa attività è stata eliminata.');
                        transaction.set(ref, { ...values, deleted: false, updatedAt: timestamp() });
                    });
                }
                const ref = collection().doc(id);
                return db.runTransaction(async transaction => {
                    const snapshot = await transaction.get(ref);
                    if (!snapshot.exists) throw new Error('Questa attività è stata eliminata.');
                    if (snapshot.data().ownerUid !== uid) throw new Error('Questa attività non appartiene al tuo account.');
                    if (snapshot.data().deleted) throw new Error('Questa attività è stata eliminata.');
                    transaction.update(ref, { ...values, updatedAt: timestamp() });
                });
            },
            subscribe(next, error) {
                const uid = user().uid;
                return collection().where('ownerUid', '==', uid).onSnapshot({ includeMetadataChanges: true }, snapshot => {
                    if (auth.currentUser?.uid !== uid) return;
                    // Display only acknowledged writes: a pending write is not yet saved on Firebase.
                    if (snapshot.metadata.hasPendingWrites) return;
                    const rows = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })).filter(row => !row.deleted);
                    rows.sort((a, b) => String(b.data).localeCompare(String(a.data)) || a.id.localeCompare(b.id));
                    next(rows, snapshot.metadata.fromCache);
                }, error);
            },
            add(input) {
                const ownerUid = user().uid;
                if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Sei offline. Riconnettiti prima di salvare.');
                return collection().doc().set({ ...validate(input), ownerUid, createdAt: timestamp(), deleted: false });
            },
            remove(id, predefined = false) {
                const uid = user().uid;
                if (typeof id !== 'string' || !id || id.includes('/')) throw new Error('Attività non valida.');
                if (predefined) {
                    const ref = overrides(uid).doc(id);
                    return db.runTransaction(async transaction => {
                        const snapshot = await transaction.get(ref);
                        if (snapshot.exists && snapshot.data().deleted) return;
                        // Preserve any personal changes so teachers can inspect the removed entry.
                        transaction.set(ref, { ...(snapshot.exists ? snapshot.data() : {}), deleted: true, deletedAt: timestamp(), updatedAt: timestamp() });
                    });
                }
                const ref = collection().doc(id);
                return db.runTransaction(async transaction => {
                    const snapshot = await transaction.get(ref);
                    if (!snapshot.exists) return;
                    if (snapshot.data().ownerUid !== uid) throw new Error('Questa attività non appartiene al tuo account.');
                    if (snapshot.data().deleted) return;
                    transaction.update(ref, { deleted: true, deletedAt: timestamp(), updatedAt: timestamp() });
                });
            }
        };
    }
    const api = { validate, create };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.HarzafiHours = api;
})(typeof window !== 'undefined' ? window : globalThis);
