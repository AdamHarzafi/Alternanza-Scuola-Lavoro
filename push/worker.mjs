import { buildPushPayload } from '@block65/webcrypto-web-push';
const PROJECT = 'harzafi---fsl',
    ORIGINS = ['https://adamharzafi.github.io'],
    BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/`;
const deny = (code = 403) => {
    throw Object.assign(new Error('Request rejected'), { status: code });
};
const identifier = (value) => typeof value === 'string' && /^[A-Za-z0-9_~.-]{1,150}$/.test(value);
const decode = (value) =>
    JSON.parse(
        new TextDecoder().decode(
            Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
        ),
    );
async function digest(value) {
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('');
}
function fields(value) {
    const convert = (v) =>
        v.stringValue !== undefined
            ? v.stringValue
            : v.booleanValue !== undefined
              ? v.booleanValue
              : v.timestampValue !== undefined
                ? v.timestampValue
                : v.arrayValue
                  ? (v.arrayValue.values || []).map(convert)
                  : null;
    return Object.fromEntries(Object.entries(value.fields || {}).map(([key, v]) => [key, convert(v)]));
}
export function validSubscription(value) {
    try {
        const url = new URL(value?.endpoint);
        return (
            url.protocol === 'https:' &&
            !url.username &&
            !url.password &&
            !url.port &&
            value.endpoint.length < 2048 &&
            ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(
                url.hostname,
            ) &&
            /^[A-Za-z0-9_-]{86,90}$/.test(value.keys?.p256dh) &&
            /^[A-Za-z0-9_-]{20,26}$/.test(value.keys?.auth)
        );
    } catch (_) {
        return false;
    }
}
async function authenticated(request) {
    const authorization = request.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ') || authorization.length > 10000) deny(401);
    let claims;
    try {
        claims = decode(authorization.slice(7).split('.')[1]);
    } catch (_) {
        deny(401);
    }
    if (
        !identifier(claims.sub) ||
        claims.aud !== PROJECT ||
        claims.iss !== `https://securetoken.google.com/${PROJECT}`
    )
        deny(401);
    const headers = { Authorization: authorization };
    const attestation = request.headers.get('X-Firebase-AppCheck');
    if (attestation) headers['X-Firebase-AppCheck'] = attestation;
    async function read(path, mask) {
        const query = new URLSearchParams();
        for (const field of mask) query.append('mask.fieldPaths', field);
        const response = await fetch(BASE + path + '?' + query, { headers, redirect: 'error' });
        if (!response.ok) deny(403);
        return fields(await response.json());
    }
    // Firestore validates the signed ID token and the live authorization rules. No administrator credential is used.
    const own = await read('messaging_profiles/' + claims.sub, ['enabled']);
    if (!own.enabled) deny(403);
    return { uid: claims.sub, read };
}
async function route(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET')
        return { ready: !!(env.PUSH_DB && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY), version: 1 };
    if (url.pathname === '/config' && request.method === 'GET')
        return { publicKey: env.VAPID_PUBLIC_KEY || '' };
    if (request.method !== 'POST') deny(405);
    if (Number(request.headers.get('content-length') || 0) > 8192) deny(413);
    const raw = await request.text();
    if (raw.length > 8192) deny(413);
    let body;
    try {
        body = JSON.parse(raw);
    } catch (_) {
        deny(400);
    }
    const actor = await authenticated(request),
        db = env.PUSH_DB,
        now = Date.now();
    if (!db) deny(503);
    if (url.pathname === '/subscribe') {
        if (!validSubscription(body.subscription)) deny(400);
        const subscription = {
                endpoint: body.subscription.endpoint,
                keys: { p256dh: body.subscription.keys.p256dh, auth: body.subscription.keys.auth },
            },
            id = await digest(subscription.endpoint + subscription.keys.auth);
        const count = await db
            .prepare('SELECT COUNT(*) AS n FROM subscriptions WHERE uid=? AND expires>? AND id<>?')
            .bind(actor.uid, now, id)
            .first();
        if (count.n >= 5) deny(429);
        await db
            .prepare(
                'INSERT INTO subscriptions(id,uid,subscription,expires) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET uid=excluded.uid,subscription=excluded.subscription,expires=excluded.expires',
            )
            .bind(id, actor.uid, JSON.stringify(subscription), now + 90 * 86400000)
            .run();
        return { ok: true };
    }
    if (url.pathname === '/unsubscribe') {
        if (!validSubscription(body.subscription)) deny(400);
        const id = await digest(body.subscription.endpoint + body.subscription.keys.auth);
        await db.prepare('DELETE FROM subscriptions WHERE id=? AND uid=?').bind(id, actor.uid).run();
        return { ok: true };
    }
    if (url.pathname === '/preferences') {
        if (!identifier(body.cid) || typeof body.muted !== 'boolean') deny(400);
        const chat = await actor.read('conversations/' + body.cid, ['members']);
        if (!chat.members?.includes(actor.uid)) deny();
        await db
            .prepare(
                'INSERT INTO chat_preferences(uid,cid,muted) VALUES(?,?,?) ON CONFLICT(uid,cid) DO UPDATE SET muted=excluded.muted',
            )
            .bind(actor.uid, body.cid, body.muted ? 1 : 0)
            .run();
        return { ok: true };
    }
    if (url.pathname === '/notify') {
        if (
            !identifier(body.cid) ||
            !identifier(body.mid) ||
            !identifier(body.recipient) ||
            body.recipient === actor.uid
        )
            deny(400);
        const chat = await actor.read('conversations/' + body.cid, ['members', 'lastMessageId']);
        if (
            !chat.members?.includes(actor.uid) ||
            !chat.members.includes(body.recipient) ||
            chat.lastMessageId !== body.mid
        )
            deny();
        const message = await actor.read(`conversations/${body.cid}/messages/${body.mid}`, [
                'senderUid',
                'createdAt',
            ]),
            created = Date.parse(message.createdAt);
        if (
            message.senderUid !== actor.uid ||
            !Number.isFinite(created) ||
            now - created > 180000 ||
            created - now > 15000
        )
            deny();
        // A recipient who disabled Messages is not notified, even if an old group still exists.
        try {
            const recipient = await actor.read('messaging_profiles/' + body.recipient, ['enabled']);
            if (!recipient.enabled) return { ok: true, skipped: true };
        } catch (_) {
            return { ok: true, skipped: true };
        }
        const muted = await db
            .prepare('SELECT muted FROM chat_preferences WHERE uid=? AND cid=?')
            .bind(body.recipient, body.cid)
            .first();
        if (muted?.muted) return { ok: true, skipped: true };
        const id = await digest(body.cid + '/' + body.mid + '/' + body.recipient),
            insert = await db
                .prepare('INSERT OR IGNORE INTO deliveries(id,created) VALUES(?,?)')
                .bind(id, now)
                .run();
        if (!insert.meta.changes) return { ok: true, duplicate: true };
        const rows = await db
            .prepare('SELECT id,subscription FROM subscriptions WHERE uid=? AND expires>? LIMIT 5')
            .bind(body.recipient, now)
            .all();
        let delivered = 0;
        for (const row of rows.results) {
            const subscription = JSON.parse(row.subscription);
            if (!validSubscription(subscription)) continue;
            try {
                const payload = await buildPushPayload(
                    {
                        data: JSON.stringify({
                            title: 'Nuovo messaggio · Harzafi FSL',
                            body: 'Apri Messaggi per leggere la conversazione.',
                            tag: 'harzafi-' + body.cid,
                        }),
                        options: { ttl: 300 },
                    },
                    subscription,
                    {
                        subject: 'mailto:harzafi.support@gmail.com',
                        publicKey: env.VAPID_PUBLIC_KEY,
                        privateKey: env.VAPID_PRIVATE_KEY,
                    },
                );
                const response = await fetch(subscription.endpoint, { ...payload, redirect: 'error' });
                if (response.ok) delivered++;
                else if ([404, 410].includes(response.status))
                    await db.prepare('DELETE FROM subscriptions WHERE id=?').bind(row.id).run();
            } catch (_) {
                /* Do not log tokens, content, or subscription endpoints. */
            }
        }
        await db
            .prepare('DELETE FROM deliveries WHERE created<?')
            .bind(now - 86400000)
            .run();
        await db.prepare('DELETE FROM subscriptions WHERE expires<?').bind(now).run();
        return { ok: true, accepted: delivered };
    }
    deny(404);
}
export default {
    async fetch(request, env) {
        const origin = request.headers.get('Origin'),
            allowed = ORIGINS.includes(origin),
            headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
        if (allowed)
            Object.assign(headers, {
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Firebase-AppCheck',
                'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
            });
        if (request.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers });
        if (origin && !allowed) return new Response('{}', { status: 403, headers });
        try {
            return new Response(JSON.stringify(await route(request, env)), { headers });
        } catch (error) {
            return new Response(JSON.stringify({ error: 'Richiesta non disponibile' }), {
                status: error.status || 503,
                headers,
            });
        }
    },
};
