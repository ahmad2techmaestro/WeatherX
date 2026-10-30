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

    throw lastError;
};

module.exports = { getJson, client };
