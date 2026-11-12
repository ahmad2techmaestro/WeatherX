/**
 * AI event log: one row per AI request (feature, latency, outcome, Gemini calls and tokens, flags).
 * Rows hold no question text and no answers, only numbers and short labels.
 *
 * Storage is a bounded in-memory ring by default. server.js plugs in a MongoDB store (with a 30 day TTL)
 * once the database is connected, so analytics survive restarts. If the store fails, the in-memory ring keeps working.
 */
const { AsyncLocalStorage } = require("node:async_hooks");

const MAX = Number(process.env.AI_EVENTS_MAX) || 2000;
const ring = [];
let store = null;
const als = new AsyncLocalStorage();

const useStore = (s) => { store = s; };
const __reset = () => { ring.length = 0; store = null; };

const persist = (row) => {
    if (!store) return;
    Promise.resolve(store.insert(row)).catch((e) => console.error("[AiOps] could not persist event:", e.message));
};

const push = (row) => {
    ring.push(row);
    if (ring.length > MAX) ring.shift();
    persist(row);
};

/** Called by the Gemini client for every model call made inside a tracked request. */
const recordGemini = ({ ms, ok, usage }) => {
    const ctx = als.getStore();
    if (!ctx) return;
    ctx.gemini.calls++;
    ctx.gemini.ms += ms;
    if (!ok) ctx.gemini.errors++;
    ctx.gemini.promptTokens += Number(usage?.promptTokenCount) || 0;
    ctx.gemini.outputTokens += Number(usage?.candidatesTokenCount) || 0;
};

/** Lets a handler attach a flag to the current request's event, e.g. flag("injection"). */
const flag = (name) => { const ctx = als.getStore(); if (ctx && !ctx.flags.includes(name)) ctx.flags.push(name); };

/** Express middleware: times the request and writes one event when the response finishes. */
const track = (feature) => (req, res, next) => {
    const ctx = { missing: [], user: req.user?.id ? String(req.user.id) : null, gemini: { calls: 0, ms: 0, errors: 0, promptTokens: 0, outputTokens: 0 }, flags: [] };
    const started = Date.now();
    // Places whose weather could not be loaded are added to the JSON reply so the browser can fetch them itself
    // (from the visitor's own IP) and ask again. See client/src/lib/api.js callWithRelay.
    const json = res.json.bind(res);
    res.json = (body) => json(ctx.missing.length && body && typeof body === "object" && !Array.isArray(body) ? { ...body, missing: ctx.missing } : body);
    res.on("finish", () => {
        if (!req.user?.id) return;
        push({
            at: new Date(), user: String(req.user.id), feature, method: req.method, status: res.statusCode, ms: Date.now() - started,
            ok: res.statusCode < 400, engine: ctx.gemini.calls > 0 ? "gemini" : "rules", geminiCalls: ctx.gemini.calls, geminiErrors: ctx.gemini.errors,
            promptTokens: ctx.gemini.promptTokens, outputTokens: ctx.gemini.outputTokens, flags: ctx.flags,
        });
    });
    als.run(ctx, next);
};

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : null);

/** Aggregates rows. Pure function so it can be tested without a store. */
const summarise = (rows, { days = 7, now = Date.now() } = {}) => {
    const since = now - days * 86400000;
    const inRange = rows.filter((r) => new Date(r.at).getTime() >= since);
    const features = {};
    const daily = {};
    for (const r of inRange) {
        const f = (features[r.feature] ||= { feature: r.feature, requests: 0, errors: 0, gemini: 0, rules: 0, tokens: 0, ms: [] });
        f.requests++;
        if (!r.ok) f.errors++;
        r.engine === "gemini" ? f.gemini++ : f.rules++;
        f.tokens += (r.promptTokens || 0) + (r.outputTokens || 0);
        f.ms.push(r.ms);
        const day = new Date(r.at).toISOString().slice(0, 10);
        daily[day] = (daily[day] || 0) + 1;
    }
    const byFeature = Object.values(features).map((f) => {
        const s = f.ms.sort((a, b) => a - b);
        return { feature: f.feature, requests: f.requests, errors: f.errors, errorRate: f.requests ? +(f.errors / f.requests).toFixed(3) : 0, gemini: f.gemini, rules: f.rules, tokens: f.tokens, p50: pct(s, 50), p95: pct(s, 95) };
    }).sort((a, b) => b.requests - a.requests);

    const all = inRange.map((r) => r.ms).sort((a, b) => a - b);
    const series = [];
    for (let i = days - 1; i >= 0; i--) { const d = new Date(now - i * 86400000).toISOString().slice(0, 10); series.push({ date: d, requests: daily[d] || 0 }); }
    return {
        days,
        total: inRange.length,
        errors: inRange.filter((r) => !r.ok).length,
        geminiRequests: inRange.filter((r) => r.engine === "gemini").length,
        geminiCalls: inRange.reduce((s, r) => s + (r.geminiCalls || 0), 0),
        geminiErrors: inRange.reduce((s, r) => s + (r.geminiErrors || 0), 0),
        promptTokens: inRange.reduce((s, r) => s + (r.promptTokens || 0), 0),
        outputTokens: inRange.reduce((s, r) => s + (r.outputTokens || 0), 0),
        flagged: inRange.filter((r) => r.flags?.length).length,
        p50: pct(all, 50),
        p95: pct(all, 95),
        byFeature,
        series,
    };
};

/** Rows for one user, newest last. Uses the store when present (so history survives restarts). */
const rowsFor = async (user, days) => {
    const since = new Date(Date.now() - days * 86400000);
    if (store) {
        try { return await store.list(String(user), since); } catch (e) { console.error("[AiOps] store read failed, using memory:", e.message); }
    }
    return ring.filter((r) => r.user === String(user) && r.at >= since);
};

const recent = (rows, limit = 15) => rows.slice(-limit).reverse().map((r) => ({ at: r.at, feature: r.feature, ms: r.ms, ok: r.ok, status: r.status, engine: r.engine, tokens: (r.promptTokens || 0) + (r.outputTokens || 0), flags: r.flags || [] }));

/**
 * Captures the current request's context so work started later from a library that loses async context
 * (a graph runner, a queue) can still run inside it: `const inRequest = capture(); inRequest(() => work())`.
 */
const capture = () => { const store = als.getStore(); return (fn) => (store ? als.run(store, fn) : fn()); };

/** Records a place whose weather could not be fetched during this request (max 5). */
const noteMissing = (latitude, longitude, fallback) => {
    const ctx = als.getStore();
    if (ctx && ctx.missing.length < 5 && !ctx.missing.some((m) => m.latitude === latitude && m.longitude === longitude)) ctx.missing.push(fallback ? { latitude, longitude, fallback } : { latitude, longitude });
};

/** Id of the signed-in user for the request being handled (null outside a tracked request). */
const currentUserId = () => als.getStore()?.user || null;

module.exports = { capture, noteMissing, currentUserId, track, recordGemini, flag, summarise, rowsFor, recent, useStore, __reset, push };
