/**
 * Tiny in-memory TTL cache with a size cap (oldest entry evicted first) and
 * in-flight de-duplication, so ten users opening the same city at once cost
 * one upstream request instead of ten.
 *
 * With `staleMs > 0`, an expired entry is kept for that long as a fallback:
 * `get()` still treats it as a miss, but if the loader then fails (upstream
 * rate limit, outage) `wrap()` serves the last known value instead of an error.
 * The default (0) keeps the original behaviour: expired entries are dropped.
 */
class TTLCache {
    constructor({ ttlMs, max = 500, staleMs = 0 }) {
        this.ttlMs = ttlMs;
        this.max = max;
        this.staleMs = staleMs;
        this.store = new Map();
        this.inflight = new Map();
    }

    get(key) {
        const hit = this.store.get(key);

        if (!hit) return undefined;

        if (hit.expires <= Date.now()) {
            // Keep it around only while it can still serve as a stale fallback.
            if (hit.expires + this.staleMs <= Date.now()) this.store.delete(key);

            return undefined;
        }

        return hit.value;
    }

    /** Last known value, including an expired one that is still inside the stale window. */
    getStale(key) {
        const hit = this.store.get(key);

        if (!hit) return undefined;

        if (hit.expires + this.staleMs <= Date.now()) {
            this.store.delete(key);
            return undefined;
        }

        return hit.value;
    }

    set(key, value, ttlMs = this.ttlMs) {
        // Re-inserting moves the key to the back, so "oldest" means least recently written.
        this.store.delete(key);

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
            } catch (error) {
                const stale = this.getStale(key);

                if (stale === undefined) throw error;

                console.warn(`[cache] upstream failed for ${key} (${error.response?.status || error.code || error.message}); serving last known data.`);

                return stale;
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
