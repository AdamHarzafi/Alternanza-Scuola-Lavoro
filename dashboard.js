(function () {
    'use strict';

    const rawUser = sessionStorage.getItem('harzafi_user') || 'Utente';
    const formattedName = rawUser.split(' ').filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ') || 'Utente';
    const firstName = formattedName.split(' ')[0];
    document.getElementById('greeting-name').textContent = firstName + '.';
    document.getElementById('profile-name').textContent = formattedName + '.';

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
            document.getElementById('profile-chip-avatar').src = photo;
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

    function animateTotalHours(finalValue) {
        const element = document.getElementById('hour-counter');
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            element.textContent = formatHours(finalValue);
            return;
        }
        const started = performance.now();
        const duration = 1200;
        function step(now) {
            const progress = Math.min((now - started) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 4);
            element.textContent = formatHours(finalValue * eased);
            if (progress < 1) requestAnimationFrame(step);
            else element.textContent = formatHours(finalValue);
        }
        requestAnimationFrame(step);
    }

    function activityIcon(certificate) {
        return certificate
            ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="5"/><path d="m9 13-1 8 4-2 4 2-1-8"/></svg>'
            : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5zM8 9h8M8 13h5"/></svg>';
    }

    function renderTimeline(activities) {
        timelineContainer.replaceChildren();
        timelineCount.textContent = activities.length + (activities.length === 1 ? ' attività' : ' attività');
        if (!activities.length) {
            const empty = document.createElement('p');
            empty.className = 'empty-state';
            empty.textContent = 'Nessuna attività registrata al momento.';
            timelineContainer.appendChild(empty);
            return;
        }

        activities.forEach(activity => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'timeline-item';
            item.setAttribute('aria-expanded', 'false');

            const summary = document.createElement('div');
            summary.className = 'timeline-summary';
            const icon = document.createElement('span');
            icon.className = 'timeline-icon' + (activity.certificato ? ' cert' : '');
            icon.innerHTML = activityIcon(Boolean(activity.certificato));

            const copy = document.createElement('div');
            copy.className = 'timeline-copy';
            const date = document.createElement('span');
            date.className = 'timeline-date';
            date.textContent = activity.data || 'Data non indicata';
            const title = document.createElement('h3');
            title.textContent = activity.titolo || 'Attività FSL';
            const meta = document.createElement('p');
            meta.className = 'timeline-meta';
            meta.textContent = activity.meta || 'Esperienza formativa';
            copy.append(date, title, meta);

            const hours = document.createElement('div');
            hours.className = 'timeline-hours';
            const value = document.createElement('strong');
            value.textContent = activity.ore || '—';
            const unit = document.createElement('span');
            unit.textContent = 'ore';
            const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            chevron.setAttribute('class', 'timeline-chevron');
            chevron.setAttribute('viewBox', '0 0 24 24');
            chevron.setAttribute('aria-hidden', 'true');
            const chevronPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            chevronPath.setAttribute('d', 'm7 10 5 5 5-5');
            chevron.appendChild(chevronPath);
            hours.append(value, unit, chevron);
            summary.append(icon, copy, hours);

            const details = document.createElement('div');
            details.className = 'timeline-details';
            const detailsInner = document.createElement('div');
            detailsInner.className = 'timeline-details-inner';
            const description = document.createElement('p');
            description.textContent = activity.descrizione || 'Nessun dettaglio aggiuntivo disponibile.';
            detailsInner.appendChild(description);
            details.appendChild(detailsInner);
            item.append(summary, details);
            item.addEventListener('click', () => {
                item.setAttribute('aria-expanded', String(item.getAttribute('aria-expanded') !== 'true'));
            });
            timelineContainer.appendChild(item);
        });
    }

    function renderTrend(activities) {
        const chart = document.getElementById('trend-bars');
        chart.replaceChildren();
        const recent = activities.slice(0, 8).reverse();
        if (!recent.length) {
            const empty = document.createElement('span');
            empty.className = 'chart-empty';
            empty.textContent = 'Il grafico apparirà con la prima attività.';
            chart.appendChild(empty);
            document.getElementById('axis-max').textContent = '0';
            document.getElementById('axis-mid').textContent = '0';
            return;
        }

        const values = recent.map(activity => toNumber(activity.ore));
        const max = Math.max(1, ...values);
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
            bar.style.height = Math.max(4, (toNumber(activity.ore) / max) * 100) + '%';
            bar.style.animationDelay = (index * 70) + 'ms';
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
        const colors = ['var(--blue)', 'var(--green)', 'var(--orange)', 'var(--purple)'];
        const valueIds = ['val-scolastiche', 'val-extra', 'val-sicurezza', 'val-certificazioni'];
        const total = keys.reduce((sum, key) => sum + totals[key], 0);
        keys.forEach((key, index) => {
            document.getElementById(valueIds[index]).textContent = formatHours(totals[key]) + ' h';
        });
        document.getElementById('donut-total').textContent = formatHours(total);
        document.getElementById('category-count').textContent = keys.filter(key => totals[key] > 0).length;

        const donut = document.getElementById('distribution-donut');
        if (!total) {
            donut.style.background = '#dedee3';
            return;
        }
        let cursor = 0;
        const stops = keys.map((key, index) => {
            const start = cursor;
            cursor += (totals[key] / total) * 100;
            return colors[index] + ' ' + start.toFixed(2) + '% ' + cursor.toFixed(2) + '%';
        });
        donut.style.background = 'conic-gradient(' + stops.join(',') + ')';
        donut.setAttribute('aria-label',
            'Distribuzione delle ore: scolastiche ' + formatHours(totals.scolastiche) +
            ', extrascolastiche ' + formatHours(totals.extra) +
            ', sicurezza ' + formatHours(totals.sicurezza) +
            ', certificazioni ' + formatHours(totals.certificazioni)
        );
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
            animateTotalHours(totalHours);
            renderDistribution(totals);
            renderTrend(activities);
            renderTimeline(activities);
        }).catch(error => {
            console.error(error);
            timelineContainer.replaceChildren();
            const message = document.createElement('p');
            message.className = 'empty-state error-state';
            message.textContent = 'Non è stato possibile caricare i dati. Riprova tra poco.';
            timelineContainer.appendChild(message);
            timelineCount.textContent = 'Errore';
            const chart = document.getElementById('trend-bars');
            chart.replaceChildren();
            const chartError = document.createElement('span');
            chartError.className = 'chart-empty error-state';
            chartError.textContent = 'Dati non disponibili.';
            chart.appendChild(chartError);
        });
    }

    const infoButton = document.getElementById('info-button');
    const validationMore = document.getElementById('validation-more');
    infoButton.addEventListener('click', () => {
        const open = infoButton.getAttribute('aria-expanded') === 'true';
        infoButton.setAttribute('aria-expanded', String(!open));
        validationMore.classList.toggle('open', !open);
        infoButton.setAttribute('aria-label', open ? 'Mostra informazioni sulla validazione' : 'Nascondi informazioni sulla validazione');
    });

    const scrollToTop = document.getElementById('scrollToTop');
    window.addEventListener('scroll', () => {
        scrollToTop.classList.toggle('visible', window.scrollY > 500);
    }, { passive: true });
    scrollToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    document.getElementById('btn-logout').addEventListener('click', () => {
        auth.signOut().finally(() => {
            sessionStorage.removeItem('harzafi_user');
            window.location.replace('index.html');
        });
    });
})();
