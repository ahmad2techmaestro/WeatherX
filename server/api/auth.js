const express = require("express");
const jwt = require("jsonwebtoken");

const {
    registerUser,
    authenticateUser,
    verifyRefreshToken,
    rotateRefreshToken,
    logoutUser,
} = require("../services/authService");

const User = require("../models/User");

const router = express.Router();

const REFRESH_COOKIE_NAME = "weatherx_refresh_token";

const refreshCookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/api/auth",
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const createHttpError = (status, message) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const sanitizeUser = (user) => ({
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
});

// ─────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────

const validateRegistrationInput = ({
    name,
    email,
    password,
}) => {
    if (
        typeof name !== "string" ||
        typeof email !== "string" ||
        typeof password !== "string"
    ) {
        throw createHttpError(
            400,
            "Name, email and password are required."
        );
    }

    const trimmedName = name.trim();
    const normalizedEmail = email.trim();

    if (!trimmedName || !normalizedEmail || !password) {
        throw createHttpError(
            400,
            "Name, email and password are required."
        );
    }

    if (
        trimmedName.length < 2 ||
        trimmedName.length > 50
    ) {
        throw createHttpError(
            400,
            "Name must contain between 2 and 50 characters."
        );
    }

    if (password.length < 8) {
        throw createHttpError(
            400,
            "Password must contain at least 8 characters."
        );
    }

    if (password.length > 128) {
        throw createHttpError(
            400,
            "Password must not exceed 128 characters."
        );
    }

    const emailRegex =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
        normalizedEmail.length > 100 ||
        !emailRegex.test(normalizedEmail)
    ) {
        throw createHttpError(
            400,
            "Please provide a valid email address."
        );
    }

    return {
        name: trimmedName,
        email: normalizedEmail.toLowerCase(),
        password,
    };
};

const validateLoginInput = ({
    email,
    password,
}) => {
    if (
        typeof email !== "string" ||
        typeof password !== "string"
    ) {
        throw createHttpError(
            400,
            "Email and password are required."
        );
    }

    const normalizedEmail = email.trim();

    if (!normalizedEmail || !password) {
        throw createHttpError(
            400,
            "Email and password are required."
        );
    }

    if (normalizedEmail.length > 100) {
        throw createHttpError(
            400,
            "Please provide a valid email address."
        );
    }

    const emailRegex =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
        throw createHttpError(
            400,
            "Please provide a valid email address."
        );
    }

    if (password.length > 128) {
        throw createHttpError(
            400,
            "Invalid email or password."
        );
    }

    return {
        email: normalizedEmail.toLowerCase(),
        password,
    };
};

// ─────────────────────────────────────────────
// Register
// ─────────────────────────────────────────────

router.post(
    "/register",
    async (req, res, next) => {
        try {
            const input =
                validateRegistrationInput(
                    req.body || {}
                );

            const user =
                await registerUser(input);

            res.status(201).json({
                success: true,
                message:
                    "Account created successfully.",
                data: {
                    user: sanitizeUser(user),
                },
            });
        } catch (error) {
            next(error);
        }
    }
);

// ─────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────

router.post(
    "/login",
    async (req, res, next) => {
        try {
            const input =
                validateLoginInput(
                    req.body || {}
                );

            const {
                user,
                accessToken,
                refreshToken,
            } =
                await authenticateUser(input);

            res.cookie(
                REFRESH_COOKIE_NAME,
                refreshToken,
                refreshCookieOptions
            );

            res.status(200).json({
                success: true,
                message:
                    "Login successful.",
                data: {
                    user: sanitizeUser(user),
                    accessToken,
                },
            });
        } catch (error) {
            next(error);
        }
    }
);

// ─────────────────────────────────────────────
// Refresh Token
// ─────────────────────────────────────────────

router.post(
    "/refresh",
    async (req, res, next) => {
        try {
            const refreshToken =
                req.cookies?.[
                    REFRESH_COOKIE_NAME
                ];

            if (
                typeof refreshToken !==
                    "string" ||
                !refreshToken.trim()
            ) {
                return res.status(401).json({
                    success: false,
                    message:
                        "Refresh token is required.",
                });
            }

            const {
                accessToken,
                refreshToken:
                    newRefreshToken,
                user,
            } =
                await rotateRefreshToken(
                    refreshToken
                );

            res.cookie(
                REFRESH_COOKIE_NAME,
                newRefreshToken,
                refreshCookieOptions
            );

            res.status(200).json({
                success: true,
                message:
                    "Access token refreshed.",
                data: {
                    user: sanitizeUser(user),
                    accessToken,
                },
            });
        } catch (error) {
            next(error);
        }
    }
);

// ─────────────────────────────────────────────
// Logout
// ─────────────────────────────────────────────

router.post(
    "/logout",
    async (req, res, next) => {
        try {
            const refreshToken =
                req.cookies?.[
                    REFRESH_COOKIE_NAME
                ];

            if (refreshToken) {
                try {
                    const decoded =
                        verifyRefreshToken(
                            refreshToken
                        );

                    if (decoded?.sub) {
                        await logoutUser(
                            decoded.sub
                        );
                    }
                } catch (error) {
                    // Invalid or expired token.
                    // Cookie is still cleared.
                }
            }

            res.clearCookie(
                REFRESH_COOKIE_NAME,
                {
                    httpOnly: true,
                    secure:
                        process.env.NODE_ENV ===
                        "production",
                    sameSite: "strict",
                    path: "/api/auth",
                }
            );

            res.status(200).json({
                success: true,
                message:
                    "Logged out successfully.",
            });
        } catch (error) {
            next(error);
        }
    }
);

// ─────────────────────────────────────────────
// Current User
// ─────────────────────────────────────────────

router.get(
    "/me",
    async (req, res, next) => {
        try {
            const authorization =
                req.headers.authorization;

            if (
                typeof authorization !==
                    "string" ||
                !authorization.startsWith(
                    "Bearer "
                )
            ) {
                return res.status(401).json({
                    success: false,
                    message:
                        "Access token is required.",
                });
            }

            const accessToken =
                authorization
                    .substring(7)
                    .trim();

            if (!accessToken) {
                return res.status(401).json({
                    success: false,
                    message:
                        "Access token is required.",
                });
            }

            if (
                !process.env.JWT_ACCESS_SECRET
            ) {
                throw createHttpError(
                    500,
                    "Authentication configuration is unavailable."
                );
            }

            const decoded =
                jwt.verify(
                    accessToken,
                    process.env
                        .JWT_ACCESS_SECRET
                );

            if (
                decoded.type !== "access" ||
                !decoded.sub
            ) {
                return res.status(401).json({
                    success: false,
                    message:
                        "Invalid access token.",
                });
            }

            const user =
                await User.findById(
                    decoded.sub
                );

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message:
                        "User account not found.",
                });
            }

            res.status(200).json({
                success: true,
                data: {
                    user: sanitizeUser(user),
                },
            });
        } catch (error) {
            if (
                error.name ===
                    "JsonWebTokenError" ||
                error.name ===
                    "TokenExpiredError"
            ) {
                error.status = 401;
                error.message =
                    "Invalid or expired access token.";
            }

            next(error);
        }
    }
);

module.exports = router;