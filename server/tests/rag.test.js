const test = require("node:test");
const assert = require("node:assert/strict");

const embeddings = require("../services/rag/embeddings");
const memory = require("../services/rag/memory");
const rag = require("../services/rag/rag");
const { chat } = require("../services/assistant/assistant");
const { __setGeminiForTests } = require("../services/assistant/gemini");
const { topK } = require("../services/rag/vectorStore");

// In-memory memory store, same interface as the Mongo one.
const fakeStore = () => {
    const rows = [];
    let n = 0;
    return {
        rows,
        async list(user, v) { return rows.filter((r) => r.user === user).map((r) => ({ ...r, ...(v ? {} : { embedding: undefined }) })); },
        async add(user, doc) { if (rows.some((r) => r.user === user && r.key === doc.key)) return null; const r = { id: `m${++n}`, user, createdAt: new Date(), ...doc }; rows.push(r); return r; },
        async remove(user, id) { const i = rows.findIndex((r) => r.user === user && r.id === id); if (i < 0) return false; rows.splice(i, 1); return true; },
        async setVector(user, id, e, p) { const r = rows.find((x) => x.id === id); if (r) { r.embedding = e; r.provider = p; } },
    };
};

test.beforeEach(() => { delete process.env.GEMINI_API_KEY; process.env.RAG_EMBEDDINGS = "local"; rag.__resetIndexForTests(); memory.__setStoreForTests(fakeStore()); });
test.afterEach(() => __setGeminiForTests(null));

test("local embeddings: normalised, deterministic, similar text scores higher than unrelated", () => {
    const a = embeddings.localEmbed("heat stroke symptoms and treatment");
    const b = embeddings.localEmbed("symptoms of heat stroke");
    const c = embeddings.localEmbed("lightning shelter thunder");
    assert.equal(a.length, embeddings.DIMS);
    assert.ok(Math.abs(Math.sqrt(a.reduce((s, x) => s + x * x, 0)) - 1) < 1e-3);
    assert.deepEqual(a, embeddings.localEmbed("heat stroke symptoms and treatment"));
    assert.ok(embeddings.cosine(a, b) > embeddings.cosine(a, c));
});

test("cosine of mismatched lengths is 0; topK orders and filters", () => {
    assert.equal(embeddings.cosine([1, 0], [1, 0, 0]), 0);
    const r = topK([1, 0], [{ id: "a", vector: [0.6, 0.8] }, { id: "b", vector: [1, 0] }, { id: "c", vector: [0, 1] }], 2, 0.1);
    assert.deepEqual(r.map((x) => x.item.id), ["b", "a"]);
});

test("retrieval finds the right passage for common questions", async () => {
    const cases = [
        ["How do I recognise heat stroke?", "heat-illness"],
        ["What should I do during lightning and thunder?", "lightning"],
        ["What AQI is good, poor, very poor?", "aqi-categories"],
        ["Which mask works against PM2.5 pollution?", "masks"],
        ["When is a heatwave declared in India?", "heatwave-criteria"],
    ];
    for (const [q, id] of cases) {
        const { results } = await rag.retrieve(q, 3);
        assert.ok(results.slice(0, 2).some((r) => r.id === id), `${q} -> ${results.map((r) => r.id)}`);
    }
});

test("an unrelated question retrieves nothing and says so instead of guessing", async () => {
    const out = await rag.ask({ question: "Who won the cricket match yesterday?" });
    assert.equal(out.found, false);
    assert.equal(out.sources.length, 0);
});

test("ask without Gemini returns the passage with sources (engine retrieval)", async () => {
    const out = await rag.ask({ question: "How do I recognise heat stroke?" });
    assert.equal(out.engine, "retrieval");
    assert.equal(out.found, true);
    assert.match(out.answer, /Heat stroke is an emergency/);
    assert.ok(out.sources[0].title);
});

test("Gemini answers are accepted only with valid citations; otherwise retrieval is used", async () => {
    process.env.GEMINI_API_KEY = "x";
    let seen;
    __setGeminiForTests(async ({ contents }) => { seen = contents[0].parts[0].text; return { text: "Move to a cool place and call 112 for heat stroke [1].", calls: [], content: {} }; });
    const ok = await rag.ask({ question: "How do I recognise heat stroke?" });
    assert.equal(ok.engine, "gemini");
    assert.match(seen, /SOURCES:\n\[1\]/);
    assert.ok(ok.sources.some((s) => s.cited));

    __setGeminiForTests(async () => ({ text: "Just drink tea.", calls: [], content: {} })); // no citation
    assert.equal((await rag.ask({ question: "How do I recognise heat stroke?" })).engine, "retrieval");
    __setGeminiForTests(async () => ({ text: "See [9].", calls: [], content: {} })); // citation out of range
    assert.equal((await rag.ask({ question: "How do I recognise heat stroke?" })).engine, "retrieval");
    __setGeminiForTests(async () => { throw new Error("quota"); });
    assert.equal((await rag.ask({ question: "How do I recognise heat stroke?" })).engine, "retrieval");
});

test("memory extraction: only plain first-person statements", () => {
    const f = (t) => memory.extractMemories(t).map((x) => x.text);
    assert.deepEqual(f("I have asthma, should I run today?"), ["Has asthma"]);
    assert.deepEqual(f("I commute by bike every day"), ["Commutes by bike"]);
    assert.deepEqual(f("remember that I leave for work at 8am"), ["I leave for work at 8am"]);
    assert.deepEqual(f("I prefer cooler weather"), ["Prefers cooler weather"]);
    assert.deepEqual(f("Does asthma get worse in smog?"), []);
    assert.deepEqual(f("My friend has asthma"), []);
});

test("memory: remember, de-duplicate, recall by relevance, forget, per-user isolation, cap", async () => {
    const a = await memory.remember("u1", "Has asthma", { kind: "health" });
    assert.ok(a.id);
    assert.equal(await memory.remember("u1", "has asthma!"), null); // duplicate
    await memory.remember("u1", "Commutes by bike", { kind: "routine" });
    await memory.remember("u2", "Has a dog at home");

    const top = await memory.recall("u1", "is air pollution bad for my asthma?");
    assert.equal(top[0].text, "Has asthma");
    assert.ok(!(await memory.recall("u1", "dog")).some((m) => m.text.includes("dog")));
    assert.equal((await memory.list("u2")).length, 1);
    assert.equal(await memory.forget("u2", a.id), false); // not theirs
    assert.equal(await memory.forget("u1", a.id), true);
    assert.equal((await memory.list("u1")).length, 1);

    for (let i = 0; i < memory.MAX_PER_USER; i++) await memory.remember("cap", `Fact number ${i} here`).catch(() => {});
    await assert.rejects(memory.remember("cap", "One more fact"), (e) => e.status === 409);
    await assert.rejects(memory.remember("u1", "no"), (e) => e.status === 400);
});

test("memory is re-embedded when the embedding provider changes", async () => {
    await memory.remember("u1", "Has asthma", { kind: "health" });
    embeddings.__setEmbedderForTests(async (texts) => texts.map((t) => (/asthma/i.test(t) ? [1, 0, 0, 0] : [0, 1, 0, 0]))); // provider "test"
    const top = await memory.recall("u1", "my asthma and smog", 3, 0.5);
    embeddings.__setEmbedderForTests(null);
    assert.equal(top[0].text, "Has asthma");
});

test("assistant: memories reach the model prompt as data; guidance tool returns real passages; sources are reported", async () => {
    process.env.GEMINI_API_KEY = "x";
    await memory.remember("u1", "Has asthma", { kind: "health" });
    const systems = [];
    let step = 0;
    __setGeminiForTests(async ({ system, tools }) => {
        systems.push({ system, tools: tools.map((t) => t.name) });
        if (step++ === 0) return { text: "", calls: [{ name: "search_guidance", args: { query: "AQI exercise" } }], content: { role: "model", parts: [] } };
        return { text: "With asthma, keep exercise indoors when AQI is above 200.", calls: [], content: { role: "model", parts: [] } };
    });
    const out = await chat({
        messages: [{ role: "user", text: "Is it safe to exercise in bad air?" }], here: { latitude: 1, longitude: 2, name: "Pune" }, unit: "celsius",
        deps: { weatherFor: async () => { throw new Error("not needed"); }, memoryFor: (q) => memory.recall("u1", q), guidanceFor: (q) => rag.retrieve(q, 3) },
    });
    assert.equal(out.engine, "gemini");
    assert.match(systems[0].system, /USER NOTES[\s\S]*Has asthma/);
    assert.ok(systems[0].tools.includes("search_guidance"));
    assert.ok(out.sources.length >= 1);
    assert.equal(out.usedNotes, 1);
});

test("assistant rule engine answers how-to/safety questions from the knowledge base, weather questions still from forecast", async () => {
    let weatherCalled = false;
    const deps = { weatherFor: async () => { weatherCalled = true; throw new Error("no weather"); }, guidanceFor: (q) => rag.retrieve(q, 3) };
    const out = await chat({ messages: [{ role: "user", text: "How do I recognise heat stroke?" }], here: { latitude: 1, longitude: 2, name: "Pune" }, unit: "celsius", deps });
    assert.equal(out.intent, "guidance");
    assert.equal(weatherCalled, false);
    assert.match(out.reply, /Heat stroke/);
});

test("manual notes that describe a health condition are stored as health (so safety answers always see them)", async () => {
    const a = await memory.remember("u9", "I get asthma attacks in smog");
    const b = await memory.remember("u9", "I run in the morning");
    const rows = await memory.list("u9");
    assert.equal(rows.find((r) => r.id === a.id).kind, "health");
    assert.equal(rows.find((r) => r.id === b.id).kind, "note");
});
