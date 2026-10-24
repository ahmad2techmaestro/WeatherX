import axios from "axios";

import {
    getAccessToken,
    setAccessToken,
    clearAccessToken,
} from "./tokenManager";

import {
    notifySessionExpired,
} from "./sessionManager";

/*
 * Dedicated client for token refresh.
 *
 * This client intentionally does not use the
 * global Axios interceptors below, preventing
 * refresh-request loops.
 */
const refreshClient = axios.create({
    baseURL: "/api",
    withCredentials: true,
});

let refreshPromise = null;

/**
 * Authentication endpoints should never trigger
 * an automatic token refresh.
 */
const isAuthRequest = (url = "") => {
    return (
        url.includes("/auth/login") ||
        url.includes("/auth/register") ||
        url.includes("/auth/refresh") ||
        url.includes("/auth/logout")
    );
};

/**
 * Request interceptor
 *
 * Automatically attaches the current access token
 * to protected API requests.
 */
axios.interceptors.request.use(
    (config) => {
        const token = getAccessToken();

        if (
            token &&
            !isAuthRequest(config.url)
        ) {
            config.headers =
                config.headers || {};

            config.headers.Authorization =
                `Bearer ${token}`;
        }

        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

/**
 * Response interceptor
 *
 * When a protected request returns 401:
 *
 * 1. Start a token refresh request.
 * 2. Share that request with concurrent failures.
 * 3. Store the new access token.
 * 4. Retry the original request.
 *
 * If refresh fails, the current session is
 * cleared and the application is notified.
 */
axios.interceptors.response.use(
    (response) => response,

    async (error) => {
        const originalRequest =
            error.config;

        /*
         * Refresh should not be attempted when:
         *
         * - the response is not 401
         * - request configuration is missing
         * - request has already been retried
         * - request belongs to authentication flow
         */
        if (
            error.response?.status !== 401 ||
            !originalRequest ||
            originalRequest._retry ||
            isAuthRequest(
                originalRequest.url
            )
        ) {
            return Promise.reject(error);
        }

        originalRequest._retry = true;

        /*
         * Create a single shared refresh promise.
         *
         * Example:
         *
         * Dashboard
         * Forecast
         * Alerts
         *
         * all receive 401 simultaneously.
         *
         * Only ONE refresh request is sent.
         * All failed requests wait for it.
         */
        if (!refreshPromise) {
            refreshPromise =
                refreshClient
                    .post(
                        "/auth/refresh",
                        {}
                    )
                    .then((response) => {
                        const newAccessToken =
                            response?.data
                                ?.data
                                ?.accessToken;

                        if (!newAccessToken) {
                            throw new Error(
                                "Session refresh did not return an access token."
                            );
                        }

                        setAccessToken(
                            newAccessToken
                        );

                        return newAccessToken;
                    })
                    .catch((refreshError) => {
                        clearAccessToken();

                        notifySessionExpired();

                        throw refreshError;
                    })
                    .finally(() => {
                        refreshPromise = null;
                    });
        }

        try {
            /*
             * Wait for the shared refresh operation.
             */
            const newAccessToken =
                await refreshPromise;

            /*
             * Attach the fresh access token
             * to the original failed request.
             */
            originalRequest.headers =
                originalRequest.headers || {};

            originalRequest.headers.Authorization =
                `Bearer ${newAccessToken}`;

            /*
             * Retry the original request.
             */
            return axios(originalRequest);
        } catch (refreshError) {
            clearAccessToken();

            notifySessionExpired();

            return Promise.reject(
                refreshError
            );
        }
    }
);

export default axios;