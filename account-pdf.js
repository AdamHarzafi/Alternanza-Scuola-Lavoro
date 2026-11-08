(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.HarzafiAccountPdf = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';
    const ZONE = 'Europe/Rome';
    const NA = 'Non disponibile';
    const scripts = new Map();
    let assetsPromise;
    const clean = value => typeof value === 'string'
        ? value.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').trim() : '';
    const cancelled = () => Object.assign(new Error('The account changed during export.'), { code:'export-cancelled' });
    function check(current) { if (current && !current()) throw cancelled(); }
    function date(value, time = true) {
        const parsed = new Date(value);
        if (!value || !Number.isFinite(parsed.getTime())) return NA;
        return new Intl.DateTimeFormat('it-IT', { timeZone:ZONE, day:'numeric', month:'long', year:'numeric',
            ...(time ? { hour:'2-digit', minute:'2-digit', hourCycle:'h23' } : {}) }).format(parsed);
    }
    function filename(at) {
        const day = new Intl.DateTimeFormat('sv-SE', { timeZone:ZONE, year:'numeric', month:'2-digit', day:'2-digit' }).format(at);
        return 'harzafi-fsl-dati-account-' + day + '.pdf';
    }
    function loadScript(url, globalName) {
        if (root[globalName]) return Promise.resolve(root[globalName]);
        if (scripts.has(url)) return scripts.get(url);
        const promise = new Promise((resolve, reject) => {
            const script = root.document.createElement('script');
            const fail = () => { clearTimeout(timer); script.remove(); scripts.delete(url); reject(new Error('PDF library unavailable.')); };
            const timer = setTimeout(fail, 25000);
            script.src = url; script.async = true;
            script.onerror = fail;
            script.onload = () => { clearTimeout(timer); root[globalName] ? resolve(root[globalName]) : fail(); };
            root.document.head.appendChild(script);
        });
        scripts.set(url, promise);
        return promise;
    }
    async function bytes(url) {
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 25000);
        try {
            const response = await root.fetch(url, { signal:controller.signal, credentials:'same-origin', cache:'force-cache' });
            if (!response.ok) throw new Error('PDF resource unavailable.');
            return new Uint8Array(await response.arrayBuffer());
        } finally { clearTimeout(timer); }
    }
    async function png(source, { circle = false, trim = false, width = 720 } = {}) {
        const image = new Image();
        const url = typeof source === 'string' ? source : URL.createObjectURL(new Blob([source]));
        try {
            await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Image unavailable.')); image.src = url; });
            const canvas = root.document.createElement('canvas');
            const factor = Math.min(1, width / image.naturalWidth);
            canvas.width = Math.max(1, Math.round(image.naturalWidth * factor));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * factor));
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Image conversion unavailable.');
            if (circle) { context.beginPath(); context.arc(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) / 2, 0, Math.PI * 2); context.clip(); }
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            if (trim) {
                const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
                let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
                for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
                    const i = (y * canvas.width + x) * 4;
                    if (data[i + 3] > 24 && Math.min(data[i], data[i + 1], data[i + 2]) < 220) {
                        left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
                    }
                }
                if (right < left) throw new Error('The brand logo is empty.');
                const cropped = root.document.createElement('canvas');
                cropped.width = right - left + 1; cropped.height = bottom - top + 1;
                cropped.getContext('2d').drawImage(canvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
                return cropped.toDataURL('image/png');
            }
            return canvas.toDataURL('image/png');
        } finally { if (typeof source !== 'string') URL.revokeObjectURL(url); }
    }
    async function resources() {
        if (!assetsPromise) assetsPromise = Promise.all([
            loadScript('pdf-lib-1.17.1.min.js', 'PDFLib'),
            loadScript('pdf-fontkit-1.1.1.min.js', 'fontkit'),
            bytes('fonts/sf-pro-pdf-regular.woff'), bytes('fonts/sf-pro-pdf-bold.woff'),
            bytes('IMMAGINI/LOGO%20HARZAFI%20NERO.webp').then(value => png(value, { trim:true }))
        ]).then(([PDFLib, fontkit, regular, bold, logo]) => ({ PDFLib, fontkit, regular, bold, logo }))
            .catch(error => { assetsPromise = null; throw error; });
        return assetsPromise;
    }

    // Text is measured with the embedded font, including long identifiers and names.
    function lines(value, font, size, width) {
        const words = (clean(value) || NA).split(/\s+/u), output = [];
        let line = '';
        for (const word of words) {
            const proposed = line ? line + ' ' + word : word;
            if (font.widthOfTextAtSize(proposed, size) <= width) { line = proposed; continue; }
            if (line) { output.push(line); line = ''; }
            for (const char of Array.from(word)) {
                if (line && font.widthOfTextAtSize(line + char, size) > width) { output.push(line); line = ''; }
                line += char;
            }
        }
        if (line) output.push(line);
        return output;
    }

    async function createDocument(summary, assets, { isCurrent } = {}) {
        if (!summary?.account?.identificativo || !summary.account.email || !summary.profilo?.riferimento) throw new Error('Account unavailable.');
        check(isCurrent);
        const { PDFDocument, rgb } = assets.PDFLib;
        const pdf = await PDFDocument.create();
        pdf.registerFontkit(assets.fontkit);
        const [regular, bold, logo] = await Promise.all([
            pdf.embedFont(assets.regular, { subset:true }), pdf.embedFont(assets.bold, { subset:true }), pdf.embedPng(assets.logo)
        ]);
        const at = new Date(summary.esportatoIl);
        if (!Number.isFinite(at.getTime())) throw new Error('Invalid generation date.');
        pdf.setTitle('Harzafi FSL - Dati dell’account'); pdf.setAuthor('Harzafi FSL');
        pdf.setSubject('Riepilogo personale delle informazioni dell’account');
        pdf.setCreator('Harzafi FSL'); pdf.setProducer('Harzafi FSL');
        pdf.setCreationDate(at); pdf.setModificationDate(at); pdf.setLanguage('it-IT');
        const C = { ink:rgb(.114,.114,.122), muted:rgb(.431,.431,.451), blue:rgb(0,.4,.8), light:rgb(.961,.961,.969), line:rgb(.884,.884,.9), pale:rgb(.91,.89,.97), purple:rgb(.4,.33,.55) };
        const W = 595.28, H = 841.89, M = 44, CW = W - M * 2, bottom = 759;
        let page, y;
        const draw = (value, x, top, { size = 10.5, font = regular, color = C.ink } = {}) => {
            page.drawText(value, { x, y:H - top - size, size, font, color });
        };
        const rule = top => page.drawLine({ start:{ x:M, y:H - top }, end:{ x:W - M, y:H - top }, thickness:.5, color:C.line });
        const box = (x, top, width, height, color, r = 12) => {
            const base = H - top - height;
            page.drawRectangle({ x:x + r, y:base, width:width - r * 2, height, color });
            page.drawRectangle({ x, y:base + r, width, height:height - r * 2, color });
            for (const cx of [x + r, x + width - r]) for (const cy of [base + r, base + height - r]) page.drawCircle({ x:cx, y:cy, size:r, color });
        };
        function newPage() {
            check(isCurrent); page = pdf.addPage([W, H]);
            const logoWidth = 92, logoHeight = logo.height / logo.width * logoWidth;
            page.drawImage(logo, { x:M, y:H - 40 - logoHeight, width:logoWidth, height:logoHeight });
            draw('FSL', M + logoWidth + 8, 46, { size:9, font:bold });
            const label = 'COPIA PERSONALE';
            draw(label, W - M - bold.widthOfTextAtSize(label, 8), 46, { size:8, font:bold, color:C.muted });
            rule(87); y = 111;
        }
        function heading(title, { size = 16, gap = 14 } = {}) {
            const wrapped = lines(title, bold, size, CW);
            if (y + wrapped.length * (size + 4) + gap + 38 > bottom) newPage();
            for (const text of wrapped) { draw(text, M, y, { size, font:bold }); y += size + 4; }
            y += gap;
        }
        function paragraph(value, { size = 10, color = C.muted, width = CW, x = M, leading = 15 } = {}) {
            for (const text of lines(value, regular, size, width)) {
                if (y + leading > bottom) newPage();
                draw(text, x, y, { size, color }); y += leading;
            }
        }
        function rows(items, continuation) {
            const labelWidth = 137, valueX = M + labelWidth + 15, valueWidth = CW - labelWidth - 15;
            for (const [label, value] of items) {
                let values = lines(value, regular, 10.5, valueWidth), first = true;
                while (values.length) {
                    const labelLines = lines(first ? label : label + ' (segue)', regular, 9.5, labelWidth);
                    const available = Math.floor((bottom - y - 21) / 15);
                    if (available < Math.max(1, labelLines.length)) { newPage(); heading(continuation + ' - continua'); continue; }
                    const part = values.splice(0, available), height = Math.max(35, Math.max(part.length, labelLines.length) * 15 + 19);
                    labelLines.forEach((text, i) => draw(text, M, y + 8 + i * 15, { size:9.5, color:C.muted }));
                    part.forEach((text, i) => draw(text, valueX, y + 7 + i * 15));
                    y += height; rule(y); first = false;
                    if (values.length) { newPage(); heading(continuation + ' - continua'); }
                }
            }
        }

        newPage();
        draw('ACCOUNT HARZAFI', M, y, { size:9, font:bold, color:C.blue }); y += 23;
        heading('Dati dell’account', { size:30, gap:5 });
        paragraph('Le tue informazioni, raccolte con chiarezza.', { size:11, leading:17 }); y += 16;
        paragraph('Generato il ' + date(summary.esportatoIl) + ' · Ora italiana', { size:9, leading:14 }); y += 18;

        const person = summary.account, info = summary.profilo.informazioni || [];
        const nameLines = lines(person.nome, bold, 21, CW - 130);
        const heroName = nameLines.length <= 4 ? nameLines : ['Il tuo profilo'];
        const emailLines = lines(person.email, regular, 10, CW - 130);
        const cardHeight = Math.max(111, 50 + heroName.length * 25 + emailLines.length * 15);
        box(M, y, CW, cardHeight, C.light);
        const avatarSize = 66, avatarX = M + 20, avatarTop = y + (cardHeight - avatarSize) / 2;
        if (assets.photo) {
            const photo = await pdf.embedPng(assets.photo);
            page.drawImage(photo, { x:avatarX, y:H - avatarTop - avatarSize, width:avatarSize, height:avatarSize });
        } else {
            page.drawCircle({ x:avatarX + avatarSize / 2, y:H - avatarTop - avatarSize / 2, size:avatarSize / 2, color:C.pale });
            const words = clean(person.nome).split(/\s+/u).filter(Boolean);
            const initials = (Array.from(words[0] || 'H')[0] + (words.length > 1 ? Array.from(words.at(-1))[0] : '')).toLocaleUpperCase('it-IT');
            draw(initials, avatarX + (avatarSize - regular.widthOfTextAtSize(initials, 22)) / 2, avatarTop + 19, { size:22, color:C.purple });
        }
        let cardY = y + 18;
        draw(person.ruolo === 'docente' ? 'DOCENTE AUTORIZZATO' : 'STUDENTE', M + 108, cardY, { size:8, font:bold, color:C.muted }); cardY += 17;
        for (const text of heroName) { draw(text, M + 108, cardY, { size:21, font:bold }); cardY += 25; }
        for (const text of emailLines) { draw(text, M + 108, cardY, { size:10, color:C.muted }); cardY += 15; }
        y += cardHeight + 26;
        heading('Informazioni personali');
        const personalRows = info.map(field => [clean(field.label), clean(field.value)]).filter(([label]) => label);
        if (person.nomeProprio && person.cognome) {
            const index = personalRows.findIndex(([label]) => label === 'Nome');
            if (index >= 0) personalRows.splice(index, 1, ['Nome', person.nomeProprio], ['Cognome', person.cognome]);
        }
        rows(personalRows, 'Informazioni personali');

        newPage();
        draw('ACCOUNT HARZAFI', M, y, { size:9, font:bold, color:C.blue }); y += 24;
        heading('Accesso e sicurezza', { size:26, gap:7 });
        paragraph('I servizi di accesso collegati al tuo account e le informazioni disponibili sulla sessione.'); y += 20;
        rows([
            ['Email dell’account', person.email],
            ['Verifica dell’email', person.emailVerificata ? 'Indirizzo verificato' : 'Indirizzo non ancora verificato'],
            ['Metodi di accesso', (person.metodiDiAccesso || []).join(' · ') || NA],
            ['Creazione dell’account', date(person.creatoIl)],
            ['Ultimo accesso', date(person.ultimoAccesso)]
        ], 'Accesso e sicurezza');
        y += 27; heading('Riferimenti dell’account');
        rows([['Identificativo account', person.identificativo], ['Riferimento del profilo', summary.profilo.riferimento]], 'Riferimenti dell’account');
        y += 25; heading('Informazioni sul documento', { size:14, gap:8 });
        paragraph('Questa copia riporta le informazioni dell’account caricate nelle Impostazioni al momento della generazione. Eventuali aggiornamenti successivi saranno inclusi in un nuovo download.'); y += 9;
        paragraph('Le esperienze, le attestazioni e le ore di FSL sono consultabili nel Registro FSL. Questo documento è un riepilogo dell’account, non un attestato delle attività.'); y += 9;
        paragraph('Per assistenza o correzioni dei dati: harzafi.support@gmail.com', { color:C.blue });
        const pages = pdf.getPages();
        pages.forEach((item, index) => {
            page = item;
            rule(784);
            draw('HARZAFI FSL  /  DATI DELL’ACCOUNT', M, 798, { size:7.5, color:C.muted });
            const label = (index + 1) + ' / ' + pages.length;
            draw(label, W - M - regular.widthOfTextAtSize(label, 8), 797, { size:8, color:C.muted });
        });
        check(isCurrent);
        const output = await pdf.save();
        check(isCurrent);
        return { bytes:output, filename:filename(at), pages:pages.length };
    }
    async function generate(summary, { isCurrent } = {}) {
        check(isCurrent);
        const assets = await resources();
        check(isCurrent);
        let photo;
        const value = summary.profilo.foto;
        if (typeof value === 'string' && value.length <= 180000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) {
            photo = await png(value, { circle:true, width:256 });
        }
        check(isCurrent);
        return createDocument(summary, { ...assets, photo }, { isCurrent });
    }
    return { generate, createDocument, filename };
});
