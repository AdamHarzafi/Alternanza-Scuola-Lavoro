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
    let editing = null, deleting = null;
    let deleteBusy = false, displayedTotal = 0, lastTotal = null;
    const cards = new Map();
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const compactMotion = matchMedia('(max-width: 1024px), (hover: none) and (pointer: coarse)');
    const deleteDialog = document.getElementById('delete-dialog');
    const calendar = RegisterUI.calendar(form.elements.data, document.getElementById('date-trigger'), document.getElementById('date-picker'));
    const enteringCards = new Map();
    function finishEntrance(item) {
        item.style.removeProperty('opacity');
        enteringCards.get(item)?.cancel();
        enteringCards.delete(item);
    }
    const reveal = 'IntersectionObserver' in window && Element.prototype.animate ? new IntersectionObserver(entries => {
        let sequence = 0;
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const item = entry.target;
            reveal.unobserve(item);
            item.style.removeProperty('opacity');
            if (motion.matches || item.contains(document.activeElement)) return;
            const compact = compactMotion.matches;
            // Fast touch scrolling should never reveal a blank card already above the viewport.
            if (compact && entry.boundingClientRect.top < 0) return;
            const distance = compact ? 8 : 18;
            const entrance = item.animate([
                { opacity: 0, translate: '0 ' + distance + 'px' },
                { opacity: 1, translate: '0 0' }
            ], { duration: compact ? 380 : 560, delay: compact ? 0 : Math.min(sequence++ * 45, 90), easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
            enteringCards.set(item, entrance);
            entrance.onfinish = () => enteringCards.delete(item);
        });
    }, { threshold: 0, rootMargin: '0px 0px 32px 0px' }) : null;
    list.addEventListener('focusin', event => {
        const item = event.target.closest('.experience-item');
        if (item) { reveal?.unobserve(item); finishEntrance(item); }
    });
    motion.addEventListener('change', event => {
        if (!event.matches) return;
        cards.forEach(({ item }) => { reveal?.unobserve(item); finishEntrance(item); });
    });
    auth.onAuthStateChanged(user => {
        if (unsubscribe) unsubscribe();
        unsubscribe = null;
        dialog.close();
        deleteDialog.close();
        document.documentElement.classList.remove('register-modal-open');
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
        if (category === 'formazione' || category === 'certificazioni') return category;
        const meta = plainText(activity.meta).toLowerCase();
        const title = plainText(activity.titolo).toLowerCase();
        if (activity.certificato === true || category.includes('certifica') || meta.includes('certificazion') || title.includes('certificazion')) return 'certificazioni';
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
        if (total === lastTotal) return;
        lastTotal = total;
        const initial = displayedTotal;
        cancelAnimationFrame(animation);
        const element = document.getElementById('hour-counter');
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
            displayedTotal = total;
            element.textContent = formatHours(total);
            return;
        }
        const start = performance.now();
        function frame(now) {
            const progress = Math.min((now - start) / 500, 1);
            displayedTotal = initial + (total - initial) * (1 - Math.pow(1 - progress, 3));
            element.textContent = formatHours(displayedTotal);
            if (progress < 1) animation = requestAnimationFrame(frame);
            else element.textContent = formatHours(total);
        }
        animation = requestAnimationFrame(frame);
    }

    function updateRing(totals) {
        const keys = ['formazione', 'certificazioni'];
        const total = keys.reduce((sum, key) => sum + totals[key], 0);
        document.getElementById('val-formazione').textContent = formatHours(totals.formazione) + ' h';
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
            formatHours(totals.certificazioni) + ' con certificazione'
        );
    }

    function renderExperiences(activities) {
        const keys = new Set(activities.map(activity => (activity.predefined ? 'default:' : 'personal:') + activity.id));
        cards.forEach((record, key) => {
            if (keys.has(key)) return;
            reveal?.unobserve(record.item); finishEntrance(record.item); cards.delete(key); record.item.remove();
        });
        list.querySelectorAll('.empty-state, .experience-skeleton').forEach(element => element.remove());
        document.getElementById('timeline-count').textContent =
            activities.length + (activities.length === 1 ? ' esperienza' : ' esperienze');
        if (!activities.length) {
            const empty = document.createElement('p');
            empty.className = 'empty-state';
            empty.textContent = 'Nessuna esperienza registrata al momento.';
            list.appendChild(empty);
            return;
        }

        activities.forEach(activity => {
            const key = (activity.predefined ? 'default:' : 'personal:') + activity.id;
            const signature = JSON.stringify(activity);
            const previous = cards.get(key);
            if (previous?.signature === signature) return;
            const wasOpen = previous?.item.classList.contains('open');
            const category = classify(activity);
            const item = document.createElement('article');
            item.className = 'experience-item';
            item.dataset.registerMotion = 'true';

            const summary = document.createElement('button');
            summary.type = 'button';
            summary.className = 'experience-summary';
            summary.setAttribute('aria-expanded', 'false');
            const detailsId = 'experience-details-' + key.replace(':', '-');
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
            remove.addEventListener('click', () => {
                deleting = activity;
                document.getElementById('delete-name').textContent = plainText(activity.titolo);
                document.getElementById('delete-status').textContent = '';
                RegisterUI.open(deleteDialog);
                document.getElementById('cancel-delete').focus();
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
                calendar.set(activity.data);
                calendar.hide();
                form.elements.categoria.value = classify(activity);
                document.getElementById('hours-dialog-title').textContent = 'Modifica la tua esperienza.';
                formStatus.textContent = form.elements.data.value ? '' : 'Seleziona una data per questa esperienza.';
                RegisterUI.open(dialog);
                form.elements.titolo.focus();
            });
            detailCopy.append(detailEyebrow, description, edit, remove);
            const detailMeta = document.createElement('div');
            detailMeta.className = 'experience-detail-meta';
            detailMeta.append(
                detailStat('Tipologia', labelFor(category)),
                detailStat('Data', date.textContent),
                detailStat('Durata', hoursText)
            );
            inner.append(detailCopy, detailMeta);
            details.appendChild(inner);
            details.inert = true;
            item.append(summary, details);
            summary.addEventListener('click', () => {
                const open = item.classList.toggle('open');
                details.inert = !open;
                summary.setAttribute('aria-expanded', String(open));
                remove.tabIndex = open ? 0 : -1;
                edit.tabIndex = open ? 0 : -1;
            });
            if (wasOpen) {
                item.classList.add('open'); summary.setAttribute('aria-expanded', 'true');
                details.inert = false; edit.tabIndex = 0; remove.tabIndex = 0;
            }
            cards.set(key, { item, signature });
            if (previous) { reveal?.unobserve(previous.item); finishEntrance(previous.item); previous.item.replaceWith(item); }
            else if (reveal && !motion.matches) { item.style.opacity = '0'; reveal.observe(item); }
        });
        activities.forEach((activity, index) => {
            const key = (activity.predefined ? 'default:' : 'personal:') + activity.id;
            const item = cards.get(key).item;
            if (list.children[index] !== item) list.insertBefore(item, list.children[index] || null);
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
            const activities = [...personalRows, ...defaultRows].sort(RegisterUI.compare);
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
        calendar.set(new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10));
        calendar.hide();
        formStatus.textContent = '';
        RegisterUI.open(dialog);
        form.elements.titolo.focus();
    });
    document.getElementById('cancel-hours').addEventListener('click', () => { if (!busy) RegisterUI.close(dialog); });
    dialog.addEventListener('cancel', event => { event.preventDefault(); if (!busy) RegisterUI.close(dialog); });
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || !form.reportValidity()) return;
        if (!form.elements.data.value) {
            formStatus.textContent = 'Scegli la data dell’esperienza.';
            document.getElementById('date-trigger').setAttribute('aria-invalid', 'true');
            document.getElementById('date-trigger').focus(); return;
        }
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
            RegisterUI.close(dialog);
            status.textContent = 'Ore salvate su Firebase.';
        } catch (error) {
            if (auth.currentUser?.uid === uid) formStatus.textContent = errorMessage(error);
        } finally {
            busy = false;
            document.getElementById('hours-fields').disabled = false;
            document.getElementById('save-hours').disabled = false;
            document.getElementById('cancel-hours').disabled = false;
        }
    });

    document.getElementById('cancel-delete').addEventListener('click', () => { if (!deleteBusy) RegisterUI.close(deleteDialog); });
    deleteDialog.addEventListener('cancel', event => { event.preventDefault(); if (!deleteBusy) RegisterUI.close(deleteDialog); });
    document.getElementById('confirm-delete').addEventListener('click', async () => {
        if (deleteBusy || !deleting) return;
        const uid = auth.currentUser?.uid;
        deleteBusy = true;
        document.getElementById('confirm-delete').disabled = true;
        document.getElementById('cancel-delete').disabled = true;
        const message = document.getElementById('delete-status');
        message.textContent = 'Eliminazione in corso…';
        try {
            await store.remove(deleting.id, deleting.predefined);
            if (auth.currentUser?.uid !== uid) return;
            RegisterUI.close(deleteDialog);
            status.textContent = 'Esperienza eliminata dal tuo registro.';
        } catch (error) { if (auth.currentUser?.uid === uid) message.textContent = errorMessage(error); }
        finally {
            deleteBusy = false;
            document.getElementById('confirm-delete').disabled = false;
            document.getElementById('cancel-delete').disabled = false;
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
