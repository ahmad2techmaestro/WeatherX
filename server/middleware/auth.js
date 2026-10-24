const jwt = require("jsonwebtoken");

const User = require("../models/User");

const authenticate = async (req, res, next) => {
    try {
        const authorization = req.headers.authorization;

        if (
            !authorization ||
            !authorization.startsWith("Bearer ")
        ) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        const token = authorization.substring(7);

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Access token is missing."
            });
        }

        const decoded = jwt.verify(
            token,
            process.env.JWT_ACCESS_SECRET
        );

        if (decoded.type !== "access") {
            return res.status(401).json({
                success: false,
                message: "Invalid access token."
            });
        }

        const user = await User.findById(decoded.sub).select(
            "_id name email role isEmailVerified"
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User account no longer exists."
            });
        }

        req.user = {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role,
            isEmailVerified: user.isEmailVerified
        };

        next();
    } catch (error) {
        if (
            error.name === "TokenExpiredError"
        ) {
            return res.status(401).json({
                success: false,
                message: "Access token expired."
            });
        }

        if (
            error.name === "JsonWebTokenError"
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid access token."
            });
        }

        next(error);
    }
};

const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: "Authentication required."
        });
    }

    if (req.user.role !== "admin") {
        return res.status(403).json({
            success: false,
            message: "Admin access required."
        });
    }

    next();
};

module.exports = {
    authenticate,
    requireAdmin
};