const express = require("express");

const { searchPlaces, reversePlace } = require("../providers/geocoder");
const { parseCoordinates, cleanText } = require("../lib/validate");

const router = express.Router();

// GET /api/geo/search?q=gorakh&scope=india|world&limit=8
router.get("/search", async (req, res, next) => {
    try {
        const q = cleanText(req.query.q, 80);

        if (q.length < 2) {
            return res.status(400).json({ success: false, message: "Type at least 2 characters to search." });
        }

        const scope = req.query.scope === "world" ? "world" : "india";
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 8, 1), 12);

        const data = await searchPlaces(q, { scope, limit });

        res.set("Cache-Control", "public, max-age=3600");

        return res.status(200).json({ success: true, count: data.length, data });
    } catch (error) {
        return next(error);
    }
});

// GET /api/geo/reverse?lat=26.76&lon=83.37
router.get("/reverse", async (req, res, next) => {
    try {
        const point = parseCoordinates(req.query.lat, req.query.lon);

        if (!point) {
            return res.status(400).json({ success: false, message: "Valid latitude and longitude are required." });
        }

        const place = await reversePlace(point.latitude, point.longitude);

        // Not a failure: open country, sea or desert. The client falls back to coordinates.
        if (!place) {
            return res.status(404).json({ success: false, message: "No named place found for these coordinates." });
        }

        res.set("Cache-Control", "public, max-age=3600");

        return res.status(200).json({ success: true, data: place });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
