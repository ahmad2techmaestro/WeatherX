/**
 * Client for the optional Python ML service (ml-service/). Disabled unless ML_SERVICE_URL is set.
 * Every caller must treat the service as optional: if it is down the app keeps working without it.
 */
const axios = require("axios");
const { TTLCache } = require("../../lib/cache");

const base = () => String(process.env.ML_SERVICE_URL || "").replace(/\/+$/, "");
const timeout = () => Number(process.env.ML_TIMEOUT_MS) || 8000;
const healthCache = new TTLCache({ ttlMs: 20 * 1000, max: 4 });

const enabled = () => Boolean(base());

const unavailable = () => Object.assign(new Error("ML service unavailable"), { status: 503, userMessage: "The ML service isn't running, so this feature is unavailable right now." });

/** @returns {Promise<{enabled:boolean, healthy:boolean, version?:string, features?:string[]}>} */
const status = async () => {
    if (!enabled()) return { enabled: false, healthy: false };
    return healthCache.wrap(base(), async () => {
        try {
            const { data } = await axios.get(`${base()}/health`, { timeout: 2500 });
            return { enabled: true, healthy: data?.status === "ok", version: data?.version, features: data?.features || [] };
        } catch {
            return { enabled: true, healthy: false };
        }
    });
};

const call = async (fn) => {
    if (!enabled()) throw unavailable();
    try {
        return (await fn()).data;
    } catch (e) {
        const code = e.response?.status;
        if (code && code >= 400 && code < 500) {
            const detail = typeof e.response.data?.detail === "string" ? e.response.data.detail : "The ML service rejected the request.";
            throw Object.assign(new Error(detail), { status: code === 422 || code === 413 || code === 415 ? 400 : 502, userMessage: detail });
        }
        throw unavailable();
    }
};

/** @param {{history:{date:string,tmax:number,tmin:number}[], days:{date:string,tmax:number,tmin:number}[]}} body */
const anomaly = (body) => call(() => axios.post(`${base()}/v1/anomaly`, body, { timeout: timeout() }));

/** @param {Buffer} buffer @param {string} mime */
const sky = (buffer, mime) => call(() => axios.post(`${base()}/v1/sky`, buffer, { timeout: timeout() * 2, headers: { "Content-Type": mime }, maxBodyLength: 6 * 1024 * 1024 }));

module.exports = { enabled, status, anomaly, sky };
