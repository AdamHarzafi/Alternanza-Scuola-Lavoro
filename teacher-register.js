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
    async function ensureStudent(db, user, knownProfileId = '') {
        if (!user.email) return;
        let studentId = knownProfileId;
        if (!studentId) {
            const profile = await db.collection('studenti').where('email', '==', user.email.trim().toLowerCase()).limit(1).get();
            if (profile.empty) return;
            studentId = profile.docs[0].id;
        }
        const ref = db.collection('registri').doc(user.uid);
        await db.runTransaction(async tx => {
            const current = await tx.get(ref);
            if (!current.exists) tx.set(ref, { studentId, email: user.email.trim().toLowerCase() });
        });
    }
    function mount(db, user) {
        const main = document.querySelector('main'), original = Array.from(main.childNodes), originalTitle = document.title;
        const ringTemplate = main.querySelector('.activity-rings').cloneNode(true);
        let ringSequence = 0;
        const nav = document.querySelector('.dashboard-header nav a');
        const oldNav = { href: nav.getAttribute('href'), text: nav.textContent };
        nav.href = '#classe'; nav.textContent = 'La classe'; document.title = 'La classe — Harzafi FSL';
        document.body.classList.add('teacher-page');
        const root = el('div', 'teacher-register');
        root.innerHTML = `<section class="teacher-hero" aria-labelledby="teacher-title"><div class="teacher-hero-copy"><p class="eyebrow">Registro docenti · FSL</p><h1 id="teacher-title">La classe,<br><span>a colpo d’occhio.</span></h1><p>Ogni percorso ha la sua storia. Qui trovi le ore e le esperienze degli studenti presenti nel portale, sempre aggiornate.</p><div class="teacher-metrics" aria-label="Riepilogo degli studenti"></div></div><img class="teacher-hero-image" src="IMMAGINI/DASHBOARD-STUDENTI-PER-DOCENTI.webp" alt="Tutti i tuoi studenti" width="1080" height="1080" fetchpriority="high" decoding="async"></section><section id="classe" aria-labelledby="class-title"><div class="teacher-section-head"><div><p class="eyebrow">I percorsi degli studenti</p><h2 id="class-title">Tutti, in un unico posto.</h2></div><button type="button" class="teacher-export" disabled>Esporta resoconto</button></div><div class="teacher-toolbar"><label class="teacher-search">Cerca uno studente<input type="search" placeholder="Cerca per nome…" autocomplete="off"></label><label>Mostra<select data-filter><option value="all">Tutti gli studenti</option><option value="deleted">Con attività eliminate</option><option value="modified">Con attività modificate</option><option value="unlinked">Account da collegare</option></select></label><label>Ordina per<select data-sort><option value="name">Nome, A–Z</option><option value="low">Ore crescenti</option><option value="high">Ore decrescenti</option></select></label></div><p class="teacher-status" role="status" aria-live="polite">Caricamento dei registri…</p><div class="student-grid"></div><p class="teacher-footnote">Puoi consultare attività attive, modificate ed eliminate, con i dettagli disponibili e le ore associate a ogni voce. Le voci modificate mostrano i dati attuali e la data di aggiornamento, quando disponibile; non è conservato uno storico completo delle versioni precedenti. Le ore sono riepilogate per categoria. Le attività eliminate restano consultabili, ma sono escluse dai totali. Per un account non ancora collegato sono mostrate soltanto le attività predefinite. Il registro è un riepilogo: la validazione ufficiale spetta all’istituto.</p></section>`;
        main.replaceChildren(root);
        const eyebrow = root.querySelector('.teacher-hero-copy .eyebrow');
        const accountTools = el('div', 'dashboard-eyebrow-row');
        const settingsLink = el('a', 'dashboard-settings-link', 'Impostazioni');
        settingsLink.href = 'impostazioni.html';
        eyebrow.before(accountTools);
        accountTools.append(eyebrow, settingsLink);
        const grid = root.querySelector('.student-grid'), status = root.querySelector('.teacher-status');
        const search = root.querySelector('input'), filter = root.querySelector('[data-filter]'), sort = root.querySelector('[data-sort]'), exportButton = root.querySelector('.teacher-export');
        const detail = el('dialog', 'student-detail');
        detail.setAttribute('aria-labelledby', 'student-detail-title');
        detail.innerHTML = `
            <button class="student-close" type="button" aria-label="Chiudi registro studente"><svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false"><path d="M 12.12 10 l 4.07 -4.06 a 1.5 1.5 0 1 0 -2.11 -2.12 L 10 7.88 L 5.94 3.81 A 1.5 1.5 0 1 0 3.82 5.93 L 7.88 10 L 3.81 14.06 a 1.5 1.5 0 0 0 0 2.12 a 1.51 1.51 0 0 0 2.13 0 L 10 12.12 l 4.06 4.07 a 1.45 1.45 0 0 0 1.06 0.44 a 1.5 1.5 0 0 0 1.06 -2.56 Z"/></svg></button>
            <div class="student-detail-scroll" tabindex="0" role="region" aria-label="Registro dello studente">
                <header class="student-detail-head">
                    <div class="student-profile-avatar"></div>
                    <div class="student-profile-copy"><p class="eyebrow">Registro studente</p><h2 id="student-detail-title" tabindex="-1"></h2><p class="student-profile-context"></p><div class="student-profile-load"><p class="student-photo-status" role="status" aria-live="polite"></p><button class="student-photo-retry" type="button" hidden>Riprova</button></div></div>
                </header>
                <section class="student-detail-summary" aria-label="Riepilogo delle ore e delle esperienze"></section>
                <p class="student-account-note" hidden></p>
                <div class="student-detail-controls">
                    <div class="student-tabs" role="group" aria-label="Stato delle esperienze"><button type="button" data-state="active" aria-pressed="true">Attive</button><button type="button" data-state="deleted" aria-pressed="false">Eliminate</button></div>
                    <label class="sr-only" for="teacher-category">Categoria delle esperienze</label><select id="teacher-category"><option value="all">Tutte le categorie</option><option value="formazione">Formazione</option><option value="certificazioni">Con attestazione</option></select>
                    <button type="button" class="detail-export" title="Esporta tutte le attività in CSV"><span class="detail-export-label">Esporta</span><svg class="detail-export-symbol" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M10 2v10m-4-4 4 4 4-4M3 13v4h14v-4"/></svg></button>
                </div>
                <div class="student-list-heading"><h3 tabindex="-1">Le esperienze.</h3><p class="detail-status" role="status" aria-live="polite"></p></div>
                <div class="student-experiences"></div>
                <details class="student-detail-note"><summary>Come leggere questo registro</summary><p>Le ore totali comprendono soltanto le esperienze attive. Le attività eliminate restano consultabili e sono escluse dai conteggi. Per le attività modificate trovi i valori attuali e la data di aggiornamento, quando disponibile; non è conservato uno storico completo delle versioni precedenti. La validazione ufficiale del percorso spetta all’istituto.</p></details>
            </div>`;
        document.body.append(detail);
        let disposed = false, roster, registry, defaults, errorMessage = '', selected = null, selectedState = 'active';
        const rootCache = new Map();
        const accounts = new Map(), cards = new Map(), stops = [];
        const detailRows = new Map();
        let profileStop = null, profileUid = null, profileVersion = 0, profileImageVersion = 0, profileTimeout = null, closeTimer = null;
        const avatar = detail.querySelector('.student-profile-avatar'), photoStatus = detail.querySelector('.student-photo-status'), photoRetry = detail.querySelector('.student-photo-retry');
        const fallbackPhoto = 'IMMAGINI/PROFILO-UTENTE-LOGO.webp';
        const experiences = count => `${count} ${count === 1 ? 'esperienza' : 'esperienze'}`;
        function defaultAvatar() {
            ++profileImageVersion;
            const image = el('img'); image.src = fallbackPhoto; image.alt = ''; image.width = image.height = 96; image.decoding = 'async';
            avatar.replaceChildren(image); avatar.dataset.photo = 'default';
        }
        function profileMessage(message = '', retry = false, loading = false) {
            photoStatus.replaceChildren();
            if (loading && window.HarzafiLoading) photoStatus.insertAdjacentHTML('beforeend', window.HarzafiLoading.markup(true));
            photoStatus.append(document.createTextNode(message));
            photoRetry.hidden = !retry;
        }
        function stopProfile() {
            ++profileVersion; ++profileImageVersion; clearTimeout(profileTimeout); profileTimeout = null;
            profileStop?.(); profileStop = null; profileUid = null;
        }
        function loadProfile(student, force = false) {
            const uid = student.accountUid;
            if (!force && profileUid === uid) return;
            stopProfile(); defaultAvatar(); profileMessage();
            if (!uid || disposed || authChanged() || !detail.open) return;
            profileUid = uid;
            const version = profileVersion, studentId = student.id;
            const current = () => !disposed && !authChanged() && detail.open && selected === studentId && profileUid === uid && profileVersion === version;
            const failed = () => {
                if (!current()) return;
                clearTimeout(profileTimeout); defaultAvatar(); profileMessage('La foto del profilo non è disponibile.', true);
            };
            profileMessage('Carico la foto del profilo…', false, true);
            profileTimeout = setTimeout(failed, 8000);
            try {
                profileStop = db.collection('account_preferences').doc(uid).onSnapshot({ includeMetadataChanges:true }, snapshot => {
                    if (!current() || snapshot.metadata?.hasPendingWrites || snapshot.metadata?.fromCache) return;
                    clearTimeout(profileTimeout);
                    const value = window.HarzafiAccountPreferences.normalize(snapshot.exists ? snapshot.data() : {});
                    if (!value.photoData) { defaultAvatar(); profileMessage(); return; }
                    const imageVersion = ++profileImageVersion;
                    const image = el('img'); image.alt = `Foto del profilo di ${student.nome}`; image.width = image.height = 96; image.decoding = 'async';
                    image.onload = () => {
                        if (!current() || imageVersion !== profileImageVersion) return;
                        avatar.replaceChildren(image); avatar.dataset.photo = 'personal'; profileMessage();
                    };
                    image.onerror = () => { if (current() && imageVersion === profileImageVersion) failed(); };
                    image.src = value.photoData;
                }, failed);
            } catch (_) { failed(); }
        }
        defaultAvatar();
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
            const svg = ringTemplate.cloneNode(true), prefix = 'teacher-ring-' + (++ringSequence) + '-';
            svg.querySelectorAll('[id]').forEach(node => { node.id = prefix + node.id; });
            ['outer', 'middle', 'inner'].forEach((name, i) => {
                const progress = svg.querySelector('.activity-progress-' + name);
                progress.style.stroke = 'url(#' + prefix + ['ring-pink-gradient','ring-lime-gradient','ring-aqua-gradient'][i] + ')';
                progress.style.filter = 'url(#' + prefix + 'activity-ring-shadow)';
            });
            circle.append(svg);
            circle.setAttribute('role', 'img');
            circle.setAttribute('aria-label', `${format(summary.total)} ore totali: ${format(summary.formazione)} di formazione e ${format(summary.certificazioni)} con attestazione`);
            const center = el('div', 'student-ring-center'); center.append(el('strong', '', format(summary.total)), el('span', '', 'ore totali')); center.classList.toggle('compact-total', format(summary.total).length > 5); circle.append(center); return circle;
        }
        function render() {
            if (authChanged()) return;
            if (!roster || !registry || !defaults) { status.textContent = errorMessage || 'Caricamento dei registri…'; return; }
            records = roster.map(student => {
                const links = registry.filter(row => row.studentId === student.id);
                const state = links.length === 1 ? accounts.get(links[0].id) : null;
                const incomplete = links.length > 1 || !!state && (state.failed || !state.personal || !state.overrides);
                const rows = M.merge(defaults, state?.overrides || [], state?.personal || []);
                return { ...student, nome: M.text(student.nome) || 'Studente', accountUid:links.length === 1 ? links[0].id : null, rows, ...M.summarize(rows), unlinked: !links.length, incomplete, cached: [...rootCache.values()].some(Boolean) || !!(state?.personalCached || state?.overridesCached) };
            });
            const ready = records.filter(row => !row.incomplete);
            const incomplete = !!errorMessage || ready.length !== records.length;
            const metrics = root.querySelector('.teacher-metrics'); metrics.replaceChildren();
            for (const [value, label] of [[records.length, 'studenti nel portale']]) {
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
        function openStudent(id) {
            if (disposed || authChanged() || !records.some(row => row.id === id && !row.incomplete)) return;
            clearTimeout(closeTimer); detail.classList.remove('is-closing'); stopProfile(); defaultAvatar(); profileMessage();
            selected = id; selectedState = 'active'; detail.querySelector('select').value = 'all';
            detail.querySelector('.student-detail-note').open = false;
            detailRows.clear(); detail.querySelector('.student-experiences').replaceChildren(); renderDetail();
            document.documentElement.style.setProperty('--student-scrollbar-gap', `${Math.max(0, innerWidth - document.documentElement.clientWidth)}px`);
            document.documentElement.classList.add('register-modal-open', 'teacher-student-open');
            detail.showModal(); detail.querySelector('.student-detail-scroll').scrollTop = 0;
            loadProfile(records.find(row => row.id === id));
            requestAnimationFrame(() => { if (detail.open && selected === id) detail.querySelector('h2').focus({preventScroll:true}); });
        }
        function closeStudent(immediate = false) {
            if (!detail.open || detail.classList.contains('is-closing')) return;
            stopProfile();
            if (immediate || matchMedia('(prefers-reduced-motion: reduce)').matches) detail.close();
            else { detail.classList.add('is-closing'); closeTimer = setTimeout(() => detail.close(), 180); }
        }
        function formatDate(value) {
            const key = RegisterUI.dateKey(value);
            return key ? new Intl.DateTimeFormat('it-IT', {day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(key + 'T12:00:00Z')) : M.text(value) || 'Data non disponibile';
        }
        function changedDate(row) {
            const value = row.deleted ? row.deletedAt : row.updatedAt;
            const date = typeof value?.toDate === 'function' ? value.toDate() : null;
            return date && Number.isFinite(date.getTime()) ? `${row.deleted ? 'Eliminata' : 'Aggiornata'} il ${date.toLocaleString('it-IT')}` : row.deleted ? 'La data di eliminazione non è disponibile per questa esperienza.' : '';
        }
        function renderDetail() {
            const student = records.find(row => row.id === selected);
            if (!student) { detail.close(); return; }
            detail.querySelector('h2').textContent = student.nome;
            detail.querySelector('.student-profile-context').textContent = [M.text(student.classe) ? `Classe ${M.text(student.classe)}` : '', 'Registro FSL'].filter(Boolean).join(' · ');
            if (detail.open) loadProfile(student);
            const summary = detail.querySelector('.student-detail-summary');
            const modified = student.active.filter(row => row.modified), modifiedHours = modified.reduce((sum, row) => sum + row.ore, 0), deletedHours = student.deleted.reduce((sum, row) => sum + row.ore, 0);
            const hours = el('div', 'student-total-card'), legend = el('dl', 'student-hours-breakdown');
            for (const [label, amount, cls] of [['Formazione', student.formazione, 'school-hours'], ['Con attestazione', student.certificazioni, 'certificate-hours']]) {
                const pair = el('div', cls); pair.append(el('dt', '', label), el('dd', '', `${format(amount)} h`)); legend.append(pair);
            }
            hours.append(ring(student), legend);
            const activitySummary = el('div', 'student-activity-card'), metrics = el('dl', 'student-detail-metrics');
            const active = el('div', 'student-active-metric'); active.append(el('dt', '', 'Esperienze attive'), el('dd', '', student.active.length)); metrics.append(active);
            for (const [label, count, amount, note] of [['Modificate', modified.length, modifiedHours, 'nelle attività attive'], ['Eliminate', student.deleted.length, deletedHours, 'escluse dal totale']]) {
                const pair = el('div'); pair.append(el('dt', '', label), el('dd', '', count), el('p', '', `${format(amount)} h · ${note}`)); metrics.append(pair);
            }
            activitySummary.append(metrics); summary.replaceChildren(hours, activitySummary);
            const note = detail.querySelector('.student-account-note'); note.hidden = !student.unlinked;
            note.textContent = student.unlinked ? 'Questo account non è ancora collegato al profilo. Il riepilogo comprende soltanto le attività predefinite.' : '';
            detail.querySelectorAll('[data-state]').forEach(button => { const active = button.dataset.state === 'active'; button.textContent = `${active ? 'Attive' : 'Eliminate'} (${active ? student.active.length : student.deleted.length})`; button.setAttribute('aria-pressed', String(button.dataset.state === selectedState)); });
            const category = detail.querySelector('select').value;
            const rows = (selectedState === 'deleted' ? student.deleted : student.active).filter(row => category === 'all' || row.category === category);
            const list = detail.querySelector('.student-experiences');
            const visibleLabel = selectedState === 'deleted' ? (rows.length === 1 ? 'eliminata' : 'eliminate') : (rows.length === 1 ? 'visualizzata' : 'visualizzate');
            detail.querySelector('.detail-status').textContent = errorMessage || student.incomplete ? 'Aggiornamento non disponibile. Ricarica la pagina per verificare il registro.' : `${experiences(rows.length)} ${visibleLabel}${selectedState === 'deleted' ? ' · escluse dai totali' : ''}${student.cached ? ' · dati memorizzati, verifica la connessione' : ''}`;
            detail.querySelector('.detail-export').disabled = !!errorMessage || student.incomplete || student.cached;
            detail.querySelector('.detail-export').setAttribute('aria-label', `Esporta tutte le attività di ${student.nome} in CSV`);
            rows.sort(RegisterUI.compare);
            const keys = new Set(rows.map(row => `${row.source}:${row.id}`));
            let lostFocus = false;
            detailRows.forEach((value, key) => { if (!keys.has(key)) { lostFocus ||= value.node.contains(document.activeElement); value.node.remove(); detailRows.delete(key); } });
            list.querySelectorAll('.teacher-empty').forEach(node => node.remove());
            rows.forEach(row => {
                const key = `${row.source}:${row.id}`, changed = changedDate(row);
                const signature = JSON.stringify([row.titolo, row.descrizione, row.ore, row.category, row.data, row.modified, row.deleted, changed]);
                const previous = detailRows.get(key);
                if (previous?.signature === signature) return;
                const item = el('details', 'teacher-experience'); item.open = previous?.node.open || false;
                const toggle = el('summary'), heading = el('div', 'teacher-experience-heading'), title = el('div', 'teacher-experience-title'), amount = el('div', 'teacher-experience-amount');
                title.append(el('h4', '', row.titolo), el('p', 'teacher-date', formatDate(row.data)));
                amount.append(el('strong', '', `${format(row.ore)} h`));
                amount.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 16 9" width="16" height="9" aria-hidden="true"><path d="m3.5 2.25 4.5 4.5 4.5-4.5"/></svg>');
                heading.append(title, amount);
                const badges = el('div', 'teacher-badges'); badges.append(el('span', '', row.source === 'predefined' ? 'Predefinita' : 'Personale'), el('span', '', labels[row.category]));
                if (row.modified) badges.append(el('span', 'modified-badge', 'Modificata'));
                if (row.deleted) badges.append(el('span', 'deleted-count', 'Eliminata'));
                toggle.append(heading, badges);
                const copy = el('div', 'teacher-experience-copy'); copy.append(el('p', '', row.descrizione || 'Non sono presenti ulteriori dettagli per questa esperienza.'));
                if (changed) copy.append(el('p', 'teacher-date', changed));
                item.append(toggle, copy);
                const focused = previous?.node.contains(document.activeElement);
                if (previous) previous.node.replaceWith(item);
                detailRows.set(key, {node:item, signature});
                if (focused) toggle.focus({preventScroll:true});
            });
            rows.forEach((row, index) => { const node = detailRows.get(`${row.source}:${row.id}`).node; if (list.children[index] !== node) list.insertBefore(node, list.children[index] || null); });
            if (!rows.length) list.append(el('p', 'teacher-empty', selectedState === 'deleted' ? 'Nessuna attività eliminata in questa categoria.' : 'Nessuna esperienza in questa categoria.'));
            if (lostFocus) detail.querySelector('.student-list-heading h3').focus({preventScroll:true});
        }
        function download(items, filename) { const url = URL.createObjectURL(new Blob([M.csv(items)], { type: 'text/csv;charset=utf-8;' })); const a = el('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
        exportButton.addEventListener('click', () => download(records, 'resoconto-fsl-classe.csv'));
        detail.querySelector('.detail-export').addEventListener('click', () => download(records.filter(row => row.id === selected), 'resoconto-fsl-studente.csv'));
        detail.querySelector('.student-close').addEventListener('click', () => closeStudent());
        detail.addEventListener('cancel', event => { event.preventDefault(); closeStudent(); });
        detail.addEventListener('keydown', event => {
            if (event.key !== 'Tab') return;
            const focusable = Array.from(detail.querySelectorAll('button:not([disabled]), select:not([disabled]), summary, a[href], [tabindex]:not([tabindex="-1"])'))
                .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
            const first = focusable[0], last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        });
        detail.addEventListener('click', event => { const r = detail.getBoundingClientRect(); if (event.target === detail && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) closeStudent(); });
        detail.addEventListener('close', () => {
            clearTimeout(closeTimer); closeTimer = null; detail.classList.remove('is-closing'); stopProfile(); defaultAvatar(); profileMessage();
            document.documentElement.classList.remove('register-modal-open', 'teacher-student-open'); document.documentElement.style.removeProperty('--student-scrollbar-gap');
            const id = selected; selected = null;
            if (!disposed) (cards.get(id) || search).focus({preventScroll:true});
        });
        photoRetry.addEventListener('click', () => { const student = records.find(row => row.id === selected); if (student) loadProfile(student, true); });
        const pageHidden = () => { clearTimeout(closeTimer); detail.classList.remove('is-closing'); closeStudent(true); };
        window.addEventListener('pagehide', pageHidden);
        detail.querySelectorAll('[data-state]').forEach(button => button.addEventListener('click', () => { selectedState = button.dataset.state; renderDetail(); }));
        detail.querySelector('select').addEventListener('change', renderDetail);
        search.addEventListener('input', schedule); filter.addEventListener('change', schedule); sort.addEventListener('change', schedule);
        watch('studenti', value => { roster = value; syncAccounts(); });
        watch('registri', value => { registry = value; syncAccounts(); });
        watch('attivita_predefinite', value => { defaults = value; });
        return () => { disposed = true; clearTimeout(closeTimer); stopProfile(); window.removeEventListener('pagehide', pageHidden); stops.forEach(stop => stop()); accounts.forEach(state => state.stops.forEach(stop => stop())); detail.close(); detail.remove(); main.replaceChildren(...original); nav.href = oldNav.href; nav.textContent = oldNav.text; document.title = originalTitle; document.body.classList.remove('teacher-page'); document.documentElement.classList.remove('register-modal-open', 'teacher-student-open'); document.documentElement.style.removeProperty('--student-scrollbar-gap'); };
    }
    window.TeacherRegister = { access, ensureStudent, mount };
})();
