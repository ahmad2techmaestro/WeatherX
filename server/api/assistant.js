const express = require("express");
const rateLimit = require("express-rate-limit");

const { chat } = require("../services/assistant/assistant");
const { makeWeatherFor, makeAnalysisFor } = require("../services/assistant/weatherSource");
const { geminiEnabled, geminiModel } = require("../services/assistant/gemini");
const { parseCoordinates, cleanText } = require("../lib/validate");
const memory = require("../services/rag/memory");
const rag = require("../services/rag/rag");

const router = express.Router();

const limiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many questions. Please wait a minute." } });

// GET /api/assistant/status
router.get("/status", (req, res) => res.json({ success: true, data: { engine: geminiEnabled() ? "gemini" : "rules", model: geminiEnabled() ? geminiModel() : null } }));

// POST /api/assistant/chat { messages:[{role,text}], lat, lon, name, unit, language }
router.post("/chat", limiter, async (req, res, next) => {
    try {
        const { messages, lat, lon, name, unit, language } = req.body || {};
        const point = parseCoordinates(lat, lon);
        if (!point) return res.status(400).json({ success: false, message: "Valid latitude and longitude are required." });

        const here = { ...point, name: cleanText(name, 80) || "your area" };
        const userId = req.user.id;
        const data = await chat({ messages, here, unit, language: ["en", "hi"].includes(language) ? language : "auto", deps: { weatherFor: makeWeatherFor(here), analysisFor: makeAnalysisFor(here, unit === "fahrenheit" ? "fahrenheit" : "celsius"), memoryFor: (q) => memory.recall(userId, q), guidanceFor: (q) => rag.retrieve(q, 3) } });

        // Facts the user plainly stated about themselves are saved (and shown in the reply so they can be removed).
        const lastUser = [...(Array.isArray(messages) ? messages : [])].reverse().find((m) => m?.role === "user");
        const remembered = [];
        for (const fact of memory.extractMemories(lastUser?.text)) {
            try {
                const saved = await memory.remember(userId, fact.text, { kind: fact.kind, source: "chat" });
                if (saved) remembered.push(saved);
            } catch (e) { /* limit reached or storage down: the answer still stands */ }
        }
        if (remembered.length) data.remembered = remembered;

        return res.json({ success: true, data });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
