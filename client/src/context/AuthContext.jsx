import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";

import authService from "../services/authService";

import {
    setAccessToken as storeAccessToken,
    clearAccessToken,
} from "../services/tokenManager";

import {
    setSessionExpiredHandler,
    clearSessionExpiredHandler,
} from "../services/sessionManager";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);

    const [accessToken, setAccessToken] =
        useState(null);

    const [loading, setLoading] =
        useState(true);

    /*
     * Handles a session that can no longer
     * be refreshed.
     */
    const handleSessionExpired =
        useCallback(() => {
            setUser(null);
            setAccessToken(null);
            clearAccessToken();
        }, []);

    /*
     * Restore an existing authenticated session
     * using the HTTP-only refresh-token cookie.
     */
    const restoreSession =
        useCallback(async () => {
            try {
                setLoading(true);

                const response =
                    await authService.refresh();

                const nextUser =
                    response?.data?.user ||
                    null;

                const nextAccessToken =
                    response?.data?.accessToken ||
                    null;

                if (
                    nextUser &&
                    nextAccessToken
                ) {
                    setUser(nextUser);

                    setAccessToken(
                        nextAccessToken
                    );

                    storeAccessToken(
                        nextAccessToken
                    );

                    return {
                        authenticated: true,
                        user: nextUser,
                        accessToken:
                            nextAccessToken,
                    };
                }

                handleSessionExpired();

                return {
                    authenticated: false,
                    user: null,
                    accessToken: null,
                };
            } catch (error) {
                /*
                 * A missing/expired refresh session
                 * simply means the user is logged out.
                 *
                 * Avoid logging expected authentication
                 * failures as application errors.
                 */
                handleSessionExpired();

                return {
                    authenticated: false,
                    user: null,
                    accessToken: null,
                };
            } finally {
                setLoading(false);
            }
        }, [handleSessionExpired]);

    /*
     * Register the session-expiry callback used
     * by the global Axios response interceptor.
     */
    useEffect(() => {
        setSessionExpiredHandler(
            handleSessionExpired
        );

        return () => {
            clearSessionExpiredHandler();
        };
    }, [handleSessionExpired]);

    /*
     * Restore the session once when the application
     * authentication provider initializes.
     */
    useEffect(() => {
        restoreSession();
    }, [restoreSession]);

    /*
     * Login with the backend.
     */
    const login = useCallback(
        async (credentials) => {
            const response =
                await authService.login(
                    credentials
                );

            const nextUser =
                response?.data?.user ||
                null;

            const nextAccessToken =
                response?.data?.accessToken ||
                null;

            if (
                !nextUser ||
                !nextAccessToken
            ) {
                throw new Error(
                    "Login response did not contain a valid session."
                );
            }

            setUser(nextUser);

            setAccessToken(
                nextAccessToken
            );

            storeAccessToken(
                nextAccessToken
            );

            return response;
        },
        []
    );

    /*
     * Registration intentionally does not
     * automatically authenticate the user.
     */
    const register = useCallback(
        async (userData) => {
            return authService.register(
                userData
            );
        },
        []
    );

    /*
     * Logout from the backend and clear the
     * client-side authentication state.
     */
    const logout = useCallback(
        async () => {
            try {
                await authService.logout();
            } finally {
                setUser(null);
                setAccessToken(null);

                clearAccessToken();
            }
        },
        []
    );

    /*
     * Public helper for components that need
     * to explicitly restore the current session.
     */
    const refreshSession =
        useCallback(async () => {
            return restoreSession();
        }, [restoreSession]);

    const value = {
        user,
        accessToken,
        loading,

        isAuthenticated:
            Boolean(
                user &&
                accessToken
            ),

        login,
        register,
        logout,
        restoreSession,
        refreshSession,
    };

    return (
        <AuthContext.Provider
            value={value}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context =
        useContext(AuthContext);

    if (!context) {
        throw new Error(
            "useAuth must be used within an AuthProvider"
        );
    }

    return context;
}