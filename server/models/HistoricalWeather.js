const mongoose = require("mongoose");

const HistoricalWeatherSchema = new mongoose.Schema(
    {
        location: {
            city: {
                type: String,
                required: true,
                trim: true,
                maxlength: 100,
            },

            country: {
                type: String,
                trim: true,
                maxlength: 10,
            },

            latitude: {
                type: Number,
                required: true,
                min: -90,
                max: 90,
            },

            longitude: {
                type: Number,
                required: true,
                min: -180,
                max: 180,
            },
        },

        observedAt: {
            type: Date,
            required: true,
            index: true,
        },

        weather: {
            temperature: {
                type: Number,
                required: true,
            },

            feelsLike: {
                type: Number,
            },

            minTemperature: {
                type: Number,
            },

            maxTemperature: {
                type: Number,
            },

            humidity: {
                type: Number,
                min: 0,
                max: 100,
            },

            pressure: {
                type: Number,
            },

            visibility: {
                type: Number,
                min: 0,
            },

            windSpeed: {
                type: Number,
                min: 0,
            },

            windDirection: {
                type: Number,
                min: 0,
                max: 360,
            },

            cloudiness: {
                type: Number,
                min: 0,
                max: 100,
            },

            condition: {
                type: String,
                trim: true,
                maxlength: 50,
            },

            description: {
                type: String,
                trim: true,
                maxlength: 150,
            },

            icon: {
                type: String,
                trim: true,
                maxlength: 20,
            },

            rainfall: {
                type: Number,
                min: 0,
                default: 0,
            },
        },

        airQuality: {
            aqi: {
                type: Number,
                min: 1,
                max: 5,
            },

            pm2_5: {
                type: Number,
                min: 0,
            },

            pm10: {
                type: Number,
                min: 0,
            },

            co: {
                type: Number,
                min: 0,
            },

            no2: {
                type: Number,
                min: 0,
            },

            so2: {
                type: Number,
                min: 0,
            },

            o3: {
                type: Number,
                min: 0,
            },
        },

        source: {
            type: String,
            default: "openweathermap",
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

// ==================================================
// ANALYTICS INDEXES
// ==================================================

HistoricalWeatherSchema.index({
    "location.city": 1,
    observedAt: -1,
});

HistoricalWeatherSchema.index({
    "location.latitude": 1,
    "location.longitude": 1,
    observedAt: -1,
});

// Prevent duplicate observations for the same location/time.
HistoricalWeatherSchema.index(
    {
        "location.latitude": 1,
        "location.longitude": 1,
        observedAt: 1,
    },
    {
        unique: true,
    }
);

module.exports = mongoose.model(
    "HistoricalWeather",
    HistoricalWeatherSchema
);