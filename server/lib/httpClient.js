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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryable = (error) => {
    if (!error.response) return true; // network error / timeout

    const status = error.response.status;

    return status === 429 || status >= 500;
};

/**
 * GET with a single retry for transient failures (network errors, timeouts,
 * 429 and 5xx). Anything else — 400, 404 — is the caller's problem and is
 * rethrown immediately.
 */
const getJson = async (url, config = {}, { retries = 1, backoffMs = 350 } = {}) => {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            const response = await client.get(url, config);

            return response.data;
        } catch (error) {
            lastError = error;

            if (attempt === retries || !isRetryable(error)) break;

            await wait(backoffMs * (attempt + 1));
        }
    }

    throw lastError;
};

module.exports = { getJson, client };
