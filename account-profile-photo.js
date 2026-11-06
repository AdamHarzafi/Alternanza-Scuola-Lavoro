(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.HarzafiProfilePhoto = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';
    const MAX_FILE_BYTES = 20 * 1024 * 1024;
    const MAX_PHOTO_CHARS = 180000;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    function cropRect(width, height, zoom = 1, centerX = .5, centerY = .5) {
        if (![width, height, zoom, centerX, centerY].every(Number.isFinite) || width <= 0 || height <= 0) throw new Error('invalid-image');
        const side = Math.min(width, height) / clamp(zoom, 1, 3);
        const x = clamp(centerX * width - side / 2, 0, width - side);
        const y = clamp(centerY * height - side / 2, 0, height - side);
        return { x, y, side, centerX:(x + side / 2) / width, centerY:(y + side / 2) / height };
    }
    function validPhoto(value) {
        return typeof value === 'string' && value.length <= MAX_PHOTO_CHARS && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
    }
    function renderAvatar(element, value) {
        element.replaceChildren();
        if (!validPhoto(value.photoData)) { element.textContent = value.initials; return; }
        const image = document.createElement('img');
        image.alt = ''; image.width = 512; image.height = 512; image.decoding = 'async';
        image.addEventListener('error', () => { if (element.contains(image)) element.textContent = value.initials; }, { once:true });
        image.src = value.photoData;
        element.append(image);
    }
    async function imageFrom(source) {
        if (typeof root.createImageBitmap === 'function' && typeof source !== 'string') {
            try {
                const bitmap = await root.createImageBitmap(source, { imageOrientation:'from-image', resizeWidth:1600, resizeQuality:'high' });
                if (bitmap.height > 10000 || bitmap.width > 10000) { bitmap.close(); throw new Error('invalid-image'); }
                return bitmap;
            } catch (_) { /* Use the same native image decoder on browsers without bitmap resizing. */ }
        }
        const url = typeof source === 'string' ? source : URL.createObjectURL(source);
        try {
            const image = new Image(); image.decoding = 'async'; image.src = url;
            await image.decode();
            const width = image.naturalWidth, height = image.naturalHeight;
            if (!width || !height || width * height > 65000000) throw new Error('invalid-image');
            const canvas = document.createElement('canvas');
            const scale = Math.min(1, 2000 / Math.max(width, height));
            canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
            canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
            image.src = '';
            return canvas;
        } finally { if (typeof source !== 'string') URL.revokeObjectURL(url); }
    }
    function exportPhoto(image, rect) {
        const canvas = document.createElement('canvas');
        for (const size of [512, 384, 256]) {
            canvas.width = size; canvas.height = size;
            const context = canvas.getContext('2d');
            context.fillStyle = '#fff'; context.fillRect(0, 0, size, size);
            context.drawImage(image, rect.x, rect.y, rect.side, rect.side, 0, 0, size, size);
            for (const quality of [.86, .74, .62]) {
                const data = canvas.toDataURL('image/jpeg', quality);
                if (validPhoto(data)) return data;
            }
        }
        throw new Error('image-too-large');
    }
    function attach({ getAccount, savePhoto }) {
        const byId = id => document.getElementById(id);
        const dialog = byId('settings-photo-dialog'), canvas = byId('settings-photo-canvas');
        const input = byId('settings-photo-input'), zoom = byId('settings-photo-zoom');
        const choose = byId('settings-photo-choose'), remove = byId('settings-photo-remove');
        const save = byId('settings-photo-save'), cancel = byId('settings-photo-cancel');
        const status = byId('settings-photo-editor-status');
        let owner = null, image = null, centerX = .5, centerY = .5;
        let operation = 0, saving = false, decoding = false, changed = false, removePhoto = false, pointer = null;
        const sameOwner = () => {
            const current = getAccount();
            return owner && current && owner.uid === current.uid && owner.version === current.version;
        };
        function say(copy, error = false) { status.textContent = copy; status.dataset.error = String(error); }
        function controls() {
            save.disabled = saving || decoding || !changed;
            save.textContent = saving ? 'Salvo…' : 'Salva';
            cancel.textContent = saving ? 'Chiudi' : 'Annulla';
            choose.disabled = saving || decoding; remove.disabled = saving || decoding;
            zoom.disabled = saving || decoding || !image;
        }
        function release() { image?.close?.(); image = null; }
        function rect() { return cropRect(image.width, image.height, Number(zoom.value), centerX, centerY); }
        function draw() {
            const context = canvas.getContext('2d');
            context.fillStyle = '#e8e3f7'; context.fillRect(0, 0, canvas.width, canvas.height);
            if (image) {
                const area = rect(); centerX = area.centerX; centerY = area.centerY;
                context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
                context.drawImage(image, area.x, area.y, area.side, area.side, 0, 0, canvas.width, canvas.height);
            } else {
                context.fillStyle = '#66558c'; context.font = '500 170px -apple-system, "SF Pro Text", sans-serif';
                context.textAlign = 'center'; context.textBaseline = 'middle';
                context.fillText(owner?.initials || '', canvas.width / 2, canvas.height / 2 + 6);
            }
        }
        function reset() {
            ++operation; owner = null; saving = false; decoding = false; changed = false; removePhoto = false; pointer = null;
            release(); input.value = ''; zoom.value = '1';
            if (dialog.open) dialog.close();
            say(''); controls(); draw();
        }
        async function decode(source, isNew) {
            const id = ++operation;
            decoding = true;
            say('Preparo la foto…');
            controls();
            try {
                const next = await imageFrom(source);
                if (id !== operation || !sameOwner() || !dialog.open) { next.close?.(); return; }
                release(); image = next; centerX = centerY = .5; zoom.value = '1';
                decoding = false; removePhoto = false; changed = isNew; remove.hidden = false;
                say('Trascina la foto per inquadrarla. Usa lo zoom per avvicinarti.');
                draw(); controls();
            } catch (_) {
                if (id !== operation || !sameOwner() || !dialog.open) return;
                decoding = false;
                say('Questa foto non può essere aperta. Scegli un’immagine JPEG, PNG o WebP.', true);
                controls();
            }
        }
        byId('settings-photo-edit').addEventListener('click', () => {
            const value = getAccount(); if (!value) return;
            reset(); owner = { ...value }; remove.hidden = !validPhoto(value.photoData);
            dialog.showModal(); draw();
            if (validPhoto(value.photoData)) decode(value.photoData, false);
            else say('Scegli una foto da usare per il tuo account.');
        });
        choose.addEventListener('click', () => { if (!saving && sameOwner()) input.click(); });
        input.addEventListener('change', () => {
            const file = input.files?.[0]; input.value = '';
            if (!file || !sameOwner() || saving) return;
            if (file.size > MAX_FILE_BYTES) { say('Scegli una foto di dimensioni inferiori a 20 MB.', true); return; }
            if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) && !(file.type === '' && /\.(jpe?g|png|webp)$/i.test(file.name))) {
                say('Scegli una foto JPEG, PNG o WebP.', true); return;
            }
            decode(file, true);
        });
        zoom.addEventListener('input', () => { if (image && !saving && !decoding) { changed = true; draw(); controls(); } });
        function pan(dx, dy) {
            if (!image || saving || decoding) return;
            const area = rect(), bounds = canvas.getBoundingClientRect();
            centerX -= dx / bounds.width * area.side / image.width;
            centerY -= dy / bounds.height * area.side / image.height;
            changed = true; draw(); controls();
        }
        canvas.addEventListener('pointerdown', event => {
            if (!image || saving || decoding || event.button !== 0) return;
            pointer = { id:event.pointerId, x:event.clientX, y:event.clientY };
            canvas.setPointerCapture(event.pointerId);
        });
        canvas.addEventListener('pointermove', event => {
            if (!pointer || pointer.id !== event.pointerId) return;
            pan(event.clientX - pointer.x, event.clientY - pointer.y);
            pointer.x = event.clientX; pointer.y = event.clientY;
        });
        for (const type of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(type, () => { pointer = null; });
        canvas.addEventListener('keydown', event => {
            if (!image || saving || decoding) return;
            const step = event.shiftKey ? 32 : 8;
            const moves = { ArrowLeft:[-step,0], ArrowRight:[step,0], ArrowUp:[0,-step], ArrowDown:[0,step] };
            if (moves[event.key]) { event.preventDefault(); pan(...moves[event.key]); }
        });
        remove.addEventListener('click', () => {
            if (saving || decoding || !sameOwner()) return;
            ++operation; release(); removePhoto = true; changed = true; remove.hidden = true;
            say('Premi Salva per rimuovere la foto e tornare alle tue iniziali.'); draw(); controls();
        });
        save.addEventListener('click', async () => {
            if (!changed || saving || decoding || !sameOwner()) return;
            const id = operation;
            saving = true; controls(); say('Salvataggio in corso…');
            try {
                const data = removePhoto ? '' : exportPhoto(image, rect());
                await savePhoto(data);
                if (id !== operation || !sameOwner()) return;
                reset();
            } catch (_) {
                if (id !== operation || !sameOwner()) return;
                saving = false; controls(); say('Non è stato possibile salvare la foto. Riprova tra qualche istante.', true);
            }
        });
        cancel.addEventListener('click', reset);
        dialog.addEventListener('cancel', event => { event.preventDefault(); reset(); });
        return { reset };
    }
    return { attach, renderAvatar, cropRect, validPhoto, MAX_FILE_BYTES, MAX_PHOTO_CHARS };
});
