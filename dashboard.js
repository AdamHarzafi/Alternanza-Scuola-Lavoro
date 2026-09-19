(function () {
    'use strict';

    const nameElement = document.getElementById('hero-user-name');
    nameElement.textContent = 'Utente';

    const firebaseConfig = {
        apiKey: 'AIzaSyBisp324W7J5jGwF_s-nbXabOjEutcwMmc',
        authDomain: 'harzafi---fsl.firebaseapp.com',
        projectId: 'harzafi---fsl'
    };
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const auth = firebase.auth();
    const list = document.getElementById('timeline-container');

    const store = HarzafiHours.create(db, auth, () => firebase.firestore.FieldValue.serverTimestamp());
    const status = document.getElementById('hours-status');
    const addButton = document.getElementById('add-hours');
    const dialog = document.getElementById('hours-dialog');
    const form = document.getElementById('hours-form');
    const formStatus = document.getElementById('hours-form-status');
    const retry = document.getElementById('retry-hours');
    let unsubscribe, animation;
    let busy = false;
    let editing = null;
    auth.onAuthStateChanged(user => {
        if (unsubscribe) unsubscribe();
        unsubscribe = null;
        dialog.close();
        retry.hidden = true;
        nameElement.textContent = 'Utente';
        addButton.disabled = true;
        renderExperiences([]);
        updateRing({ formazione: 0, extra: 0, sicurezza: 0, certificazioni: 0 });
        document.getElementById('activity-count').textContent = '0';
        document.getElementById('certificate-count').textContent = '0';
        if (!user) {
            sessionStorage.removeItem('harzafi_user');
            window.location.replace('login.html');
            return;
        }
        // The email-linked Firestore profile is the source of the greeting.
        // HID accounts have no email: only reuse a name bound to this exact UID.
        if (user.isAnonymous && sessionStorage.getItem('harzafi_user_uid') === user.uid) {
            nameElement.textContent = sessionStorage.getItem('harzafi_user') || 'Utente';
        } else {
            window.HarzafiSession.profileName(user).then(name => {
                if (auth.currentUser?.uid !== user.uid) return;
                nameElement.textContent = name;
            });
        }
        if (user.isAnonymous) {
            status.textContent = 'Questo accesso Harzafi ID è temporaneo. Esci e accedi con email e password per salvare e ritrovare le tue ore anche su altri dispositivi.';
            return;
        }
        addButton.disabled = false;
        loadData();
    });

    function plainText(value) {
        const documentValue = new DOMParser().parseFromString(String(value || ''), 'text/html');
        return (documentValue.body.textContent || '').replace(/\s+/g, ' ').trim();
    }
    function toNumber(value) {
        return Number.parseFloat(String(value || '0').replace(',', '.')) || 0;
    }
    function formatHours(value) {
        return new Intl.NumberFormat('it-IT', {
            minimumFractionDigits: value % 1 ? 1 : 0,
            maximumFractionDigits: 2
        }).format(value);
    }
    function formatActivityHours(value) {
        const raw = plainText(value);
        if (!raw) return '—';
        const match = raw.replace(',', '.').match(/\d+(?:\.\d+)?/);
        if (!match) return raw.replace(/\s*(?:h|ore)\s*$/i, '').trim() || '—';
        return formatHours(Number.parseFloat(match[0])) + ' h';
    }
    function classify(activity) {
        const category = plainText(activity.categoria).toLowerCase();
        const meta = plainText(activity.meta).toLowerCase();
        const title = plainText(activity.titolo).toLowerCase();
        if (activity.certificato === true || category.includes('certifica') || meta.includes('certificazion') || title.includes('certificazion')) return 'certificazioni';
        if (category.includes('sicurezza') || meta.includes('sicurezza') || title.includes('sicurezza')) return 'sicurezza';
        if (category.includes('extra') || meta.includes('extra') || meta.includes('universit') || title.includes('extra')) return 'extra';
        return 'formazione';
    }
    function labelFor(category) {
        return {
            formazione: 'Formazione scolastica',
            extra: 'Esperienza extrascolastica',
            sicurezza: 'Formazione sulla sicurezza',
            certificazioni: 'Esperienza con attestazione'
        }[category];
    }
    function iconMarkup(certificate) {
        const source = certificate ? 'IMMAGINI/CERTIFICAZIONE.png' : 'IMMAGINI/LEZIONE.png';
        return '<img src="' + source + '" alt="" loading="lazy" decoding="async">';
    }
    function detailStat(label, value) {
        const item = document.createElement('div');
        const caption = document.createElement('span');
        caption.textContent = label;
        const content = document.createElement('strong');
        content.textContent = value;
        item.append(caption, content);
        return item;
    }
    function animateHours(total) {
        cancelAnimationFrame(animation);
        const element = document.getElementById('hour-counter');
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
            element.textContent = formatHours(total);
            return;
        }
        const start = performance.now();
        function frame(now) {
            const progress = Math.min((now - start) / 1100, 1);
            element.textContent = formatHours(total * (1 - Math.pow(1 - progress, 4)));
            if (progress < 1) animation = requestAnimationFrame(frame);
            else element.textContent = formatHours(total);
        }
        animation = requestAnimationFrame(frame);
    }

    function updateRing(totals) {
        const keys = ['formazione', 'extra', 'sicurezza', 'certificazioni'];
        const total = keys.reduce((sum, key) => sum + totals[key], 0);
        document.getElementById('val-formazione').textContent = formatHours(totals.formazione) + ' h';
        document.getElementById('val-extra').textContent = formatHours(totals.extra) + ' h';
        document.getElementById('val-sicurezza').textContent = formatHours(totals.sicurezza) + ' h';
        document.getElementById('val-certificazioni').textContent = formatHours(totals.certificazioni) + ' h';
        animateHours(total);

        const ring = document.getElementById('fitness-ring');
        if (!total) {
            ring.setAttribute('aria-label', 'Nessuna ora registrata');
            return;
        }
        ring.setAttribute('aria-label',
            formatHours(total) + ' ore totali: ' +
            formatHours(totals.formazione) + ' di formazione, ' +
            formatHours(totals.extra) + ' extrascolastiche, ' +
            formatHours(totals.sicurezza) + ' di sicurezza e ' +
            formatHours(totals.certificazioni) + ' con certificazione'
        );
    }

    function renderExperiences(activities) {
        list.replaceChildren();
        document.getElementById('timeline-count').textContent =
            activities.length + (activities.length === 1 ? ' esperienza' : ' esperienze');
        if (!activities.length) {
            const empty = document.createElement('p');
            empty.className = 'empty-state';
            empty.textContent = 'Nessuna esperienza registrata al momento.';
            list.appendChild(empty);
            return;
        }

        activities.forEach((activity, index) => {
            const category = classify(activity);
            const item = document.createElement('article');
            item.className = 'experience-item';

            const summary = document.createElement('button');
            summary.type = 'button';
            summary.className = 'experience-summary';
            summary.setAttribute('aria-expanded', 'false');
            const detailsId = 'experience-details-' + index;
            summary.setAttribute('aria-controls', detailsId);

            const titleWrap = document.createElement('div');
            titleWrap.className = 'experience-title';
            const icon = document.createElement('span');
            icon.className = 'experience-icon' + (category === 'certificazioni' ? ' cert' : '');
            icon.setAttribute('aria-hidden', 'true');
            icon.innerHTML = iconMarkup(category === 'certificazioni');
            const title = document.createElement('strong');
            title.textContent = plainText(activity.titolo) || 'Attività FSL';
            const meta = document.createElement('span');
            meta.textContent = plainText(activity.meta) || 'Esperienza formativa';
            titleWrap.append(title, meta);

            const categoryText = document.createElement('span');
            categoryText.className = 'experience-category';
            categoryText.textContent = labelFor(category);
            const date = document.createElement('span');
            date.className = 'experience-date';
            const dateText = plainText(activity.data) || 'Data non disponibile';
            date.textContent = /^\d{4}-\d{2}-\d{2}$/.test(dateText)
                ? dateText.split('-').reverse().join('/') : dateText;
            const hours = document.createElement('span');
            hours.className = 'experience-hours';
            const hoursText = formatActivityHours(activity.ore);
            hours.textContent = hoursText;

            const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            chevron.setAttribute('class', 'experience-chevron');
            chevron.setAttribute('viewBox', '0 0 24 24');
            chevron.setAttribute('aria-hidden', 'true');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'm7 10 5 5 5-5');
            chevron.appendChild(path);
            const actions = document.createElement('span');
            actions.className = 'experience-actions';
            actions.append(hours, chevron);
            summary.append(icon, titleWrap, categoryText, date, actions);

            const details = document.createElement('div');
            details.className = 'experience-details';
            details.id = detailsId;
            const inner = document.createElement('div');
            inner.className = 'experience-detail-shell';
            const detailCopy = document.createElement('div');
            detailCopy.className = 'experience-detail-copy';
            const detailEyebrow = document.createElement('span');
            detailEyebrow.className = 'experience-detail-eyebrow';
            detailEyebrow.textContent = 'Dettagli dell’esperienza';
            const description = document.createElement('p');
            description.textContent = plainText(activity.descrizione) || 'Nessun dettaglio aggiuntivo disponibile.';
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'hours-remove';
            remove.tabIndex = -1;
            remove.textContent = 'Elimina esperienza';
            remove.addEventListener('click', async () => {
                if (!window.confirm('Eliminare “' + plainText(activity.titolo) + '” e le relative ore?')) return;
                const uid = auth.currentUser?.uid;
                remove.disabled = true;
                try {
                    await store.remove(activity.id, activity.predefined);
                    if (auth.currentUser?.uid !== uid) return;
                    status.textContent = 'Esperienza eliminata da Firebase.';
                    addButton.focus();
                } catch (error) {
                    if (auth.currentUser?.uid !== uid) return;
                    status.textContent = errorMessage(error);
                    remove.disabled = false;
                }
            });
            const edit = document.createElement('button');
            edit.type = 'button';
            edit.className = 'hours-edit';
            edit.tabIndex = -1;
            edit.textContent = 'Modifica esperienza';
            edit.addEventListener('click', () => {
                editing = activity;
                form.reset();
                form.elements.titolo.value = plainText(activity.titolo);
                form.elements.descrizione.value = plainText(activity.descrizione);
                form.elements.ore.value = toNumber(activity.ore);
                const rawDate = plainText(activity.data);
                const italian = rawDate.match(/^(\d{2})[/.](\d{2})[/.](\d{4})$/);
                form.elements.data.value = italian ? italian[3] + '-' + italian[2] + '-' + italian[1] : rawDate;
                form.elements.categoria.value = classify(activity);
                document.getElementById('hours-dialog-title').textContent = 'Modifica la tua esperienza.';
                formStatus.textContent = form.elements.data.value ? '' : 'Seleziona una data per questa esperienza.';
                dialog.showModal();
                form.elements.titolo.focus();
            });
            detailCopy.append(detailEyebrow, description, edit, remove);
            const detailMeta = document.createElement('div');
            detailMeta.className = 'experience-detail-meta';
            detailMeta.append(
                detailStat('Tipologia', labelFor(category)),
                detailStat('Data', dateText),
                detailStat('Durata', hoursText)
            );
            inner.append(detailCopy, detailMeta);
            details.appendChild(inner);
            item.append(summary, details);
            summary.addEventListener('click', () => {
                const open = item.classList.toggle('open');
                summary.setAttribute('aria-expanded', String(open));
                remove.tabIndex = open ? 0 : -1;
                edit.tabIndex = open ? 0 : -1;
            });
            list.appendChild(item);
        });
    }

    function errorMessage(error) {
        if (error.code === 'permission-denied') return 'Accesso negato: occorre configurare le regole Firebase del registro personale.';
        if (error.code === 'unavailable') return 'Connessione non disponibile. Riprova quando torni online.';
        return error.code ? 'Operazione non riuscita. Riprova tra poco.' : error.message;
    }
    function loadData() {
        if (unsubscribe) unsubscribe();
        const uid = auth.currentUser?.uid;
        retry.hidden = true;
        status.textContent = 'Sincronizzazione del tuo registro…';
        let personalRows, defaultRows, personalCache = false, defaultCache = false;
        let failed = false;
        function renderCombined() {
            if (failed || !personalRows || !defaultRows || auth.currentUser?.uid !== uid) return;
            const activities = [...personalRows, ...defaultRows].sort((a, b) => String(b.data).localeCompare(String(a.data)));
            const fromCache = personalCache || defaultCache;
            const totals = { formazione: 0, extra: 0, sicurezza: 0, certificazioni: 0 };
            let certificateCount = 0;
            activities.forEach(activity => {
                const category = classify(activity);
                totals[category] += toNumber(activity.ore);
                if (activity.certificato === true || category === 'certificazioni') certificateCount += 1;
            });
            document.getElementById('activity-count').textContent = activities.length;
            document.getElementById('certificate-count').textContent = certificateCount;
            document.getElementById('last-update').textContent = fromCache ? 'Offline' : new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(new Date());
            updateRing(totals);
            renderExperiences(activities);
            status.textContent = fromCache ? 'In attesa di connessione: i dati potrebbero non essere aggiornati.' : 'Registro personale sincronizzato.';
        }
        function loadError(error) {
            failed = true;
            if (auth.currentUser?.uid !== uid) return;
            renderExperiences([]);
            updateRing({ formazione: 0, extra: 0, sicurezza: 0, certificazioni: 0 });
            document.getElementById('activity-count').textContent = '—';
            document.getElementById('certificate-count').textContent = '—';
            document.getElementById('timeline-count').textContent = 'Dati non disponibili';
            status.textContent = errorMessage(error);
            retry.hidden = false;
        }
        const stopPersonal = store.subscribe((rows, cached) => { personalRows = rows; personalCache = cached; renderCombined(); }, loadError);
        const stopDefaults = store.subscribeDefaults((rows, cached) => { defaultRows = rows; defaultCache = cached; renderCombined(); }, loadError);
        unsubscribe = () => { failed = true; stopPersonal(); stopDefaults(); };
    }
    retry.addEventListener('click', loadData);
    addButton.addEventListener('click', () => {
        editing = null;
        document.getElementById('hours-dialog-title').textContent = 'Aggiungi un’esperienza.';
        form.reset();
        const today = new Date();
        form.elements.data.value = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        formStatus.textContent = '';
        dialog.showModal();
        form.elements.titolo.focus();
    });
    document.getElementById('cancel-hours').addEventListener('click', () => { if (!busy) dialog.close(); });
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || !form.reportValidity()) return;
        const uid = auth.currentUser?.uid;
        busy = true;
        const values = Object.fromEntries(new FormData(form));
        document.getElementById('hours-fields').disabled = true;
        document.getElementById('save-hours').disabled = true;
        document.getElementById('cancel-hours').disabled = true;
        formStatus.textContent = 'Salvataggio su Firebase in corso…';
        try {
            if (editing) await store.edit(editing.id, values, editing.predefined);
            else await store.add(values);
            if (auth.currentUser?.uid !== uid) return;
            dialog.close();
            status.textContent = 'Ore salvate su Firebase.';
            addButton.focus();
        } catch (error) {
            if (auth.currentUser?.uid === uid) formStatus.textContent = errorMessage(error);
        } finally {
            busy = false;
            document.getElementById('hours-fields').disabled = false;
            document.getElementById('save-hours').disabled = false;
            document.getElementById('cancel-hours').disabled = false;
        }
    });

    document.getElementById('btn-logout').addEventListener('click', () => {
        auth.signOut().then(() => {
            sessionStorage.removeItem('harzafi_user');
            sessionStorage.removeItem('harzafi_user_uid');
            window.location.replace('index.html');
        }).catch(() => {
            const button = document.getElementById('btn-logout');
            button.textContent = 'Uscita non riuscita. Riprova';
        });
    });
})();
