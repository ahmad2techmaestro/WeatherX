const express = require("express");

const authModule = require("../middleware/auth");

const {
    getPersonalizationProfile,
} = require("../services/personalizationService");

const router = express.Router();

/*
 * Resolve the existing authentication middleware
 * without changing the already-working auth system.
 */
const authMiddleware =
    typeof authModule === "function"
        ? authModule
        : authModule.auth ||
          authModule.authenticate ||
          authModule.protect ||
          authModule.requireAuth;

if (typeof authMiddleware !== "function") {
    throw new Error(
        "Unable to resolve authentication middleware from ../middleware/auth"
    );
}

/*
 * GET /api/personalization
 *
 * Returns the authenticated user's
 * normalized personalization profile.
 */
router.get(
    "/",
    authMiddleware,
    async (req, res) => {
        try {
            const userId =
                req.user?.id ||
                req.user?._id;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message:
                        "Authentication required.",
                });
            }

            const profile =
                await getPersonalizationProfile(
                    userId
                );

            return res.status(200).json({
                success: true,
                data: profile,
            });
        } catch (error) {
            console.error(
                "Get personalization profile error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to load personalization profile.",
            });
        }
    }
);

module.exports = router;