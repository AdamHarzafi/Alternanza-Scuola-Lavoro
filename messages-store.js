(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.HarzafiMessages = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const REACTIONS = ['❤️', '👍', '👎', '😂', '‼️', '❓'];
    const MAX_LENGTH = 2000;
    const TEXT_EFFECTS = ['big', 'small', 'shake', 'nod', 'explode', 'ripple', 'bloom', 'jitter'];
    const MAX_GROUP_MEMBERS = 30;
    const BACKGROUNDS = ['default', 'paper', 'sky', 'mint', 'rose'];
    const MEDIA_LIMITS = { image:5 * 1024 * 1024, audio:8 * 1024 * 1024, video:20 * 1024 * 1024, file:10 * 1024 * 1024 };
    const RAW_CHUNK_BYTES = 262144, BASE64_CHUNK_CHARS = 349528, MAX_CHUNKS = 80;
    const MEDIA_MIMES = {
        image:['image/jpeg','image/png','image/webp','image/gif'],
        audio:['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav','audio/aac'],
        video:['video/mp4','video/webm','video/quicktime'],
        file:['application/pdf','text/plain','text/csv','application/zip','application/x-zip-compressed','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/rtf','application/octet-stream']
    };
    const millis = value => value?.toMillis?.() || (value instanceof Date ? value.getTime() : Number(value) || 0);
    const clean = value => typeof value === 'string' ? value.trim() : '';
    const groupOwner = value => value?.ownerUid || value?.createdBy || '';
    const failure = code => Object.assign(new Error(code), { code });
    function messageText(value) {
        const text = clean(value).replace(/\r\n?/g, '\n');
        if (!text) throw failure('empty-message');
        if (text.length > MAX_LENGTH) throw failure('message-too-long');
        return text;
    }
    function conversationId(a, b) {
        if (!a || !b || a === b || [a, b].some(v => typeof v !== 'string' || v.includes('/') || v.includes('~'))) throw failure('invalid-recipient');
        return [a, b].sort().join('~');
    }
    function textEffect(value, text) {
        if (value == null) return null;
        if (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'end,name,start'
            || !TEXT_EFFECTS.includes(value.name) || !Number.isInteger(value.start) || !Number.isInteger(value.end)
            || value.start < 0 || value.end <= value.start || value.end > text.length) throw failure('invalid-text-effect');
        const boundaries = new Set([0, text.length]);
        if (typeof Intl.Segmenter === 'function') {
            for (const part of new Intl.Segmenter(undefined, {granularity:'grapheme'}).segment(text)) boundaries.add(part.index);
        } else { let offset = 0; for (const part of text) { offset += part.length; boundaries.add(offset); } }
        if (!boundaries.has(value.start) || !boundaries.has(value.end)) throw failure('invalid-text-effect');
        return {name:value.name, start:value.start, end:value.end};
    }
    function mediaKind(mime) {
        const normalized = clean(mime).split(';')[0].toLowerCase();
        return Object.keys(MEDIA_MIMES).find(kind => MEDIA_MIMES[kind].includes(normalized)) || '';
    }
    function attachmentValue(id, messageId, value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('invalid-attachment');
        if (Object.keys(value).some(key => !['path','name','mime','size','duration','backend'].includes(key))) throw failure('invalid-attachment');
        const mime = clean(value.mime).split(';')[0].toLowerCase(), type = mediaKind(mime), path = clean(value.path), name = clean(value.name);
        const parts = path.split('/');
        if (!type || parts.length !== 4 || parts[0] !== 'message_media' || parts[1] !== id || parts[2] !== messageId || !/^[A-Za-z0-9_.-]{1,180}$/.test(parts[3])
            || !name || name.length > 180 || /[\u0000-\u001f\u007f/\\]/.test(name)
            || !Number.isInteger(value.size) || value.size < 1 || value.size > MEDIA_LIMITS[type]) throw failure('invalid-attachment');
        if (value.backend !== undefined && value.backend !== 'firestore') throw failure('invalid-attachment');
        const result = { backend:'firestore', path, name, mime, size:value.size };
        if (value.duration !== undefined) {
            if (!['audio','video'].includes(type) || !Number.isFinite(value.duration) || value.duration < 0 || value.duration > 600) throw failure('invalid-attachment');
            result.duration = value.duration;
        }
        return { type, attachment:result };
    }
    function preview(value) {
        return clean(value.text) || ({ image:'Foto', audio:'Messaggio vocale', video:'Video', file:'File' }[value.type] || 'Messaggio');
    }
    function pollValue(question, values) {
        const text = messageText(question);
        if (!Array.isArray(values) || values.length < 2 || values.length > 6) throw failure('invalid-poll');
        const options = values.map(clean);
        if (options.some(option => !option || option.length > 120) || new Set(options.map(option => option.toLocaleLowerCase('it'))).size !== options.length) throw failure('invalid-poll');
        return { question:text, options, votes:{} };
    }
    function create(db, user, timestamp, options = {}) {
        const uid = user?.uid;
        if (!uid || user.isAnonymous) throw failure('account-unavailable');
        const profiles = db.collection('messaging_profiles'), chats = db.collection('conversations');
        const self = profiles.doc(uid);
        const preferences = db.collection('messaging_preferences').doc(uid).collection('conversations');
        const mediaAccess = db.collection('media_access').doc(uid).collection('conversations');
        const grants = new Map();
        function chat(id) { return chats.doc(id); }
        function message(id, messageId) { return chat(id).collection('messages').doc(messageId); }
        function upload(id, messageId) { return chat(id).collection('uploads').doc(messageId); }
        function preferencesPatch(patch) {
            if (!patch || typeof patch !== 'object' || Object.keys(patch).some(key => !['muted','background','readAt'].includes(key))) throw failure('invalid-preferences');
            if ('muted' in patch && typeof patch.muted !== 'boolean') throw failure('invalid-preferences');
            if ('background' in patch && !BACKGROUNDS.includes(patch.background)) throw failure('invalid-preferences');
            if ('readAt' in patch && !patch.readAt?.toMillis) throw failure('invalid-preferences');
            return { ...patch, updatedAt:timestamp() };
        }
        async function sendPayload(id, messageId, value) {
            if (!messageId || messageId.includes('/') || messageId.length > 100) throw failure('invalid-message');
            const ref = message(id, messageId);
            await db.runTransaction(async transaction => {
                const previous = await transaction.get(ref);
                if (previous.exists) {
                    const saved = previous.data();
                    if (saved.senderUid === uid && saved.text === value.text && saved.replyTo === value.replyTo && (saved.type || 'text') === (value.type || 'text')
                        && JSON.stringify(saved.attachment || null) === JSON.stringify(value.attachment || null)
                        && (saved.textEffect?.name || '') === (value.textEffect?.name || '') && (saved.textEffect?.start ?? -1) === (value.textEffect?.start ?? -1) && (saved.textEffect?.end ?? -1) === (value.textEffect?.end ?? -1)
                        && JSON.stringify(saved.poll?.options || null) === JSON.stringify(value.poll?.options || null)) return;
                    throw failure('message-conflict');
                }
                transaction.set(ref, { senderUid:uid, ...value, reactions:{}, createdAt:timestamp() });
                transaction.update(chat(id), { lastMessageId:messageId, lastText:preview(value), lastSender:uid, lastAt:timestamp(), updatedAt:timestamp() });
            });
        }
        return {
            uid,
            profile: () => self.get({ source:'server' }),
            enroll: value => self.set({ name:clean(value.name).slice(0, 160), role:value.role, photoData:value.photoData || '', enabled:true, updatedAt:timestamp() }),
            async disable() {
                const existing = await mediaAccess.limit(400).get({ source:'server' });
                const batch = db.batch(); batch.update(self, { enabled:false, updatedAt:timestamp() });
                existing.docs.forEach(document => batch.delete(document.ref)); await batch.commit(); grants.clear();
            },
            contacts: (receive, fail) => profiles.where('enabled', '==', true).limit(200).onSnapshot(receive, fail),
            badges: (receive, fail) => db.collection('messaging_badges').where('enabled', '==', true).limit(20).onSnapshot(receive, fail),
            conversations: (receive, fail) => chats.where('members', 'array-contains', uid).limit(100).onSnapshot({ includeMetadataChanges:true }, receive, fail),
            settings: (receive, fail) => preferences.limit(100).onSnapshot(receive, fail),
            saveConversationSettings: (id, patch) => preferences.doc(id).set(preferencesPatch(patch), { merge:true }),
            async open(otherUid) {
                const id = conversationId(uid, otherUid), ref = chat(id);
                await db.runTransaction(async transaction => {
                    const existing = await transaction.get(ref);
                    if (!existing.exists) transaction.set(ref, { members:[uid, otherUid].sort(), createdBy:uid, createdAt:timestamp(), updatedAt:timestamp(), lastText:'', lastSender:'', lastMessageId:'' });
                });
                return id;
            },
            async createGroup(memberUids, title = '') {
                if (!Array.isArray(memberUids)) throw failure('invalid-members');
                const members = [...new Set([uid, ...memberUids])].sort();
                if (members.length < 2 || members.length > MAX_GROUP_MEMBERS || members.some(member => typeof member !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(member))) throw failure('invalid-members');
                const name = clean(title); if (name.length > 80) throw failure('invalid-group-name');
                const ref = chats.doc(); await ref.set({ kind:'group', title:name, members, ownerUid:uid, createdBy:uid, createdAt:timestamp(), updatedAt:timestamp(), lastText:'', lastSender:'', lastMessageId:'' });
                return ref.id;
            },
            async setGroupDeleted(id, deleted) {
                if (typeof id !== 'string' || !id || id.includes('/') || typeof deleted !== 'boolean') throw failure('invalid-group');
                const ref = chat(id);
                await db.runTransaction(async transaction => {
                    const snapshot = await transaction.get(ref), value = snapshot.data();
                    if (!snapshot.exists || value.kind !== 'group' || groupOwner(value) !== uid || !value.members?.includes(uid)) throw failure('group-owner-required');
                    if (!!value.deletedAt === deleted) return;
                    transaction.update(ref, { deletedAt:deleted ? timestamp() : null, deletedBy:deleted ? uid : '', updatedAt:timestamp() });
                });
            },
            async leaveGroup(id, nextOwner = '') {
                if (typeof id !== 'string' || !id || id.includes('/')) throw failure('invalid-group');
                const ref = chat(id);
                await db.runTransaction(async transaction => {
                    const snapshot = await transaction.get(ref), value = snapshot.data();
                    if (!snapshot.exists || value.kind !== 'group' || value.deletedAt || !value.members?.includes(uid)) throw failure('group-member-required');
                    const remaining = value.members.filter(member => member !== uid);
                    if (!remaining.length) {
                        transaction.update(ref, { deletedAt:timestamp(), deletedBy:uid, updatedAt:timestamp() });
                        return;
                    }
                    const patch = { members:remaining, updatedAt:timestamp() };
                    if (groupOwner(value) === uid) {
                        if (!remaining.includes(nextOwner)) throw failure('group-successor-required');
                        patch.ownerUid = nextOwner;
                    }
                    transaction.update(ref, patch);
                });
            },
            listen: (id, receive, fail, limit = 50) => chat(id).collection('messages').orderBy('createdAt', 'desc').limit(limit).onSnapshot({ includeMetadataChanges:true }, receive, fail),
            older: (id, cursor) => chat(id).collection('messages').orderBy('createdAt', 'desc').startAfter(cursor).limit(50).get({ source:'server' }),
            listenOlder: (id, cursor, receive, fail) => chat(id).collection('messages').orderBy('createdAt', 'desc').startAfter(cursor).limit(50).onSnapshot(receive, fail),
            states: (id, receive, fail) => chat(id).collection('states').onSnapshot(receive, fail),
            inboxState: (id, receive, fail) => chat(id).collection('states').onSnapshot(receive, fail),
            state: (id, patch) => {
                if (!patch || Object.keys(patch).some(key => !['isTyping','readAt'].includes(key)) || ('isTyping' in patch && typeof patch.isTyping !== 'boolean') || ('readAt' in patch && !patch.readAt?.toMillis)) return Promise.reject(failure('invalid-state'));
                const batch = db.batch(); batch.set(chat(id).collection('states').doc(uid), { ...patch, updatedAt:timestamp() }, { merge:true });
                if (patch.readAt) batch.set(preferences.doc(id), preferencesPatch({ readAt:patch.readAt }), { merge:true });
                return batch.commit();
            },
            newMessageId: id => chat(id).collection('messages').doc().id,
            async send(id, messageId, text, replyTo = '', effect = null) {
                const body = messageText(text), normalized = textEffect(effect, body);
                return sendPayload(id, messageId, { text:body, replyTo, ...(normalized ? {textEffect:normalized} : {}) });
            },
            async sendMedia(id, messageId, attachment, caption = '', replyTo = '') {
                const value = attachmentValue(id, messageId, attachment), text = clean(caption);
                if (text.length > MAX_LENGTH) throw failure('message-too-long');
                return sendPayload(id, messageId, { ...value, text, replyTo });
            },
            sendPoll: (id, messageId, question, values, replyTo = '') => {
                const poll = pollValue(question, values);
                return sendPayload(id, messageId, { type:'poll', text:poll.question, poll, replyTo });
            },
            async edit(id, messageId, text) {
                const body = messageText(text), ref = message(id, messageId);
                await db.runTransaction(async transaction => {
                    const saved = await transaction.get(ref), conversation = await transaction.get(chat(id));
                    if (!saved.exists || saved.data().senderUid !== uid || saved.data().type === 'poll') throw failure('message-not-editable');
                    if (saved.data().text === body) return;
                    transaction.update(ref, { text:body, editedAt:timestamp(), ...(saved.data().textEffect ? {textEffect:null} : {}) });
                    if (conversation.data()?.lastMessageId === messageId) transaction.update(chat(id), { lastText:body, ...(!conversation.data().lastAt ? {lastAt:saved.data().createdAt} : {}) });
                });
            },
            async vote(id, messageId, optionIndex) {
                const ref = message(id, messageId);
                await db.runTransaction(async transaction => {
                    const snapshot = await transaction.get(ref), poll = snapshot.data()?.poll;
                    if (!snapshot.exists || snapshot.data().type !== 'poll' || !poll || (optionIndex !== null && (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= poll.options.length))) throw failure('invalid-vote');
                    const votes = { ...poll.votes };
                    if (optionIndex === null || votes[uid] === optionIndex) delete votes[uid]; else votes[uid] = optionIndex;
                    transaction.update(ref, { poll:{ ...poll, votes } });
                });
            },
            async saveTranscript(id, messageId, text) {
                const transcript = clean(text);
                if (!transcript || transcript.length > 12000) throw failure('invalid-transcript');
                const ref = message(id, messageId);
                await db.runTransaction(async transaction => {
                    const saved = await transaction.get(ref);
                    if (!saved.exists || saved.data().senderUid !== uid || saved.data().type !== 'audio') throw failure('transcript-not-editable');
                    if (saved.data().transcript === transcript) return;
                    transaction.update(ref, { transcript, transcribedAt:timestamp() });
                });
            },
            async createUpload(id, messageId, metadata) {
                if (!metadata || Object.keys(metadata).some(key => !['kind','name','mime','size','totalChunks'].includes(key))) throw failure('invalid-upload');
                const type = mediaKind(metadata.mime), name = clean(metadata.name), mime = clean(metadata.mime).split(';')[0].toLowerCase();
                if (type !== metadata.kind || !type || !name || name.length > 180 || /[\u0000-\u001f\u007f/\\]/.test(name)
                    || !Number.isInteger(metadata.size) || metadata.size < 1 || metadata.size > MEDIA_LIMITS[type]
                    || metadata.totalChunks !== Math.ceil(metadata.size / RAW_CHUNK_BYTES) || metadata.totalChunks > MAX_CHUNKS) throw failure('invalid-upload');
                const ref = upload(id, messageId), expected = { ownerUid:uid, kind:type, name, mime, size:metadata.size, totalChunks:metadata.totalChunks };
                await db.runTransaction(async transaction => {
                    const existing = await transaction.get(ref);
                    if (existing.exists) {
                        if (Object.keys(expected).every(key => existing.data()[key] === expected[key])) return;
                        throw failure('upload-conflict');
                    }
                    transaction.set(ref, { ...expected, complete:false, createdAt:timestamp(), updatedAt:timestamp() });
                });
                return ref.get({ source:'server' });
            },
            async putUploadChunk(id, messageId, index, dataBase64) {
                if (!Number.isInteger(index) || index < 0 || index >= MAX_CHUNKS || typeof dataBase64 !== 'string'
                    || !dataBase64.length || dataBase64.length > BASE64_CHUNK_CHARS || dataBase64.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(dataBase64)) throw failure('invalid-upload-chunk');
                const ref = upload(id, messageId).collection('chunks').doc(String(index));
                await db.runTransaction(async transaction => {
                    const existing = await transaction.get(ref);
                    if (existing.exists) {
                        if (existing.data().index === index && existing.data().data === dataBase64) return;
                        throw failure('upload-chunk-conflict');
                    }
                    transaction.set(ref, { index, data:dataBase64 });
                });
            },
            async completeUpload(id, messageId) {
                const ref = upload(id, messageId);
                await db.runTransaction(async transaction => {
                    const saved = await transaction.get(ref);
                    if (!saved.exists || saved.data().ownerUid !== uid) throw failure('upload-unavailable');
                    if (saved.data().complete === true) return;
                    transaction.update(ref, { complete:true, updatedAt:timestamp() });
                });
            },
            getUpload: (id, messageId) => upload(id, messageId).get({ source:'server' }),
            getUploadChunks: (id, messageId) => upload(id, messageId).collection('chunks').orderBy('index').get({ source:'server' }),
            async authorizeMedia(id, force = false) {
                const previous = grants.get(id), now = Date.now();
                if (!force && previous && now - previous.started < 3 * 60 * 1000) return previous.promise;
                const ref = mediaAccess.doc(id), started = now;
                const promise = (async () => {
                    const enrolled = await self.get({ source:'server' }), role = enrolled.data()?.role;
                    if (!enrolled.exists || enrolled.data().enabled !== true || !['studente','docente'].includes(role)) throw failure('media-access-unavailable');
                    const makeTimestamp = options.Timestamp || globalThis.firebase?.firestore?.Timestamp;
                    if (!makeTimestamp?.fromMillis) throw failure('timestamp-unavailable');
                    // Read the server clock before assigning the short expiry: device clocks are not trusted.
                    await ref.set({ uid, conversationId:id, role, updatedAt:timestamp(), expiresAt:timestamp() });
                    const saved = await ref.get({ source:'server' }), serverNow = millis(saved.data()?.updatedAt);
                    if (!serverNow) throw failure('media-access-unavailable');
                    const expiresAt = makeTimestamp.fromMillis(serverNow + 4 * 60 * 1000);
                    await ref.set({ uid, conversationId:id, role, updatedAt:timestamp(), expiresAt });
                    return { uid, conversationId:id, role, expiresAt };
                })();
                grants.set(id, { started, promise });
                try { return await promise; } catch (error) { if (grants.get(id)?.promise === promise) grants.delete(id); throw error; }
            },
            async react(id, messageId, emoji) {
                if (!REACTIONS.includes(emoji)) throw failure('invalid-reaction');
                const ref = message(id, messageId);
                await db.runTransaction(async transaction => {
                    const snapshot = await transaction.get(ref);
                    if (!snapshot.exists) throw failure('message-unavailable');
                    const reactions = { ...snapshot.data().reactions };
                    if (reactions[uid] === emoji) delete reactions[uid]; else reactions[uid] = emoji;
                    transaction.update(ref, { reactions });
                });
            },
            getMessage: (id, messageId) => message(id, messageId).get({ source:'server' }),
            watchMessage: (id, messageId, receive, fail) => message(id, messageId).onSnapshot(receive, fail),
            replies: (id, messageId, receive, fail, limit = 100) => chat(id).collection('messages').where('replyTo', '==', messageId).limit(limit + 1).onSnapshot({ includeMetadataChanges:true }, receive, fail),
            now: timestamp
        };
    }
    return { create, groupOwner, REACTIONS, MAX_LENGTH, TEXT_EFFECTS, textEffect, MAX_GROUP_MEMBERS, BACKGROUNDS, MEDIA_LIMITS, MEDIA_MIMES, RAW_CHUNK_BYTES, BASE64_CHUNK_CHARS, MAX_CHUNKS, millis, messageText, conversationId, mediaKind, attachmentValue, pollValue, preview };
});
