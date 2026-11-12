/**
 * Text embeddings for retrieval.
 *  - "gemini": gemini-embedding-001 through the same GEMINI_API_KEY (256 dims, L2-normalised).
 *  - "local":  a deterministic hashed bag-of-words vector (no network, no key). It matches shared words rather than
 *    meaning, so it is weaker than Gemini; every vector records its provider so the two are never compared.
 */
const axios = require("axios");
const { geminiKeyValue, geminiBase } = require("../assistant/gemini");

const MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
const DIMS = 256;

let override = null; // tests inject a fake provider: async (texts, task) => number[][]
const __setEmbedderForTests = (fn) => { override = fn; };

const normalise = (v) => {
    const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => Math.round((x / n) * 1e6) / 1e6);
};

const STOP = new Set("a an the is are was were be to of in on at for and or it this that with as by do does i my me you your what how when should can will if from not no yes".split(" "));
const tokens = (text) =>
    String(text || "").toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]+/gu)?.filter((t) => t.length > 1 && !STOP.has(t)).map((t) => (/^[a-z]+$/.test(t) && t.length > 4 ? t.replace(/(ing|ed|es|s)$/, "") : t)) || [];

const hash = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
};

const localEmbed = (text) => {
    const v = new Array(DIMS).fill(0);
    const t = tokens(text);
    t.forEach((w, i) => {
        v[hash(w) % DIMS] += 1;
        if (i > 0) v[hash(`${t[i - 1]} ${w}`) % DIMS] += 0.5;
    });
    return normalise(v);
};

const geminiOn = () => Boolean(geminiKeyValue()) && String(process.env.RAG_EMBEDDINGS || "").toLowerCase() !== "local";

/** @returns {Promise<{vectors:number[][], provider:string}>} */
const embed = async (texts, task = "RETRIEVAL_DOCUMENT") => {
    const list = texts.map((t) => String(t || "").slice(0, 2000));
    if (override) return { vectors: await override(list, task), provider: "test" };
    if (geminiOn()) {
        try {
            const { data } = await axios.post(
                `${geminiBase()}/models/${MODEL}:batchEmbedContents`,
                { requests: list.map((text) => ({ model: `models/${MODEL}`, content: { parts: [{ text }] }, taskType: task, outputDimensionality: DIMS })) },
                { headers: { "x-goog-api-key": geminiKeyValue(), "content-type": "application/json" }, timeout: 15000 }
            );
            const vectors = (data?.embeddings || []).map((e) => normalise(e.values || []));
            if (vectors.length === list.length && vectors.every((v) => v.length === DIMS)) return { vectors, provider: "gemini" };
            throw new Error("Unexpected embedding response");
        } catch (e) {
            console.error("[RAG] Gemini embeddings failed, using local:", e.response?.status || e.message);
        }
    }
    return { vectors: list.map(localEmbed), provider: "local" };
};

const cosine = (a, b) => {
    if (!a || !b || a.length !== b.length) return 0;
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
};

module.exports = { embed, cosine, tokens, localEmbed, __setEmbedderForTests, DIMS };
