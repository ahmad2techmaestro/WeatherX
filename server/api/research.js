const express = require("express");
const rateLimit = require("express-rate-limit");

const rag = require("../services/rag/rag");
const memory = require("../services/rag/memory");
const { embed } = require("../services/rag/embeddings");
const { geminiEnabled } = require("../services/assistant/gemini");
const { cleanText } = require("../lib/validate");

const router = express.Router();
const memoryRouter = express.Router();
const limiter = (limit) => rateLimit({ windowMs: 60 * 1000, limit, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many requests. Please wait a minute." } });

// GET /api/research/status
router.get("/status", (req, res) => res.json({ success: true, data: { engine: geminiEnabled() ? "gemini" : "retrieval", embeddings: geminiEnabled() ? "gemini" : "local", documents: rag.KB_SIZE, topics: rag.topics(), examples: rag.sample() } }));

// POST /api/research/ask { question, language }
router.post("/ask", limiter(20), async (req, res, next) => {
    try {
        const { question, language } = req.body || {};
        if (require("../services/security/guard").looksLikeInjection(String(question || ""))) require("../services/ops/events").flag("injection_attempt");
        const memories = await memory.recall(req.user.id, cleanText(question, 300)).catch(() => []);
        const data = await rag.ask({ question, language: ["en", "hi"].includes(language) ? language : "auto", memories });
        res.json({ success: true, data });
    } catch (e) {
        next(e);
    }
});

// GET /api/memory, POST /api/memory { text }, DELETE /api/memory/:id
memoryRouter.get("/", async (req, res, next) => {
    try {
        res.json({ success: true, data: { items: await memory.list(req.user.id), max: memory.MAX_PER_USER } });
    } catch (e) {
        next(e);
    }
});

memoryRouter.post("/", limiter(30), async (req, res, next) => {
    try {
        const saved = await memory.remember(req.user.id, req.body?.text, { kind: "note", source: "manual" });
        res.status(saved ? 201 : 200).json({ success: true, data: saved, duplicate: !saved });
    } catch (e) {
        next(e);
    }
});

memoryRouter.delete("/:id", async (req, res, next) => {
    try {
        const ok = await memory.forget(req.user.id, req.params.id);
        if (!ok) return res.status(404).json({ success: false, message: "Memory not found." });
        res.json({ success: true });
    } catch (e) {
        next(e);
    }
});

module.exports = router;
module.exports.memoryRouter = memoryRouter;
