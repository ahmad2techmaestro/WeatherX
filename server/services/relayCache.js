const { TTLCache } = require("../lib/cache");

/**
 * Raw forecast/air JSON that a signed-in user's own browser fetched from Open-Meteo when the server's shared IP was
 * rate-limited. Kept per user (never shared) so a forged payload can only affect the person who sent it. The AI
 * features read it as a fallback when the server's own request fails.
 */
const HOUR = 60 * 60 * 1000;
const cache = new TTLCache({ ttlMs: 30 * 60 * 1000, max: 500, staleMs: 3 * HOUR });
const key = (userId, lat, lon) => `${userId}|${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;

const put = (userId, lat, lon, value) => { if (userId) cache.set(key(userId, lat, lon), value); };
/** Latest relayed data for this user and place, including slightly old data (up to 3 hours). */
const get = (userId, lat, lon) => (userId ? cache.getStale(key(userId, lat, lon)) : undefined);

module.exports = { put, get, clear: () => cache.clear() };
