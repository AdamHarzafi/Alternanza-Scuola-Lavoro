(function (root) {
    'use strict';
    const months = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
    function isoDate(year, month, day) {
        const date = new Date(Number(year), Number(month), Number(day), 12);
        return date.getFullYear() === Number(year) && date.getMonth() === Number(month) && date.getDate() === Number(day)
            ? `${year}-${String(Number(month) + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
    }
    function dateKey(value) {
        const text = String(value || '').toLowerCase().replace(/<[^>]*>/g, ' ').trim();
        let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (match) return isoDate(match[1], Number(match[2]) - 1, match[3]);
        const numeric = [...text.matchAll(/(\d{1,2})[/.](\d{1,2})[/.](\d{4})/g)].pop();
        if (numeric) return isoDate(numeric[3], Number(numeric[2]) - 1, numeric[1]);
        const written = [...text.matchAll(/(?:(\d{1,2})\s+)?(gen\w*|feb\w*|mar\w*|apr\w*|mag\w*|giu\w*|lug\w*|ago\w*|set\w*|ott\w*|nov\w*|dic\w*)\s+(\d{4})/g)].pop();
        return written ? isoDate(written[3], months.indexOf(written[2].slice(0, 3)), written[1] || 1) : '';
    }
    function compare(a, b) {
        return dateKey(b.data).localeCompare(dateKey(a.data))
            || (Number(b.ordine) || 0) - (Number(a.ordine) || 0)
            || String(a.titolo || '').localeCompare(String(b.titolo || ''), 'it')
            || String(a.id).localeCompare(String(b.id));
    }
    const api = { dateKey, compare };
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
    root.RegisterUI = api;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    api.open = dialog => {
        dialog.classList.remove('is-closing');
        dialog.showModal();
        document.documentElement.classList.add('register-modal-open');
    };
    api.close = dialog => {
        if (!dialog.open || dialog.classList.contains('is-closing')) return;
        const close = () => {
            dialog.close();
            dialog.classList.remove('is-closing');
            document.documentElement.classList.remove('register-modal-open');
            if (!document.activeElement || document.activeElement === document.body) document.getElementById('add-hours')?.focus({ preventScroll: true });
        };
        if (reduced.matches) close();
        else { dialog.classList.add('is-closing'); setTimeout(close, 180); }
    };
    api.calendar = (field, trigger, panel) => {
        let current;
        const monthSelect = panel.querySelector('[data-month]');
        const yearSelect = panel.querySelector('[data-year]');
        const grid = panel.querySelector('[data-days]');
        const fullDate = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
        const today = new Date();
        const todayISO = isoDate(today.getFullYear(), today.getMonth(), today.getDate());
        for (let i = 0; i < 12; i++) monthSelect.add(new Option(new Intl.DateTimeFormat('it-IT', { month: 'long' }).format(new Date(2026, i, 1)), i));
        for (let year = 1900; year <= today.getFullYear() + 20; year++) yearSelect.add(new Option(year, year));
        function set(value) {
            field.value = dateKey(value);
            trigger.querySelector('span').textContent = field.value ? fullDate.format(new Date(field.value + 'T12:00:00')) : 'Scegli una data';
            trigger.removeAttribute('aria-invalid');
            current = new Date((field.value || todayISO) + 'T12:00:00');
            render();
        }
        function hide() { panel.hidden = true; trigger.setAttribute('aria-expanded', 'false'); }
        function render(focusDay) {
            const year = current.getFullYear(), month = current.getMonth();
            monthSelect.value = month; yearSelect.value = year;
            panel.querySelector('[data-month-title]').textContent = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(current);
            grid.replaceChildren();
            const offset = (new Date(year, month, 1).getDay() + 6) % 7;
            const count = new Date(year, month + 1, 0).getDate();
            const selectedDay = field.value.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`) ? Number(field.value.slice(-2)) : 1;
            for (let i = 0; i < offset; i++) grid.appendChild(document.createElement('span'));
            for (let day = 1; day <= count; day++) {
                const value = isoDate(year, month, day);
                const button = document.createElement('button');
                button.type = 'button'; button.textContent = day; button.dataset.day = day;
                button.setAttribute('aria-label', fullDate.format(new Date(value + 'T12:00:00')));
                button.setAttribute('aria-pressed', String(field.value === value));
                if (value === todayISO) button.setAttribute('aria-current', 'date');
                button.tabIndex = day === (focusDay || selectedDay) ? 0 : -1;
                button.addEventListener('click', () => { set(value); hide(); trigger.focus(); });
                button.addEventListener('keydown', event => {
                    const changes = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
                    let next;
                    if (event.key in changes) next = new Date(year, month, day + changes[event.key], 12);
                    else if (event.key === 'Home') next = new Date(year, month, day - (new Date(year, month, day).getDay() + 6) % 7, 12);
                    else if (event.key === 'End') next = new Date(year, month, day + 6 - (new Date(year, month, day).getDay() + 6) % 7, 12);
                    else if (event.key === 'PageUp' || event.key === 'PageDown') next = new Date(year, month + (event.key === 'PageUp' ? -1 : 1), 1, 12);
                    if (!next || next.getFullYear() < 1900 || next.getFullYear() > today.getFullYear() + 20) return;
                    event.preventDefault(); current = next; render(next.getDate());
                });
                grid.appendChild(button);
            }
            panel.querySelector('[data-prev]').disabled = year === 1900 && month === 0;
            panel.querySelector('[data-next]').disabled = year === today.getFullYear() + 20 && month === 11;
            if (focusDay) grid.querySelector(`[data-day="${focusDay}"]`)?.focus();
        }
        trigger.addEventListener('click', () => {
            if (!panel.hidden) { hide(); return; }
            panel.hidden = false; trigger.setAttribute('aria-expanded', 'true'); render();
            grid.querySelector('[tabindex="0"]')?.focus({ preventScroll: true });
        });
        monthSelect.addEventListener('change', () => { current = new Date(current.getFullYear(), Number(monthSelect.value), 1); render(); });
        yearSelect.addEventListener('change', () => { current = new Date(Number(yearSelect.value), current.getMonth(), 1); render(); });
        panel.querySelector('[data-prev]').addEventListener('click', () => { current = new Date(current.getFullYear(), current.getMonth() - 1, 1); render(); });
        panel.querySelector('[data-next]').addEventListener('click', () => { current = new Date(current.getFullYear(), current.getMonth() + 1, 1); render(); });
        panel.querySelector('[data-today]').addEventListener('click', () => { set(todayISO); hide(); trigger.focus(); });
        panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); hide(); trigger.focus(); } });
        set(todayISO);
        return { set, hide, today: todayISO };
    };
})(typeof window !== 'undefined' ? window : globalThis);
