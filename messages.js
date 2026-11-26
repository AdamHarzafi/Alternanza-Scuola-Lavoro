(function () {
    'use strict';
    const $ = id => document.getElementById(id), model = window.HarzafiMessages;
    const auth = window.HarzafiSession?.auth, db = window.firebase?.firestore?.();
    const app = $('messages-app'), input = $('message-input'), scroll = $('message-scroll');
    const time = new Intl.DateTimeFormat('it-IT', { hour:'2-digit', minute:'2-digit' });
    const day = new Intl.DateTimeFormat('it-IT', { day:'numeric', month:'long' });
    const roleName = role => role === 'docente' ? 'Docente' : 'Studente';
    const node = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) { if(window.HarzafiEmoji) window.HarzafiEmoji.render(e,String(text)); else e.textContent = text; } return e; };
    const defaultPhoto = 'IMMAGINI/PROFILO-UTENTE-LOGO.webp';
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let version = 0, store, user, identity, contacts = new Map(), conversations = [], globalStops = [], chatStops = [];
    let activeId = '', chatVersion = 0, recipientUid = '', messages = new Map(), rowNodes = new Map(), states = new Map();
    let quotes = new Map(), requestedQuotes = new Set(), oldest, hasMore = false, replyTo = '', actionId = '', olderBusy = false;
    const replyThreads = new Map(); let openThreadId = '';
    const replyObserver = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
            replyObserver.unobserve(entry.target);
            if (entry.target.isConnected && activeId) ensureThread(entry.target.dataset.replyRoot);
        }
    }, { root:scroll, rootMargin:'180px' });
    let typingTimer, typingRefresh, typingExpiry, lastTyping = 0, readTimer, stateError = false, sending = false, enrollmentBusy = false;
    let pending = new Map(), drafts = new Map(), outbox = new Map(), longPressTimer, pressTarget, suppressClick = false;
    const dialogs = [...document.querySelectorAll('dialog')];
    const effects = window.HarzafiTextEffects, syncEmojiDraft = window.HarzafiEmoji?.mirror(input) || (()=>{});
    let draftEffect = null, draftEffectAll = false, draftText = '', effectSelection = null;
    const motions = new Map(), visibilityTargets = new Map(), dialogEpochs = new WeakMap(), dialogDesired = new WeakMap();
    let transitionRequest = 0, actionOriginRect;
    const viewportState = { width:window.innerWidth, baseline:window.innerHeight, height:0, scale:window.visualViewport?.scale || 1, followLatest:true };
    let preferences = new Map(), inboxStates = new Map(), inboxStops = new Map(), inboxTimer;
    let deletedGroups = [], groupToDelete = '', groupDeletionBusy = false;
    let groupToLeave = '', groupExitBusy = false, verifiedAccounts = new Set();
    const restoringGroups = new Set();
    const notificationLast = new Map(); let inboxReady=false;
    let preparedAttachment, attachmentId = '', localPreview = '', recording;
    let voiceEpoch = 0, voiceBusy = false, voiceSegments = [], voicePreview, liveWave;
    const audioUI = window.HarzafiMessageAudio;
    const media = window.HarzafiMessageMedia;
    const conversation = id => conversations.find(c => c.id === (id || activeId));
    const groupOwner = value => model.groupOwner(value);
    const peers = id => (conversation(id)?.members || [user?.uid,recipientUid]).filter(uid => uid && uid !== user?.uid);
    const groupChat = id => conversation(id)?.kind === 'group';
    const chatName = c => c.kind === 'group' ? c.title || 'Conversazione di gruppo' : person(c.members.find(uid => uid !== user.uid)).name;
    const latestTime = c => Math.max(model.millis(c.lastAt),model.millis(c.updatedAt));
    const previewText = message => model.preview ? model.preview(message) : message.text || 'Allegato';
    function verifiedBadge(uid) {
        if(!verifiedAccounts.has(uid))return null;
        const badge=node('span','verified-account');badge.setAttribute('role','img');badge.setAttribute('aria-label','Account ufficiale · Amministratore di Harzafi FSL');badge.title='Amministratore di Harzafi FSL';
        const icon=node('img');icon.src='IMMAGINI/SPUNTA%20BLU.webp';icon.alt='';icon.width=icon.height=18;icon.decoding='async';icon.setAttribute('aria-hidden','true');badge.append(icon);return badge;
    }
    function nameLabel(uid,text,tag='span') {
        const label=node(tag,'account-name-label');label.append(node('span','account-name-text',text));const badge=verifiedBadge(uid);if(badge)label.append(badge);return label;
    }
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
        $('mute-conversation').checked=value.muted===true;
        document.querySelectorAll('input[name="chat-background"]').forEach(option=>{option.checked=option.value===(value.background||'default');});
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
    async function messageActionsMotion(entering) {
        const dialog=$('message-actions'),preview=$('action-message-text');cancelWithin(dialog);
        if(reduced.matches||!preview.animate){dialog.classList.remove('message-context-animating');return true;}
        dialog.classList.add('message-context-animating');
        const target=preview.getBoundingClientRect(),source=entering?actionOriginRect:rowNodes.get(actionId)?.querySelector('.message-bubble')?.getBoundingClientRect();
        const visible=source&&source.width>0&&source.height>0&&source.bottom>0&&source.top<window.innerHeight;
        const transform=visible?`translate(${source.left+source.width/2-target.left-target.width/2}px,${source.top+source.height/2-target.top-target.height/2}px) scale(${source.width/target.width},${source.height/target.height})`:'scale(.94)';
        const frames=[{opacity:visible?1:0,transform},{opacity:1,transform:'translate(0,0) scale(1)'}];
        const animation=preview.animate(entering?frames:[...frames].reverse(),{duration:entering?320:230,easing:entering?'cubic-bezier(.2,.8,.2,1)':'cubic-bezier(.4,0,.2,1)'});motions.set(preview,animation);
        for(const [index,element]of [dialog.querySelector('.dialog-heading'),$('reaction-picker'),dialog.querySelector('.action-menu')].entries())motion(element,'accessory',entering,{duration:entering?240:170,delay:entering?60+index*35:0,fill:'backwards'});
        let finished=true;await animation.finished.catch(()=>{finished=false;});const current=motions.get(preview)===animation;if(current){motions.delete(preview);dialog.classList.remove('message-context-animating');}return current&&finished;
    }
    function openDialog(dialog) {
        dialogEpochs.set(dialog, (dialogEpochs.get(dialog) || 0) + 1); dialogDesired.set(dialog, true);
        if (!dialog.open) dialog.showModal();
        if (dialog.id === 'composer-menu') {
            $('attach-message').setAttribute('aria-expanded', 'true');
            composerMenuMotion(true);
        } else if(dialog.id==='message-actions'){cancelMotion(dialog);dialog.scrollTop=0;messageActionsMotion(true);}
        else { cancelMotion(dialog); motion(dialog, 'dialog', true); }
    }
    async function dismiss(dialog) {
        if (!dialog.open) return;
        if ((dialog.id === 'delete-group-dialog' && groupDeletionBusy) || (dialog.id === 'leave-group-dialog' && groupExitBusy)) return;
        const epoch = dialogEpochs.get(dialog); dialogDesired.set(dialog, false);
        const finished = await (dialog.id === 'composer-menu' ? composerMenuMotion(false) : dialog.id==='message-actions'?messageActionsMotion(false):motion(dialog, 'dialog', false));
        if (finished && dialogEpochs.get(dialog) === epoch && dialog.open && !dialogDesired.get(dialog)) dialog.close();
    }
    function closeDialogs() { for (const dialog of dialogs) { dialogEpochs.set(dialog, (dialogEpochs.get(dialog) || 0) + 1); dialogDesired.set(dialog, false); cancelMotion(dialog); if (dialog.open) dialog.close(); } }
    for (const button of document.querySelectorAll('[data-close-dialog]')) button.addEventListener('click', () => dismiss(button.closest('dialog')));
    for (const dialog of dialogs) {
        dialog.addEventListener('close', () => {
            if (dialog.id === 'composer-menu' && !dialog.open) {
                cancelWithin(dialog); $('attach-message').setAttribute('aria-expanded', 'false');
            }
            if(dialog.id==='message-actions'&&!dialog.open){cancelWithin(dialog);dialog.classList.remove('message-context-animating');$('action-message-text').replaceChildren();actionOriginRect=null;}
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
        media?.cancelActivity?.();resetVoice();resetAttachment();
        if (activeId) drafts.set(activeId, { text:input.value, replyTo, textEffect:draftEffect, effectAll:draftEffectAll });
        if (writeTyping) stopTyping();
        ++chatVersion; chatStops.splice(0).forEach(stop => stop());
        replyObserver.disconnect(); replyThreads.clear(); openThreadId = '';
        viewportState.followLatest=true;
        clearTimeout(readTimer); clearTimeout(typingExpiry); cancelMessagePress();
        activeId = recipientUid = replyTo = actionId = ''; states.clear(); messages.clear(); rowNodes.clear(); quotes.clear(); requestedQuotes.clear();
        cancelWithin($('active-conversation')); $('active-conversation').inert = false;
        effects?.cancelWithin($('message-list')); $('message-list').replaceChildren(); visibleNow($('typing-indicator'), false); visibleNow($('reply-preview'), false);
        $('active-conversation').hidden = true; $('conversation-placeholder').hidden = false; app.classList.remove('conversation-open');
        $('connection-status').hidden = true; $('new-messages-indicator').hidden = true; input.value = ''; draftEffect=null;draftEffectAll=false;draftText='';resizeInput();closeDialogs();
        pending = new Map(); sending = false; olderBusy = false; oldest = null; stateError = false;
    }
    function clear(preservePush=false) {
        if(user)window.HarzafiMessagePush?.clear(!preservePush);
        ++transitionRequest; for (const element of [...motions.keys()]) cancelMotion(element);
        clearChat(); globalStops.splice(0).forEach(stop => stop()); contacts.clear(); conversations = []; store = user = identity = null;
        deletedGroups=[];groupToDelete=groupToLeave='';groupDeletionBusy=groupExitBusy=false;restoringGroups.clear();verifiedAccounts.clear();
        $('deleted-group-list').replaceChildren();$('deleted-groups-section').hidden=true;$('deleted-groups-status').textContent='';
        inboxStops.forEach(stop=>stop());inboxStops.clear();inboxStates.clear();preferences.clear();clearInterval(inboxTimer);media?.destroy();
        notificationLast.clear();inboxReady=false;
        $('action-message-text').replaceChildren();$('attachment-preview').replaceChildren();$('group-members').replaceChildren();$('conversation-members').replaceChildren();
        preparedAttachment=null;recording?.cancel();recording=null;if(localPreview)URL.revokeObjectURL(localPreview);localPreview='';
        $('conversation-list').replaceChildren(); $('contact-list').replaceChildren(); $('conversation-search').value = ''; $('contact-search').value = '';
        $('messages-enable').disabled = false; enrollmentBusy = false;
        drafts.clear(); outbox.clear();effects?.clear();
        for(const id of ['edit-message-input','attachment-caption','group-title','poll-question'])$(id).value='';
        document.querySelectorAll('.poll-option-input').forEach(e=>e.value='');$('media-viewer-image').removeAttribute('src');
    }
    function connected() {
        const offline = !navigator.onLine;
        $('connection-status').hidden = !offline;
        $('connection-status').textContent = offline ? 'Sei offline. I nuovi messaggi saranno disponibili quando torni online.' : '';
        const unavailablePeer=!groupChat() && person(recipientUid).enabled === false;
        const voiceOpen=!$('voice-draft').hidden;
        input.hidden=voiceOpen;$('attach-message').hidden=voiceOpen;$('cancel-recording').hidden=!voiceOpen;
        $('send-message').hidden = voiceOpen || !input.value.trim(); $('voice-message').hidden = voiceOpen || !!input.value.trim();
        $('send-message').disabled = !activeId || !input.value.trim() || offline || sending || unavailablePeer;
        $('attach-message').disabled=$('voice-message').disabled=!activeId || offline || unavailablePeer || sending;
    }
    function resizeInput() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight || 34, 150) + 'px'; connected();syncEmojiDraft();syncEffectDraft(); }
    function chatError(error) {
        if (!activeId) return;
        $('history-status').textContent = error?.code === 'permission-denied' ? 'Questa conversazione non è disponibile per il tuo account.' : 'Non riesco ad aggiornare la conversazione. Torna all’elenco e riprova.';
        $('send-message').disabled = true; stopTyping();
    }
    function listDate(value) {
        const date = new Date(model.millis(value));
        if (!date.getTime()) return '';
        const today=new Date(),calendarDay=d=>Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()),elapsed=(calendarDay(today)-calendarDay(date))/86400000;
        if(elapsed===0)return time.format(date);
        if(elapsed===1)return 'ieri';
        if(elapsed>1&&elapsed<7)return new Intl.DateTimeFormat('it-IT',{weekday:'long'}).format(date);
        return new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'}).format(date);
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
            const meta=node('span','conversation-item-meta'),timestamp=node('time','',listDate({toMillis:()=>latestTime(c)})),updated=latestTime(c);
            if(updated){timestamp.dateTime=new Date(updated).toISOString();timestamp.title=day.format(updated)+' · '+time.format(updated);}
            const chevron=document.createElementNS('http://www.w3.org/2000/svg','svg');chevron.setAttribute('viewBox','0 0 12 20');chevron.setAttribute('class','conversation-chevron');chevron.setAttribute('aria-hidden','true');
            const chevronPath=document.createElementNS(chevron.namespaceURI,'path');chevronPath.setAttribute('d','m3.5 4.5 5.5 5.5-5.5 5.5');chevron.append(chevronPath);meta.append(timestamp,chevron);
            heading.append(nameLabel(c.kind==='group'?'':other,chatName(c),'strong'),meta);
            const writing=writers(c.id);let preview;
            if(writing.length){preview=node('span','conversation-typing');preview.setAttribute('aria-label',writing.map(([uid])=>nameOf(uid)).join(', ')+' sta scrivendo');for(let i=0;i<3;i++)preview.append(node('span','typing-dot'));preview.append(node('span','','Sta scrivendo…'));}
            else preview=node('span', 'conversation-preview', (c.lastSender === user.uid ? 'Tu: ' : '') + (c.lastText || 'Inizia la conversazione.'));
            copy.append(heading,preview);
            const readAt=Math.max(model.millis(preferences.get(c.id)?.readAt),model.millis(inboxStates.get(c.id)?.get(user.uid)?.readAt));
            const marker=node('span','conversation-status-marker');
            if(c.lastSender && c.lastSender!==user.uid && latestTime(c)>readAt){const dot=node('span','unread-dot');dot.setAttribute('role','img');dot.setAttribute('aria-label','Messaggi non letti');marker.append(dot);}
            button.append(marker,image,copy); button.addEventListener('click', () => selectConversation(c.id, other)); fragment.append(button);
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
            const copy = node('span'); copy.append(nameLabel(uid,p.name,'strong'), node('small', '', roleName(p.role)));
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
    function newConversation(event) {
        const dialog=$('new-message-dialog');dialog.dataset.inputMode=event?.detail===0?'keyboard':'pointer';
        $('contact-search').value='';renderContacts();openDialog(dialog);$('contact-search').focus({preventScroll:true});
    }
    $('new-message-dialog').addEventListener('pointerdown',()=>{$('new-message-dialog').dataset.inputMode='pointer';});
    $('new-message-dialog').addEventListener('keydown',event=>{if(event.key==='Tab')$('new-message-dialog').dataset.inputMode='keyboard';});
    function updateHeader() {
        const p = person(recipientUid); avatar($('conversation-avatar'), p); $('conversation-name').textContent = p.name;
        const c=conversation();if(c){chatAvatar($('conversation-avatar'),c);$('conversation-name').textContent=chatName(c);}
        const badge=verifiedBadge(c?.kind==='group'?'':recipientUid);$('conversation-verified').hidden=!badge;$('conversation-verified').replaceChildren(...(badge?[badge.firstChild]:[]));
        $('conversation-verified').setAttribute('role','img');$('conversation-verified').setAttribute('aria-label','Account ufficiale · Amministratore di Harzafi FSL');
        $('conversation-role').textContent = p.role ? roleName(p.role) : ''; $('conversation-info').setAttribute('aria-label', 'Informazioni sulla conversazione con ' + p.name); connected();
    }
    function start() {
        const current = version;
        window.HarzafiMessagePush?.start(user);
        $('messages-gate').hidden = true; app.hidden = false;
        motion(app, 'conversation', true, {duration:360});
        globalStops.push(store.badges(snapshot=>{
            if(current!==version)return;verifiedAccounts=new Set(snapshot.docs.filter(d=>d.data().enabled===true&&d.data().kind==='administrator').map(d=>d.id));
            renderConversations();renderContacts();if(activeId){updateHeader();renderMessages();}
        },()=>{if(current===version){verifiedAccounts.clear();renderConversations();renderContacts();if(activeId){updateHeader();renderMessages();}}}));
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
            const all = snapshot.docs.map(d => ({ ...d.data(), id:d.id })).filter(c => Array.isArray(c.members) && c.members.includes(user.uid));
            deletedGroups=all.filter(c=>c.kind==='group'&&c.deletedAt&&groupOwner(c)===user.uid);
            conversations=all.filter(c=>!c.deletedAt);renderDeletedGroups();
            if(activeId&&!conversations.some(c=>c.id===activeId)){
                clearChat(false);$('new-conversation').focus({preventScroll:true});
            }
            for(const c of conversations){if(inboxReady&&notificationLast.get(c.id)!==c.lastMessageId&&c.lastSender!==user.uid&&c.lastMessageId&&!preferences.get(c.id)?.muted)window.HarzafiMessageNotifications?.notify(c.id);notificationLast.set(c.id,c.lastMessageId);}inboxReady=true;
            syncInbox(); renderConversations();if(activeId){updateHeader();if($('conversation-details').open)updateGroupControls();}
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
        const draft = drafts.get(id); input.value = draft?.text || ''; replyTo = draft?.replyTo || ''; draftEffect=draft?.textEffect||null;draftEffectAll=!!draft?.effectAll;draftText=input.value;resizeInput();
        if (replyTo) { const original = quotes.get(replyTo); $('reply-name').textContent = 'Risposta al messaggio'; $('reply-text').textContent = original?.text || 'Il messaggio originale verrà richiamato nella risposta.'; reveal($('reply-preview'), true); }
        $('active-conversation').hidden = false; $('conversation-placeholder').hidden = true; app.classList.add('conversation-open');
        updateHeader();applyPreferences(); renderConversations(); status(); $('history-status').textContent = 'Caricamento dei messaggi…'; $('load-older').hidden = true;
        let initial = true;
        chatStops.push(store.listen(id, snapshot => {
            if (current !== chatVersion || id !== activeId) return;
            const stick = (initial || nearBottom()) && !$('reply-thread').open;
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
    function cancelMessagePress(){clearTimeout(longPressTimer);pressTarget?.classList.remove('message-pressing');pressTarget=null;}
    function openActions(id) {
        const message = messages.get(id); if (!message || message.pending || message.failed) return;
        cancelMessagePress();if($('message-actions').open&&actionId===id)return;
        const source=rowNodes.get(id)?.querySelector('.message-bubble'),preview=$('action-message-text');actionOriginRect=source?.getBoundingClientRect();
        const sourceStyle=source?getComputedStyle(source):null;
        actionId = id; preview.replaceChildren(); $('action-status').textContent = '';
        preview.setAttribute('aria-label','Messaggio selezionato: '+(message.text||previewText(message)));
        preview.style.setProperty('--context-font-size',Math.min(21,(parseFloat(sourceStyle?.fontSize)||16)*1.15)+'px');
        preview.style.setProperty('--context-background',sourceStyle?.backgroundColor||(message.senderUid===user.uid?'#008aff':'#e9e9eb'));preview.style.setProperty('--context-foreground',sourceStyle?.color||(message.senderUid===user.uid?'#fff':'#1d1d1f'));
        preview.style.minWidth=actionOriginRect?Math.min(actionOriginRect.width*1.08,Math.max(0,window.innerWidth-64),436)+'px':'';
        preview.classList.toggle('has-media',!!message.attachment);
        if(source){const content=node('div','message-preview-content'),clone=source.cloneNode(true);content.inert=true;for(const element of clone.querySelectorAll('[id]'))element.removeAttribute('id');for(const element of clone.querySelectorAll('audio'))element.remove();for(const element of clone.querySelectorAll('video'))element.replaceWith(node('span','',previewText(message)));for(const element of clone.querySelectorAll('button,input,select,textarea'))element.disabled=true;for(const element of clone.querySelectorAll('a'))element.removeAttribute('href');content.append(...clone.childNodes);preview.append(content);}
        else preview.textContent=message.text||previewText(message);
        $('action-message-text').classList.toggle('own',message.senderUid===user.uid);
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
        const message = messages.get(id) || quotes.get(id); if (!message?.senderUid) return;
        replyTo = id; $('reply-name').textContent = 'Risposta a ' + nameOf(message.senderUid); $('reply-text').textContent = previewText(message);
        const current = chatVersion; reveal($('reply-preview'), true); await dismiss($('message-actions')); if (current === chatVersion) { input.focus(); resizeInput(); bottom(); }
    }
    function threadLabel(thread) {
        if (!thread?.ready || thread.cacheOnly) return 'Mostra risposte';
        const count = thread.rows.size;
        return thread.more ? thread.limit + '+ risposte' : count + (count === 1 ? ' risposta' : ' risposte');
    }
    function updateThreadLinks() {
        for (const button of document.querySelectorAll('.message-replies-link')) {
            const thread = replyThreads.get(button.dataset.threadId);
            button.textContent = threadLabel(thread);
            button.setAttribute('aria-label', threadLabel(thread) + ' a ' + nameOf((messages.get(button.dataset.threadId) || quotes.get(button.dataset.threadId))?.senderUid));
        }
    }
    function subscribeReplies(thread) {
        thread.stop?.(); thread.error = false; thread.loading = true;
        const current = chatVersion, request = ++thread.request;
        thread.stop = store.replies(activeId, thread.id, snapshot => {
            if (current !== chatVersion || request !== thread.request) return;
            thread.rows = new Map(snapshot.docs.slice(0,thread.limit).map(doc => [doc.id,{ ...doc.data(), id:doc.id }]));
            thread.more = snapshot.docs.length > thread.limit;
            thread.cacheOnly = !!snapshot.metadata?.fromCache;
            thread.ready = true; thread.loading = false;
            updateThreadLinks(); renderThread();
        }, () => {
            if (current !== chatVersion || request !== thread.request) return;
            thread.error = true; thread.loading = false; updateThreadLinks(); renderThread();
        }, thread.limit);
    }
    function ensureThread(id) {
        if (!id || !activeId || replyThreads.has(id)) return replyThreads.get(id);
        const thread = { id, rows:new Map(), limit:100, request:0, ready:false, loading:true, more:false, error:false };
        replyThreads.set(id,thread);
        const current = chatVersion;
        chatStops.push(store.watchMessage(activeId,id,snapshot => {
            if (current !== chatVersion) return;
            quotes.set(id,snapshot.exists ? { ...snapshot.data(), id } : { text:'Messaggio non disponibile', senderUid:'' });
            if(snapshot.exists&&messages.has(id))messages.set(id,{...snapshot.data(),id});
            renderMessages(); renderThread();
        }, () => {
            if (current !== chatVersion) return;
            quotes.set(id,{ text:'Messaggio non disponibile', senderUid:'' }); renderMessages(); renderThread();
        }));
        chatStops.push(() => thread.stop?.()); subscribeReplies(thread);
        return thread;
    }
    function repliesButton(id) {
        const button = node('button','message-replies-link',threadLabel(replyThreads.get(id)));
        button.type = 'button'; button.dataset.threadId = id;
        button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','reply-thread');
        button.addEventListener('click',() => openReplyThread(id));
        return button;
    }
    function replyContext(id, original) {
        const context = node('div','message-reply-context'); context.dataset.replyRoot = id;
        const image = node('span','reply-parent-avatar'); image.setAttribute('aria-hidden','true'); avatar(image,person(original.senderUid));
        const content = node('div','reply-parent-content'), source = node('button','reply-parent-bubble'); source.type = 'button';
        source.setAttribute('aria-label','Vai al messaggio originale di ' + nameOf(original.senderUid) + ': ' + previewText(original));
        source.append(node('span','reply-parent-text',previewText(original)));
        source.addEventListener('click',() => jumpTo(id));
        content.append(source,repliesButton(id)); context.append(image,content); return context;
    }
    function replyConnector() {
        const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 44 46');svg.setAttribute('class','reply-connector');svg.setAttribute('aria-hidden','true');
        const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d','M4 2v10c0 18 12 29 30 29h6');svg.append(path);return svg;
    }
    function openReplyThread(id) {
        if (!activeId) return;
        clearTimeout(readTimer);
        openThreadId = id; $('reply-thread').dataset.renderSignature=''; ensureThread(id); renderThread(); $('thread-scroll').scrollTop=0; openDialog($('reply-thread'));
    }
    function renderThread() {
        if (!openThreadId || !activeId) return;
        const id=openThreadId, thread=replyThreads.get(id); if (!thread) return;
        const original=quotes.get(id) || messages.get(id);
        const rows=[...thread.rows.values()].sort((a,b)=>model.millis(a.createdAt)-model.millis(b.createdAt)||a.id.localeCompare(b.id));
        const signature=JSON.stringify([id,original,thread.loading,thread.error,thread.more,thread.cacheOnly,thread.limit,rows,rows.map(message=>[nameOf(message.senderUid),verifiedAccounts.has(message.senderUid)]),nameOf(original?.senderUid),verifiedAccounts.has(original?.senderUid)]);
        if($('reply-thread').dataset.renderSignature===signature)return;
        $('reply-thread').dataset.renderSignature=signature;
        $('thread-original').replaceChildren();
        if (original) {
            $('thread-original').append(nameLabel(original.senderUid,nameOf(original.senderUid),'strong'),node('span','',previewText(original)));
            $('thread-reply').disabled=!original.senderUid;
        } else { $('thread-original').append(node('span','','Caricamento del messaggio originale…')); $('thread-reply').disabled=true; }
        $('thread-summary').textContent=threadLabel(thread);
        $('thread-status').textContent=thread.error ? 'Non è stato possibile aggiornare le risposte. Controlla la connessione e riprova.' : thread.loading ? 'Caricamento delle risposte…' : thread.cacheOnly ? 'Risposte salvate su questo dispositivo. Il riepilogo completo si aggiorna quando torni online.' : thread.more ? 'Altre risposte sono disponibili. Caricale per completare la conversazione.' : !thread.rows.size ? 'Non ci sono ancora risposte a questo messaggio.' : '';
        $('thread-more').hidden=!thread.more&&!thread.error;
        $('thread-more').disabled=thread.loading;
        $('thread-more').textContent=thread.error ? 'Riprova' : 'Carica altre risposte';
        const list=$('thread-replies'), top=$('thread-scroll').scrollTop, focused=document.activeElement;
        const focusId=focused?.dataset.threadMessage;
        const fragment=document.createDocumentFragment();
        for (const message of rows) {
            const own=message.senderUid===user.uid, item=node('li','thread-reply'+(own?' own':''));
            item.append(nameLabel(message.senderUid,nameOf(message.senderUid),'strong'));
            const bubble=node('div','thread-reply-bubble');const body=node('span','message-text');effects.render(body,previewText(message),message.textEffect);bubble.append(body);
            if(message.editedAt)bubble.append(node('small','message-edited','Modificato'));
            item.append(bubble);
            const meta=node('div','thread-reply-meta');const date=model.millis(message.createdAt);
            if(date)meta.append(node('time','',day.format(date)+' · '+time.format(date)));
            const locate=node('button','thread-locate','Mostra nella chat');locate.type='button';locate.dataset.threadMessage=message.id;
            locate.addEventListener('click',async()=>{const current=chatVersion;await dismiss($('reply-thread'));if(current===chatVersion)jumpTo(message.id);});
            meta.append(locate);item.append(meta);fragment.append(item);
        }
        list.replaceChildren(fragment);$('thread-scroll').scrollTop=top;
        if(focusId)[...list.querySelectorAll('[data-thread-message]')].find(button=>button.dataset.threadMessage===focusId)?.focus({preventScroll:true});
    }
    $('thread-original').addEventListener('click',async()=>{const id=openThreadId,current=chatVersion;await dismiss($('reply-thread'));if(current===chatVersion&&id)jumpTo(id);});
    $('thread-reply').addEventListener('click',async()=>{const id=openThreadId,current=chatVersion;await dismiss($('reply-thread'));if(current===chatVersion&&id)startReply(id);});
    $('thread-more').addEventListener('click',()=>{const thread=replyThreads.get(openThreadId);if(!thread||thread.loading)return;if(!thread.error)thread.limit+=100;subscribeReplies(thread);renderThread();});
    $('reply-thread').addEventListener('close',()=>{if($('reply-thread').open)return;openThreadId='';$('reply-thread').dataset.renderSignature='';$('thread-original').replaceChildren();$('thread-replies').replaceChildren();scheduleRead();});
    function renderMessages({animate = false} = {}) {
        if (!activeId) return;
        const values = [...messages.values()].sort((a, b) => (model.millis(a.createdAt) || a.localTime || Date.now()) - (model.millis(b.createdAt) || b.localTime || Date.now()) || a.id.localeCompare(b.id));
        const replyParents=new Set(values.filter(message=>message.replyTo).map(message=>message.replyTo));
        let previous;
        for (let index = 0; index < values.length; index++) {
            const message = values[index], own = message.senderUid === user.uid, date = model.millis(message.createdAt) || message.localTime || Date.now();
            const showDate = !previous || new Date(date).toDateString() !== new Date(model.millis(previous.createdAt) || previous.localTime).toDateString();
            const grouped = !message.replyTo && !previous?.replyTo && !showDate && previous?.senderUid === message.senderUid && date - (model.millis(previous.createdAt) || previous.localTime) < 120000;
            const quoted = quoteFor(message), lastOwn = own && !values.slice(index + 1).some(m => m.senderUid === user.uid);
            const peerRead = peers().length>0 && peers().every(uid=>model.millis(states.get(uid)?.readAt)>=date);
            const signature = JSON.stringify([message, quoted, showDate, grouped, lastOwn, peerRead, verifiedAccounts.has(message.senderUid),replyParents.has(message.id)]);
            let row = rowNodes.get(message.id); const isNew = !row;
            if (!row) { row = node('li', 'message-row'); row.dataset.messageId = message.id; rowNodes.set(message.id, row); }
            if (row.dataset.signature !== signature) {
                const transcriptOpen = row.querySelector('.message-transcript')?.open;
                const mediaKey=JSON.stringify(message.attachment);
                const reusableAudio=row.dataset.mediaKey===mediaKey?row.querySelector('.message-audio'):null;
                if(!reusableAudio)row.querySelector('.message-audio')?.audioController?.destroy();
                if(reusableAudio&&message.transcript){const details=reusableAudio.querySelector('.message-transcript');const wasTranscribed=details.classList.contains('has-transcript');details.querySelector('p').textContent=message.transcript;details.querySelector('.transcribe-audio')?.remove();details.classList.add('has-transcript');if(!wasTranscribed)details.open=true;}
                row.dataset.mediaKey=mediaKey;
                row.querySelectorAll('[data-reply-root]').forEach(element=>replyObserver.unobserve(element));
                const textKey=JSON.stringify([message.text,message.textEffect?.name,message.textEffect?.start,message.textEffect?.end]), reusableText=row.dataset.textKey===textKey?row.querySelector('.message-text'):null;
                if(reusableText)reusableText.remove();row.dataset.textKey=textKey;
                effects?.cancelWithin(row);row.dataset.signature = signature; row.replaceChildren(); row.className = 'message-row' + (own ? ' own' : '') + (grouped ? ' grouped' : '') + (quoted ? ' has-reply' : '');
                if (showDate) row.append(node('div', 'message-date', day.format(date) + ' · ' + time.format(date)));
                const cluster = node('div', 'message-cluster'), bubble = node('div', 'message-bubble');
                if (quoted) {
                    row.append(replyContext(message.replyTo,quoted));
                }
                if(groupChat()&&!own&&!grouped){const sender=nameLabel(message.senderUid,nameOf(message.senderUid),'strong');sender.classList.add('message-sender');bubble.append(sender);}
                if(message.type==='poll')renderPoll(bubble,message);
                else {if(reusableAudio)bubble.append(reusableAudio);else if(message.attachment)renderMedia(bubble,message);if(message.text){const body=reusableText||node('span','message-text');if(!reusableText)effects.render(body,message.text,message.textEffect);bubble.append(body);}}
                if (transcriptOpen && bubble.querySelector('.message-transcript')) bubble.querySelector('.message-transcript').open = true;
                if(message.editedAt)bubble.append(node('span','message-edited','Modificato'));
                const actions = node('button', 'bubble-actions', '•••'); actions.type = 'button'; actions.setAttribute('aria-label', 'Azioni del messaggio: ' + message.text.slice(0, 60)); actions.disabled = !!message.pending || !!message.failed;
                actions.addEventListener('click', () => openActions(message.id));
                bubble.addEventListener('contextmenu', event => { if(event.target.closest('button,input,a,audio,video,summary'))return;event.preventDefault();openActions(message.id); });
                bubble.addEventListener('dblclick', event => {if(!event.target.closest('button,input,a,audio,video,summary'))openActions(message.id);});
                let pressPoint;
                bubble.addEventListener('pointerdown', event => { if(event.button!==0||event.isPrimary===false||event.target.closest('button,input,a,audio,video,summary'))return;cancelMessagePress();pressTarget=bubble;bubble.classList.add('message-pressing');pressPoint=[event.clientX,event.clientY];suppressClick=false;longPressTimer=setTimeout(()=>{suppressClick=true;openActions(message.id);},450); });
                bubble.addEventListener('pointermove', event => { if(pressTarget===bubble&&pressPoint&&Math.hypot(event.clientX-pressPoint[0],event.clientY-pressPoint[1])>10)cancelMessagePress(); });
                for(const name of ['pointerup','pointercancel'])bubble.addEventListener(name,()=>{if(pressTarget===bubble)cancelMessagePress();pressPoint=null;});
                bubble.addEventListener('click', event => { if (suppressClick) { event.preventDefault(); suppressClick = false; } });
                cluster.append(bubble, actions);
                if(quoted){const response=node('div','reply-response');response.append(replyConnector(),cluster);row.append(response);}else row.append(cluster);
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
                if(replyParents.has(message.id)){const link=repliesButton(message.id);link.dataset.replyRoot=message.id;row.append(link);}
                if (own && (lastOwn || message.failed || message.pending)) {
                    const meta = node('div', 'message-meta', message.failed ? 'Invio non riuscito' : message.pending ? 'Invio…' : peerRead ? 'Letto' : 'Inviato');
                    if (message.failed) { const retry = node('button', '', 'Riprova'); retry.type = 'button'; retry.addEventListener('click', () => retrySend(message.id)); meta.append(retry); } row.append(meta);
                }
                if(message.textEffect && !message.editedAt){const replay=node('button','effect-replay','Riproduci effetto');replay.type='button';replay.setAttribute('aria-label','Riproduci effetto '+(effects.labels[message.textEffect.name]||''));replay.addEventListener('click',()=>effects.play(row.querySelector('.message-text'),message.textEffect));row.append(replay);}
                row.querySelectorAll('[data-reply-root]').forEach(element=>replyObserver.observe(element));
            }
            // Reuse nodes so focus and a user's place in the conversation survive updates.
            const existing = $('message-list').children[index]; if (existing !== row) $('message-list').insertBefore(row, existing || null);
            if (isNew && animate && (animate !== 'history' || index >= values.length - 6)) motion(row, 'message', true, {duration:300,delay:animate === 'history' ? Math.max(0, index - values.length + 6) * 24 : 0});
            if(animate && message.textEffect && !message.editedAt && !message.failed){const body=row.querySelector('.message-text');if(body)effects.schedule(body,message.textEffect,user.uid+'/'+activeId+'/'+message.id);}
            previous = message;
        }
        updateThreadLinks(); renderThread();
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
            const panel=node('div','message-audio'),player=audioUI.player({source:load,duration:attachment.duration,media});panel.audioController=player;panel.append(player.element);
            const audioObserver=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){audioObserver.disconnect();player.prepare().catch(()=>{});}},{root:scroll,rootMargin:'500px'});
            audioObserver.observe(panel);chatStops.push(()=>audioObserver.disconnect());
            chatStops.push(()=>player.destroy());
            const details=node('details','message-transcript');details.append(node('summary','','Trascrizione automatica'));
            details.open=!!message.transcript;
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
                        transcribe.remove();details.classList.add('has-transcript');
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
            if(message.transcript)details.classList.add('has-transcript');
            panel.append(details);bubble.append(panel);
        } else {
            const button=node('button','message-document');button.type='button';button.setAttribute('aria-label','Scarica '+attachment.name);
            const icon=node('span','document-icon');icon.setAttribute('aria-hidden','true');icon.append(node('span','document-fold'));
            const copy=node('span','document-copy');copy.append(node('strong','',attachment.name),node('small','',documentKind(attachment)+' · '+formatSize(attachment.size)));button.append(icon,copy);
            button.addEventListener('click',async()=>{button.disabled=true;button.setAttribute('aria-busy','true');try{const url=await load();if(current!==chatVersion)return;const a=node('a');a.href=url;a.download=attachment.name;a.click();}catch(_){if(current===chatVersion)status('Il file non è disponibile. Riprova.',true);}finally{button.disabled=false;button.removeAttribute('aria-busy');}});bubble.append(button);
        }
    }
    function documentKind(attachment){const mime=attachment.mime||'';if(mime.includes('pdf'))return 'Documento PDF';if(/word|rtf/.test(mime))return 'Documento di testo';if(/sheet|excel|csv/.test(mime))return 'Foglio di calcolo';if(/presentation|powerpoint/.test(mime))return 'Presentazione';if(/zip/.test(mime))return 'Archivio ZIP';return 'Documento';}
    function formatSize(size){return size<1048576?Math.max(1,Math.round(size/1024))+' KB':(size/1048576).toFixed(1)+' MB';}
    $('edit-message-action').addEventListener('click',async()=>{const message=messages.get(actionId);if(!message||message.senderUid!==user.uid)return;const current=chatVersion;await dismiss($('message-actions'));if(current!==chatVersion)return;$('edit-message-input').value=message.text;$('edit-message-status').textContent='';openDialog($('edit-message-dialog'));$('edit-message-input').focus();});
    $('edit-message-form').addEventListener('submit',async event=>{event.preventDefault();const current=chatVersion;$('save-message-edit').disabled=true;try{await store.edit(activeId,actionId,$('edit-message-input').value);if(current===chatVersion)await dismiss($('edit-message-dialog'));}catch(_){if(current===chatVersion)$('edit-message-status').textContent='Non è stato possibile salvare la modifica. Controlla il testo e riprova.';}finally{$('save-message-edit').disabled=false;}});
    $('select-message-action').addEventListener('click',async()=>{const id=actionId,current=chatVersion;await dismiss($('message-actions'));if(current!==chatVersion)return;const text=rowNodes.get(id)?.querySelector('.message-text');if(text){const range=document.createRange();range.selectNodeContents(text);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);}});
    $('new-group').addEventListener('click',async()=>{const current=version;await dismiss($('new-message-dialog'));if(current!==version)return;$('group-title').value='';$('group-status').textContent='';$('group-members').replaceChildren();for(const [uid,p]of contacts){if(uid===user.uid||!p.enabled)continue;const label=node('label','contact-choice'),image=node('span','person-avatar'),copy=node('span'),check=node('input');avatar(image,p);copy.append(node('strong','',p.name),node('small','',roleName(p.role)));check.type='checkbox';check.dataset.groupMember=uid;label.append(image,copy,check);$('group-members').append(label);}openDialog($('new-group-dialog'));});
    $('group-form').addEventListener('submit',async event=>{event.preventDefault();const members=[...$('group-members').querySelectorAll('input:checked')].map(e=>e.dataset.groupMember);if(members.length<2||members.length>29){$('group-status').textContent='Scegli da 2 a 29 persone.';return;}const current=version;$('create-group').disabled=true;try{const id=await store.createGroup(members,$('group-title').value);if(current!==version)return;await dismiss($('new-group-dialog'));selectConversation(id,members[0]);}catch(_){if(current===version)$('group-status').textContent='Non è stato possibile creare il gruppo. Riprova.';}finally{$('create-group').disabled=false;}});
    function renderDeletedGroups(){
        $('deleted-groups-section').hidden=!deletedGroups.length;$('deleted-group-list').replaceChildren();
        for(const group of deletedGroups){
            const row=node('div','deleted-group-row'),copy=node('span');
            copy.append(node('strong','',group.title||'Conversazione di gruppo'),node('small','',group.members.length+' partecipanti'));
            const button=node('button','restore-group','Ripristina');button.type='button';button.disabled=restoringGroups.has(group.id);
            button.setAttribute('aria-label','Ripristina il gruppo '+(group.title||'senza nome'));
            button.addEventListener('click',async()=>{
                if(restoringGroups.has(group.id))return;
                const session=version,writer=store;restoringGroups.add(group.id);button.disabled=true;$('deleted-groups-status').textContent='';
                try{await writer.setGroupDeleted(group.id,false);if(session===version)$('settings-message-status').textContent='Gruppo ripristinato. Lo trovi nell’elenco delle conversazioni.';}
                catch(_){if(session===version)$('deleted-groups-status').textContent='Non è stato possibile ripristinare il gruppo. Controlla la connessione e riprova.';}
                finally{if(session===version){restoringGroups.delete(group.id);button.disabled=false;}}
            });row.append(copy,button);$('deleted-group-list').append(row);
        }
    }
    function updateGroupControls(){
        const group=conversation(),isGroup=group?.kind==='group';
        $('leave-group').hidden=!isGroup;$('delete-group').hidden=!isGroup||groupOwner(group)!==user.uid;
        $('group-owner-note').hidden=!isGroup;$('group-owner-note').textContent=isGroup?'Gestito da '+(groupOwner(group)===user.uid?'te':nameOf(groupOwner(group)))+'.':'';
    }
    async function details(){applyPreferences();$('conversation-preferences-status').textContent='';$('conversation-members').replaceChildren();for(const uid of conversation()?.members || [])$('conversation-members').append(nameLabel(uid,nameOf(uid),'p'));updateGroupControls();openDialog($('conversation-details'));}
    $('delete-group').addEventListener('click',async()=>{
        const group=conversation(),session=version,cid=activeId;if(group?.kind!=='group'||groupOwner(group)!==user.uid)return;
        await dismiss($('conversation-details'));if(session!==version||cid!==activeId)return;
        groupToDelete=cid;$('delete-group-copy').textContent='Stai per eliminare «'+(group.title||'Conversazione di gruppo')+'».';
        $('delete-group-status').textContent='';$('confirm-delete-group').disabled=false;openDialog($('delete-group-dialog'));
    });
    $('leave-group').addEventListener('click',async()=>{
        const group=conversation(),session=version,cid=activeId;if(group?.kind!=='group')return;
        await dismiss($('conversation-details'));if(session!==version||cid!==activeId)return;
        groupToLeave=cid;const remaining=group.members.filter(uid=>uid!==user.uid),transfer=groupOwner(group)===user.uid&&remaining.length>0;
        $('group-successor-field').hidden=!transfer;$('group-successor').replaceChildren();
        if(transfer){const placeholder=node('option','','Scegli una persona');placeholder.value='';placeholder.disabled=true;placeholder.selected=true;$('group-successor').append(placeholder);for(const uid of remaining){const option=node('option','',nameOf(uid));option.value=uid;$('group-successor').append(option);}}
        $('leave-group-copy').textContent=!remaining.length?'Sei l’ultimo partecipante. Uscendo, il gruppo verrà spostato tra i gruppi eliminati. Potrai ripristinarlo dalle impostazioni di Messaggi.':transfer?'Affida la gestione di «'+(group.title||'Conversazione di gruppo')+'» a un altro partecipante. Dopo l’uscita non potrai più consultare la chat o inviare messaggi; il gruppo continuerà per gli altri.':'Uscendo da «'+(group.title||'Conversazione di gruppo')+'» non potrai più consultare la chat o inviare messaggi. Il gruppo continuerà per gli altri partecipanti.';
        $('confirm-leave-group').disabled=transfer;$('leave-group-status').textContent='';openDialog($('leave-group-dialog'));
    });
    $('group-successor').addEventListener('change',()=>{$('confirm-leave-group').disabled=!$('group-successor').value;});
    $('confirm-leave-group').addEventListener('click',async()=>{
        if(groupExitBusy||!groupToLeave)return;
        const cid=groupToLeave,session=version,writer=store;groupExitBusy=true;$('confirm-leave-group').disabled=true;$('leave-group-status').textContent='Uscita dal gruppo in corso…';
        try{await writer.leaveGroup(cid,$('group-successor').value);if(session!==version)return;groupExitBusy=false;if(activeId===cid)clearChat(false);else await dismiss($('leave-group-dialog'));$('new-conversation').focus({preventScroll:true});}
        catch(error){if(session===version)$('leave-group-status').textContent=error.code==='group-successor-required'?'Scegli chi gestirà il gruppo prima di uscire.':'Non è stato possibile uscire dal gruppo. Controlla la connessione e riprova.';}
        finally{if(session===version){groupExitBusy=false;$('confirm-leave-group').disabled=false;}}
    });
    $('confirm-delete-group').addEventListener('click',async()=>{
        if(groupDeletionBusy||!groupToDelete)return;
        const cid=groupToDelete,session=version,writer=store;groupDeletionBusy=true;$('confirm-delete-group').disabled=true;
        try{await writer.setGroupDeleted(cid,true);if(session!==version)return;groupDeletionBusy=false;
            if(activeId===cid)clearChat(false);else await dismiss($('delete-group-dialog'));
            $('new-conversation').focus({preventScroll:true});
        }catch(_){if(session===version)$('delete-group-status').textContent='Il gruppo non è stato eliminato. Controlla la connessione e riprova.';}
        finally{if(session===version){groupDeletionBusy=false;$('confirm-delete-group').disabled=false;}}
    });
    // Preferences are private to the signed-in account and sync to its devices.
    async function savePreference(key,value){const current=chatVersion;try{await store.saveConversationSettings(activeId,{[key]:value});}catch(_){if(current===chatVersion){applyPreferences();$('conversation-preferences-status').textContent='Non è stato possibile salvare la preferenza.';}}}
    $('mute-conversation').addEventListener('change',()=>savePreference('muted',$('mute-conversation').checked));
    document.querySelectorAll('input[name="chat-background"]').forEach(option=>option.addEventListener('change',()=>{if(option.checked)savePreference('background',option.value);}));
    $('conversation-details').addEventListener('close',()=>{$('conversation-members').replaceChildren();});
    $('conversation-info').addEventListener('click',details);$('conversation-encryption').addEventListener('click',details);
    function syncEffectDraft() {
        $('effect-draft').hidden=!draftEffect;
        $('change-text-effect').textContent=draftEffect?'Effetto: '+effects.labels[draftEffect.name]:'';
    }
    function previewEffect() {
        const value=input.value.trim()||'Un messaggio speciale ✨';
        const effect=draftEffect?{...draftEffect,...(!input.value.trim()?{start:0,end:value.length}:{})}:null;
        effects.cancelWithin($('effect-preview'));effects.render($('effect-preview'),value,effect);
        for(const button of $('effect-choices').children)button.setAttribute('aria-pressed',String(button.dataset.effect===effect?.name));
        requestAnimationFrame(()=>{if($('text-effects-dialog').open)effects.play($('effect-preview'),effect);});
        syncEffectDraft();
    }
    async function chooseTextEffects(fromMenu=false) {
        const raw=input.value, trimStart=raw.length-raw.trimStart().length, value=raw.trim();
        const selected=input.selectionEnd>input.selectionStart;
        let start=Math.max(0,input.selectionStart-trimStart),end=Math.min(value.length,input.selectionEnd-trimStart);
        if(selected&&typeof Intl.Segmenter==='function'){
            const points=[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(value)].map(p=>p.index).concat(value.length);
            start=points.filter(p=>p<=start).at(-1)||0;end=points.find(p=>p>=end)??value.length;
        }
        effectSelection=selected&&end>start?{start,end}:{start:0,end:value.length};
        const current=chatVersion;
        if(fromMenu)await dismiss($('composer-menu'));
        if(current!==chatVersion||!activeId)return;
        openDialog($('text-effects-dialog'));previewEffect();
    }
    for(const [name,label]of Object.entries(effects.labels)){
        const button=node('button','effect-choice',label);button.type='button';button.dataset.effect=name;button.setAttribute('aria-pressed','false');
        button.addEventListener('click',()=>{draftEffect={name,...effectSelection};draftEffectAll=effectSelection.start===0&&effectSelection.end===input.value.trim().length;draftText=input.value;previewEffect();});
        $('effect-choices').append(button);
    }
    $('choose-text-effects').addEventListener('click',()=>chooseTextEffects(true));
    $('change-text-effect').addEventListener('click',()=>chooseTextEffects());
    $('clear-text-effect').addEventListener('click',()=>{draftEffect=null;syncEffectDraft();});
    $('effect-none').addEventListener('click',()=>{draftEffect=null;previewEffect();});
    $('effect-done').addEventListener('click',()=>dismiss($('text-effects-dialog')));
    $('text-effects-dialog').addEventListener('close',()=>effects.cancelWithin($('effect-preview')));
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
    function resetAttachment(){preparedAttachment=null;attachmentId='';voicePreview?.destroy();voicePreview=null;if(localPreview)URL.revokeObjectURL(localPreview);localPreview='';$('attachment-preview').replaceChildren();$('voice-preview').replaceChildren();}
    function previewAttachment(prepared){$('attachment-preview').replaceChildren();const box=node('div','attachment-preview');box.append(node('strong','',prepared.name),node('small','',formatSize(prepared.size)));if(prepared.type==='image'){localPreview=URL.createObjectURL(prepared.file);const img=node('img');img.alt='Anteprima allegato';img.src=localPreview;box.prepend(img);}$('attachment-preview').append(box);}
    $('message-attachment-input').addEventListener('change',async event=>{const file=event.target.files[0];if(!file||!activeId)return;const current=chatVersion;resetAttachment();$('attachment-status').textContent='Preparo l’allegato…';$('send-attachment').disabled=true;$('attachment-caption').value='';openDialog($('attachment-dialog'));try{const prepared=await media.prepare(file);if(current!==chatVersion)return;preparedAttachment=prepared;previewAttachment(prepared);$('attachment-status').textContent='Foto ottimizzate · Audio fino a 8 MB · Video fino a 20 MB · File fino a 10 MB.';$('send-attachment').disabled=false;}catch(_){if(current===chatVersion)$('attachment-status').textContent='Formato non supportato o file troppo grande. Scegli un altro allegato.';}});
    async function sendAttachment(voice=false){if(!preparedAttachment||!activeId||sending||voiceBusy)return;const current=chatVersion,writer=store,cid=activeId,session=version,reply=replyTo,caption=voice?'':$('attachment-caption').value,members=conversation()?.members.slice() || [],sender=user,button=$(voice?'send-recording':'send-attachment'),notice=$(voice?'voice-status':'attachment-status');attachmentId ||= writer.newMessageId(cid);sending=true;button.disabled=true;if(voice){$('voice-draft').dataset.state='uploading';voicePreview?.audio.pause();$('cancel-recording').disabled=$('resume-recording').disabled=true;}connected();try{const attachment=await media.upload(cid,attachmentId,preparedAttachment,value=>{if(current===chatVersion)notice.textContent='Caricamento… '+Math.round(value)+'%';},writer);if(session!==version)return;await writer.sendMedia(cid,attachmentId,attachment,caption,reply);window.HarzafiMessagePush?.sent(cid,attachmentId,members,sender).catch(()=>{});if(current!==chatVersion)return;resetAttachment();replyTo='';reveal($('reply-preview'),false);if(voice)resetVoice();else await dismiss($('attachment-dialog'));bottom();}catch(_){if(current===chatVersion){if(voice)$('voice-draft').dataset.state='error';notice.textContent='Invio non riuscito. L’allegato rimane qui: riprova quando torni online.';}}finally{if(current===chatVersion){sending=false;button.disabled=false;if(voice){$('cancel-recording').disabled=false;$('resume-recording').disabled=voiceDuration()>=119.9;}connected();}}}
    $('send-attachment').addEventListener('click',()=>sendAttachment());$('send-recording').addEventListener('click',()=>sendAttachment(true));
    $('attachment-dialog').addEventListener('close',()=>{if(!sending)resetAttachment();});
    const voiceDuration=()=>voiceSegments.reduce((total,segment)=>total+(segment.duration||0),0);
    function resetVoice(){++voiceEpoch;recording?.cancel();recording=null;voiceBusy=false;voiceSegments=[];voicePreview?.destroy();voicePreview=null;liveWave=null;$('voice-draft').hidden=true;$('voice-status').textContent='';$('message-form').classList.remove('voice-mode');$('message-form').style.removeProperty('--voice-field-height');$('cancel-recording').disabled=false;connected();}
    async function stopRecording(){
        if(!recording||voiceBusy)return;
        const controller=recording,current=chatVersion,epoch=voiceEpoch;recording=null;voiceBusy=true;$('stop-recording').disabled=true;$('voice-draft').dataset.state='preparing';$('voice-status').textContent='Preparo l’anteprima…';
        try{
            const result=await controller.stop();if(current!==chatVersion||epoch!==voiceEpoch)return;
            voiceSegments.push(result);const prepared=await media.mergeRecordings(voiceSegments);if(current!==chatVersion||epoch!==voiceEpoch)return;
            preparedAttachment=prepared;if(localPreview)URL.revokeObjectURL(localPreview);localPreview=URL.createObjectURL(prepared.file);
            voicePreview?.destroy();voicePreview=audioUI.player({source:()=>localPreview,duration:prepared.duration,media});$('voice-preview').replaceChildren(voicePreview.element);voicePreview.prepare().catch(()=>{});
            $('voice-preview').hidden=false;$('voice-live').hidden=true;$('send-recording').hidden=false;$('stop-recording').hidden=true;$('resume-recording').hidden=false;$('resume-recording').disabled=voiceDuration()>=119.9;$('voice-resume-time').textContent=audioUI.clock(prepared.duration);$('voice-status').textContent='Ascolta, riprendi o invia il vocale.';$('voice-draft').dataset.state='preview';$('send-recording').focus({preventScroll:true});
        }catch(_){if(current===chatVersion&&epoch===voiceEpoch){$('voice-draft').dataset.state='error';$('voice-status').textContent='Non è stato possibile preparare il vocale. Puoi annullare e registrarlo di nuovo.';$('stop-recording').hidden=true;}}
        finally{if(epoch===voiceEpoch)voiceBusy=false;}
    }
    async function recordSegment(){
        if(voiceBusy||recording||voiceDuration()>=119.9)return;
        voiceBusy=true;const current=chatVersion,epoch=voiceEpoch,offset=voiceDuration();
        voicePreview?.destroy();voicePreview=null;$('voice-preview').replaceChildren();$('voice-preview').hidden=true;$('voice-live').hidden=false;$('resume-recording').hidden=$('send-recording').hidden=true;$('stop-recording').hidden=false;$('stop-recording').disabled=true;$('voice-draft').dataset.state='preparing';$('voice-timer').textContent=audioUI.clock(offset);$('voice-status').textContent='Preparo il microfono…';
        liveWave ||= audioUI.wave(Math.max(32,Math.min(160,Math.round($('voice-waveform').clientWidth/5))));$('voice-waveform').replaceChildren(liveWave.element);
        try{
            const controller=await media.startRecording({maxSeconds:120-offset,onTick:seconds=>{if(current===chatVersion&&epoch===voiceEpoch)$('voice-timer').textContent=audioUI.clock(Math.floor(offset+seconds));},onLevel:value=>{if(current===chatVersion&&epoch===voiceEpoch)liveWave?.push(value);},onLimit:stopRecording});
            if(current!==chatVersion||epoch!==voiceEpoch||$('voice-draft').hidden){controller.cancel();return;}
            recording=controller;preparedAttachment=null;attachmentId='';$('voice-draft').dataset.state='recording';$('stop-recording').disabled=false;$('voice-status').textContent='Registrazione in corso · Massimo 2 minuti';$('stop-recording').focus({preventScroll:true});
        }catch(_){if(current===chatVersion&&epoch===voiceEpoch){$('voice-draft').dataset.state='error';$('voice-status').textContent='Microfono non disponibile. Controlla i permessi del browser oppure allega un file audio.';$('stop-recording').hidden=true;}}
        finally{if(epoch===voiceEpoch)voiceBusy=false;}
    }
    $('voice-message').addEventListener('click',()=>{if(!activeId||sending||!$('voice-draft').hidden)return;const fieldHeight=document.querySelector('.composer-field').getBoundingClientRect().height;resetAttachment();resetVoice();stopTyping();input.blur();$('message-form').style.setProperty('--voice-field-height',fieldHeight+'px');$('message-form').classList.add('voice-mode');$('voice-draft').hidden=false;connected();recordSegment();});
    $('stop-recording').addEventListener('click',stopRecording);$('resume-recording').addEventListener('click',recordSegment);
    $('cancel-recording').addEventListener('click',()=>{if(sending)return;resetVoice();resetAttachment();$('voice-message').focus({preventScroll:true});});
    $('voice-draft').addEventListener('keydown',event=>{if(event.key==='Escape'&&!sending){event.preventDefault();$('cancel-recording').click();}});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&recording)stopRecording();});
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
        if (!activeId || document.hidden || !navigator.onLine || !nearBottom() || $('reply-thread').open) return;
        const id = activeId, current = chatVersion;
        readTimer = setTimeout(() => {
            if (current !== chatVersion || document.hidden || !nearBottom() || $('reply-thread').open) return;
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
            await writer.send(id, message.id, message.text, message.replyTo, message.textEffect || null);
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
        if(draftEffect){try{const effect=model.textEffect(draftEffect,text);if(effect)message.textEffect=effect;}catch(_){status('Seleziona di nuovo l’effetto per questo testo.',true);return;}}
        pending.set(id, message); input.value = '';draftEffect=null;draftEffectAll=false;draftText=''; replyTo = ''; reveal($('reply-preview'), false); status(); stopTyping(); resizeInput();
        await deliver(message);
    });
    input.addEventListener('input', () => {
        if(draftEffect){if(draftEffectAll)draftEffect={name:draftEffect.name,start:0,end:input.value.trim().length};else if(input.value!==draftText)draftEffect=null;}
        draftText=input.value;resizeInput();typing();
    });
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && window.matchMedia('(min-width:701px)').matches) { event.preventDefault(); $('message-form').requestSubmit(); } });
    input.addEventListener('blur', () => { stopTyping(); viewport(); });
    input.addEventListener('focus', viewport);
    scroll.addEventListener('scroll', () => { cancelMessagePress();viewportState.followLatest=nearBottom();if (viewportState.followLatest) { $('new-messages-indicator').hidden = true; scheduleRead(); } }, { passive:true });
    window.addEventListener('online', () => { connected(); scheduleRead(); }); window.addEventListener('offline', () => { stopTyping(); connected(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopTyping(); else { updateTyping(); scheduleRead(); } });
    function viewport() {
        const visual=window.visualViewport,scale=visual?.scale || 1;
        const height=Math.round(Math.max(1,Math.min(window.innerHeight,(visual?.height || window.innerHeight)*scale))*100)/100;
        const focused=document.activeElement===input,widthChanged=Math.abs(window.innerWidth-viewportState.width)>1;
        if(!focused||widthChanged)viewportState.baseline=window.innerHeight;
        else viewportState.baseline=Math.max(viewportState.baseline,window.innerHeight);
        const heightChanged=Math.abs(height-viewportState.height)>.5,scaleChanged=Math.abs(scale-viewportState.scale)>.01;
        if(heightChanged)document.documentElement.style.setProperty('--messages-height',height+'px');
        const keyboardOpen=focused&&viewportState.baseline-height>100;
        $('message-form').classList.toggle('keyboard-open', keyboardOpen);
        document.body.classList.toggle('messages-keyboard-open', keyboardOpen);
        if(activeId&&(heightChanged||widthChanged)&&!scaleChanged&&!$('reply-thread').open&&(viewportState.followLatest||(focused&&keyboardOpen))){
            const current=chatVersion;requestAnimationFrame(()=>{if(current===chatVersion&&activeId&&!$('reply-thread').open)bottom();});
        }
        Object.assign(viewportState,{width:window.innerWidth,height,scale});
    }
    window.visualViewport?.addEventListener('resize', viewport); window.addEventListener('resize', viewport); viewport();
    reduced.addEventListener('change', () => {
        if (!reduced.matches) return;
        $('message-actions').classList.remove('message-context-animating');
        for (const element of [...motions.keys()]) cancelMotion(element);
        for (const [element, show] of visibilityTargets) element.hidden = !show;
        for (const dialog of dialogs) if (dialog.open && dialogDesired.get(dialog) === false) dialog.close();
    });
    window.addEventListener('pagehide', () => { ++version; clear(true); });
    window.addEventListener('pageshow', event => { if (event.persisted) load(auth.currentUser); });
    if (!auth || !db || !model) gate('Messaggi', unavailable, { retry:true });
    else auth.onAuthStateChanged(load, () => { ++version; clear(); gate('Messaggi', unavailable, { retry:true }); });
})();
