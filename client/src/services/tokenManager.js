let accessToken = null;

/**
 * Get the current in-memory access token.
 */
export function getAccessToken() {
    return accessToken;
}

/**
 * Store a valid access token in memory.
 *
 * WeatherX intentionally keeps the access token
 * out of localStorage/sessionStorage.
 */
export function setAccessToken(token) {
    if (
        typeof token !== "string" ||
        !token.trim()
    ) {
        accessToken = null;
        return;
    }

    accessToken = token.trim();
}

/**
 * Clear the current access token.
 */
export function clearAccessToken() {
    accessToken = null;
}