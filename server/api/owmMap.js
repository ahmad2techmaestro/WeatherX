const express = require("express");
const axios = require("axios");

const { TTLCache } = require("../lib/cache");
const jwt = require("jsonwebtoken");

const { describeKeySource } = require("../config/env");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

const LAYERS = ["temp_new", "precipitation_new", "clouds_new", "wind_new", "pressure_new"];
const tileBase = () => process.env.OPENWEATHER_TILE_URL || "https://tile.openweathermap.org/map";

// OpenWeather's free plan allows 60 calls/min, and every tile is a call: cache them.
const tileCache = new TTLCache({ ttlMs: 10 * 60 * 1000, max: 600 });
const statusCache = new TTLCache({ ttlMs: 60 * 1000, max: 5 });

class KeyError extends Error {}

const fetchTile = async (layer, z, x, y) => {
    try {
        const res = await axios.get(`${tileBase()}/${layer}/${z}/${x}/${y}.png`, {
            params: { appid: process.env.OPENWEATHER_API_KEY },
            responseType: "arraybuffer",
            timeout: 8000,
        });
        return Buffer.from(res.data);
    } catch (error) {
        const status = error.response?.status;
        if (status === 401 || status === 403) throw new KeyError("rejected");
        if (status === 429) throw new KeyError("rate_limited");
        throw error;
    }
};

/**
 * GET /api/weather/map/status — tells the UI (and you) why the layers do or don't load.
 * Makes one real tile request with the configured key (cached for a minute).
 */
const TILE_TOKEN_TTL = "30m";

const issueTileToken = (userId) => jwt.sign({ sub: String(userId), type: "tile" }, process.env.JWT_ACCESS_SECRET, { expiresIn: TILE_TOKEN_TTL });

const tileTokenValid = (token) => {
    try {
        return jwt.verify(String(token || ""), process.env.JWT_ACCESS_SECRET).type === "tile";
    } catch {
        return false;
    }
};

router.get("/status", authenticate, async (req, res) => {
    const source = describeKeySource();
    const base = { envVar: source.envVar, envFiles: source.envFiles, keyLooksValid: source.looksValid };

    const result = await statusCache.wrap(`status:${process.env.OPENWEATHER_API_KEY || ""}`, async () => {
        if (!source.envVar) {
            return {
                ok: false,
                code: "missing",
                message: source.clientEnvHasKey
                    ? "The key is in client/.env, but the server can't read that file. Put OPENWEATHER_API_KEY=... in server/.env and restart."
                    : "No OpenWeather key found. Add OPENWEATHER_API_KEY=your_key to server/.env (or the project-root .env) and restart the server.",
            };
        }

        try {
            await fetchTile("temp_new", 0, 0, 0);
            return { ok: true, code: "ok", message: "OpenWeather layers are working." };
        } catch (error) {
            if (error instanceof KeyError && error.message === "rejected") {
                return {
                    ok: false,
                    code: "rejected",
                    message: source.looksValid
                        ? "OpenWeather rejected this key (401). A new key can take up to ~2 hours to activate; otherwise check it in your OpenWeather account."
                        : `OpenWeather rejected this key (401). It is ${source.keyLength} characters, but keys are 32 hex characters: check for a typo, a missing character or extra text.`,
                };
            }
            if (error instanceof KeyError) return { ok: false, code: "rate_limited", message: "OpenWeather rate limit reached (free plan: 60 calls/min). Layers resume shortly." };
            return { ok: false, code: "unreachable", message: "The server could not reach OpenWeather (network or firewall)." };
        }
    }, 60 * 1000);

    res.set("Cache-Control", "no-store").json({ success: true, data: { ...base, ...result, tileToken: result.ok ? issueTileToken(req.user.id) : null } });
});

// GET /api/weather/map/:layer/:z/:x/:y — tile proxy; the key never reaches the browser.
router.get("/:layer/:z/:x/:y", async (req, res) => {
    const { layer, z, x, y } = req.params;

    if (!tileTokenValid(req.query.t)) return res.status(401).json({ success: false, message: "Authentication required." });

    if (!LAYERS.includes(layer)) return res.status(400).json({ success: false, message: "Invalid weather map layer." });

    const zi = Number(z);
    const max = 2 ** zi;
    if (!/^\d{1,2}$/.test(z) || zi > 10 || !/^\d{1,7}$/.test(x) || !/^\d{1,7}$/.test(y) || Number(x) >= max || Number(y) >= max) {
        return res.status(400).json({ success: false, message: "Invalid map tile coordinates." });
    }

    if (!process.env.OPENWEATHER_API_KEY) return res.status(503).json({ success: false, code: "missing", message: "Weather map layers are not configured." });

    try {
        const png = await tileCache.wrap(`${layer}/${z}/${x}/${y}`, () => fetchTile(layer, z, x, y));
        res.set({ "Content-Type": "image/png", "Cache-Control": "public, max-age=600" }).send(png);
    } catch (error) {
        if (error instanceof KeyError) {
            return res.status(error.message === "rate_limited" ? 429 : 401).json({ success: false, code: error.message, message: "OpenWeather refused the request." });
        }
        return res.status(502).json({ success: false, message: "Weather tile unavailable." });
    }
});

module.exports = router;
