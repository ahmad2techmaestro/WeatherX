const express = require("express");
const rateLimit = require("express-rate-limit");

const { run } = require("../services/agents/graph");
const runs = require("../services/agents/runs");
const { AGENTS } = require("../services/agents/registry");
const { narrate } = require("../services/agents/narrate");
const { makeWeatherFor, makeAnalysisFor } = require("../services/assistant/weatherSource");
const memory = require("../services/rag/memory");
const rag = require("../services/rag/rag");
const airIntel = require("../services/air/airIntel");
const travel = require("../services/travel/planner");
const { geminiEnabled } = require("../services/assistant/gemini");
const { parseCoordinates, cleanText } = require("../lib/validate");

const limiter = (limit) => rateLimit({ windowMs: 60 * 1000, limit, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many requests. Please wait a minute." } });
const hereOf = (q) => {
    const point = parseCoordinates(q.lat, q.lon);
    return point ? { ...point, name: cleanText(q.name, 80) || "your area" } : null;
};
const unitOf = (u) => (u === "fahrenheit" ? "fahrenheit" : "celsius");
const langOf = (l) => (["en", "hi"].includes(l) ? l : "auto");
const health = (memories) => memories.some((m) => m.kind === "health");

// ── /api/agents ─────────────────────────────────────────────────────────────────
const agents = express.Router();

agents.get("/", (req, res) => res.json({ success: true, data: { engine: geminiEnabled() ? "gemini" : "rules", framework: "LangGraph", agents: Object.values(AGENTS), stats: runs.stats(req.user.id) } }));
agents.get("/runs", (req, res) => res.json({ success: true, data: runs.recent(req.user.id) }));

// POST /api/agents/run { goal, lat, lon, name, unit, language }
agents.post("/run", limiter(10), async (req, res, next) => {
    try {
        const here = hereOf(req.body || {});
        if (!here) return res.status(400).json({ success: false, message: "Valid latitude and longitude are required." });
        if (require("../services/security/guard").looksLikeInjection(String(req.body.goal || ""))) require("../services/ops/events").flag("injection_attempt");
        const unit = unitOf(req.body.unit);
        const goal = cleanText(req.body.goal, 300);
        const memories = await memory.recall(req.user.id, goal).catch(() => []);
        const data = await run({ goal, unit, language: langOf(req.body.language), memories, deps: { weatherFor: makeWeatherFor(here), analysisFor: makeAnalysisFor(here, unit), guidanceFor: (q) => rag.retrieve(q, 3) } });
        const saved = runs.record({ id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString(), user: req.user.id, ...data, usedNotes: memories.length });
        const { user: _u, ...out } = saved;
        res.json({ success: true, data: out });
    } catch (e) {
        next(e);
    }
});

// ── /api/air ────────────────────────────────────────────────────────────────────
const air = express.Router();

// GET /api/air/analysis?lat&lon&name
air.get("/analysis", limiter(30), async (req, res, next) => {
    try {
        const here = hereOf(req.query);
        if (!here) return res.status(400).json({ success: false, message: "Valid latitude and longitude are required." });
        const memories = await memory.list(req.user.id).catch(() => []);
        const w = await makeWeatherFor(here)(null);
        const analysis = airIntel.analyze(w.overview, { sensitive: health(memories) });
        res.json({ success: true, data: { place: w.place, analysis, summary: airIntel.summary(analysis, w.place), personalised: health(memories) } });
    } catch (e) {
        next(e);
    }
});

// ── /api/travel ─────────────────────────────────────────────────────────────────
const travelRouter = express.Router();

// POST /api/travel/plan { destinations:[name], startDate?, nights?, unit, language, lat, lon, name }
travelRouter.post("/plan", limiter(15), async (req, res, next) => {
    try {
        const here = hereOf(req.body || {});
        if (!here) return res.status(400).json({ success: false, message: "Valid latitude and longitude are required." });
        const names = (Array.isArray(req.body.destinations) ? req.body.destinations : []).map((d) => cleanText(String(d), 60)).filter(Boolean).slice(0, 3);
        if (!names.length) return res.status(400).json({ success: false, message: "Enter at least one destination." });
        const startDate = /^\d{4}-\d{2}-\d{2}$/.test(req.body.startDate || "") ? req.body.startDate : undefined;
        const nights = Math.max(1, Math.min(7, Math.round(Number(req.body.nights) || 3)));
        const unit = unitOf(req.body.unit);
        const weatherFor = makeWeatherFor(here);

        const plans = await Promise.all(names.map(async (name) => {
            try {
                const w = await weatherFor(name);
                return { ...travel.planFor(w, { startDate, nights, unit }), summary: null };
            } catch (e) {
                return { place: name, error: e.userMessage || "Weather isn't available for that place right now." };
            }
        }));
        for (const p of plans) p.summary = travel.summary(p, unit);
        const ranked = plans.filter((p) => !p.error).sort((a, b) => b.score - a.score).map((p) => p.place);

        const good = plans.filter((p) => !p.error);
        const findings = good.map((p) => p.summary).join("\n");
        const text = good.length ? await narrate({ task: "You write a short travel-weather briefing for a person in India comparing the destinations.", findings: `${ranked.length > 1 ? `Ranking best to worst: ${ranked.join(", ")}.\n` : ""}${findings}`, lang: langOf(req.body.language) === "hi" ? "hi" : "en" }) : null;
        res.json({ success: true, data: { unit, plans, ranking: ranked, narrative: { text: text || `${ranked.length > 1 ? `${ranked[0]} scores best for these dates. ` : ""}${good.map((p) => p.summary).join(" ")}`, engine: text ? "gemini" : "rules" } } });
    } catch (e) {
        next(e);
    }
});

module.exports = { agents, air, travelRouter };
