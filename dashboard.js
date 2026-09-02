(function () {
    'use strict';

    const cachedName = sessionStorage.getItem('harzafi_user') || 'Utente';
    const displayName = plainText(cachedName) || 'Utente';
    document.getElementById('hero-user-name').textContent = displayName;

    const firebaseConfig = {
        apiKey: 'AIzaSyBisp324W7J5jGwF_s-nbXabOjEutcwMmc',
        authDomain: 'harzafi---fsl.firebaseapp.com',
        projectId: 'harzafi---fsl'
    };
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const auth = firebase.auth();
    const list = document.getElementById('timeline-container');

    auth.onAuthStateChanged(user => {
        if (!user) {
            sessionStorage.removeItem('harzafi_user');
            window.location.replace('login.html');
            return;
        }
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
        const element = document.getElementById('hour-counter');
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
            element.textContent = formatHours(total);
            return;
        }
        const start = performance.now();
        function frame(now) {
            const progress = Math.min((now - start) / 1100, 1);
            element.textContent = formatHours(total * (1 - Math.pow(1 - progress, 4)));
            if (progress < 1) requestAnimationFrame(frame);
            else element.textContent = formatHours(total);
        }
        requestAnimationFrame(frame);
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
            date.textContent = dateText;
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
            detailCopy.append(detailEyebrow, description);
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
            });
            list.appendChild(item);
        });
    }

    function loadData() {
        db.collection('attivita_pcto').orderBy('ordine', 'desc').get().then(snapshot => {
            const activities = [];
            const totals = { formazione: 0, extra: 0, sicurezza: 0, certificazioni: 0 };
            let certificateCount = 0;
            snapshot.forEach(documentSnapshot => {
                const activity = documentSnapshot.data();
                activities.push(activity);
                const category = classify(activity);
                totals[category] += toNumber(activity.ore);
                if (activity.certificato === true || category === 'certificazioni') certificateCount += 1;
            });
            document.getElementById('activity-count').textContent = activities.length;
            document.getElementById('certificate-count').textContent = certificateCount;
            document.getElementById('last-update').textContent =
                new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(new Date());
            updateRing(totals);
            renderExperiences(activities);
        }).catch(error => {
            console.error(error);
            list.replaceChildren();
            const message = document.createElement('p');
            message.className = 'empty-state error-state';
            message.textContent = 'Non è stato possibile caricare i dati. Riprova tra poco.';
            list.appendChild(message);
            document.getElementById('timeline-count').textContent = 'Errore';
        });
    }

    document.getElementById('btn-logout').addEventListener('click', () => {
        auth.signOut().finally(() => {
            sessionStorage.removeItem('harzafi_user');
            window.location.replace('index.html');
        });
    });
})();
