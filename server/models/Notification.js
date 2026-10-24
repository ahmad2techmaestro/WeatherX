const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        alert: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Alert",
            default: null,
            index: true,
        },

        type: {
            type: String,
            enum: [
                "weather_alert",
                "daily_forecast",
                "weather_update",
            ],
            required: true,
        },

        channel: {
            type: String,
            enum: [
                "in_app",
                "email",
                "sms",
                "whatsapp",
                "push",
            ],
            required: true,
            index: true,
        },

        // Stable key for de-duplication, e.g. "adv:<lat,lon>:rain-2026-10-19:warning".
        dedupeKey: {
            type: String,
            default: "",
            trim: true,
            maxlength: 200,
        },

        status: {
            type: String,
            enum: [
                "pending",
                "processing",
                "sent",
                "failed",
            ],
            default: "pending",
            index: true,
        },

        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 150,
        },

        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: 1000,
        },

        /*
         * In-app notification read state.
         *
         * This is intentionally separate from
         * delivery status:
         *
         * status = whether the notification was delivered
         * isRead = whether the user has viewed/read it
         */
        isRead: {
            type: Boolean,
            default: false,
            index: true,
        },

        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },

        retryCount: {
            type: Number,
            default: 0,
            min: 0,
        },

        maxRetries: {
            type: Number,
            default: 3,
            min: 0,
        },

        lastAttemptAt: {
            type: Date,
            default: null,
        },

        sentAt: {
            type: Date,
            default: null,
        },

        failedAt: {
            type: Date,
            default: null,
        },

        errorMessage: {
            type: String,
            default: "",
            trim: true,
            maxlength: 1000,
        },
    },
    {
        timestamps: true,
    }
);

notificationSchema.index({
    user: 1,
    status: 1,
    createdAt: -1,
});

notificationSchema.index({
    user: 1,
    channel: 1,
    isRead: 1,
    createdAt: -1,
});

notificationSchema.index({
    channel: 1,
    status: 1,
    createdAt: 1,
});

notificationSchema.index({
    alert: 1,
    channel: 1,
});

notificationSchema.index({
    user: 1,
    channel: 1,
    dedupeKey: 1,
});

module.exports = mongoose.model(
    "Notification",
    notificationSchema
);