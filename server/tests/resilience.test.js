const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");

const { getJson } = require("../lib/httpClient");
const { TTLCache } = require("../lib/cache");

/** Tiny upstream that answers each request with the next entry of `script` (status or [status, headers]). */
const startScripted = (script) =>
    new Promise((resolve) => {
        const calls = { count: 0 };
        const server = http.createServer((req, res) => {
            const step = script[Math.min(calls.count, script.length - 1)];
            const [status, headers = {}] = Array.isArray(step) ? step : [step];

            calls.count += 1;
            res.writeHead(status, { "Content-Type": "application/json", ...headers });
            res.end(JSON.stringify({ ok: status === 200 }));
        });

        server.listen(0, "127.0.0.1", () => resolve({ server, calls, url: `http://127.0.0.1:${server.address().port}/` }));
    });

test("getJson waits out a 429 (honouring Retry-After) and then succeeds", async () => {
    const { server, calls, url } = await startScripted([[429, { "Retry-After": "1" }], 200]);
    const started = Date.now();

    try {
        const data = await getJson(url);

        assert.deepEqual(data, { ok: true });
        assert.equal(calls.count, 2);
        assert.ok(Date.now() - started >= 1000, "waited for Retry-After");
    } finally {
        server.close();
    }
});

test("getJson gives up after the rate-limit retries are used", async () => {
    const { server, calls, url } = await startScripted([429]);

    try {
        await assert.rejects(() => getJson(url, {}, { rateLimitRetries: 2 }), (e) => e.response?.status === 429);
        assert.equal(calls.count, 3, "first try + 2 retries");
    } finally {
        server.close();
    }
});

test("getJson with retries: 0 never retries, even on 429", async () => {
    const { server, calls, url } = await startScripted([429]);

    try {
        await assert.rejects(() => getJson(url, {}, { retries: 0 }));
        assert.equal(calls.count, 1);
    } finally {
        server.close();
    }
});

test("getJson does not retry client errors", async () => {
    const { server, calls, url } = await startScripted([400]);

    try {
        await assert.rejects(() => getJson(url));
        assert.equal(calls.count, 1);
    } finally {
        server.close();
    }
});

test("TTLCache serves the last known value when the loader fails inside the stale window", async () => {
    const cache = new TTLCache({ ttlMs: 5, max: 10, staleMs: 60 * 1000 });

    await cache.wrap("k", async () => "fresh");
    await new Promise((resolve) => setTimeout(resolve, 15)); // let it expire

    assert.equal(cache.get("k"), undefined, "expired entries still count as a miss");
    assert.equal(await cache.wrap("k", async () => { throw new Error("429"); }), "fresh");
});

test("TTLCache without a stale window still surfaces loader errors", async () => {
    const cache = new TTLCache({ ttlMs: 5, max: 10 });

    await cache.wrap("k", async () => "fresh");
    await new Promise((resolve) => setTimeout(resolve, 15));

    await assert.rejects(() => cache.wrap("k", async () => { throw new Error("boom"); }), /boom/);
});

test("TTLCache never serves data older than the stale window, and a failed key with no history still errors", async () => {
    const cache = new TTLCache({ ttlMs: 5, max: 10, staleMs: 10 });

    await cache.wrap("k", async () => "fresh");
    await new Promise((resolve) => setTimeout(resolve, 40));

    await assert.rejects(() => cache.wrap("k", async () => { throw new Error("late"); }), /late/);
    await assert.rejects(() => cache.wrap("never-seen", async () => { throw new Error("none"); }), /none/);
});
