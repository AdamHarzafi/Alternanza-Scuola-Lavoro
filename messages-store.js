(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.HarzafiMessages = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const REACTIONS = ['❤️', '👍', '👎', '😂', '‼️', '❓'];
    const MAX_LENGTH = 2000;
    const millis = value => value?.toMillis?.() || (value instanceof Date ? value.getTime() : Number(value) || 0);
    const clean = value => typeof value === 'string' ? value.trim() : '';
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
    function create(db, user, timestamp) {
        const uid = user?.uid;
        if (!uid || user.isAnonymous) throw failure('account-unavailable');
        const profiles = db.collection('messaging_profiles'), chats = db.collection('conversations');
        const self = profiles.doc(uid);
        function chat(id) { return chats.doc(id); }
        function message(id, messageId) { return chat(id).collection('messages').doc(messageId); }
        return {
            uid,
            profile: () => self.get({ source:'server' }),
            enroll: value => self.set({ name:clean(value.name).slice(0, 160), role:value.role, photoData:value.photoData || '', enabled:true, updatedAt:timestamp() }),
            disable: () => self.update({ enabled:false, updatedAt:timestamp() }),
            contacts: (receive, fail) => profiles.where('enabled', '==', true).limit(200).onSnapshot(receive, fail),
            conversations: (receive, fail) => chats.where('members', 'array-contains', uid).limit(100).onSnapshot({ includeMetadataChanges:true }, receive, fail),
            async open(otherUid) {
                const id = conversationId(uid, otherUid), ref = chat(id);
                await db.runTransaction(async transaction => {
                    const existing = await transaction.get(ref);
                    if (!existing.exists) transaction.set(ref, { members:[uid, otherUid].sort(), createdBy:uid, createdAt:timestamp(), updatedAt:timestamp(), lastText:'', lastSender:'', lastMessageId:'' });
                });
                return id;
            },
            listen: (id, receive, fail, limit = 50) => chat(id).collection('messages').orderBy('createdAt', 'desc').limit(limit).onSnapshot({ includeMetadataChanges:true }, receive, fail),
            older: (id, cursor) => chat(id).collection('messages').orderBy('createdAt', 'desc').startAfter(cursor).limit(50).get({ source:'server' }),
            listenOlder: (id, cursor, receive, fail) => chat(id).collection('messages').orderBy('createdAt', 'desc').startAfter(cursor).limit(50).onSnapshot(receive, fail),
            states: (id, receive, fail) => chat(id).collection('states').onSnapshot(receive, fail),
            state: (id, patch) => chat(id).collection('states').doc(uid).set({ ...patch, updatedAt:timestamp() }, { merge:true }),
            newMessageId: id => chat(id).collection('messages').doc().id,
            async send(id, messageId, text, replyTo = '') {
                const body = messageText(text), ref = message(id, messageId);
                // An acknowledged retry cannot create a duplicate or overwrite a message.
                await db.runTransaction(async transaction => {
                    const previous = await transaction.get(ref);
                    if (previous.exists) {
                        const value = previous.data();
                        if (value.senderUid === uid && value.text === body && value.replyTo === replyTo) return;
                        throw failure('message-conflict');
                    }
                    transaction.set(ref, { senderUid:uid, text:body, replyTo, reactions:{}, createdAt:timestamp() });
                    transaction.update(chat(id), { lastMessageId:messageId, lastText:body, lastSender:uid, updatedAt:timestamp() });
                });
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
            now: timestamp
        };
    }
    return { create, REACTIONS, MAX_LENGTH, millis, messageText, conversationId };
});
