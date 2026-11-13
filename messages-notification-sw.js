self.addEventListener('push', (event) => {
    event.waitUntil(
        (async () => {
            let payload;
            try {
                payload = event.data?.json();
            } catch (_) {
                return;
            }
            if (!payload || payload.title !== 'Nuovo messaggio · Harzafi FSL') return;
            await self.registration.showNotification(payload.title, {
                body: 'Apri Messaggi per leggere la conversazione.',
                tag: typeof payload.tag === 'string' ? payload.tag.slice(0, 180) : 'harzafi-messages',
                icon: new URL('IMMAGINI/LOGO-DOMANDA-HARZAFI.webp', self.location.href).href,
            });
        })(),
    );
});
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target = new URL('messaggi.html', self.location.href).href;
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
            const existing = windows.find((client) => client.url.split('?')[0] === target);
            if (existing) return existing.focus();
            return clients.openWindow(target);
        }),
    );
});
