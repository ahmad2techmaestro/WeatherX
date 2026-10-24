const express = require("express");
const mongoose = require("mongoose");

const { getOverview, getSummary, prefetchMany, getGrid, recordSnapshot } = require("../services/forecastService");
const { optionalAuthenticate } = require("../middleware/optionalAuth");
const { parseCoordinates, cleanText } = require("../lib/validate");

const router = express.Router();

const MAX_COMPARE_POINTS = 5;

// GET /api/weather/overview?lat=26.76&lon=83.37[&name=Gorakhpur&country=IN]
// Current conditions, 7 days of hourly data, 14 days of daily data, air quality,
// astronomy, insights and forecast-based advisories — one request per location.
router.get("/overview", optionalAuthenticate, async (req, res, next) => {
    try {
        const point = parseCoordinates(req.query.lat, req.query.lon);

        if (!point) {
            return res.status(400).json({ success: false, message: "Valid latitude and longitude are required." });
        }

        const overview = await getOverview(point.latitude, point.longitude);

        // History powers the Analytics page, so it is only recorded for signed-in users
        // (anonymous traffic must not be able to grow the database).
        const name = cleanText(req.query.name, 100);

        if (req.user && name && mongoose.connection.readyState === 1) {
            recordSnapshot({ overview, name, country: cleanText(req.query.country, 10).toUpperCase() }).catch((error) => {
                console.error("Weather history snapshot skipped:", error.message);
            });
        }

        res.set("Cache-Control", "private, max-age=60");

        return res.status(200).json({ success: true, data: overview });
    } catch (error) {
        return next(error);
    }
});

// GET /api/weather/multi?points=26.76,83.37|28.61,77.20   (up to 5)
router.get("/multi", async (req, res, next) => {
    try {
        const raw = typeof req.query.points === "string" ? req.query.points.split("|") : [];

        if (raw.length === 0 || raw.length > MAX_COMPARE_POINTS) {
            return res.status(400).json({ success: false, message: `Provide between 1 and ${MAX_COMPARE_POINTS} points as lat,lon|lat,lon.` });
        }

        const points = raw.map((item) => {
            const [lat, lon] = item.split(",");

            return parseCoordinates(lat, lon);
        });

        if (points.some((point) => !point)) {
            return res.status(400).json({ success: false, message: "One or more coordinates are invalid." });
        }

        await prefetchMany(points);

        // Anything the batch missed is fetched one at a time, so a single hiccup can't blank the whole comparison.
        const results = [];

        for (const point of points) {
            try {
                results.push({ status: "fulfilled", value: await getSummary(point.latitude, point.longitude) });
            } catch (reason) {
                results.push({ status: "rejected", reason });
            }
        }

        const data = results.map((result, index) =>
            result.status === "fulfilled"
                ? { ok: true, ...result.value }
                : { ok: false, latitude: points[index].latitude, longitude: points[index].longitude, message: result.reason?.message || "Unavailable" }
        );

        res.set("Cache-Control", "private, max-age=60");

        return res.status(200).json({ success: true, data });
    } catch (error) {
        return next(error);
    }
});

// GET /api/weather/grid?south=&west=&north=&east=   — live values on a 7×5 grid for the map layers
router.get("/grid", async (req, res, next) => {
    try {
        const [south, west, north, east] = ["south", "west", "north", "east"].map((k) => Number(req.query[k]));

        if (![south, west, north, east].every(Number.isFinite) || south >= north || west >= east || north - south > 60 || east - west > 90) {
            return res.status(400).json({ success: false, message: "Provide a valid map area (south, west, north, east)." });
        }

        const points = await getGrid({ south, west, north, east });

        res.set("Cache-Control", "public, max-age=300");

        return res.status(200).json({ success: true, data: points });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
