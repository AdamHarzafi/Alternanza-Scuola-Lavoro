(function (root) {
    'use strict';
    const categories = ['formazione', 'extra', 'sicurezza', 'certificazioni'];
    function validate(input) {
        const titolo = String(input.titolo || '').trim();
        const descrizione = String(input.descrizione || '').trim();
        const ore = Number(String(input.ore).replace(',', '.'));
        const data = String(input.data || '');
        if (!titolo || titolo.length > 120) throw new Error('Inserisci un titolo di massimo 120 caratteri.');
        if (!Number.isFinite(ore) || ore <= 0 || ore > 24 || Math.abs(ore * 100 - Math.round(ore * 100)) > 1e-8) throw new Error('Inserisci una durata tra 0,01 e 24 ore, con massimo due decimali.');
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
        return {
            subscribe(next, error) {
                const uid = user().uid;
                return collection().where('ownerUid', '==', uid).onSnapshot({ includeMetadataChanges: true }, snapshot => {
                    if (auth.currentUser?.uid !== uid) return;
                    // Display only acknowledged writes: a pending write is not yet saved on Firebase.
                    if (snapshot.metadata.hasPendingWrites) return;
                    const rows = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                    rows.sort((a, b) => String(b.data).localeCompare(String(a.data)) || a.id.localeCompare(b.id));
                    next(rows, snapshot.metadata.fromCache);
                }, error);
            },
            add(input) {
                const ownerUid = user().uid;
                if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Sei offline. Riconnettiti prima di salvare.');
                return collection().doc().set({ ...validate(input), ownerUid, createdAt: timestamp() });
            },
            remove(id) {
                const uid = user().uid;
                if (typeof id !== 'string' || !id || id.includes('/')) throw new Error('Attività non valida.');
                const ref = collection().doc(id);
                return db.runTransaction(async transaction => {
                    const snapshot = await transaction.get(ref);
                    if (!snapshot.exists) return;
                    if (snapshot.data().ownerUid !== uid) throw new Error('Questa attività non appartiene al tuo account.');
                    transaction.delete(ref);
                });
            }
        };
    }
    const api = { validate, create };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.HarzafiHours = api;
})(typeof window !== 'undefined' ? window : globalThis);
