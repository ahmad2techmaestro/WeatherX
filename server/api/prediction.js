const express = require("express");
const rateLimit = require("express-rate-limit");

const { getAnalysis } = require("../services/prediction/service");
const { parseCoordinates, cleanText } = require("../lib/validate");

const router = express.Router();
const limiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many requests. Please wait a minute." } });

// GET /api/prediction/analysis?lat=&lon=&name=&unit=celsius|fahrenheit&language=en|hi
router.get("/analysis", limiter, async (req, res, next) => {
    try {
        const point = parseCoordinates(req.query.lat, req.query.lon);
        if (!point) return res.status(400).json({ success: false, message: "Valid latitude and longitude are required." });
        const data = await getAnalysis({ ...point, name: cleanText(req.query.name, 80) || "your area", unit: req.query.unit, language: req.query.language });
        return res.json({ success: true, data });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
