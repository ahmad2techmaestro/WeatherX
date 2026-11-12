const express = require("express");
const rateLimit = require("express-rate-limit");

const events = require("../services/ops/events");
const { geminiEnabled, geminiModel } = require("../services/assistant/gemini");
const mlClient = require("../services/ml/client");
const memory = require("../services/rag/memory");
const { getStore: workflowStore } = require("../services/automation/store");

const router = express.Router();
const limiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many requests. Please wait a minute." } });

/** What is switched on, plus this user's counts. Nothing here exposes keys or other users' data. */
router.get("/overview", limiter, async (req, res, next) => {
    try {
        const days = Math.min(30, Math.max(1, Number(req.query.days) || 7));
        const [ml, rows, notes, workflows] = await Promise.all([
            mlClient.status().catch(() => ({ enabled: false })),
            events.rowsFor(req.user.id, days),
            memory.list(req.user.id).catch(() => null),
            workflowStore().list(req.user.id).catch(() => null),
        ]);
        res.json({
            success: true,
            data: {
                status: {
                    gemini: { enabled: geminiEnabled(), model: geminiEnabled() ? geminiModel() : null },
                    embeddings: process.env.RAG_EMBEDDINGS === "local" || !geminiEnabled() ? "local" : "gemini",
                    ml: { enabled: Boolean(ml.enabled), healthy: Boolean(ml.healthy) },
                    persistence: "memory-or-db",
                },
                counts: { memories: Array.isArray(notes) ? notes.length : null, workflows: Array.isArray(workflows) ? workflows.length : null, activeWorkflows: Array.isArray(workflows) ? workflows.filter((w) => w.enabled).length : null },
                usage: events.summarise(rows, { days }),
                recent: events.recent(rows, 12),
            },
        });
    } catch (e) { next(e); }
});

module.exports = router;
