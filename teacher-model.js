(function (root) {
    'use strict';
    function text(value) { return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
    function hours(value) { const n = parseFloat(text(value).replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; }
    function category(row) {
        if (['formazione', 'certificazioni'].includes(row.categoria)) return row.categoria;
        return row.certificato === true || /certificazion/i.test(text(row.categoria) + ' ' + text(row.meta) + ' ' + text(row.titolo)) ? 'certificazioni' : 'formazione';
    }
    function merge(defaults, overrides, personal) {
        const changes = new Map(overrides.map(row => [row.id, row]));
        const rows = defaults.map(base => {
            const change = changes.get(base.id);
            return { ...base, ...change, id: base.id, source: 'predefined', modified: !!change && typeof change.titolo === 'string' };
        });
        // Keep a removed/edited record visible even if an administrator removes its template later.
        overrides.filter(row => !defaults.some(base => base.id === row.id)).forEach(row => rows.push({ ...row, source: 'predefined', missingTemplate: true }));
        rows.push(...personal.map(row => ({ ...row, source: 'personal', modified: !!row.updatedAt && !row.deleted })));
        return rows.map(row => ({ ...row, titolo: text(row.titolo) || 'Attività predefinita non più disponibile', descrizione: text(row.descrizione), ore: hours(row.ore), category: category(row), deleted: row.deleted === true }));
    }
    function summarize(rows) {
        const active = rows.filter(row => !row.deleted), deleted = rows.filter(row => row.deleted);
        const formazione = active.filter(row => row.category === 'formazione').reduce((n, row) => n + row.ore, 0);
        const certificazioni = active.filter(row => row.category === 'certificazioni').reduce((n, row) => n + row.ore, 0);
        return { active, deleted, formazione, certificazioni, total: Math.round((formazione + certificazioni) * 100) / 100 };
    }
    function csv(records) {
        const cell = value => '"' + String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""') + '"';
        const rows = [['Studente', 'Esperienza', 'Data', 'Ore', 'Categoria', 'Origine', 'Stato']];
        records.forEach(record => record.rows.forEach(row => rows.push([record.nome, row.titolo, text(row.data), String(row.ore).replace('.', ','), row.category === 'formazione' ? 'Formazione scolastica' : 'Esperienza con attestazione', row.source === 'predefined' ? 'Predefinita' : 'Personale', row.deleted ? 'Eliminata - esclusa dal totale' : row.modified ? 'Modificata' : 'Attiva'])));
        return '\ufeff' + rows.map(row => row.map(cell).join(';')).join('\r\n');
    }
    const api = { text, hours, category, merge, summarize, csv };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.TeacherModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
