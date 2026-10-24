const express = require("express");
const mongoose = require("mongoose");

const Notification = require("../models/Notification");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

// Only notifications that were actually delivered to the in-app inbox are shown.
const inboxFilter = (userId) => ({
    user: userId,
    channel: "in_app",
    status: "sent",
});

// GET /api/notifications — latest 50 plus the unread count
router.get("/", authenticate, async (req, res, next) => {
    try {
        const [notifications, unreadCount] = await Promise.all([
            Notification.find(inboxFilter(req.user.id)).sort({ createdAt: -1 }).limit(50).lean(),
            Notification.countDocuments({ ...inboxFilter(req.user.id), isRead: false }),
        ]);

        return res.status(200).json({
            success: true,
            data: { notifications, unreadCount },
        });
    } catch (error) {
        return next(error);
    }
});

// PATCH /api/notifications/read-all
router.patch("/read-all", authenticate, async (req, res, next) => {
    try {
        const result = await Notification.updateMany({ ...inboxFilter(req.user.id), isRead: false }, { $set: { isRead: true } });

        return res.status(200).json({
            success: true,
            data: { modifiedCount: result.modifiedCount },
        });
    } catch (error) {
        return next(error);
    }
});

// PATCH /api/notifications/:id/read
router.patch("/:id/read", authenticate, async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid notification id." });
        }

        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, user: req.user.id },
            { $set: { isRead: true } },
            { new: true }
        ).lean();

        if (!notification) {
            return res.status(404).json({ success: false, message: "Notification not found." });
        }

        return res.status(200).json({ success: true, data: notification });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
