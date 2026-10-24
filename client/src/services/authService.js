import axios from "axios";

import {
    setAccessToken,
    clearAccessToken,
} from "./tokenManager";

const API_BASE_URL = "/api/auth";

const authService = {
    /**
     * Register a new WeatherX user.
     */
    register: async (userData) => {
        const response = await axios.post(
            `${API_BASE_URL}/register`,
            userData
        );

        return response.data;
    },

    /**
     * Authenticate an existing user.
     *
     * The refresh token is stored by the
     * backend in an HTTP-only cookie.
     *
     * The access token remains in memory.
     */
    login: async (credentials) => {
        const response = await axios.post(
            `${API_BASE_URL}/login`,
            credentials,
            {
                withCredentials: true,
            }
        );

        const accessToken =
            response.data?.data?.accessToken;

        if (accessToken) {
            setAccessToken(accessToken);
        }

        return response.data;
    },

    /**
     * Restore/refresh the current session.
     */
    refresh: async () => {
        const response = await axios.post(
            `${API_BASE_URL}/refresh`,
            {},
            {
                withCredentials: true,
            }
        );

        const accessToken =
            response.data?.data?.accessToken;

        if (accessToken) {
            setAccessToken(accessToken);
        }

        return response.data;
    },

    /**
     * Logout the current user.
     *
     * The backend clears the refresh-token
     * cookie and the client clears its in-memory
     * access token.
     */
    logout: async () => {
        try {
            const response =
                await axios.post(
                    `${API_BASE_URL}/logout`,
                    {},
                    {
                        withCredentials: true,
                    }
                );

            return response.data;
        } finally {
            clearAccessToken();
        }
    },
};

export default authService;