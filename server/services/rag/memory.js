/**
 * Long-term user memory: short facts the user shares or saves, retrieved by similarity and given to the assistant
 * as DATA (never as instructions). Facts are extracted by explicit patterns only, so nothing is saved silently
 * that the user did not plainly say about themselves; the UI lists everything and lets them delete it.
 */
const { embed } = require("./embeddings");
const { topK } = require("./vectorStore");
const { cleanText } = require("../../lib/validate");

const MAX_PER_USER = 40;
const MAX_LEN = 160;

const normKey = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();

// Pattern → fact. Matched against a single user message; the first-person statement itself becomes the memory.
const PATTERNS = [
    { kind: "health", re: /\b(?:i|we)\s+(?:have|got|suffer from|am (?:allergic|sensitive))\s+(?:an?\s+)?((?:[a-z]+\s+){0,2}(?:asthma|allergy|allergies|copd|bronchitis|migraines?|diabetes|hypertension|sinusitis|dust allergy|pollen allergy))\b/i, fact: (m) => `Has ${m[1].toLowerCase()}` },
    { kind: "health", re: /\b(?:i am|i'm|im)\s+(?:allergic|sensitive)\s+to\s+([a-z ]{3,30})/i, fact: (m) => `Allergic or sensitive to ${m[1].trim().toLowerCase()}` },
    { kind: "health", re: /(?:mujhe|mereko)\s+([a-z ]{0,15}(?:asthma|dama|allergy|migraine|sinus))\b/i, fact: (m) => `Has ${m[1].trim().toLowerCase()}` },
    { kind: "routine", re: /\b(?:i|we)\s+(?:usually\s+|always\s+)?(?:commute|travel|ride|go to (?:work|office))\s+(?:to work\s+)?(?:by|on|via)\s+(?:a\s+)?(bike|motorcycle|scooter|bicycle|cycle|bus|train|metro|car|auto)\b/i, fact: (m) => `Commutes by ${m[1].toLowerCase()}` },
    { kind: "routine", re: /\b(?:i|we)\s+(?:usually\s+|always\s+)?(run|jog|walk|cycle|exercise|workout)\s+(?:in the|every|at)\s+(morning|evening|night|afternoon|dawn)\b/i, fact: (m) => `Usually ${m[1].toLowerCase()}s in the ${m[2].toLowerCase()}`.replace("ss ", "s ") },
    { kind: "routine", re: /\b(?:i|we)\s+(?:work|am working|travel)\s+outdoors?\b|\boutdoor (?:worker|job)\b/i, fact: () => "Works outdoors" },
    { kind: "preference", re: /\bi\s+(?:prefer|like|love)\s+(cooler|warmer|colder|hotter|dry|humid|sunny|cloudy|rainy)\s+(?:weather|days?|temperatures?)\b/i, fact: (m) => `Prefers ${m[1].toLowerCase()} weather` },
    { kind: "preference", re: /\bi\s+(?:hate|dislike|can't stand|cannot stand)\s+(humidity|heat|cold|rain|wind|dust)\b/i, fact: (m) => `Dislikes ${m[1].toLowerCase()}` },
    { kind: "routine", re: /\b(?:i|we)\s+have\s+(?:an?\s+)?(small kids?|young kids?|toddler|baby|infant|elderly parents?|old parents?|pets?|dog|cat)\b/i, fact: (m) => `Has ${m[1].toLowerCase()} at home` },
];
const EXPLICIT = /^\s*(?:please\s+)?(?:remember(?: that)?|yaad rakho(?: ki)?|note that)\s+(.{4,160})$/i;

/** Facts a message states about the user. Returns [{text, kind}] (de-duplicated). */
const extractMemories = (message) => {
    const text = cleanText(String(message || ""), 400);
    const out = [];
    const ex = text.match(EXPLICIT);
    if (ex) out.push({ text: cleanText(ex[1].replace(/[.!?]+$/, ""), MAX_LEN), kind: "note" });
    for (const { re, fact, kind } of PATTERNS) {
        const m = text.match(re);
        if (m) out.push({ text: cleanText(fact(m), MAX_LEN), kind });
    }
    const seen = new Set();
    return out.filter((f) => f.text.length >= 4 && !seen.has(normKey(f.text)) && seen.add(normKey(f.text)));
};

// ── storage: Mongo by default, replaceable in tests ───────────────────────────────────────────────
const mongoStore = () => {
    const Memory = require("../../models/Memory");
    const plain = (d) => ({ id: String(d._id), text: d.text, kind: d.kind, source: d.source, createdAt: d.createdAt, embedding: d.embedding, provider: d.provider });
    return {
        async list(user, withVectors = false) {
            const q = Memory.find({ user }).sort({ createdAt: -1 }).limit(MAX_PER_USER);
            if (withVectors) q.select("+embedding +provider");
            return (await q.lean()).map(plain);
        },
        async add(user, doc) {
            try {
                const d = await Memory.create({ user, ...doc });
                return plain(d);
            } catch (e) {
                if (e.code === 11000) return null;
                throw e;
            }
        },
        async remove(user, id) {
            if (!/^[0-9a-f]{24}$/i.test(id)) return false;
            return (await Memory.deleteOne({ _id: id, user })).deletedCount > 0;
        },
        async setVector(user, id, embedding, provider) {
            await Memory.updateOne({ _id: id, user }, { embedding, provider });
        },
    };
};
let store = null;
const getStore = () => store || (store = mongoStore());
const __setStoreForTests = (s) => { store = s; };

const publicView = ({ id, text, kind, source, createdAt }) => ({ id, text, kind, source, createdAt });

const list = async (user) => (await getStore().list(user)).map(publicView);

/** Saves a fact. Returns the saved memory, or null if it is a duplicate. Throws {status:400/409} on limits. */
const HEALTH_WORDS = /\b(asthma|asthmatic|allerg\w*|copd|bronchitis|migraines?|diabet\w*|hypertension|sinus\w*|heart (?:disease|condition|patient)|lung|respiratory|pregnan\w*)\b/i;

const remember = async (user, rawText, { kind = "note", source = "manual" } = {}) => {
    const text = cleanText(rawText, MAX_LEN);
    if (kind === "note" && HEALTH_WORDS.test(text)) kind = "health";
    if (text.length < 4) throw Object.assign(new Error("Memory must be at least 4 characters."), { status: 400 });
    const existing = await getStore().list(user);
    if (existing.length >= MAX_PER_USER) throw Object.assign(new Error(`You can keep up to ${MAX_PER_USER} memories. Delete one to add another.`), { status: 409 });
    const { vectors, provider } = await embed([text]);
    const saved = await getStore().add(user, { text, key: normKey(text), kind, source, embedding: vectors[0], provider });
    return saved ? publicView(saved) : null;
};

const forget = (user, id) => getStore().remove(user, id);

/** Memories most relevant to a question (re-embedding any that were stored with a different provider). */
const recall = async (user, query, k = 3, minScore = 0.12) => {
    const items = await getStore().list(user, true);
    if (!items.length) return [];
    const { vectors: [q], provider } = await embed([query], "RETRIEVAL_QUERY");
    const stale = items.filter((m) => m.provider !== provider || !m.embedding?.length);
    if (stale.length) {
        const fresh = await embed(stale.map((m) => m.text));
        for (let i = 0; i < stale.length; i++) {
            stale[i].embedding = fresh.vectors[i];
            stale[i].provider = fresh.provider;
            await getStore().setVector(user, stale[i].id, fresh.vectors[i], fresh.provider).catch(() => {});
        }
    }
    const usable = items.filter((m) => m.provider === provider && m.embedding?.length).map((m) => ({ ...m, vector: m.embedding }));
    const hits = topK(q, usable, k, minScore).map((r) => ({ ...publicView(r.item), score: Math.round(r.score * 100) / 100 }));
    // Health conditions are always relevant to safety advice, even when the wording shares nothing with the question.
    for (const m of items.filter((x) => x.kind === "health").slice(0, 2)) if (!hits.some((h) => h.id === m.id)) hits.push({ ...publicView(m), score: 0 });
    return hits.slice(0, k + 2);
};

module.exports = { extractMemories, remember, forget, list, recall, normKey, __setStoreForTests, MAX_PER_USER };
