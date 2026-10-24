const mongoose = require("mongoose");

const userPreferencesSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
            index: true,
        },

        weather: {
            temperatureUnit: {
                type: String,
                enum: ["celsius", "fahrenheit"],
                default: "celsius",
            },

            windUnit: {
                type: String,
                enum: ["kmh", "mph", "ms"],
                default: "kmh",
            },

            defaultLocation: {
                type: String,
                trim: true,
                maxlength: 100,
                default: "Gorakhpur",
            },
        },

        appearance: {
            theme: {
                type: String,
                enum: ["light", "dark", "system"],
                default: "system",
            },
        },

        notifications: {
            severeWeatherAlerts: {
                type: Boolean,
                default: true,
            },

            dailyForecast: {
                type: Boolean,
                default: true,
            },

            weatherUpdates: {
                type: Boolean,
                default: false,
            },

            phoneNumber: {
                type: String,
                trim: true,
                default: "",
                maxlength: 20,
                match: [/^(\+?\d{7,15})?$/, "Phone number must contain digits only."],
            },

            channels: {
                inApp: {
                    type: Boolean,
                    default: true,
                },

                email: {
                    type: Boolean,
                    default: false,
                },

                sms: {
                    type: Boolean,
                    default: false,
                },

                whatsapp: {
                    type: Boolean,
                    default: false,
                },
            },
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model(
    "UserPreferences",
    userPreferencesSchema
);