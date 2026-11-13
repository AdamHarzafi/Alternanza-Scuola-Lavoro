CREATE TABLE IF NOT EXISTS subscriptions (id TEXT PRIMARY KEY, uid TEXT NOT NULL, subscription TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS subscriptions_owner ON subscriptions(uid, expires);
CREATE TABLE IF NOT EXISTS chat_preferences (uid TEXT NOT NULL, cid TEXT NOT NULL, muted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(uid,cid));
CREATE TABLE IF NOT EXISTS deliveries (id TEXT PRIMARY KEY, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS deliveries_created ON deliveries(created);
CREATE INDEX IF NOT EXISTS subscriptions_expiry ON subscriptions(expires);
