(function () {
    'use strict';
    const $ = id => document.getElementById(id), model = window.HarzafiMessages;
    const auth = window.HarzafiSession?.auth, db = window.firebase?.firestore?.();
    const app = $('messages-app'), input = $('message-input'), scroll = $('message-scroll');
    const time = new Intl.DateTimeFormat('it-IT', { hour:'2-digit', minute:'2-digit' });
    const day = new Intl.DateTimeFormat('it-IT', { day:'numeric', month:'long' });
    const roleName = role => role === 'docente' ? 'Docente' : 'Studente';
    const node = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; };
    const defaultPhoto = 'IMMAGINI/PROFILO-UTENTE-LOGO.webp';
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let version = 0, store, user, identity, contacts = new Map(), conversations = [], globalStops = [], chatStops = [];
    let activeId = '', chatVersion = 0, recipientUid = '', messages = new Map(), rowNodes = new Map(), states = new Map();
    let quotes = new Map(), requestedQuotes = new Set(), oldest, hasMore = false, replyTo = '', actionId = '', olderBusy = false;
    let typingTimer, typingRefresh, typingExpiry, lastTyping = 0, readTimer, stateError = false, sending = false, enrollmentBusy = false;
    let pending = new Map(), drafts = new Map(), outbox = new Map(), longPressTimer, suppressClick = false;
    const dialogs = [...document.querySelectorAll('dialog')];
    const unavailable = 'Messaggi non è disponibile in questo momento. Riprova tra poco.';

    async function thumbnail(source) {
        if (!window.HarzafiAccountPreferences?.validatePhoto(source)) return '';
        try {
            const image = new Image(); image.src = source; await image.decode();
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
            const context = canvas.getContext('2d'); context.fillStyle = '#ffffff'; context.fillRect(0, 0, 128, 128);
            context.drawImage(image, 0, 0, 128, 128);
            const result = canvas.toDataURL('image/jpeg', .76); return result.length <= 24000 ? result : '';
        } catch (_) { return ''; }
    }

    function avatar(target, person) {
        const image = document.createElement('img'); image.alt = ''; image.decoding = 'async';
        const photo = window.HarzafiAccountPreferences?.validatePhoto(person?.photoData) ? person.photoData : '';
        image.src = photo || defaultPhoto;
        image.addEventListener('error', () => { if (image.getAttribute('src') !== defaultPhoto) image.src = defaultPhoto; }, { once:true });
        target.replaceChildren(image);
    }
    function person(uid) { return contacts.get(uid) || { name:'Utente non disponibile', role:'', enabled:false }; }
    function nameOf(uid) { return uid === user?.uid ? 'Tu' : person(uid).name; }
    function nearBottom() { return scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 90; }
    function bottom(animate = false) { scroll.scrollTo({ top:scroll.scrollHeight, behavior:animate && !reduced.matches ? 'smooth' : 'instant' }); $('new-messages-indicator').hidden = true; }
    function status(text = '', error = false) { $('composer-status').textContent = text; $('composer-status').classList.toggle('error', error); }
    function openDialog(dialog) { if (!dialog.open) dialog.showModal(); }
    async function dismiss(dialog) {
        if (!dialog.open) return;
        if (!reduced.matches) await dialog.animate([{opacity:1,transform:'translateY(0) scale(1)'},{opacity:0,transform:'translateY(8px) scale(.985)'}], {duration:160,easing:'ease-in'}).finished.catch(() => {});
        if (dialog.open) dialog.close();
    }
    function closeDialogs() { for (const dialog of dialogs) if (dialog.open) dialog.close(); }
    for (const button of document.querySelectorAll('[data-close-dialog]')) button.addEventListener('click', () => dismiss(button.closest('dialog')));
    for (const dialog of dialogs) {
        dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(dialog); });
        dialog.addEventListener('click', event => { if (event.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dismiss(dialog); });
        dialog.addEventListener('keydown', event => {
            if (event.key !== 'Tab') return;
            const items = [...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),a[href],[tabindex="0"]')].filter(e => e.getClientRects().length);
            if (!items.length) return;
            if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
            else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
        });
    }

    function gate(title, copy, { loading = false, enable = false, retry = false } = {}) {
        $('messages-gate').hidden = false; app.hidden = true;
        $('gate-title').textContent = title; $('gate-copy').textContent = copy;
        $('gate-spinner').hidden = !loading; $('messages-enable').hidden = !enable; $('messages-retry').hidden = !retry;
    }
    function clearChat(writeTyping = true) {
        if (activeId) drafts.set(activeId, { text:input.value, replyTo });
        if (writeTyping) stopTyping();
        ++chatVersion; chatStops.splice(0).forEach(stop => stop());
        clearTimeout(readTimer); clearTimeout(typingExpiry); clearTimeout(longPressTimer);
        activeId = recipientUid = replyTo = actionId = ''; states.clear(); messages.clear(); rowNodes.clear(); quotes.clear(); requestedQuotes.clear();
        $('message-list').replaceChildren(); $('typing-indicator').hidden = true; $('reply-preview').hidden = true;
        $('active-conversation').hidden = true; $('conversation-placeholder').hidden = false; app.classList.remove('conversation-open');
        $('connection-status').hidden = true; $('new-messages-indicator').hidden = true; input.value = ''; resizeInput(); closeDialogs();
        pending = new Map(); sending = false; olderBusy = false; oldest = null; stateError = false;
    }
    function clear() {
        clearChat(); globalStops.splice(0).forEach(stop => stop()); contacts.clear(); conversations = []; store = user = identity = null;
        $('conversation-list').replaceChildren(); $('contact-list').replaceChildren(); $('conversation-search').value = ''; $('contact-search').value = '';
        $('messages-enable').disabled = false; enrollmentBusy = false;
        drafts.clear(); outbox.clear();
    }
    function connected() {
        const offline = !navigator.onLine;
        $('connection-status').hidden = !offline;
        $('connection-status').textContent = offline ? 'Sei offline. I nuovi messaggi saranno disponibili quando torni online.' : '';
        $('send-message').disabled = !activeId || !input.value.trim() || offline || sending || person(recipientUid).enabled === false;
    }
    function resizeInput() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight || 34, 150) + 'px'; connected(); }
    function chatError(error) {
        if (!activeId) return;
        $('history-status').textContent = error?.code === 'permission-denied' ? 'Questa conversazione non è disponibile per il tuo account.' : 'Non riesco ad aggiornare la conversazione. Torna all’elenco e riprova.';
        $('send-message').disabled = true; stopTyping();
    }
    function listDate(value) {
        const date = new Date(model.millis(value));
        if (!date.getTime()) return '';
        return date.toDateString() === new Date().toDateString() ? time.format(date) : new Intl.DateTimeFormat('it-IT', { day:'2-digit', month:'2-digit' }).format(date);
    }
    function renderConversations() {
        const search = $('conversation-search').value.trim().toLocaleLowerCase('it');
        const list = conversations.filter(c => person(c.members.find(uid => uid !== user.uid)).name.toLocaleLowerCase('it').includes(search))
            .sort((a, b) => model.millis(b.updatedAt) - model.millis(a.updatedAt));
        const focused = document.activeElement?.dataset?.conversation;
        const fragment = document.createDocumentFragment();
        for (const c of list) {
            const other = c.members.find(uid => uid !== user.uid), p = person(other);
            const button = node('button', 'conversation-item'); button.type = 'button'; button.dataset.conversation = c.id;
            button.setAttribute('aria-current', String(c.id === activeId)); button.setAttribute('aria-label', 'Apri la conversazione con ' + p.name);
            const image = node('span', 'person-avatar'); avatar(image, p);
            const copy = node('span', 'conversation-item-copy'), heading = node('span', 'conversation-item-heading');
            heading.append(node('strong', '', p.name), node('time', '', listDate(c.updatedAt)));
            copy.append(heading, node('span', 'conversation-preview', (c.lastSender === user.uid ? 'Tu: ' : '') + (c.lastText || 'Inizia la conversazione.')));
            button.append(image, copy); button.addEventListener('click', () => selectConversation(c.id, other)); fragment.append(button);
        }
        $('conversation-list').replaceChildren(fragment);
        if (focused) [...$('conversation-list').children].find(b => b.dataset.conversation === focused)?.focus({ preventScroll:true });
        $('conversation-status').textContent = list.length ? `${list.length} ${list.length === 1 ? 'conversazione' : 'conversazioni'}` : search ? 'Nessuna conversazione trovata.' : 'Le tue conversazioni iniziano qui.';
    }
    function renderContacts() {
        const query = $('contact-search').value.trim().toLocaleLowerCase('it');
        const list = [...contacts.entries()].filter(([uid, p]) => uid !== user.uid && p.enabled && p.name.toLocaleLowerCase('it').includes(query))
            .sort((a, b) => a[1].name.localeCompare(b[1].name, 'it'));
        const fragment = document.createDocumentFragment();
        for (const [uid, p] of list) {
            const button = node('button', 'contact-row'); button.type = 'button'; button.setAttribute('aria-label', 'Scrivi a ' + p.name);
            const image = node('span', 'person-avatar'); avatar(image, p);
            const copy = node('span'); copy.append(node('strong', '', p.name), node('small', '', roleName(p.role)));
            button.append(image, copy); button.addEventListener('click', async () => {
                if (!navigator.onLine) { $('contact-status').textContent = 'Torna online per iniziare una conversazione.'; return; }
                const current = version; button.disabled = true; $('contact-status').textContent = 'Apro la conversazione…';
                try { const id = await store.open(uid); if (current !== version) return; await dismiss($('new-message-dialog')); if (current === version) selectConversation(id, uid); }
                catch (_) { if (current === version) $('contact-status').textContent = 'Non è stato possibile aprire la conversazione. Riprova.'; }
                finally { if (current === version) button.disabled = false; }
            }); fragment.append(button);
        }
        $('contact-list').replaceChildren(fragment); $('contact-status').textContent = list.length ? '' : query ? 'Nessuna persona trovata.' : 'Le altre persone appariranno qui dopo aver attivato Messaggi.';
    }
    function newConversation() { $('contact-search').value = ''; renderContacts(); openDialog($('new-message-dialog')); $('contact-search').focus(); }
    function updateHeader() {
        const p = person(recipientUid); avatar($('conversation-avatar'), p); $('conversation-name').textContent = p.name;
        $('conversation-role').textContent = p.role ? roleName(p.role) : ''; $('conversation-info').setAttribute('aria-label', 'Informazioni sulla conversazione con ' + p.name); connected();
    }
    function start() {
        const current = version;
        $('messages-gate').hidden = true; app.hidden = false;
        $('conversation-status').textContent = 'Caricamento delle conversazioni…';
        globalStops.push(store.contacts(snapshot => {
            if (current !== version) return;
            contacts = new Map(snapshot.docs.map(d => [d.id, { ...d.data(), name:String(d.data().name || 'Utente').slice(0, 160) }]));
            if (!contacts.get(user.uid)?.enabled) { load(auth.currentUser); return; }
            renderConversations(); renderContacts(); if (activeId) updateHeader();
        }, () => { if (current === version) { ++version; clear(); gate('Messaggi', unavailable, { retry:true }); } }));
        globalStops.push(store.conversations(snapshot => {
            if (current !== version) return;
            conversations = snapshot.docs.map(d => ({ ...d.data(), id:d.id })).filter(c => Array.isArray(c.members) && c.members.includes(user.uid));
            renderConversations();
        }, () => { if (current === version) { ++version; clear(); gate('Messaggi', unavailable, { retry:true }); } }));
    }
    async function load(account) {
        const current = ++version; clear();
        gate('Messaggi', 'Preparo le tue conversazioni…', { loading:true });
        if (!account) { window.location.replace('login.html'); return; }
        if (account.isAnonymous) { gate('Accedi al tuo account', 'Per usare Messaggi è necessario un account studente o docente autorizzato.'); return; }
        user = account;
        try {
            const cachedRole = sessionStorage.getItem('harzafi_user_uid') === account.uid ? sessionStorage.getItem('harzafi_user_role') : '';
            const profile = await window.HarzafiAccountSettings.loadProfile(db, account, cachedRole);
            if (profile.role === 'studente') {
                const registry = await db.collection('registri').doc(account.uid).get({ source:'server' });
                if (!registry.exists || registry.data().studentId !== profile.id || registry.data().email !== account.email.trim().toLowerCase()) throw new Error('profile-unavailable');
            }
            let preferences = {}, preferencesReady = false;
            try { const own = await db.collection('account_preferences').doc(account.uid).get({ source:'server' }); preferences = window.HarzafiAccountPreferences.normalize(own.exists ? own.data() : {}); preferencesReady = true; } catch (_) { /* Keep the existing messaging identity when preferences cannot be refreshed. */ }
            if (current !== version) return;
            const photoData = await thumbnail(preferences.photoData);
            if (current !== version) return;
            identity = { ...window.HarzafiAccountSettings.identity(profile.data, account, preferences), role:profile.role, photoData };
            store = model.create(db, account, () => window.firebase.firestore.FieldValue.serverTimestamp());
            const own = await store.profile(); if (current !== version) return;
            if (!own.exists || own.data().enabled !== true) {
                gate('Le persone. Più vicine.', 'Scrivi agli studenti e ai docenti di Harzafi FSL. Attivando Messaggi, rendi visibili alle altre persone il tuo nome, il ruolo e la foto del profilo. Il tuo indirizzo email rimane riservato.', { enable:true });
            } else {
                const previous = own.data();
                if (!preferencesReady) { identity.name = previous.name; identity.photoData = previous.photoData; }
                if (previous.name !== identity.name || previous.role !== identity.role || previous.photoData !== identity.photoData) await store.enroll(identity);
                if (current === version) start();
            }
        } catch (_) { if (current === version) gate('Messaggi', unavailable, { retry:true }); }
    }
    $('messages-enable').addEventListener('click', async () => {
        if (enrollmentBusy) return;
        if (!store || !identity) { load(auth.currentUser); return; }
        const current = version; enrollmentBusy = true; $('messages-enable').disabled = true;
        try { await store.enroll(identity); if (current === version) start(); }
        catch (_) { if (current === version) gate('Messaggi', 'Non è stato possibile attivare Messaggi. Controlla la connessione e riprova.', { enable:true }); }
        finally { if (current === version) { enrollmentBusy = false; $('messages-enable').disabled = false; } }
    });
    $('messages-retry').addEventListener('click', () => load(auth.currentUser));
    $('new-conversation').addEventListener('click', newConversation); $('placeholder-new').addEventListener('click', newConversation);
    $('conversation-search').addEventListener('input', renderConversations); $('contact-search').addEventListener('input', renderContacts);
    $('conversation-back').addEventListener('click', () => { clearChat(); renderConversations(); $('new-conversation').focus(); });
    $('conversation-info').addEventListener('click', () => openDialog($('conversation-details')));
    $('messages-options').addEventListener('click', () => { $('settings-message-status').textContent = ''; openDialog($('messages-settings')); });
    $('disable-messages').addEventListener('click', async () => {
        const current = version; $('disable-messages').disabled = true;
        try { stopTyping(); await store.disable(); if (current === version) { clearChat(false); load(auth.currentUser); } }
        catch (_) { if (current === version) $('settings-message-status').textContent = 'Non è stato possibile disattivare Messaggi. Riprova.'; }
        finally { $('disable-messages').disabled = false; }
    });

    function selectConversation(id, otherUid) {
        if (id === activeId) { app.classList.add('conversation-open'); return; }
        clearChat(); activeId = id; recipientUid = otherUid; const current = chatVersion;
        pending = outbox.get(id) || new Map(); outbox.set(id, pending);
        pending.forEach((value, key) => messages.set(key, value));
        const draft = drafts.get(id); input.value = draft?.text || ''; replyTo = draft?.replyTo || ''; resizeInput();
        if (replyTo) { const original = quotes.get(replyTo); $('reply-name').textContent = 'Risposta al messaggio'; $('reply-text').textContent = original?.text || 'Il messaggio originale verrà richiamato nella risposta.'; $('reply-preview').hidden = false; }
        $('active-conversation').hidden = false; $('conversation-placeholder').hidden = true; app.classList.add('conversation-open');
        updateHeader(); renderConversations(); status(); $('history-status').textContent = 'Caricamento dei messaggi…'; $('load-older').hidden = true;
        let initial = true;
        chatStops.push(store.listen(id, snapshot => {
            if (current !== chatVersion || id !== activeId) return;
            const stick = initial || nearBottom();
            let incoming = false;
            snapshot.docs.forEach(doc => {
                const value = { ...doc.data(), id:doc.id, pending:doc.metadata?.hasPendingWrites === true };
                if (!messages.has(doc.id) && value.senderUid !== user.uid && !initial) incoming = true;
                messages.set(doc.id, value); quotes.set(doc.id, value);
                if (!value.pending) pending.delete(doc.id);
            });
            if (!oldest || initial) { oldest = snapshot.docs.at(-1); hasMore = snapshot.docs.length === 50; }
            $('load-older').hidden = !hasMore;
            $('history-status').textContent = snapshot.metadata?.fromCache ? 'Connessione in corso. Mostro i messaggi già disponibili.' : !messages.size ? 'È l’inizio della vostra conversazione.' : 'Messaggi · Harzafi FSL';
            renderMessages();
            if (stick) bottom(); else if (incoming) $('new-messages-indicator').hidden = false;
            if (!snapshot.metadata?.fromCache && stick) scheduleRead();
            initial = false;
        }, error => { if (current === chatVersion) chatError(error); }));
        chatStops.push(store.states(id, snapshot => {
            if (current !== chatVersion) return;
            states = new Map(snapshot.docs.map(d => [d.id, d.data()])); updateTyping(); renderMessages();
        }, () => { if (current === chatVersion && !stateError) { stateError = true; status('L’indicatore di scrittura e le conferme di lettura non sono disponibili.'); } }));
        if (window.matchMedia('(min-width:701px)').matches) input.focus({ preventScroll:true });
    }
    function quoteFor(message) {
        if (!message.replyTo) return null;
        const known = quotes.get(message.replyTo); if (known) return known;
        if (!requestedQuotes.has(message.replyTo)) {
            requestedQuotes.add(message.replyTo); const current = chatVersion;
            store.getMessage(activeId, message.replyTo).then(snapshot => {
                if (current !== chatVersion) return;
                quotes.set(message.replyTo, snapshot.exists ? { ...snapshot.data(), id:snapshot.id } : { text:'Messaggio non disponibile', senderUid:'' });
                renderMessages();
            }).catch(() => { if (current === chatVersion) { quotes.set(message.replyTo, { text:'Messaggio non disponibile', senderUid:'' }); renderMessages(); } });
        }
        return { text:'Caricamento del messaggio…', senderUid:'' };
    }
    function openActions(id) {
        const message = messages.get(id); if (!message || message.pending || message.failed) return;
        actionId = id; $('action-message-text').textContent = message.text; $('action-status').textContent = '';
        const picker = $('reaction-picker'); picker.replaceChildren();
        const labels = ['Cuore', 'Mi piace', 'Non mi piace', 'Risata', 'Punto esclamativo', 'Domanda'];
        model.REACTIONS.forEach((emoji, i) => {
            const button = node('button', '', emoji); button.type = 'button'; button.setAttribute('aria-label', labels[i]);
            button.setAttribute('aria-pressed', String(message.reactions?.[user.uid] === emoji));
            button.addEventListener('click', async () => {
                const current = chatVersion, id = activeId; picker.querySelectorAll('button').forEach(b => b.disabled = true);
                try { await store.react(id, message.id, emoji); if (current === chatVersion) await dismiss($('message-actions')); }
                catch (_) { if (current === chatVersion) $('action-status').textContent = 'La reazione non è stata salvata. Riprova.'; }
                finally { picker.querySelectorAll('button').forEach(b => b.disabled = false); }
            }); picker.append(button);
        }); openDialog($('message-actions'));
    }
    async function startReply(id) {
        const message = messages.get(id); if (!message) return;
        replyTo = id; $('reply-name').textContent = 'Risposta a ' + nameOf(message.senderUid); $('reply-text').textContent = message.text;
        const current = chatVersion; $('reply-preview').hidden = false; await dismiss($('message-actions')); if (current === chatVersion) { input.focus(); resizeInput(); bottom(); }
    }
    function renderMessages() {
        if (!activeId) return;
        const values = [...messages.values()].sort((a, b) => (model.millis(a.createdAt) || a.localTime || Date.now()) - (model.millis(b.createdAt) || b.localTime || Date.now()) || a.id.localeCompare(b.id));
        let previous;
        for (let index = 0; index < values.length; index++) {
            const message = values[index], own = message.senderUid === user.uid, date = model.millis(message.createdAt) || message.localTime || Date.now();
            const showDate = !previous || new Date(date).toDateString() !== new Date(model.millis(previous.createdAt) || previous.localTime).toDateString();
            const grouped = !showDate && previous?.senderUid === message.senderUid && date - (model.millis(previous.createdAt) || previous.localTime) < 120000;
            const quoted = quoteFor(message), lastOwn = own && !values.slice(index + 1).some(m => m.senderUid === user.uid);
            const peerRead = model.millis(states.get(recipientUid)?.readAt) >= date;
            const signature = JSON.stringify([message, quoted, showDate, grouped, lastOwn, peerRead]);
            let row = rowNodes.get(message.id);
            if (!row) { row = node('li', 'message-row'); row.dataset.messageId = message.id; rowNodes.set(message.id, row); }
            if (row.dataset.signature !== signature) {
                row.dataset.signature = signature; row.replaceChildren(); row.className = 'message-row' + (own ? ' own' : '') + (grouped ? ' grouped' : '');
                if (showDate) row.append(node('div', 'message-date', day.format(date) + ' · ' + time.format(date)));
                const cluster = node('div', 'message-cluster'), bubble = node('div', 'message-bubble');
                if (quoted) {
                    const quote = node('button', 'reply-quote'); quote.type = 'button'; quote.setAttribute('aria-label', 'Vai al messaggio a cui si risponde');
                    quote.append(node('strong', '', nameOf(quoted.senderUid)), node('span', '', quoted.text));
                    quote.addEventListener('click', () => jumpTo(message.replyTo)); bubble.append(quote);
                }
                bubble.append(node('span', 'message-text', message.text));
                const actions = node('button', 'bubble-actions', '•••'); actions.type = 'button'; actions.setAttribute('aria-label', 'Azioni del messaggio: ' + message.text.slice(0, 60)); actions.disabled = !!message.pending || !!message.failed;
                actions.addEventListener('click', () => openActions(message.id));
                bubble.addEventListener('contextmenu', event => { event.preventDefault(); openActions(message.id); });
                bubble.addEventListener('dblclick', () => openActions(message.id));
                let pressPoint;
                bubble.addEventListener('pointerdown', event => { if (event.pointerType !== 'touch') return; pressPoint = [event.clientX, event.clientY]; suppressClick = false; longPressTimer = setTimeout(() => { suppressClick = true; openActions(message.id); }, 480); });
                bubble.addEventListener('pointermove', event => { if (pressPoint && Math.hypot(event.clientX - pressPoint[0], event.clientY - pressPoint[1]) > 10) clearTimeout(longPressTimer); });
                for (const name of ['pointerup', 'pointercancel']) bubble.addEventListener(name, () => { clearTimeout(longPressTimer); pressPoint = null; });
                bubble.addEventListener('click', event => { if (suppressClick) { event.preventDefault(); suppressClick = false; } });
                cluster.append(bubble, actions); row.append(cluster);
                const reactions = Object.entries(message.reactions || {}).filter(([, emoji]) => model.REACTIONS.includes(emoji));
                if (reactions.length) {
                    const group = node('div', 'message-reactions');
                    const types = [...new Set(reactions.map(([, emoji]) => emoji))];
                    for (const emoji of types) {
                        const reactors = reactions.filter(([, value]) => value === emoji), chip = node('button', 'reaction-chip', emoji + (reactors.length > 1 ? ' ' + reactors.length : ''));
                        chip.type = 'button'; chip.setAttribute('aria-pressed', String(message.reactions[user.uid] === emoji)); chip.setAttribute('aria-label', reactors.map(([uid]) => nameOf(uid)).join(' e ') + ': ' + emoji + '. Gestisci reazione');
                        chip.addEventListener('click', () => openActions(message.id)); group.append(chip);
                    } row.append(group);
                }
                if (own && (lastOwn || message.failed || message.pending)) {
                    const meta = node('div', 'message-meta', message.failed ? 'Invio non riuscito' : message.pending ? 'Invio…' : peerRead ? 'Letto' : 'Inviato');
                    if (message.failed) { const retry = node('button', '', 'Riprova'); retry.type = 'button'; retry.addEventListener('click', () => retrySend(message.id)); meta.append(retry); } row.append(meta);
                }
            }
            // Reuse nodes so focus and a user's place in the conversation survive updates.
            const existing = $('message-list').children[index]; if (existing !== row) $('message-list').insertBefore(row, existing || null);
            previous = message;
        }
    }
    async function jumpTo(id) {
        const current = chatVersion; let attempts = 0;
        while (!rowNodes.has(id) && hasMore && attempts++ < 8 && current === chatVersion) await loadOlder();
        if (current !== chatVersion) return;
        const row = rowNodes.get(id);
        if (!row) { status('Carica i messaggi precedenti per ritrovare la risposta originale.'); return; }
        row.scrollIntoView({ block:'center', behavior:reduced.matches ? 'instant' : 'smooth' }); row.classList.add('highlight'); setTimeout(() => row.classList.remove('highlight'), 1400);
    }
    async function loadOlder() {
        if (!activeId || !hasMore || olderBusy || !oldest) return;
        const current = chatVersion, previousHeight = scroll.scrollHeight, previousTop = scroll.scrollTop, cursor = oldest;
        olderBusy = true; $('load-older').disabled = true;
        try {
            const snapshot = await store.older(activeId, oldest); if (current !== chatVersion) return;
            snapshot.docs.forEach(d => { const value = { ...d.data(), id:d.id }; messages.set(d.id, value); quotes.set(d.id, value); });
            oldest = snapshot.docs.at(-1) || oldest; hasMore = snapshot.docs.length === 50; renderMessages();
            scroll.scrollTop = previousTop + scroll.scrollHeight - previousHeight; $('load-older').hidden = !hasMore;
            if (snapshot.docs.length && store.listenOlder) chatStops.push(store.listenOlder(activeId, cursor, updates => {
                if (current !== chatVersion) return;
                updates.docs.forEach(d => { const value = { ...d.data(), id:d.id }; messages.set(d.id, value); quotes.set(d.id, value); }); renderMessages();
            }, () => { if (current === chatVersion) status('Alcuni messaggi precedenti non si stanno aggiornando. Riapri la conversazione per riprovare.'); }));
        } catch (_) { if (current === chatVersion) status('Non è stato possibile caricare i messaggi precedenti. Riprova.'); }
        finally { olderBusy = false; $('load-older').disabled = false; }
    }
    $('load-older').addEventListener('click', loadOlder);
    $('new-messages-indicator').addEventListener('click', () => { bottom(true); scheduleRead(); });
    $('reply-action').addEventListener('click', () => startReply(actionId));
    $('cancel-reply').addEventListener('click', () => { replyTo = ''; $('reply-preview').hidden = true; input.focus(); });
    $('copy-message').addEventListener('click', async () => {
        const message = messages.get(actionId); if (!message) return;
        try { await navigator.clipboard.writeText(message.text); await dismiss($('message-actions')); status('Testo copiato.'); }
        catch (_) { $('action-status').textContent = 'Copia non disponibile. Puoi selezionare il testo del messaggio.'; }
    });
    function updateTyping() {
        clearTimeout(typingExpiry);
        const state = states.get(recipientUid), age = Date.now() - model.millis(state?.updatedAt);
        const typing = state?.isTyping === true && age >= -5000 && age < 8000 && !document.hidden;
        const stick = nearBottom(); $('typing-indicator').hidden = !typing;
        $('typing-indicator').setAttribute('aria-label', person(recipientUid).name + ' sta scrivendo');
        if (typing) { typingExpiry = setTimeout(updateTyping, Math.max(200, 8100 - age)); if (stick) bottom(); }
    }
    function writeTyping(value) {
        if (!activeId || !store || !navigator.onLine) return;
        const id = activeId, current = chatVersion;
        store.state(id, { isTyping:value }).catch(() => { if (current === chatVersion) stateError = true; });
    }
    function stopTyping() {
        clearTimeout(typingTimer); clearInterval(typingRefresh);
        if (lastTyping) writeTyping(false); lastTyping = 0;
    }
    function typing() {
        if (!input.value.trim() || document.hidden) { stopTyping(); return; }
        const now = Date.now(); if (!lastTyping || now - lastTyping > 2500) { writeTyping(true); lastTyping = now; }
        clearTimeout(typingTimer); typingTimer = setTimeout(stopTyping, 3500);
    }
    function scheduleRead() {
        clearTimeout(readTimer);
        if (!activeId || document.hidden || !navigator.onLine || !nearBottom()) return;
        const id = activeId, current = chatVersion;
        readTimer = setTimeout(() => {
            if (current !== chatVersion || document.hidden || !nearBottom()) return;
            const latest = [...messages.values()].filter(m => !m.pending && m.senderUid !== user.uid && model.millis(m.createdAt)).sort((a, b) => model.millis(b.createdAt) - model.millis(a.createdAt))[0];
            if (!latest || model.millis(states.get(user.uid)?.readAt) >= model.millis(latest.createdAt)) return;
            store.state(id, { readAt:latest.createdAt, isTyping:!!input.value.trim() }).catch(() => {});
        }, 350);
    }
    async function deliver(message) {
        const current = chatVersion, id = activeId, writer = store, session = version, queue = outbox.get(activeId);
        message.pending = true; message.failed = false; messages.set(message.id, message); renderMessages(); bottom();
        try {
            await writer.send(id, message.id, message.text, message.replyTo);
            if (session !== version) return;
            queue?.delete(message.id);
            if (current !== chatVersion) return;
            pending.delete(message.id); const saved = messages.get(message.id);
            if (saved?.pending) { saved.pending = false; renderMessages(); }
        } catch (_) {
            if (session !== version) return;
            message.pending = false; message.failed = true; queue?.set(message.id, message);
            if (current !== chatVersion) return;
            const saved = messages.get(message.id) || message; saved.pending = false; saved.failed = true; messages.set(message.id, saved); pending.set(message.id, saved);
            renderMessages(); status('Il messaggio non è stato inviato. Il testo è conservato qui: premi Riprova.', true);
        }
    }
    function retrySend(id) { const message = pending.get(id); if (message && !message.pending && navigator.onLine) deliver(message); }
    $('message-form').addEventListener('submit', async event => {
        event.preventDefault(); if (!activeId || sending || !navigator.onLine || person(recipientUid).enabled === false) return;
        let text; try { text = model.messageText(input.value); } catch (error) { status(error.code === 'message-too-long' ? 'Il messaggio può contenere fino a 2.000 caratteri.' : 'Scrivi un messaggio prima di inviarlo.', true); return; }
        const id = store.newMessageId(activeId), message = { id, text, senderUid:user.uid, replyTo, reactions:{}, localTime:Date.now() };
        pending.set(id, message); input.value = ''; replyTo = ''; $('reply-preview').hidden = true; status(); stopTyping(); resizeInput();
        await deliver(message);
    });
    input.addEventListener('input', () => { resizeInput(); typing(); });
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && window.matchMedia('(min-width:701px)').matches) { event.preventDefault(); $('message-form').requestSubmit(); } });
    input.addEventListener('blur', stopTyping);
    scroll.addEventListener('scroll', () => { if (nearBottom()) { $('new-messages-indicator').hidden = true; scheduleRead(); } }, { passive:true });
    window.addEventListener('online', () => { connected(); scheduleRead(); }); window.addEventListener('offline', () => { stopTyping(); connected(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopTyping(); else { updateTyping(); scheduleRead(); } });
    function viewport() {
        const height = window.visualViewport?.height || window.innerHeight;
        document.documentElement.style.setProperty('--messages-height', height + 'px');
        $('message-form').classList.toggle('keyboard-open', window.innerHeight - height > 100);
        if (activeId && document.activeElement === input) bottom();
    }
    window.visualViewport?.addEventListener('resize', viewport); window.addEventListener('resize', viewport); viewport();
    window.addEventListener('pagehide', () => { ++version; clear(); });
    window.addEventListener('pageshow', event => { if (event.persisted) load(auth.currentUser); });
    if (!auth || !db || !model) gate('Messaggi', unavailable, { retry:true });
    else auth.onAuthStateChanged(load, () => { ++version; clear(); gate('Messaggi', unavailable, { retry:true }); });
})();
