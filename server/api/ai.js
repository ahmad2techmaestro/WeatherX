const express = require("express");
const rateLimit = require("express-rate-limit");

const { getOverview } = require("../services/forecastService");
const { briefing, ask, aiEnabled } = require("../services/aiService");
const { parseCoordinates, cleanText } = require("../lib/validate");

const router = express.Router();

const limiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many questions. Please wait a minute." } });

const unitOf = (v) => (v === "fahrenheit" ? "fahrenheit" : "celsius");

// GET /api/ai/status
router.get("/status", (req, res) => res.json({ success: true, data: { engine: aiEnabled() ? "claude" : "rules" } }));

// GET /api/ai/briefing?lat&lon&name&unit
router.get("/briefing", limiter, async (req, res, next) => {
    try {
        const point = parseCoordinates(req.query.lat, req.query.lon);
        if (!point) return res.status(400).json({ success: false, message: "Valid latitude and longitude are required." });

        const overview = await getOverview(point.latitude, point.longitude);
        const data = await briefing(overview, cleanText(req.query.name, 80) || "your area", unitOf(req.query.unit));

        res.set("Cache-Control", "private, max-age=300");
        return res.json({ success: true, data });
    } catch (error) {
        return next(error);
    }
});

// POST /api/ai/ask { lat, lon, name, unit, question }
router.post("/ask", limiter, async (req, res, next) => {
    try {
        const { lat, lon, name, unit, question } = req.body || {};
        const point = parseCoordinates(lat, lon);
        const q = cleanText(question, 300);

        if (!point) return res.status(400).json({ success: false, message: "Valid latitude and longitude are required." });
        if (q.length < 3) return res.status(400).json({ success: false, message: "Ask a question of at least 3 characters." });

        const overview = await getOverview(point.latitude, point.longitude);
        const data = await ask(overview, cleanText(name, 80) || "your area", unitOf(unit), q);

        return res.json({ success: true, data });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
