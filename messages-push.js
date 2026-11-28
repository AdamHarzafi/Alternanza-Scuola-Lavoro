(function () {
    'use strict';
    const endpoint = 'https://harzafi-messages-push.allorasonoadam.workers.dev';
    const worker = 'messages-notification-sw.js?v=20261128';
    let account, registration, epoch = 0, ready = false;
    let cleanup = Promise.resolve();
    const savedPreferences = new Map();
    const available = () => Boolean(endpoint && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);

    const currentSession = (user, current) => account === user && epoch === current;
    function enqueue(work) {
        const result = cleanup.then(work);
        cleanup = result.catch(() => {});
        return result;
    }

    async function call(path, body, user = account, current) {
        if (!endpoint || !user) throw new Error('push-unavailable');
        const token = await user.getIdToken();
        if (current !== undefined && !currentSession(user, current)) return;
        const headers = {Authorization:'Bearer ' + token, 'Content-Type':'application/json'};
        const attestation = await firebase.appCheck().getToken(false);
        if (current !== undefined && !currentSession(user, current)) return;
        headers['X-Firebase-AppCheck'] = attestation.token;
        const response = await fetch(endpoint + path, {
            method:'POST', headers, body:JSON.stringify(body),
            credentials:'omit', cache:'no-store', keepalive:true
        });
        if (!response.ok) throw new Error('push-unavailable');
        return response.json();
    }

    function subscribe() {
        const current = epoch, user = account;
        return enqueue(async () => {
            if (!currentSession(user, current) || ready || !available() || Notification.permission !== 'granted' || !user) return;
            const localRegistration = await navigator.serviceWorker.register(worker);
            registration = localRegistration;
            await navigator.serviceWorker.ready;
            if (!currentSession(user, current)) return;
            const response = await fetch(endpoint + '/config', {cache:'no-store', credentials:'omit'});
            if (!response.ok) throw new Error('push-unavailable');
            const config = await response.json();
            if (!currentSession(user, current)) return;
            const key = Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
            let subscription = await localRegistration.pushManager.getSubscription();
            if (!currentSession(user, current)) return;
            subscription ||= await localRegistration.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:key});
            if (!currentSession(user, current)) return;
            await call('/subscribe', {subscription:subscription.toJSON()}, user, current);
            if (currentSession(user, current)) ready = true;
        });
    }

    async function enable() {
        if (!available()) return 'unsupported';
        const result = await Notification.requestPermission();
        if (result === 'granted') await subscribe();
        return result;
    }

    function start(user) {
        if (account && account.uid !== user.uid) clear();
        account = user;
        ++epoch;
        ready = false;
        if (available() && Notification.permission === 'granted') subscribe().catch(() => {});
    }

    function clear(unsubscribe = true) {
        ++epoch;
        account = null;
        ready = false;
        savedPreferences.clear();
        if (!unsubscribe) return;
        enqueue(async () => {
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
        if (!endpoint || !account || savedPreferences.get(cid)?.muted === muted) return;
        const user = account, current = epoch, preference = {muted};
        savedPreferences.set(cid, preference);
        try {
            await enqueue(() => currentSession(user, current) ? call('/preferences', {cid,muted}, user, current) : undefined);
        } catch (error) {
            if (currentSession(user, current) && savedPreferences.get(cid) === preference) savedPreferences.delete(cid);
            throw error;
        }
    }

    window.HarzafiMessagePush = {available, enabled:() => ready, start, enable, clear, sent, preferences};
})();
