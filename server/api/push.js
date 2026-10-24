const express = require("express");
const PushSubscription = require("../models/PushSubscription");
const { authenticate } = require("../middleware/auth");
const { getPublicKey } = require("../services/pushService");

const router = express.Router();

// GET /api/push/key — public VAPID key (null when push is not configured on this server)
router.get("/key", (req, res) => res.json({ success: true, data: { publicKey: getPublicKey() } }));

// POST /api/push/subscribe
router.post("/subscribe", authenticate, async (req, res, next) => {
    try {
        const { endpoint, keys } = req.body || {};

        if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || !keys?.p256dh || !keys?.auth) {
            return res.status(400).json({ success: false, message: "Invalid push subscription." });
        }

        await PushSubscription.findOneAndUpdate(
            { endpoint },
            { user: req.user.id, endpoint, keys: { p256dh: String(keys.p256dh), auth: String(keys.auth) }, userAgent: String(req.get("user-agent") || "").slice(0, 300) },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        return res.status(201).json({ success: true });
    } catch (error) {
        return next(error);
    }
});

// DELETE /api/push/subscribe
router.delete("/subscribe", authenticate, async (req, res, next) => {
    try {
        const { endpoint } = req.body || {};
        await PushSubscription.deleteMany(endpoint ? { user: req.user.id, endpoint } : { user: req.user.id });
        return res.json({ success: true });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
