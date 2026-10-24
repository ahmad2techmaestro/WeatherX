const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const User = require("../models/User");

const ACCESS_TOKEN_EXPIRES_IN =
    process.env.JWT_ACCESS_EXPIRES_IN || "15m";

const REFRESH_TOKEN_EXPIRES_IN =
    process.env.JWT_REFRESH_EXPIRES_IN || "7d";

const getRequiredEnv = (key) => {
    const value = process.env[key];

    if (!value) {
        throw new Error(`${key} is not configured.`);
    }

    return value;
};

const hashPassword = async (password) => {
    const saltRounds = 12;

    return bcrypt.hash(password, saltRounds);
};

const comparePassword = async (password, hashedPassword) => {
    return bcrypt.compare(password, hashedPassword);
};

const generateAccessToken = (user) => {
    return jwt.sign(
        {
            sub: user._id.toString(),
            role: user.role,
            type: "access",
        },
        getRequiredEnv("JWT_ACCESS_SECRET"),
        {
            expiresIn: ACCESS_TOKEN_EXPIRES_IN,
        }
    );
};

const generateRefreshToken = (user) => {
    return jwt.sign(
        {
            sub: user._id.toString(),
            type: "refresh",
        },
        getRequiredEnv("JWT_REFRESH_SECRET"),
        {
            expiresIn: REFRESH_TOKEN_EXPIRES_IN,
        }
    );
};

const hashRefreshToken = (refreshToken) => {
    return crypto
        .createHash("sha256")
        .update(refreshToken)
        .digest("hex");
};

const registerUser = async ({ name, email, password }) => {
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({
        email: normalizedEmail,
    });

    if (existingUser) {
        const error = new Error(
            "An account with this email already exists."
        );

        error.status = 409;

        throw error;
    }

    const hashedPassword = await hashPassword(password);

    const user = await User.create({
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
    });

    return user;
};

const authenticateUser = async ({ email, password }) => {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({
        email: normalizedEmail,
    }).select("+password +refreshTokenHash");

    if (!user) {
        const error = new Error("Invalid email or password.");
        error.status = 401;
        throw error;
    }

    const passwordValid = await comparePassword(
        password,
        user.password
    );

    if (!passwordValid) {
        const error = new Error("Invalid email or password.");
        error.status = 401;
        throw error;
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshTokenHash = hashRefreshToken(refreshToken);
    user.lastLoginAt = new Date();

    await user.save();

    return {
        user,
        accessToken,
        refreshToken,
    };
};

const verifyAccessToken = (token) => {
    return jwt.verify(
        token,
        getRequiredEnv("JWT_ACCESS_SECRET")
    );
};

const verifyRefreshToken = (token) => {
    return jwt.verify(
        token,
        getRequiredEnv("JWT_REFRESH_SECRET")
    );
};

const rotateRefreshToken = async (refreshToken) => {
    const decoded = verifyRefreshToken(refreshToken);

    if (decoded.type !== "refresh") {
        const error = new Error("Invalid refresh token.");
        error.status = 401;
        throw error;
    }

    const user = await User.findById(decoded.sub).select(
        "+refreshTokenHash"
    );

    if (!user || !user.refreshTokenHash) {
        const error = new Error("Refresh session is invalid.");
        error.status = 401;
        throw error;
    }

    const incomingTokenHash = hashRefreshToken(refreshToken);

    if (incomingTokenHash !== user.refreshTokenHash) {
        const error = new Error("Refresh session is invalid.");
        error.status = 401;
        throw error;
    }

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    user.refreshTokenHash = hashRefreshToken(newRefreshToken);

    await user.save();

    return {
        user,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
    };
};

const logoutUser = async (userId) => {
    await User.findByIdAndUpdate(userId, {
        $set: {
            refreshTokenHash: null,
        },
    });
};

module.exports = {
    hashPassword,
    comparePassword,
    generateAccessToken,
    generateRefreshToken,
    hashRefreshToken,
    registerUser,
    authenticateUser,
    verifyAccessToken,
    verifyRefreshToken,
    rotateRefreshToken,
    logoutUser,
};