let sessionExpiredHandler = null;

/**
 * Register the application-level handler that
 * should run when the user's session expires.
 */
export function setSessionExpiredHandler(
    handler
) {
    sessionExpiredHandler =
        typeof handler === "function"
            ? handler
            : null;
}

/**
 * Remove the current session-expiry handler.
 */
export function clearSessionExpiredHandler() {
    sessionExpiredHandler = null;
}

/**
 * Notify the application that the current
 * authentication session has expired.
 */
export function notifySessionExpired() {
    if (
        typeof sessionExpiredHandler ===
        "function"
    ) {
        sessionExpiredHandler();
    }
}