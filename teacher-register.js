(function () {
    'use strict';
    const M = TeacherModel;
    const format = value => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(value);
    const labels = { formazione: 'Formazione scolastica', certificazioni: 'Esperienza con attestazione' };
    function el(tag, cls, text) { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; }
    async function access(db, user) {
        const doc = await db.collection('docenti_autorizzati').doc(user.uid).get({ source: 'server' });
        return doc.exists && doc.data().enabled === true;
    }
    async function ensureStudent(db, user) {
        if (!user.email) return;
        const profile = await db.collection('studenti').where('email', '==', user.email.toLowerCase()).limit(1).get();
        if (profile.empty) return;
        const ref = db.collection('registri').doc(user.uid);
        await db.runTransaction(async tx => {
            const current = await tx.get(ref);
            if (!current.exists) tx.set(ref, { studentId: profile.docs[0].id, email: user.email.toLowerCase() });
        });
    }
    function mount(db, user) {
        const main = document.querySelector('main'), original = Array.from(main.childNodes), originalTitle = document.title;
        const nav = document.querySelector('.dashboard-header nav a');
        const oldNav = { href: nav.getAttribute('href'), text: nav.textContent };
        nav.href = '#classe'; nav.textContent = 'La classe'; document.title = 'La classe — Harzafi FSL';
        document.body.classList.add('teacher-page');
        const root = el('div', 'teacher-register');
        root.innerHTML = `<section class="teacher-hero" aria-labelledby="teacher-title"><p class="eyebrow">Registro docenti · FSL</p><h1 id="teacher-title">La classe,<br><span>a colpo d’occhio.</span></h1><p>Ogni percorso ha la sua storia. Qui trovi le ore e le esperienze di tutti gli studenti, sempre aggiornate.</p><div class="teacher-metrics" aria-label="Riepilogo della classe"></div></section><section id="classe" aria-labelledby="class-title"><div class="teacher-section-head"><div><p class="eyebrow">I percorsi degli studenti</p><h2 id="class-title">Tutti, in un unico posto.</h2></div><button type="button" class="teacher-export" disabled>Esporta resoconto</button></div><div class="teacher-toolbar"><label class="teacher-search">Cerca uno studente<input type="search" placeholder="Cerca per nome…" autocomplete="off"></label><label>Mostra<select data-filter><option value="all">Tutti gli studenti</option><option value="deleted">Con attività eliminate</option><option value="modified">Con attività modificate</option><option value="unlinked">Account da collegare</option></select></label><label>Ordina per<select data-sort><option value="name">Nome, A–Z</option><option value="low">Ore crescenti</option><option value="high">Ore decrescenti</option></select></label></div><p class="teacher-status" role="status" aria-live="polite">Caricamento dei registri…</p><div class="student-grid"></div><p class="teacher-footnote">Le ore comprendono le attività predefinite e quelle personali. Le esperienze eliminate restano consultabili e sono escluse dai totali. Il registro è un riepilogo: la validazione ufficiale spetta all’istituto.</p></section>`;
        main.replaceChildren(root);
        const grid = root.querySelector('.student-grid'), status = root.querySelector('.teacher-status');
        const search = root.querySelector('input'), filter = root.querySelector('[data-filter]'), sort = root.querySelector('[data-sort]'), exportButton = root.querySelector('.teacher-export');
        const detail = el('dialog', 'student-detail');
        detail.setAttribute('aria-labelledby', 'student-detail-title');
        detail.innerHTML = `<div class="student-detail-head"><div><p class="eyebrow">Registro studente</p><h2 id="student-detail-title"></h2></div><button class="student-close" type="button" aria-label="Chiudi registro studente">×</button></div><div class="student-detail-summary"></div><div class="student-detail-controls"><div class="student-tabs" role="group" aria-label="Stato delle esperienze"><button type="button" data-state="active" aria-pressed="true">Attive</button><button type="button" data-state="deleted" aria-pressed="false">Eliminate</button></div><label class="sr-only" for="teacher-category">Categoria</label><select id="teacher-category"><option value="all">Tutte le categorie</option><option value="formazione">Formazione scolastica</option><option value="certificazioni">Esperienza con attestazione</option></select><button type="button" class="detail-export">Esporta</button></div><p class="detail-status" role="status"></p><div class="student-experiences"></div>`;
        document.body.append(detail);
        let disposed = false, roster, registry, defaults, errorMessage = '', selected = null, selectedState = 'active';
        const rootCache = new Map();
        const accounts = new Map(), cards = new Map(), stops = [];
        let records = [], updateQueued = false;
        function schedule() { if (disposed || updateQueued) return; updateQueued = true; requestAnimationFrame(() => { updateQueued = false; if (!disposed) render(); }); }
        function fail() { errorMessage = 'Non è possibile aggiornare tutti i registri. Ricarica la pagina per riprovare. I dati incompleti non vengono esportati.'; schedule(); }
        function syncAccounts() {
            if (!registry || !roster || disposed) return;
            const ids = new Set(roster.map(row => row.id));
            const wanted = new Set(registry.filter(row => ids.has(row.studentId)).map(row => row.id));
            accounts.forEach((state, uid) => { if (!wanted.has(uid)) { state.stops.forEach(stop => stop()); accounts.delete(uid); } });
            wanted.forEach(uid => {
                if (accounts.has(uid)) return;
                const state = { personal: null, overrides: null, failed: false, cached: false, stops: [] }; accounts.set(uid, state);
                const receive = key => snapshot => {
                    if (disposed || accounts.get(uid) !== state || authChanged()) return;
                    if (snapshot.metadata.hasPendingWrites) return;
                    state[key] = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                    state[key + 'Cached'] = snapshot.metadata.fromCache; schedule();
                };
                const error = () => { state.failed = true; schedule(); };
                state.stops.push(db.collection('attivita_pcto').where('ownerUid', '==', uid).onSnapshot({ includeMetadataChanges: true }, receive('personal'), error));
                state.stops.push(db.collection('registri').doc(uid).collection('predefinite').onSnapshot({ includeMetadataChanges: true }, receive('overrides'), error));
            });
            schedule();
        }
        function authChanged() { return firebase.auth().currentUser?.uid !== user.uid; }
        function watch(name, receive) {
            stops.push(db.collection(name).onSnapshot({ includeMetadataChanges: true }, snapshot => {
                if (disposed || authChanged() || snapshot.metadata.hasPendingWrites) return;
                rootCache.set(name, snapshot.metadata.fromCache);
                receive(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))); schedule();
            }, fail));
        }
        function ring(summary) {
            const circle = el('div', 'student-ring');
            circle.style.setProperty('--school-share', (summary.total ? summary.formazione / summary.total * 100 : 0) + '%');
            circle.classList.toggle('is-empty', !summary.total);
            circle.setAttribute('role', 'img');
            circle.setAttribute('aria-label', `${format(summary.total)} ore totali: ${format(summary.formazione)} di formazione e ${format(summary.certificazioni)} con attestazione`);
            const center = el('div', 'student-ring-center'); center.append(el('strong', '', format(summary.total)), el('span', '', 'ore totali')); circle.append(center); return circle;
        }
        function render() {
            if (authChanged()) return;
            if (!roster || !registry || !defaults) { status.textContent = errorMessage || 'Caricamento dei registri…'; return; }
            records = roster.map(student => {
                const links = registry.filter(row => row.studentId === student.id);
                const state = links.length === 1 ? accounts.get(links[0].id) : null;
                const incomplete = links.length > 1 || !!state && (state.failed || !state.personal || !state.overrides);
                const rows = M.merge(defaults, state?.overrides || [], state?.personal || []);
                return { ...student, nome: M.text(student.nome) || 'Studente', rows, ...M.summarize(rows), unlinked: !links.length, incomplete, cached: [...rootCache.values()].some(Boolean) || !!(state?.personalCached || state?.overridesCached) };
            });
            const ready = records.filter(row => !row.incomplete);
            const incomplete = !!errorMessage || ready.length !== records.length;
            const metrics = root.querySelector('.teacher-metrics'); metrics.replaceChildren();
            for (const [value, label] of [[records.length, 'studenti'], [incomplete ? '—' : format(ready.reduce((n, r) => n + r.total, 0)), 'ore complessive'], [incomplete ? '—' : ready.reduce((n, r) => n + r.deleted.length, 0), 'esperienze eliminate']]) {
                const block = el('div'); block.append(el('strong', '', value), el('span', '', label)); metrics.append(block);
            }
            const query = search.value.trim().toLocaleLowerCase('it');
            const visible = records.filter(row => row.nome.toLocaleLowerCase('it').includes(query) && (filter.value === 'all' || filter.value === 'deleted' && row.deleted.length || filter.value === 'modified' && row.rows.some(r => r.modified) || filter.value === 'unlinked' && row.unlinked));
            visible.sort((a, b) => (sort.value === 'low' ? a.total - b.total : sort.value === 'high' ? b.total - a.total : 0) || a.nome.localeCompare(b.nome, 'it'));
            const allowed = new Set(visible.map(row => row.id));
            cards.forEach((card, id) => { if (!allowed.has(id)) { card.remove(); cards.delete(id); } });
            visible.forEach(row => {
                let card = cards.get(row.id);
                if (!card) { card = el('button', 'student-card'); card.type = 'button'; card.addEventListener('click', () => openStudent(row.id)); cards.set(row.id, card); }
                card.setAttribute('aria-label', `Apri il registro di ${row.nome}`);
                card.disabled = row.incomplete;
                const heading = el('h3', '', row.nome);
                const note = el('span', 'student-card-status', row.incomplete ? 'Registro da verificare' : row.unlinked ? 'Solo attività predefinite' : row.cached ? 'Dati memorizzati · verifica connessione' : 'Registro aggiornato');
                const legend = el('div', 'student-card-legend');
                legend.append(el('span', 'school-hours', `${format(row.formazione)} h formazione`), el('span', 'certificate-hours', `${format(row.certificazioni)} h con attestazione`));
                const foot = el('div', 'student-card-foot'); foot.append(el('span', '', `${row.active.length} esperienze`), el('span', row.deleted.length ? 'deleted-count' : '', row.deleted.length ? `${row.deleted.length} eliminate` : 'Apri registro ↗'));
                card.replaceChildren(heading, note, row.incomplete ? el('div', 'student-ring-placeholder', '—') : ring(row), legend, foot);
                grid.append(card);
            });
            status.textContent = errorMessage || (incomplete ? 'Alcuni registri sono in caricamento o richiedono una verifica.' : `${visible.length} di ${records.length} studenti · ${records.some(r => r.cached) ? 'Dati memorizzati: controlla la connessione' : 'Aggiornamento in tempo reale'}`);
            grid.querySelectorAll('.teacher-empty').forEach(node => node.remove());
            if (!visible.length) grid.append(el('p', 'teacher-empty', 'Nessuno studente corrisponde alla ricerca.'));
            else grid.querySelectorAll('.teacher-empty').forEach(node => node.remove());
            exportButton.disabled = incomplete || !records.length || records.some(r => r.cached);
            if (detail.open && selected) renderDetail();
        }
        function openStudent(id) { selected = id; selectedState = 'active'; detail.querySelector('select').value = 'all'; renderDetail(); detail.showModal(); document.documentElement.classList.add('register-modal-open'); }
        function renderDetail() {
            const student = records.find(row => row.id === selected);
            if (!student) { detail.close(); return; }
            detail.querySelector('h2').textContent = student.nome;
            const summary = detail.querySelector('.student-detail-summary'); summary.replaceChildren(ring(student));
            const copy = el('div'); copy.append(el('strong', '', `${student.active.length} esperienze attive`), el('p', '', `${format(student.formazione)} h di formazione scolastica · ${format(student.certificazioni)} h con attestazione`), el('p', 'teacher-footnote', student.unlinked ? 'Account non ancora collegato: sono mostrate soltanto le attività predefinite.' : 'Le attività eliminate non contribuiscono alle ore totali.')); summary.append(copy);
            detail.querySelectorAll('[data-state]').forEach(button => { const active = button.dataset.state === 'active'; button.textContent = `${active ? 'Attive' : 'Eliminate'} (${active ? student.active.length : student.deleted.length})`; button.setAttribute('aria-pressed', String(button.dataset.state === selectedState)); });
            const category = detail.querySelector('select').value;
            const rows = (selectedState === 'deleted' ? student.deleted : student.active).filter(row => category === 'all' || row.category === category);
            const list = detail.querySelector('.student-experiences'); list.replaceChildren();
            detail.querySelector('.detail-status').textContent = student.incomplete ? 'Aggiornamento non disponibile. Ricarica la pagina per verificare il registro.' : selectedState === 'deleted' ? 'Attività rimosse dallo studente e conservate per la consultazione docente.' : `${rows.length} esperienze visualizzate`;
            detail.querySelector('.detail-export').disabled = student.incomplete || student.cached;
            rows.sort(RegisterUI.compare);
            rows.forEach(row => {
                const item = el('article', 'teacher-experience'); const heading = el('div', 'teacher-experience-heading'); heading.append(el('h3', '', row.titolo), el('strong', '', `${format(row.ore)} h`));
                const badges = el('div', 'teacher-badges'); badges.append(el('span', '', row.source === 'predefined' ? 'Predefinita' : 'Personale'), el('span', '', labels[row.category]));
                if (row.modified) badges.append(el('span', 'modified-badge', 'Modificata'));
                if (row.deleted) badges.append(el('span', 'deleted-count', 'Eliminata'));
                item.append(heading, badges, el('p', 'teacher-date', M.text(row.data) || 'Data non disponibile'));
                if (row.descrizione) item.append(el('p', '', row.descrizione));
                const changed = row.deleted ? row.deletedAt : row.updatedAt;
                if (changed?.toDate) item.append(el('p', 'teacher-date', `${row.deleted ? 'Eliminata' : 'Modificata'} il ${changed.toDate().toLocaleString('it-IT')}`));
                else if (row.deleted) item.append(el('p', 'teacher-date', 'Data di eliminazione non disponibile per questa voce precedente.'));
                list.append(item);
            });
            if (!rows.length) list.append(el('p', 'teacher-empty', selectedState === 'deleted' ? 'Nessuna attività eliminata in questa categoria.' : 'Nessuna esperienza in questa categoria.'));
        }
        function download(items, filename) { const url = URL.createObjectURL(new Blob([M.csv(items)], { type: 'text/csv;charset=utf-8;' })); const a = el('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
        exportButton.addEventListener('click', () => download(records, 'resoconto-fsl-classe.csv'));
        detail.querySelector('.detail-export').addEventListener('click', () => download(records.filter(row => row.id === selected), 'resoconto-fsl-studente.csv'));
        detail.querySelector('.student-close').addEventListener('click', () => detail.close());
        detail.addEventListener('close', () => { document.documentElement.classList.remove('register-modal-open'); cards.get(selected)?.focus({ preventScroll: true }); selected = null; });
        detail.querySelectorAll('[data-state]').forEach(button => button.addEventListener('click', () => { selectedState = button.dataset.state; renderDetail(); }));
        detail.querySelector('select').addEventListener('change', renderDetail);
        search.addEventListener('input', schedule); filter.addEventListener('change', schedule); sort.addEventListener('change', schedule);
        watch('studenti', value => { roster = value; syncAccounts(); });
        watch('registri', value => { registry = value; syncAccounts(); });
        watch('attivita_predefinite', value => { defaults = value; });
        return () => { disposed = true; stops.forEach(stop => stop()); accounts.forEach(state => state.stops.forEach(stop => stop())); detail.close(); detail.remove(); main.replaceChildren(...original); nav.href = oldNav.href; nav.textContent = oldNav.text; document.title = originalTitle; document.body.classList.remove('teacher-page'); document.documentElement.classList.remove('register-modal-open'); };
    }
    window.TeacherRegister = { access, ensureStudent, mount };
})();
