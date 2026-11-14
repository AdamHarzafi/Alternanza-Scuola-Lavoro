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
    const motions = new Map(), visibilityTargets = new Map(), dialogEpochs = new WeakMap(), dialogDesired = new WeakMap();
    let transitionRequest = 0;
    let preferences = new Map(), inboxStates = new Map(), inboxStops = new Map(), inboxTimer;
    const notificationLast = new Map(); let inboxReady=false;
    let preparedAttachment, attachmentId = '', localPreview = '', recording;
    const media = window.HarzafiMessageMedia;
    const conversation = id => conversations.find(c => c.id === (id || activeId));
    const peers = id => (conversation(id)?.members || [user?.uid,recipientUid]).filter(uid => uid && uid !== user?.uid);
    const groupChat = id => conversation(id)?.kind === 'group';
    const chatName = c => c.kind === 'group' ? c.title || 'Conversazione di gruppo' : person(c.members.find(uid => uid !== user.uid)).name;
    const latestTime = c => Math.max(model.millis(c.lastAt),model.millis(c.updatedAt));
    const previewText = message => model.preview ? model.preview(message) : message.text || 'Allegato';
    function chatAvatar(target,c) {
        target.classList.toggle('group-avatar',c?.kind === 'group');
        if(c?.kind !== 'group') { avatar(target,person(c?.members.find(uid=>uid!==user.uid) || recipientUid));return; }
        target.replaceChildren();
        for(const uid of c.members.filter(uid=>uid!==user.uid).slice(0,2)){const slot=node('span');avatar(slot,person(uid));target.append(slot.firstChild);}
    }
    function writers(id) { return [...(inboxStates.get(id) || states)].filter(([uid,s])=>uid!==user?.uid && s.isTyping && Date.now()-model.millis(s.updatedAt)<8000 && Date.now()-model.millis(s.updatedAt)>=-5000); }
    function syncInbox() {
        const current=version;
        for(const [id,stop] of inboxStops) if(!conversations.some(c=>c.id===id)){stop();inboxStops.delete(id);inboxStates.delete(id);}
        for(const c of conversations)if(!inboxStops.has(c.id))inboxStops.set(c.id,store.inboxState(c.id,snapshot=>{if(current!==version)return;inboxStates.set(c.id,new Map(snapshot.docs.map(d=>[d.id,d.data()])));renderConversations();},()=>{}));
        clearInterval(inboxTimer);inboxTimer=setInterval(()=>{if(user&&!document.hidden)renderConversations();},1500);
    }
    function applyPreferences() {
        const value=preferences.get(activeId) || {}; $('active-conversation').dataset.background=value.background || 'default';
        $('mute-conversation').checked=value.muted===true;$('chat-background').value=value.background || 'default';
    }
    const motionFrames = {
        dialog:[{opacity:0,transform:'translateY(12px) scale(.975)'},{opacity:1,transform:'translateY(0) scale(1)'}],
        conversation:[{opacity:0},{opacity:1}],
        message:[{opacity:0,transform:'translateY(8px) scale(.985)'},{opacity:1,transform:'translateY(0) scale(1)'}],
        accessory:[{opacity:0,transform:'translateY(5px) scale(.96)'},{opacity:1,transform:'translateY(0) scale(1)'}],
        reaction:[{opacity:0,transform:'scale(.72)'},{opacity:1,transform:'scale(1)'}]
    };
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
    function cancelMotion(element) { const running = motions.get(element); if (running) { motions.delete(element); running.cancel(); } }
    function cancelWithin(element) { for (const target of [...motions.keys()]) if (target === element || element.contains(target)) cancelMotion(target); }
    async function motion(element, type = 'accessory', entering = true, options = {}) {
        if (!element) return false;
        cancelMotion(element);
        if (reduced.matches || !element.animate) return true;
        const frames = entering ? motionFrames[type] : [...motionFrames[type]].reverse();
        const animation = element.animate(frames, {duration:options.duration || 280,delay:options.delay || 0,fill:options.fill || 'none',easing:'cubic-bezier(.4,0,.2,1)'});
        motions.set(element, animation);
        let finished = true; await animation.finished.catch(() => { finished = false; });
        const current = motions.get(element) === animation;
        if (current) motions.delete(element);
        return current && finished;
    }
    function visibleNow(element, show) { cancelMotion(element); visibilityTargets.set(element, show); element.hidden = !show; }
    async function reveal(element, show, type = 'accessory') {
        const previous = visibilityTargets.has(element) ? visibilityTargets.get(element) : !element.hidden;
        if (previous === show) return;
        visibilityTargets.set(element, show);
        if (show) element.hidden = false;
        const finished = await motion(element, type, show, {duration:220});
        if (finished && visibilityTargets.get(element) === show) element.hidden = !show;
    }
    function positionComposerMenu() {
        const dialog = $('composer-menu'), anchor = $('attach-message').getBoundingClientRect();
        const viewport = window.visualViewport;
        const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
        const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
        const edge = 12, availableHeight = Math.max(120, height - edge * 2);
        dialog.style.width = Math.min(300, width - edge * 2) + 'px';
        dialog.style.maxHeight = availableHeight + 'px';
        const boxHeight = dialog.offsetHeight;
        const x = Math.max(left + edge, Math.min(anchor.left - 8, left + width - dialog.offsetWidth - edge));
        const y = Math.max(top + edge, Math.min(anchor.bottom + 8 - boxHeight, top + height - boxHeight - edge));
        dialog.style.left = x + 'px'; dialog.style.top = y + 'px';
        return { anchor, x, y, width:dialog.offsetWidth, height:boxHeight };
    }
    async function composerMenuMotion(entering) {
        const dialog = $('composer-menu'), interrupted = motions.has(dialog);
        const currentClip = interrupted ? getComputedStyle(dialog).clipPath : '';
        cancelMotion(dialog);
        const box = positionComposerMenu(), radius = box.anchor.width / 2;
        // Reveal the glass itself from the source circle; the labels never stretch.
        const collapsed = `inset(${box.anchor.top - box.y}px ${box.x + box.width - box.anchor.right}px ${box.y + box.height - box.anchor.bottom}px ${box.anchor.left - box.x}px round ${radius}px)`;
        const expanded = 'inset(0px 0px 0px 0px round 30px)';
        const frames = [{clipPath:currentClip && currentClip !== 'none' ? currentClip : entering ? collapsed : expanded}, {clipPath:entering ? expanded : collapsed}];
        if (reduced.matches || !dialog.animate) return true;
        const animation = dialog.animate(frames, {
            duration:entering ? 430 : 300, easing:entering ? 'cubic-bezier(.22,.8,.24,1)' : 'cubic-bezier(.4,0,.6,1)'
        });
        motions.set(dialog, animation);
        for (const [index, item] of [...dialog.querySelectorAll('.dialog-heading,.action-row')].entries()) {
            motion(item, 'accessory', entering, {duration:entering ? 250 : 300, delay:entering ? 95 + index * 24 : 0, fill:'backwards'});
        }
        let finished = true; await animation.finished.catch(() => { finished = false; });
        const current = motions.get(dialog) === animation;
        if (current) motions.delete(dialog);
        return current && finished;
    }
    function openDialog(dialog) {
        dialogEpochs.set(dialog, (dialogEpochs.get(dialog) || 0) + 1); dialogDesired.set(dialog, true);
        if (!dialog.open) dialog.showModal();
        if (dialog.id === 'composer-menu') {
            $('attach-message').setAttribute('aria-expanded', 'true');
            composerMenuMotion(true);
        } else { cancelMotion(dialog); motion(dialog, 'dialog', true); }
    }
    async function dismiss(dialog) {
        if (!dialog.open) return;
        const epoch = dialogEpochs.get(dialog); dialogDesired.set(dialog, false);
        const finished = await (dialog.id === 'composer-menu' ? composerMenuMotion(false) : motion(dialog, 'dialog', false));
        if (finished && dialogEpochs.get(dialog) === epoch && dialog.open && !dialogDesired.get(dialog)) dialog.close();
    }
    function closeDialogs() { for (const dialog of dialogs) { dialogEpochs.set(dialog, (dialogEpochs.get(dialog) || 0) + 1); dialogDesired.set(dialog, false); cancelMotion(dialog); if (dialog.open) dialog.close(); } }
    for (const button of document.querySelectorAll('[data-close-dialog]')) button.addEventListener('click', () => dismiss(button.closest('dialog')));
    for (const dialog of dialogs) {
        dialog.addEventListener('close', () => {
            if (dialog.id === 'composer-menu' && !dialog.open) {
                cancelWithin(dialog); $('attach-message').setAttribute('aria-expanded', 'false');
            }
        });
        dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(dialog); });
        dialog.addEventListener('click', event => { if (event.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dismiss(dialog); });
        dialog.addEventListener('keydown', event => {
            if (event.key !== 'Tab') return;
            const items = [...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href],[tabindex="0"]')].filter(e => e.getClientRects().length);
            if (!items.length) return;
            if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
            else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
        });
    }
    const repositionComposerMenu = () => {
        const dialog=$('composer-menu'); if (!dialog.open) return;
        if (dialogDesired.get(dialog) === false) { cancelWithin(dialog); dialog.close(); }
        else { cancelMotion(dialog); positionComposerMenu(); }
    };
    window.addEventListener('resize', repositionComposerMenu);
    window.visualViewport?.addEventListener('resize', repositionComposerMenu);
    window.visualViewport?.addEventListener('scroll', repositionComposerMenu);
    window.addEventListener('scroll', repositionComposerMenu, {passive:true});

    function gate(title, copy, { loading = false, enable = false, retry = false } = {}) {
        $('messages-gate').hidden = false; app.hidden = true;
        $('gate-title').textContent = title; $('gate-copy').textContent = copy;
        $('gate-title').hidden=enable; $('gate-copy').hidden=enable;
        $('messages-onboarding').hidden=!enable;
        document.querySelector('#messages-gate > .messages-symbol')?.toggleAttribute('hidden',enable);
        $('gate-spinner').hidden = !loading; $('messages-enable').hidden = !enable; $('messages-retry').hidden = !retry;
    }
    function clearChat(writeTyping = true) {
        for(const player of $('message-list').querySelectorAll('audio,video')){
            player.pause();player.removeAttribute('src');player.load();
        }
        media?.cancelActivity?.();recording?.cancel();recording=null;resetAttachment();
        if (activeId) drafts.set(activeId, { text:input.value, replyTo });
        if (writeTyping) stopTyping();
        ++chatVersion; chatStops.splice(0).forEach(stop => stop());
        clearTimeout(readTimer); clearTimeout(typingExpiry); clearTimeout(longPressTimer);
        activeId = recipientUid = replyTo = actionId = ''; states.clear(); messages.clear(); rowNodes.clear(); quotes.clear(); requestedQuotes.clear();
        cancelWithin($('active-conversation')); $('active-conversation').inert = false;
        $('message-list').replaceChildren(); visibleNow($('typing-indicator'), false); visibleNow($('reply-preview'), false);
        $('active-conversation').hidden = true; $('conversation-placeholder').hidden = false; app.classList.remove('conversation-open');
        $('connection-status').hidden = true; $('new-messages-indicator').hidden = true; input.value = ''; resizeInput(); closeDialogs();
        pending = new Map(); sending = false; olderBusy = false; oldest = null; stateError = false;
    }
    function clear(preservePush=false) {
        if(user)window.HarzafiMessagePush?.clear(!preservePush);
        ++transitionRequest; for (const element of [...motions.keys()]) cancelMotion(element);
        clearChat(); globalStops.splice(0).forEach(stop => stop()); contacts.clear(); conversations = []; store = user = identity = null;
        inboxStops.forEach(stop=>stop());inboxStops.clear();inboxStates.clear();preferences.clear();clearInterval(inboxTimer);media?.destroy();
        notificationLast.clear();inboxReady=false;
        $('action-message-text').replaceChildren();$('attachment-preview').replaceChildren();$('group-members').replaceChildren();$('conversation-members').replaceChildren();
        preparedAttachment=null;recording?.cancel();recording=null;if(localPreview)URL.revokeObjectURL(localPreview);localPreview='';
        $('conversation-list').replaceChildren(); $('contact-list').replaceChildren(); $('conversation-search').value = ''; $('contact-search').value = '';
        $('messages-enable').disabled = false; enrollmentBusy = false;
        drafts.clear(); outbox.clear();
        for(const id of ['edit-message-input','attachment-caption','group-title','poll-question'])$(id).value='';
        document.querySelectorAll('.poll-option-input').forEach(e=>e.value='');$('media-viewer-image').removeAttribute('src');
    }
    function connected() {
        const offline = !navigator.onLine;
        $('connection-status').hidden = !offline;
        $('connection-status').textContent = offline ? 'Sei offline. I nuovi messaggi saranno disponibili quando torni online.' : '';
        const unavailablePeer=!groupChat() && person(recipientUid).enabled === false;
        $('send-message').disabled = !activeId || !input.value.trim() || offline || sending || unavailablePeer;
        $('attach-message').disabled=$('voice-message').disabled=!activeId || offline || unavailablePeer || sending;
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
        if(!user)return;
        const list = conversations.filter(c => chatName(c).toLocaleLowerCase('it').includes(search))
            .sort((a, b) => latestTime(b) - latestTime(a));
        const focused = document.activeElement?.dataset?.conversation;
        const fragment = document.createDocumentFragment();
        for (const c of list) {
            const other = c.members.find(uid => uid !== user.uid), p = person(other);
            const button = node('button', 'conversation-item'); button.type = 'button'; button.dataset.conversation = c.id;
            button.setAttribute('aria-current', String(c.id === activeId)); button.setAttribute('aria-label', 'Apri la conversazione con ' + chatName(c));
            const image = node('span', 'person-avatar'); chatAvatar(image, c);
            const copy = node('span', 'conversation-item-copy'), heading = node('span', 'conversation-item-heading');
            heading.append(node('strong', '', chatName(c)), node('time', '', listDate({toMillis:()=>latestTime(c)})));
            const writing=writers(c.id);let preview;
            if(writing.length){preview=node('span','conversation-typing');preview.setAttribute('aria-label',writing.map(([uid])=>nameOf(uid)).join(', ')+' sta scrivendo');for(let i=0;i<3;i++)preview.append(node('span','typing-dot'));preview.append(node('span','','Sta scrivendo…'));}
            else preview=node('span', 'conversation-preview', (c.lastSender === user.uid ? 'Tu: ' : '') + (c.lastText || 'Inizia la conversazione.'));
            copy.append(heading,preview);
            const readAt=Math.max(model.millis(preferences.get(c.id)?.readAt),model.millis(inboxStates.get(c.id)?.get(user.uid)?.readAt));
            if(c.lastSender && c.lastSender!==user.uid && latestTime(c)>readAt){const dot=node('span','unread-dot');dot.setAttribute('aria-label','Messaggi non letti');button.append(dot);}
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
        const c=conversation();if(c){chatAvatar($('conversation-avatar'),c);$('conversation-name').textContent=chatName(c);}
        $('conversation-role').textContent = p.role ? roleName(p.role) : ''; $('conversation-info').setAttribute('aria-label', 'Informazioni sulla conversazione con ' + p.name); connected();
    }
    function start() {
        const current = version;
        window.HarzafiMessagePush?.start(user);
        $('messages-gate').hidden = true; app.hidden = false;
        motion(app, 'conversation', true, {duration:360});
        globalStops.push(store.settings(snapshot=>{if(current!==version)return;preferences=new Map(snapshot.docs.map(d=>[d.id,d.data()]));for(const [id,value] of preferences)if(typeof value.muted==='boolean')window.HarzafiMessagePush?.preferences(id,value.muted).catch(()=>{});renderConversations();if(activeId)applyPreferences();},()=>{}));
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
            for(const c of conversations){if(inboxReady&&notificationLast.get(c.id)!==c.lastMessageId&&c.lastSender!==user.uid&&c.lastMessageId&&!preferences.get(c.id)?.muted)window.HarzafiMessageNotifications?.notify(c.id);notificationLast.set(c.id,c.lastMessageId);}inboxReady=true;
            syncInbox(); renderConversations();if(activeId)updateHeader();
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
    $('conversation-back').addEventListener('click', async () => {
        const request = ++transitionRequest, session = version; stopTyping();
        $('active-conversation').inert = true;
        await motion($('active-conversation'), 'conversation', false);
        if (request !== transitionRequest || session !== version) return;
        clearChat(); renderConversations(); motion(document.querySelector('.conversation-sidebar'), 'conversation', true); $('new-conversation').focus({preventScroll:true});
    });
    $('messages-options').addEventListener('click', () => { $('settings-message-status').textContent = ''; openDialog($('messages-settings')); });
    $('disable-messages').addEventListener('click', async () => {
        const current = version; $('disable-messages').disabled = true;
        try { stopTyping(); await store.disable(); if (current === version) { clearChat(false); load(auth.currentUser); } }
        catch (_) { if (current === version) $('settings-message-status').textContent = 'Non è stato possibile disattivare Messaggi. Riprova.'; }
        finally { $('disable-messages').disabled = false; }
    });

    async function selectConversation(id, otherUid) {
        const request = ++transitionRequest, session = version;
        if (id === activeId) { cancelMotion($('active-conversation')); $('active-conversation').inert = false; app.classList.add('conversation-open'); return; }
        stopTyping();
        if (activeId && !$('active-conversation').hidden) {
            $('active-conversation').inert = true; await motion($('active-conversation'), 'conversation', false);
            if (request !== transitionRequest || session !== version) return;
        }
        mountConversation(id, otherUid);
        motion($('active-conversation'), 'conversation', true);
        motion($('conversation-avatar'), 'accessory', true);
        motion(document.querySelector('.conversation-name-glass'), 'accessory', true, {delay:45});
    }
    function mountConversation(id, otherUid) {
        if (id === activeId) { app.classList.add('conversation-open'); return; }
        clearChat(); activeId = id; recipientUid = otherUid; const current = chatVersion;
        pending = outbox.get(id) || new Map(); outbox.set(id, pending);
        pending.forEach((value, key) => messages.set(key, value));
        const draft = drafts.get(id); input.value = draft?.text || ''; replyTo = draft?.replyTo || ''; resizeInput();
        if (replyTo) { const original = quotes.get(replyTo); $('reply-name').textContent = 'Risposta al messaggio'; $('reply-text').textContent = original?.text || 'Il messaggio originale verrà richiamato nella risposta.'; reveal($('reply-preview'), true); }
        $('active-conversation').hidden = false; $('conversation-placeholder').hidden = true; app.classList.add('conversation-open');
        updateHeader();applyPreferences(); renderConversations(); status(); $('history-status').textContent = 'Caricamento dei messaggi…'; $('load-older').hidden = true;
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
            $('history-status').textContent = snapshot.metadata?.fromCache ? 'Connessione in corso. Mostro i messaggi già disponibili.' : !messages.size ? 'È l’inizio della vostra conversazione.' : '';
            renderMessages({animate:initial ? 'history' : true});
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
        $('action-message-text').classList.toggle('own',message.senderUid===user.uid);
        if(!message.text)$('action-message-text').textContent=previewText(message);
        $('edit-message-action').hidden=message.senderUid!==user.uid || (message.type && message.type!=='text');
        $('copy-message').hidden=$('select-message-action').hidden=!message.text;
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
        const current = chatVersion; reveal($('reply-preview'), true); await dismiss($('message-actions')); if (current === chatVersion) { input.focus(); resizeInput(); bottom(); }
    }
    function renderMessages({animate = false} = {}) {
        if (!activeId) return;
        const values = [...messages.values()].sort((a, b) => (model.millis(a.createdAt) || a.localTime || Date.now()) - (model.millis(b.createdAt) || b.localTime || Date.now()) || a.id.localeCompare(b.id));
        let previous;
        for (let index = 0; index < values.length; index++) {
            const message = values[index], own = message.senderUid === user.uid, date = model.millis(message.createdAt) || message.localTime || Date.now();
            const showDate = !previous || new Date(date).toDateString() !== new Date(model.millis(previous.createdAt) || previous.localTime).toDateString();
            const grouped = !showDate && previous?.senderUid === message.senderUid && date - (model.millis(previous.createdAt) || previous.localTime) < 120000;
            const quoted = quoteFor(message), lastOwn = own && !values.slice(index + 1).some(m => m.senderUid === user.uid);
            const peerRead = peers().length>0 && peers().every(uid=>model.millis(states.get(uid)?.readAt)>=date);
            const signature = JSON.stringify([message, quoted, showDate, grouped, lastOwn, peerRead]);
            let row = rowNodes.get(message.id); const isNew = !row;
            if (!row) { row = node('li', 'message-row'); row.dataset.messageId = message.id; rowNodes.set(message.id, row); }
            if (row.dataset.signature !== signature) {
                const transcriptOpen = row.querySelector('.message-transcript')?.open;
                row.dataset.signature = signature; row.replaceChildren(); row.className = 'message-row' + (own ? ' own' : '') + (grouped ? ' grouped' : '');
                if (showDate) row.append(node('div', 'message-date', day.format(date) + ' · ' + time.format(date)));
                const cluster = node('div', 'message-cluster'), bubble = node('div', 'message-bubble');
                if (quoted) {
                    const quote = node('button', 'reply-quote'); quote.type = 'button'; quote.setAttribute('aria-label', 'Vai al messaggio a cui si risponde');
                    quote.append(node('strong', '', nameOf(quoted.senderUid)), node('span', '', quoted.text));
                    quote.addEventListener('click', () => jumpTo(message.replyTo)); bubble.append(quote);
                }
                if(groupChat()&&!own&&!grouped)bubble.append(node('strong','message-sender',nameOf(message.senderUid)));
                if(message.type==='poll')renderPoll(bubble,message);
                else {if(message.attachment)renderMedia(bubble,message);if(message.text)bubble.append(node('span', 'message-text', message.text));}
                if (transcriptOpen && bubble.querySelector('.message-transcript')) bubble.querySelector('.message-transcript').open = true;
                if(message.editedAt)bubble.append(node('span','message-edited','Modificato'));
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
            if (isNew && animate && (animate !== 'history' || index >= values.length - 6)) motion(row, 'message', true, {duration:300,delay:animate === 'history' ? Math.max(0, index - values.length + 6) * 24 : 0});
            previous = message;
        }
    }
    function renderPoll(bubble,message) {
        const poll=message.poll, panel=node('div','message-poll');if(!poll)return;
        panel.append(node('h3','',poll.question));const votes=Object.values(poll.votes || {}),total=votes.length;
        poll.options.forEach((option,index)=>{const count=votes.filter(value=>value===index).length,button=node('button','poll-option');button.type='button';button.setAttribute('aria-pressed',String(poll.votes?.[user.uid]===index));button.style.setProperty('--poll-percent',(total?count/total*100:0)+'%');button.append(node('span','',option),node('strong','',String(count)));button.addEventListener('click',async()=>{const current=chatVersion;button.disabled=true;try{await store.vote(activeId,message.id,index);}catch(_){if(current===chatVersion)status('Il voto non è stato salvato. Riprova.',true);}finally{button.disabled=false;}});panel.append(button);});
        panel.append(node('small','poll-meta',total+' '+(total===1?'voto':'voti')+' · Voti visibili ai partecipanti'));bubble.append(panel);
    }
    function renderMedia(bubble,message) {
        const attachment=message.attachment,current=chatVersion,writer=store;
        const load=()=>media.load(attachment,writer);
        if(message.type==='image'||message.type==='video') {
            const element=node(message.type==='image'?'img':'video','message-'+message.type);element.setAttribute('aria-label',attachment.name);if(message.type==='image'){
                element.alt=attachment.name;element.loading='lazy';element.decoding='async';
                element.width=280;element.height=210;
                element.addEventListener('load',()=>{
                    if(current!==chatVersion || !element.naturalWidth || !element.naturalHeight)return;
                    const follow=nearBottom(),ratio=element.naturalWidth/element.naturalHeight;
                    element.width=element.naturalWidth;element.height=element.naturalHeight;
                    bubble.style.setProperty('--photo-native-width',element.naturalWidth+'px');
                    bubble.style.setProperty('--photo-tall-width',420*ratio+'px');
                    bubble.style.setProperty('--photo-mobile-tall-width',360*ratio+'px');
                    if(follow)bottom();
                });
            }else{element.controls=true;element.preload='metadata';}bubble.append(element);
            // Load only visible media, rather than all files in a long conversation.
            const observer=new IntersectionObserver(entries=>{if(!entries.some(e=>e.isIntersecting))return;observer.disconnect();load().then(url=>{if(current===chatVersion&&element.isConnected)element.src=url;}).catch(()=>{if(current===chatVersion)element.replaceWith(node('span','media-error','Allegato non disponibile. Riapri la conversazione per riprovare.'));});},{root:scroll,rootMargin:'250px'});observer.observe(element);chatStops.push(()=>observer.disconnect());
            if(message.type==='image')element.addEventListener('click',async()=>{try{const url=await load();if(current!==chatVersion)return;const dialog=$('media-viewer');$('media-viewer-image').src=url;openDialog(dialog);}catch(_){status('Non è stato possibile aprire la foto.',true);}});
        } else if(message.type==='audio') {
            const panel=node('div','message-audio'),audio=node('audio');audio.controls=true;audio.preload='auto';panel.append(audio);
            const audioStatus=node('span','audio-status','Preparo il vocale…');audioStatus.setAttribute('role','status');panel.append(audioStatus);
            async function prepareAudio(){
                try {
                    const url=await load();
                    if(current!==chatVersion||!audio.isConnected)return;
                    audio.src=url;audio.load();audioStatus.remove();
                } catch (_) {
                    if(current!==chatVersion)return;
                    audioStatus.textContent='Caricamento non riuscito. ';
                    const retry=node('button','audio-load','Riprova');retry.type='button';
                    retry.addEventListener('click',()=>{retry.remove();audioStatus.textContent='Preparo il vocale…';prepareAudio();});audioStatus.append(retry);
                }
            }
            const audioObserver=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){audioObserver.disconnect();prepareAudio();}},{root:scroll,rootMargin:'500px'});
            audioObserver.observe(panel);chatStops.push(()=>audioObserver.disconnect());
            const details=node('details','message-transcript');details.append(node('summary','','Trascrizione automatica'));
            const copy=node('p','',message.transcript || 'La trascrizione viene elaborata su questo dispositivo e può contenere errori. Al primo utilizzo scarica il modello di riconoscimento vocale (circa 75 MB).');details.append(copy);
            if (!message.transcript) {
                const transcribe=node('button','transcribe-audio','Trascrivi sul dispositivo');
                transcribe.type='button';
                transcribe.addEventListener('click',async()=>{
                    transcribe.disabled=true;
                    copy.textContent='Preparo il riconoscimento vocale in italiano…';
                    try {
                        const url=await load();
                        const text=await media.transcribe(url,value=>{
                            if(current===chatVersion)copy.textContent=value?'Scarico il modello… '+Math.round(value)+'%':'Elaborazione sul dispositivo…';
                        });
                        if(current!==chatVersion)return;
                        copy.textContent=text||'Non è stato riconosciuto un testo. Verifica che la voce sia udibile.';
                        transcribe.remove();
                        if(text&&message.senderUid===user.uid){
                            try { await writer.saveTranscript(activeId,message.id,text); }
                            catch (_) { if(current===chatVersion)copy.append(node('small','',' Trascrizione disponibile su questo dispositivo. La sincronizzazione non è riuscita.')); }
                        }
                    } catch(error) {
                        if(current!==chatVersion)return;
                        copy.textContent=error.code==='transcription-busy'?'Un’altra trascrizione è in corso. Attendi che termini e riprova.':error.code==='audio-too-long'?'Puoi trascrivere audio della durata massima di 5 minuti.':'Trascrizione non disponibile. Controlla la connessione per scaricare il modello e riprova.';
                        transcribe.disabled=false;
                    }
                });
                details.append(transcribe);
            }
            panel.append(details);bubble.append(panel);
        } else {
            const button=node('button','message-document');button.type='button';button.append(node('span','document-icon','▤'));const copy=node('span');copy.append(node('strong','',attachment.name),node('small','',formatSize(attachment.size)+' · Scarica file'));button.append(copy);button.addEventListener('click',async()=>{button.disabled=true;try{const url=await load();if(current!==chatVersion)return;const a=node('a');a.href=url;a.download=attachment.name;a.click();}catch(_){if(current===chatVersion)status('Il file non è disponibile. Riprova.',true);}finally{button.disabled=false;}});bubble.append(button);
        }
    }
    function formatSize(size){return size<1048576?Math.max(1,Math.round(size/1024))+' KB':(size/1048576).toFixed(1)+' MB';}
    $('edit-message-action').addEventListener('click',async()=>{const message=messages.get(actionId);if(!message||message.senderUid!==user.uid)return;const current=chatVersion;await dismiss($('message-actions'));if(current!==chatVersion)return;$('edit-message-input').value=message.text;$('edit-message-status').textContent='';openDialog($('edit-message-dialog'));$('edit-message-input').focus();});
    $('edit-message-form').addEventListener('submit',async event=>{event.preventDefault();const current=chatVersion;$('save-message-edit').disabled=true;try{await store.edit(activeId,actionId,$('edit-message-input').value);if(current===chatVersion)await dismiss($('edit-message-dialog'));}catch(_){if(current===chatVersion)$('edit-message-status').textContent='Non è stato possibile salvare la modifica. Controlla il testo e riprova.';}finally{$('save-message-edit').disabled=false;}});
    $('select-message-action').addEventListener('click',async()=>{const id=actionId,current=chatVersion;await dismiss($('message-actions'));if(current!==chatVersion)return;const text=rowNodes.get(id)?.querySelector('.message-text');if(text){const range=document.createRange();range.selectNodeContents(text);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);}});
    $('new-group').addEventListener('click',async()=>{const current=version;await dismiss($('new-message-dialog'));if(current!==version)return;$('group-title').value='';$('group-status').textContent='';$('group-members').replaceChildren();for(const [uid,p]of contacts){if(uid===user.uid||!p.enabled)continue;const label=node('label','contact-choice'),image=node('span','person-avatar'),copy=node('span'),check=node('input');avatar(image,p);copy.append(node('strong','',p.name),node('small','',roleName(p.role)));check.type='checkbox';check.dataset.groupMember=uid;label.append(image,copy,check);$('group-members').append(label);}openDialog($('new-group-dialog'));});
    $('group-form').addEventListener('submit',async event=>{event.preventDefault();const members=[...$('group-members').querySelectorAll('input:checked')].map(e=>e.dataset.groupMember);if(members.length<2||members.length>29){$('group-status').textContent='Scegli da 2 a 29 persone.';return;}const current=version;$('create-group').disabled=true;try{const id=await store.createGroup(members,$('group-title').value);if(current!==version)return;await dismiss($('new-group-dialog'));selectConversation(id,members[0]);}catch(_){if(current===version)$('group-status').textContent='Non è stato possibile creare il gruppo. Riprova.';}finally{$('create-group').disabled=false;}});
    async function details(){applyPreferences();$('conversation-preferences-status').textContent='';$('conversation-members').replaceChildren();for(const uid of conversation()?.members || [])$('conversation-members').append(node('p','',nameOf(uid)));openDialog($('conversation-details'));}
    // Preferences are private to the signed-in account and sync to its devices.
    for(const [id,key]of [['mute-conversation','muted'],['chat-background','background']])$(id).addEventListener('change',async()=>{const current=chatVersion,value=key==='muted'?$(id).checked:$(id).value;try{await store.saveConversationSettings(activeId,{[key]:value});}catch(_){if(current===chatVersion){applyPreferences();$('conversation-preferences-status').textContent='Non è stato possibile salvare la preferenza.';}}});
    $('conversation-details').addEventListener('close',()=>{$('conversation-members').replaceChildren();});
    $('conversation-info').addEventListener('click',details);$('conversation-encryption').addEventListener('click',details);
    $('attach-message').addEventListener('click',()=>openDialog($('composer-menu')));
    $('enable-push').addEventListener('click', async () => {
        const current=version, push=window.HarzafiMessagePush;
        $('enable-push').disabled=true;
        try {
            const result=await (push?.available()?push.enable():window.HarzafiMessageNotifications.enable());
            if(current!==version)return;
            $('push-status').textContent=result==='granted'
                ? (push?.enabled()?'Notifiche attive su questo dispositivo, anche quando il sito è chiuso.':'Notifiche attive mentre il sito rimane aperto.')
                : result==='unsupported'?'Per ricevere notifiche su iPhone o iPad, aggiungi il sito alla schermata Home e aprilo da lì. Negli altri browser verifica il supporto alle notifiche.':'Notifiche non consentite. Puoi modificare i permessi nelle impostazioni del browser.';
        } catch (_) {
            if(current===version)$('push-status').textContent='Non è stato possibile attivare le notifiche. Controlla la connessione e riprova.';
        } finally { if(current===version)$('enable-push').disabled=false; }
    });
    for(const [id,accept]of [['choose-media','image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime'],['choose-file','.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip'],['choose-audio','audio/*']])$(id).addEventListener('click',()=>{const picker=$('message-attachment-input');picker.accept=accept;picker.value='';picker.click();dismiss($('composer-menu'));});
    function resetAttachment(){preparedAttachment=null;attachmentId='';if(localPreview)URL.revokeObjectURL(localPreview);localPreview='';$('attachment-preview').replaceChildren();$('voice-preview').removeAttribute('src');}
    function previewAttachment(prepared){$('attachment-preview').replaceChildren();const box=node('div','attachment-preview');box.append(node('strong','',prepared.name),node('small','',formatSize(prepared.size)));if(prepared.type==='image'){localPreview=URL.createObjectURL(prepared.file);const img=node('img');img.alt='Anteprima allegato';img.src=localPreview;box.prepend(img);}$('attachment-preview').append(box);}
    $('message-attachment-input').addEventListener('change',async event=>{const file=event.target.files[0];if(!file||!activeId)return;const current=chatVersion;resetAttachment();$('attachment-status').textContent='Preparo l’allegato…';$('send-attachment').disabled=true;$('attachment-caption').value='';openDialog($('attachment-dialog'));try{const prepared=await media.prepare(file);if(current!==chatVersion)return;preparedAttachment=prepared;previewAttachment(prepared);$('attachment-status').textContent='Foto ottimizzate · Audio fino a 8 MB · Video fino a 20 MB · File fino a 10 MB.';$('send-attachment').disabled=false;}catch(_){if(current===chatVersion)$('attachment-status').textContent='Formato non supportato o file troppo grande. Scegli un altro allegato.';}});
    async function sendAttachment(voice=false){if(!preparedAttachment||!activeId||sending)return;const current=chatVersion,writer=store,cid=activeId,session=version,reply=replyTo,caption=voice?'':$('attachment-caption').value,members=conversation()?.members.slice() || [],sender=user,button=$(voice?'send-recording':'send-attachment'),notice=$(voice?'voice-status':'attachment-status');attachmentId ||= writer.newMessageId(cid);sending=true;button.disabled=true;connected();try{const attachment=await media.upload(cid,attachmentId,preparedAttachment,value=>{if(current===chatVersion)notice.textContent='Caricamento… '+Math.round(value)+'%';},writer);if(session!==version)return;await writer.sendMedia(cid,attachmentId,attachment,caption,reply);window.HarzafiMessagePush?.sent(cid,attachmentId,members,sender).catch(()=>{});if(current!==chatVersion)return;resetAttachment();replyTo='';reveal($('reply-preview'),false);await dismiss($(voice?'voice-dialog':'attachment-dialog'));bottom();}catch(_){if(current===chatVersion)notice.textContent='Invio non riuscito. L’allegato rimane qui: riprova quando torni online.';}finally{if(current===chatVersion){sending=false;button.disabled=false;connected();}}}
    $('send-attachment').addEventListener('click',()=>sendAttachment());$('send-recording').addEventListener('click',()=>sendAttachment(true));
    $('attachment-dialog').addEventListener('close',()=>{if(!sending)resetAttachment();});
    async function stopRecording(){if(!recording)return;const controller=recording;recording=null;const current=chatVersion;$('stop-recording').disabled=true;try{const result=await controller.stop();if(current!==chatVersion)return;preparedAttachment=result;localPreview=URL.createObjectURL(result.file);$('voice-preview').src=localPreview;$('voice-preview').hidden=false;$('send-recording').hidden=false;$('stop-recording').hidden=true;$('voice-status').textContent='Ascolta il vocale prima di inviarlo.';}catch(_){if(current===chatVersion)$('voice-status').textContent='Non è stato possibile preparare la registrazione.';}}
    $('voice-message').addEventListener('click',async()=>{if(!activeId)return;resetAttachment();const current=chatVersion;$('voice-timer').textContent='00:00';$('voice-preview').hidden=true;$('send-recording').hidden=true;$('stop-recording').hidden=false;$('stop-recording').disabled=false;$('voice-status').textContent='Consenti l’uso del microfono per registrare. Massimo 2 minuti.';openDialog($('voice-dialog'));try{const controller=await media.startRecording({onTick:seconds=>{if(current===chatVersion)$('voice-timer').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');},onLimit:stopRecording});if(current!==chatVersion||!$('voice-dialog').open){controller.cancel();return;}recording=controller;$('voice-status').textContent='Registrazione in corso…';}catch(_){if(current===chatVersion){$('voice-status').textContent='Microfono non disponibile. Controlla i permessi del browser oppure allega un file audio.';$('stop-recording').hidden=true;}}});
    $('stop-recording').addEventListener('click',stopRecording);$('voice-dialog').addEventListener('close',()=>{recording?.cancel();recording=null;if(!sending)resetAttachment();});
    $('new-poll').addEventListener('click',async()=>{const current=chatVersion;await dismiss($('composer-menu'));if(current!==chatVersion)return;$('poll-form').reset();$('poll-status').textContent='';while($('poll-options').children.length>2)$('poll-options').lastChild.remove();openDialog($('poll-dialog'));});
    $('add-poll-option').addEventListener('click',()=>{const count=$('poll-options').children.length;if(count>=6)return;const label=node('label','','Opzione '+(count+1)),option=node('input','poll-option-input');option.maxLength=100;option.required=true;label.append(option);$('poll-options').append(label);});
    $('poll-form').addEventListener('submit',async event=>{event.preventDefault();const current=chatVersion,cid=activeId,mid=store.newMessageId(activeId),members=conversation()?.members.slice() || [],sender=user;$('send-poll').disabled=true;try{await store.sendPoll(cid,mid,$('poll-question').value,[...document.querySelectorAll('.poll-option-input')].map(e=>e.value),replyTo);window.HarzafiMessagePush?.sent(cid,mid,members,sender).catch(()=>{});if(current!==chatVersion)return;replyTo='';reveal($('reply-preview'),false);await dismiss($('poll-dialog'));bottom();}catch(_){if(current===chatVersion)$('poll-status').textContent='Controlla la domanda e le opzioni: devono essere diverse. Poi riprova.';}finally{$('send-poll').disabled=false;}});
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
        finally { if (current === chatVersion) { olderBusy = false; $('load-older').disabled = false; } }
    }
    $('load-older').addEventListener('click', loadOlder);
    $('new-messages-indicator').addEventListener('click', () => { bottom(true); scheduleRead(); });
    $('reply-action').addEventListener('click', () => startReply(actionId));
    $('cancel-reply').addEventListener('click', () => { replyTo = ''; reveal($('reply-preview'), false); input.focus(); });
    $('copy-message').addEventListener('click', async () => {
        const message = messages.get(actionId); if (!message) return;
        try { await navigator.clipboard.writeText(message.text); await dismiss($('message-actions')); status('Testo copiato.'); }
        catch (_) { $('action-status').textContent = 'Copia non disponibile. Puoi selezionare il testo del messaggio.'; }
    });
    function updateTyping() {
        clearTimeout(typingExpiry);
        const writing=writers(activeId),age=writing.length?Date.now()-model.millis(writing[0][1].updatedAt):0;
        const typing = writing.length>0 && !document.hidden;
        const stick = nearBottom(); reveal($('typing-indicator'), typing);
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
        const members=conversation(id)?.members.slice() || [],sender=user;
        message.pending = true; message.failed = false; messages.set(message.id, message); renderMessages({animate:true}); bottom();
        try {
            await writer.send(id, message.id, message.text, message.replyTo);
            window.HarzafiMessagePush?.sent(id,message.id,members,sender).catch(()=>{});
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
        event.preventDefault(); if (!activeId || sending || !navigator.onLine || (!groupChat() && person(recipientUid).enabled === false)) return;
        let text; try { text = model.messageText(input.value); } catch (error) { status(error.code === 'message-too-long' ? 'Il messaggio può contenere fino a 2.000 caratteri.' : 'Scrivi un messaggio prima di inviarlo.', true); return; }
        const id = store.newMessageId(activeId), message = { id, text, senderUid:user.uid, replyTo, reactions:{}, localTime:Date.now() };
        pending.set(id, message); input.value = ''; replyTo = ''; reveal($('reply-preview'), false); status(); stopTyping(); resizeInput();
        await deliver(message);
    });
    input.addEventListener('input', () => { resizeInput(); typing(); });
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && window.matchMedia('(min-width:701px)').matches) { event.preventDefault(); $('message-form').requestSubmit(); } });
    input.addEventListener('blur', () => { stopTyping(); viewport(); });
    input.addEventListener('focus', viewport);
    scroll.addEventListener('scroll', () => { if (nearBottom()) { $('new-messages-indicator').hidden = true; scheduleRead(); } }, { passive:true });
    window.addEventListener('online', () => { connected(); scheduleRead(); }); window.addEventListener('offline', () => { stopTyping(); connected(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopTyping(); else { updateTyping(); scheduleRead(); } });
    function viewport() {
        const height = window.visualViewport?.height || window.innerHeight;
        document.documentElement.style.setProperty('--messages-height', height + 'px');
        const keyboardOpen = window.innerHeight - height > 100 || (document.activeElement === input && height < 600 && window.matchMedia('(max-width:700px)').matches);
        $('message-form').classList.toggle('keyboard-open', keyboardOpen);
        document.body.classList.toggle('messages-keyboard-open', keyboardOpen);
        if (activeId && document.activeElement === input) bottom();
    }
    window.visualViewport?.addEventListener('resize', viewport); window.addEventListener('resize', viewport); viewport();
    reduced.addEventListener('change', () => {
        if (!reduced.matches) return;
        for (const element of [...motions.keys()]) cancelMotion(element);
        for (const [element, show] of visibilityTargets) element.hidden = !show;
        for (const dialog of dialogs) if (dialog.open && dialogDesired.get(dialog) === false) dialog.close();
    });
    window.addEventListener('pagehide', () => { ++version; clear(true); });
    window.addEventListener('pageshow', event => { if (event.persisted) load(auth.currentUser); });
    if (!auth || !db || !model) gate('Messaggi', unavailable, { retry:true });
    else auth.onAuthStateChanged(load, () => { ++version; clear(); gate('Messaggi', unavailable, { retry:true }); });
})();
