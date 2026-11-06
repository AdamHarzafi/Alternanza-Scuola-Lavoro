(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.HarzafiAccountPreferences = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const MAX_PHOTO_CHARS = 180000;
    const NAME_LIMIT = 80;
    const photoPattern = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;
    const allowedFields = new Set(['givenName', 'familyName', 'photoData']);
    const owns = (data, key) => Object.prototype.hasOwnProperty.call(data, key);
    function failure(code) { return Object.assign(new Error(code), { code }); }
    function nameOf(value) {
        if (typeof value !== 'string') return '';
        const result = value.trim().normalize('NFC');
        return result.length <= NAME_LIMIT && !/[\u0000-\u001f\u007f]/.test(result) ? result : '';
    }
    function validatePhoto(value) {
        return typeof value === 'string' && value.length <= MAX_PHOTO_CHARS
            && (value === '' || (photoPattern.test(value) && !/\s/.test(value)));
    }
    function normalize(data) {
        const value = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
        const givenName = nameOf(value.givenName), familyName = nameOf(value.familyName);
        return {
            givenName: givenName && familyName ? givenName : '',
            familyName: givenName && familyName ? familyName : '',
            photoData: validatePhoto(value.photoData) ? value.photoData : ''
        };
    }
    function ownReference(db, user) {
        if (!user || typeof user.uid !== 'string' || !/^[^/\\\u0000-\u001f]{1,128}$/.test(user.uid)
            || user.uid !== user.uid.trim() || user.isAnonymous
            || typeof user.email !== 'string' || !user.email.trim()) throw failure('account-unavailable');
        return db.collection('account_preferences').doc(user.uid);
    }
    async function load(db, user) {
        const ref = ownReference(db, user);
        const document = await ref.get({ source: 'server' });
        return normalize(document.exists ? document.data() : {});
    }
    function validatePatch(patch) {
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw failure('invalid-preferences');
        const keys = Object.keys(patch);
        if (!keys.length || keys.some(key => !allowedFields.has(key))) throw failure('invalid-preferences');
        const result = {};
        if (owns(patch, 'givenName') || owns(patch, 'familyName')) {
            if (!owns(patch, 'givenName') || !owns(patch, 'familyName')) throw failure('invalid-profile-name');
            const givenName = nameOf(patch.givenName), familyName = nameOf(patch.familyName);
            if (!givenName || !familyName) throw failure('invalid-profile-name');
            result.givenName = givenName;
            result.familyName = familyName;
        }
        if (owns(patch, 'photoData')) {
            if (!validatePhoto(patch.photoData)) throw failure('invalid-profile-photo');
            result.photoData = patch.photoData;
        }
        return result;
    }
    async function save(db, user, patch, createServerTimestamp) {
        const ref = ownReference(db, user);
        const value = validatePatch(patch);
        if (typeof createServerTimestamp !== 'function') throw failure('server-timestamp-unavailable');
        const updatedAt = createServerTimestamp();
        if (updatedAt === undefined || updatedAt === null) throw failure('server-timestamp-unavailable');
        await ref.set({ ...value, updatedAt }, { merge: true });
    }
    return { MAX_PHOTO_CHARS, normalize, validatePhoto, load, save };
});
