(function () {
    'use strict';
    const endpoint = 'https://harzafi-messages-push.allorasonoadam.workers.dev'; // Filled after the push service is deployed.
    let account, registration, epoch = 0, ready = false;
    let cleanup = Promise.resolve();
    const savedPreferences = new Map();
    const available = () => Boolean(endpoint && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);

    async function call(path, body, user = account) {
        if (!endpoint || !user) throw new Error('push-unavailable');
        const token = await user.getIdToken();
        const headers = {Authorization:'Bearer ' + token, 'Content-Type':'application/json'};
        const attestation = await firebase.appCheck().getToken(false);
        headers['X-Firebase-AppCheck'] = attestation.token;
        const response = await fetch(endpoint + path, {
            method:'POST', headers, body:JSON.stringify(body),
            credentials:'omit', cache:'no-store', keepalive:true
        });
        if (!response.ok) throw new Error('push-unavailable');
        return response.json();
    }

    async function subscribe() {
        const current = epoch;
        await cleanup;
        if (current !== epoch || !available() || Notification.permission !== 'granted' || !account) return;
        registration = await navigator.serviceWorker.register('messages-notification-sw.js?v=20261113');
        await navigator.serviceWorker.ready;
        const response = await fetch(endpoint + '/config', {cache:'no-store', credentials:'omit'});
        if (!response.ok) throw new Error('push-unavailable');
        const config = await response.json();
        if (current !== epoch) return;
        const key = Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
        let subscription = await registration.pushManager.getSubscription();
        subscription ||= await registration.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:key});
        if (current !== epoch) { await subscription.unsubscribe(); return; }
        await call('/subscribe', {subscription:subscription.toJSON()});
        if (current === epoch) ready = true;
    }

    async function enable() {
        if (!available()) return 'unsupported';
        const result = await Notification.requestPermission();
        if (result === 'granted') await subscribe();
        return result;
    }

    function start(user) {
        account = user;
        ++epoch;
        if (available() && Notification.permission === 'granted') subscribe().catch(() => {});
    }

    function clear(unsubscribe = true) {
        ++epoch;
        account = null;
        ready = false;
        savedPreferences.clear();
        if (!unsubscribe) return;
        cleanup = cleanup.then(async () => {
            const previous = registration || await navigator.serviceWorker?.getRegistration();
            const subscription = await previous?.pushManager.getSubscription();
            await subscription?.unsubscribe();
            registration = null;
        }).catch(() => {});
    }

    async function sent(cid, mid, members, user = account) {
        if (!endpoint || !user) return;
        const recipients = members.filter(uid => uid !== user.uid);
        await Promise.allSettled(recipients.map(recipient => call('/notify', {cid,mid,recipient}, user)));
    }

    async function preferences(cid, muted) {
        if (!endpoint || !account || savedPreferences.get(cid) === muted) return;
        savedPreferences.set(cid, muted);
        try { await call('/preferences', {cid,muted}); }
        catch (error) { savedPreferences.delete(cid); throw error; }
    }

    window.HarzafiMessagePush = {available, enabled:() => ready, start, enable, clear, sent, preferences};
})();
