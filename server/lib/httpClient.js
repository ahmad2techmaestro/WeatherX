const axios = require("axios");

const USER_AGENT =
    process.env.HTTP_USER_AGENT ||
    "WeatherX/2.0 (+https://github.com/; weather dashboard)";

const client = axios.create({
    timeout: Number(process.env.UPSTREAM_TIMEOUT_MS) || 9000,
    headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
    },
});

// Total time one getJson() call may spend retrying. Netlify's proxy gives up on a
// request after ~26 s, so staying well under that means the user sees our error
// message rather than a bare gateway timeout.
const DEADLINE_MS = Number(process.env.UPSTREAM_DEADLINE_MS) || 20000;

// Circuit breaker: once a host has answered 429 even after our retries, stop sending it requests for a short
// cooldown. Hammering a rate-limited shared IP only extends the block, and callers would otherwise each wait out the
// full retry deadline (~20 s) just to fail. During the cooldown calls fail at once, so the app can use its stale cache
// or the browser relay straight away.
const cooldowns = new Map();
const cooldownMs = () => (process.env.UPSTREAM_COOLDOWN_MS !== undefined ? Number(process.env.UPSTREAM_COOLDOWN_MS) : 30000);
const hostOf = (url) => { try { return new URL(url).host; } catch { return ""; } };
const resetBreaker = () => cooldowns.clear();

const coolingDown = (url) => {
    const until = cooldowns.get(hostOf(url));
    return until && until > Date.now() ? until : 0;
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryable = (error) => {
    if (!error.response) return true; // network error / timeout

    const status = error.response.status;

    return status === 429 || status >= 500;
};

/** Seconds from a `Retry-After` header, capped so one response can't stall the request. */
const retryAfterMs = (error) => {
    const seconds = Number(error.response?.headers?.["retry-after"]);

    return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 5) * 1000 : null;
};

/**
 * GET with retries for transient failures.
 *
 * - Network errors, timeouts and 5xx: up to `retries` more attempts (default 1), short linear backoff.
 * - 429 (rate limited): up to `rateLimitRetries` more attempts (default 3 when `retries` > 0, otherwise 0),
 *   waiting for `Retry-After` when the upstream sends it, else 0.7 s / 1.4 s / 2.8 s plus jitter.
 *   A shared hosting IP often hits a per-minute limit that a 350 ms retry can never outwait.
 * - Anything else (400, 404 ...) is the caller's problem and is rethrown immediately.
 * - Retrying stops once DEADLINE_MS would be exceeded.
 */
const getJson = async (url, config = {}, { retries = 1, backoffMs = 350, rateLimitRetries = retries > 0 ? 3 : 0 } = {}) => {
    if (coolingDown(url)) {
        const error = new Error("Upstream is rate-limiting this server; waiting before trying again.");
        error.isAxiosError = true;
        error.response = { status: 429, data: { reason: "cooling down after rate limit" }, headers: {} };
        throw error;
    }

    const startedAt = Date.now();
    let failures = 0;
    let throttled = 0;
    let lastError;

    for (;;) {
        try {
            const response = await client.get(url, config);

            return response.data;
        } catch (error) {
            lastError = error;

            const isThrottle = error.response?.status === 429;

            if (isThrottle) throttled += 1;
            else failures += 1;

            const allowed = isThrottle ? throttled <= rateLimitRetries : failures <= retries;

            if (!isRetryable(error) || !allowed) break;

            const delay = isThrottle
                ? (retryAfterMs(error) ?? 700 * 2 ** (throttled - 1)) + Math.floor(Math.random() * 250)
                : backoffMs * failures;

            if (Date.now() - startedAt + delay >= DEADLINE_MS) break;

            await wait(delay);
        }
    }

    if (lastError.response?.status === 429 && cooldownMs() > 0) cooldowns.set(hostOf(url), Date.now() + cooldownMs());

    throw lastError;
};

// Optional paid Open-Meteo plan: with OPEN_METEO_API_KEY the server uses the customer hosts and signs each call.
// The key is added here, on the server only. It is never put into the URLs handed to the browser.
client.interceptors.request.use((config) => {
    const key = process.env.OPEN_METEO_API_KEY;
    if (key && /\/\/customer-/.test(config.url || "")) config.params = { ...config.params, apikey: key };
    return config;
});

module.exports = { getJson, client, resetBreaker };
