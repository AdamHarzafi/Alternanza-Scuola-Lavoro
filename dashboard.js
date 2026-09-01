(function () {
    'use strict';

    const rawUser = sessionStorage.getItem('harzafi_user') || 'Utente';
    const fullName = rawUser.split(' ').filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ') || 'Utente';
    const firstName = fullName.split(' ')[0];
    document.getElementById('greeting-name').textContent = firstName;
    document.getElementById('header-name').textContent = firstName;

    const firebaseConfig = {
        apiKey: 'AIzaSyBisp324W7J5jGwF_s-nbXabOjEutcwMmc',
        authDomain: 'harzafi---fsl.firebaseapp.com',
        projectId: 'harzafi---fsl'
    };
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const auth = firebase.auth();
    const timelineContainer = document.getElementById('timeline-container');
    const timelineCount = document.getElementById('timeline-count');

    auth.onAuthStateChanged(user => {
        if (!user) {
            sessionStorage.removeItem('harzafi_user');
            window.location.replace('login.html');
            return;
        }
        if (user.photoURL) {
            let photo = user.photoURL;
            if (photo.includes('googleusercontent.com')) photo = photo.replace('=s96-c', '=s192-c');
            document.getElementById('avatar-img').src = photo;
            document.getElementById('header-avatar').src = photo;
        }
        loadDashboardData();
    });

    function toNumber(value) {
        return Number.parseFloat(String(value || '0').replace(',', '.')) || 0;
    }
    function formatHours(value) {
        return new Intl.NumberFormat('it-IT', {
            minimumFractionDigits: value % 1 ? 1 : 0,
            maximumFractionDigits: 2
        }).format(value);
    }
    function classify(activity) {
        const category = String(activity.categoria || '').toLowerCase();
        const meta = String(activity.meta || '').toLowerCase();
        const title = String(activity.titolo || '').toLowerCase();
        if (activity.certificato === true || category.includes('certifica') || meta.includes('certificazion') || title.includes('certificazion')) return 'certificazioni';
        if (category.includes('sicurezza') || meta.includes('sicurezza') || title.includes('sicurezza')) return 'sicurezza';
        if (category.includes('extra') || meta.includes('extra') || meta.includes('universit') || title.includes('extra')) return 'extra';
        return 'scolastiche';
    }
    function categoryLabel(key) {
        return { scolastiche: 'Scolastica', extra: 'Extrascolastica', sicurezza: 'Sicurezza', certificazioni: 'Certificazione' }[key];
    }
    function animateHours(finalValue) {
        const element = document.getElementById('hour-counter');
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
            element.textContent = formatHours(finalValue);
            return;
        }
        const start = performance.now();
        function frame(now) {
            const progress = Math.min((now - start) / 950, 1);
            element.textContent = formatHours(finalValue * (1 - Math.pow(1 - progress, 4)));
            if (progress < 1) requestAnimationFrame(frame);
            else element.textContent = formatHours(finalValue);
        }
        requestAnimationFrame(frame);
    }
    function iconMarkup(certificate) {
        return certificate
            ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="5"/><path d="m9 13-1 8 4-2 4 2-1-8"/></svg>'
            : '<svg viewBox="0 0 24 24"><path d="M6 4h12v16H6zM9 8h6M9 12h6M9 16h4"/></svg>';
    }

    function renderActivities(activities) {
        timelineContainer.replaceChildren();
        timelineCount.textContent = activities.length;
        if (!activities.length) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 5;
            cell.className = 'empty-state';
            cell.textContent = 'Nessuna attività registrata al momento.';
            row.appendChild(cell);
            timelineContainer.appendChild(row);
            return;
        }

        activities.forEach((activity, index) => {
            const category = classify(activity);
            const row = document.createElement('tr');
            const detailRow = document.createElement('tr');
            detailRow.className = 'detail-row';
            detailRow.id = 'activity-detail-' + index;

            const nameCell = document.createElement('td');
            const nameWrap = document.createElement('div');
            nameWrap.className = 'activity-name';
            const icon = document.createElement('span');
            icon.className = 'activity-icon' + (category === 'certificazioni' ? ' cert' : '');
            icon.innerHTML = iconMarkup(category === 'certificazioni');
            const nameText = document.createElement('div');
            const title = document.createElement('strong');
            title.textContent = activity.titolo || 'Attività FSL';
            const meta = document.createElement('small');
            meta.textContent = activity.meta || 'Esperienza formativa';
            nameText.append(title, meta);
            nameWrap.append(icon, nameText);
            nameCell.appendChild(nameWrap);

            const categoryCell = document.createElement('td');
            const categoryWrap = document.createElement('span');
            categoryWrap.className = 'category-cell';
            const dot = document.createElement('i');
            const categoryText = document.createElement('span');
            categoryText.textContent = categoryLabel(category);
            categoryWrap.append(dot, categoryText);
            categoryCell.appendChild(categoryWrap);

            const dateCell = document.createElement('td');
            dateCell.textContent = activity.data || '—';
            const hoursCell = document.createElement('td');
            const hours = document.createElement('span');
            hours.className = 'hours-pill';
            hours.textContent = activity.ore || '—';
            hoursCell.appendChild(hours);

            const actionCell = document.createElement('td');
            const action = document.createElement('button');
            action.type = 'button';
            action.className = 'detail-button';
            action.textContent = 'Apri';
            action.setAttribute('aria-expanded', 'false');
            action.setAttribute('aria-controls', detailRow.id);
            actionCell.appendChild(action);
            row.append(nameCell, categoryCell, dateCell, hoursCell, actionCell);

            const detailCell = document.createElement('td');
            detailCell.colSpan = 5;
            const detailContent = document.createElement('div');
            detailContent.className = 'detail-content';
            const inner = document.createElement('div');
            const description = document.createElement('p');
            description.textContent = activity.descrizione || 'Nessun dettaglio aggiuntivo disponibile.';
            inner.appendChild(description);
            detailContent.appendChild(inner);
            detailCell.appendChild(detailContent);
            detailRow.appendChild(detailCell);

            action.addEventListener('click', () => {
                const open = action.getAttribute('aria-expanded') === 'true';
                action.setAttribute('aria-expanded', String(!open));
                action.textContent = open ? 'Apri' : 'Chiudi';
                detailRow.classList.toggle('open', !open);
            });
            timelineContainer.append(row, detailRow);
        });
    }

    function renderTrend(activities) {
        const chart = document.getElementById('trend-bars');
        chart.replaceChildren();
        const recent = activities.slice(0, 8).reverse();
        if (!recent.length) {
            const empty = document.createElement('em');
            empty.textContent = 'Il grafico apparirà con la prima attività.';
            chart.appendChild(empty);
            document.getElementById('axis-max').textContent = '0';
            document.getElementById('axis-mid').textContent = '0';
            return;
        }
        const max = Math.max(1, ...recent.map(activity => toNumber(activity.ore)));
        document.getElementById('axis-max').textContent = formatHours(max);
        document.getElementById('axis-mid').textContent = formatHours(max / 2);
        document.getElementById('chart-range').textContent = recent.length === 1 ? '1 attività' : 'Ultime ' + recent.length;
        recent.forEach((activity, index) => {
            const column = document.createElement('div');
            column.className = 'chart-column';
            const wrap = document.createElement('div');
            wrap.className = 'chart-bar-wrap';
            const bar = document.createElement('div');
            bar.className = 'chart-bar';
            bar.style.height = Math.max(4, toNumber(activity.ore) / max * 100) + '%';
            bar.style.animationDelay = index * 60 + 'ms';
            bar.title = (activity.titolo || 'Attività') + ': ' + formatHours(toNumber(activity.ore)) + ' ore';
            wrap.appendChild(bar);
            const label = document.createElement('span');
            label.className = 'chart-label';
            label.textContent = String(activity.data || index + 1).split(' ')[0];
            column.append(wrap, label);
            chart.appendChild(column);
        });
    }

    function renderDistribution(totals) {
        const keys = ['scolastiche', 'extra', 'sicurezza', 'certificazioni'];
        const colors = ['var(--blue)', 'var(--green)', 'var(--orange)', 'var(--pink)'];
        const ids = ['val-scolastiche', 'val-extra', 'val-sicurezza', 'val-certificazioni'];
        const total = keys.reduce((sum, key) => sum + totals[key], 0);
        keys.forEach((key, index) => document.getElementById(ids[index]).textContent = formatHours(totals[key]) + ' h');
        document.getElementById('donut-total').textContent = formatHours(total);
        if (!total) return;
        let cursor = 0;
        const stops = keys.map((key, index) => {
            const start = cursor;
            cursor += totals[key] / total * 100;
            return colors[index] + ' ' + start.toFixed(2) + '% ' + cursor.toFixed(2) + '%';
        });
        document.getElementById('distribution-donut').style.background = 'conic-gradient(' + stops.join(',') + ')';
    }

    function loadDashboardData() {
        db.collection('attivita_pcto').orderBy('ordine', 'desc').get().then(snapshot => {
            const activities = [];
            const totals = { scolastiche: 0, extra: 0, sicurezza: 0, certificazioni: 0 };
            let certificates = 0;
            snapshot.forEach(documentSnapshot => {
                const activity = documentSnapshot.data();
                activities.push(activity);
                const category = classify(activity);
                totals[category] += toNumber(activity.ore);
                if (activity.certificato === true || category === 'certificazioni') certificates += 1;
            });
            const totalHours = Object.values(totals).reduce((sum, value) => sum + value, 0);
            document.getElementById('activity-count').textContent = activities.length;
            document.getElementById('certificate-count').textContent = certificates;
            animateHours(totalHours);
            renderActivities(activities);
            renderTrend(activities);
            renderDistribution(totals);
        }).catch(error => {
            console.error(error);
            timelineContainer.replaceChildren();
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 5;
            cell.className = 'empty-state error-state';
            cell.textContent = 'Non è stato possibile caricare i dati. Riprova tra poco.';
            row.appendChild(cell);
            timelineContainer.appendChild(row);
            timelineCount.textContent = 'Errore';
        });
    }

    document.getElementById('btn-logout').addEventListener('click', () => {
        auth.signOut().finally(() => {
            sessionStorage.removeItem('harzafi_user');
            window.location.replace('index.html');
        });
    });
})();
