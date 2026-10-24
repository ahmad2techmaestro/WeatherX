const jwt = require("jsonwebtoken");

/**
 * Attach `req.user` when a valid access token is present, but never block the
 * request. Lets public endpoints behave a little differently for signed-in users
 * (for example, recording history for the Analytics page).
 */
const optionalAuthenticate = (req, res, next) => {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) return next();

    try {
        const decoded = jwt.verify(header.substring(7), process.env.JWT_ACCESS_SECRET);

        if (decoded.type === "access") req.user = { id: String(decoded.sub) };
    } catch (error) {
        // An expired or malformed token on a public route is simply treated as signed-out.
    }

    next();
};

module.exports = { optionalAuthenticate };
