/**
 * Minimal Gemini client (REST, generateContent) with function calling.
 * The API key goes in the x-goog-api-key header, never in the URL, so it can't leak into access logs.
 */
const axios = require("axios");
const ops = require("../ops/events");
const guard = require("../security/guard");

const BASE = process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.5-flash";

let override = null; // tests inject a fake model here
const __setGeminiForTests = (fn) => { override = fn; };

const clean = (v) => String(v || "").trim().replace(/^["']|["']$/g, "").trim();
const geminiKey = () => clean(process.env.GEMINI_API_KEY);
const geminiModel = () => clean(process.env.GEMINI_MODEL) || DEFAULT_MODEL;
const geminiEnabled = () => Boolean(override) || Boolean(geminiKey());


/**
 * @param {{system:string, contents:object[], tools?:object[], maxOutputTokens?:number}} p
 * @returns {Promise<{content:object, text:string, calls:{name:string,args:object}[]}>}
 */
const generate = async (params) => {
    const out = await generateRaw(params);
    // Every caller falls back to deterministic text when this throws.
    if (out.text && guard.leaksPrompt(out.text)) {
        ops.flag("leak_blocked");
        throw new Error("Reply discarded by output guard");
    }
    return out;
};

const generateRaw = async ({ system, contents, tools, maxOutputTokens = 500 }) => {
    if (override) {
        const out = await override({ system, contents, tools });
        ops.recordGemini({ ms: 0, ok: true, usage: out?.usage });
        return out;
    }

    const started = Date.now();
    let usage = null;
    let ok = false;
    try {
        const out = await call({ system, contents, tools, maxOutputTokens }, (u) => { usage = u; });
        ok = true;
        return out;
    } finally {
        ops.recordGemini({ ms: Date.now() - started, ok, usage });
    }
};

const call = async ({ system, contents, tools, maxOutputTokens }, onUsage) => {
    const { data } = await axios.post(
        `${BASE}/models/${encodeURIComponent(geminiModel())}:generateContent`,
        {
            systemInstruction: { parts: [{ text: system }] },
            contents,
            ...(tools?.length ? { tools: [{ functionDeclarations: tools }] } : {}),
            generationConfig: { temperature: 0.3, maxOutputTokens },
        },
        { headers: { "x-goog-api-key": geminiKey(), "content-type": "application/json" }, timeout: 20000 }
    );

    onUsage(data?.usageMetadata || null);
    const candidate = data?.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const text = parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join(" ").trim();
    const calls = parts.filter((p) => p.functionCall).map((p) => ({ name: p.functionCall.name, args: p.functionCall.args || {} }));

    if (!candidate || (!text && !calls.length)) {
        const blocked = data?.promptFeedback?.blockReason || candidate?.finishReason;
        throw new Error(`Empty Gemini response${blocked ? ` (${blocked})` : ""}`);
    }

    // The model's own content is returned untouched so it can be echoed back (keeps any thought signatures intact).
    return { content: candidate.content, text, calls };
};

const geminiKeyValue = geminiKey;
const geminiBase = () => BASE;

module.exports = { geminiKeyValue, geminiBase, generate, geminiEnabled, geminiModel, __setGeminiForTests };
