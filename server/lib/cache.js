/**
 * Tiny in-memory TTL cache with a size cap (oldest entry evicted first) and
 * in-flight de-duplication, so ten users opening the same city at once cost
 * one upstream request instead of ten.
 */
class TTLCache {
    constructor({ ttlMs, max = 500 }) {
        this.ttlMs = ttlMs;
        this.max = max;
        this.store = new Map();
        this.inflight = new Map();
    }

    get(key) {
        const hit = this.store.get(key);

        if (!hit) return undefined;

        if (hit.expires <= Date.now()) {
            this.store.delete(key);
            return undefined;
        }

        return hit.value;
    }

    set(key, value, ttlMs = this.ttlMs) {
        if (this.store.size >= this.max) {
            this.store.delete(this.store.keys().next().value);
        }

        this.store.set(key, { value, expires: Date.now() + ttlMs });
    }

    /** Return the cached value, or run `loader` once (shared by concurrent callers). */
    async wrap(key, loader, ttlMs = this.ttlMs) {
        const cached = this.get(key);

        if (cached !== undefined) return cached;

        if (this.inflight.has(key)) return this.inflight.get(key);

        const promise = (async () => {
            try {
                const value = await loader();
                this.set(key, value, ttlMs);
                return value;
            } finally {
                this.inflight.delete(key);
            }
        })();

        this.inflight.set(key, promise);

        return promise;
    }

    clear() {
        this.store.clear();
        this.inflight.clear();
    }
}

module.exports = { TTLCache };
