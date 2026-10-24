const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        type: {
            type: String,
            enum: [
                "extreme_heat",
                "high_temperature",
                "high_humidity",
                "strong_wind",
                "rain",
                "thunderstorm",
            ],
            required: true,
        },

        severity: {
            type: String,
            enum: ["info", "warning", "danger"],
            required: true,
        },

        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100,
        },

        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: 500,
        },

        location: {
            city: {
                type: String,
                required: true,
                trim: true,
            },

            country: {
                type: String,
                default: "",
                trim: true,
            },
        },

        weatherSnapshot: {
            temperature: {
                type: Number,
                default: null,
            },

            humidity: {
                type: Number,
                default: null,
            },

            windSpeed: {
                type: Number,
                default: null,
            },

            condition: {
                type: String,
                default: "",
            },
        },

        status: {
            type: String,
            enum: ["active", "resolved"],
            default: "active",
            index: true,
        },

        isRead: {
            type: Boolean,
            default: false,
            index: true,
        },

        firstDetectedAt: {
            type: Date,
            default: Date.now,
        },

        lastDetectedAt: {
            type: Date,
            default: Date.now,
        },

        resolvedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

alertSchema.index({
    user: 1,
    status: 1,
    type: 1,
    "location.city": 1,
});

module.exports = mongoose.model("Alert", alertSchema);