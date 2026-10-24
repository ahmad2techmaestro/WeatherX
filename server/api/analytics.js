const express = require("express");

const {
    getWeatherTrends,
} = require("../services/weatherAnalyticsService");

const {
    buildAdvancedWeatherInsights,
} = require("../services/advancedWeatherInsightsService");

const {
    getAQIAnalytics,
} = require("../services/aqiAnalyticsService");

const {
    getRainfallTemperatureAnalytics,
} = require("../services/rainfallTemperatureAnalyticsService");

const router = express.Router();

const DEFAULT_ANALYTICS_DAYS = 7;
const MIN_ANALYTICS_DAYS = 1;
const MAX_ANALYTICS_DAYS = 30;

// ==================================================
// ANALYTICS REQUEST PARSER
// ==================================================

const parseAnalyticsRequest = (query) => {
    const {
        city,
        latitude,
        longitude,
        days,
    } = query;

    const hasCity =
        typeof city === "string" &&
        city.trim().length > 0;

    const parsedLatitude =
        latitude !== undefined
            ? Number(latitude)
            : null;

    const parsedLongitude =
        longitude !== undefined
            ? Number(longitude)
            : null;

    const hasLatitude =
        Number.isFinite(parsedLatitude);

    const hasLongitude =
        Number.isFinite(parsedLongitude);

    const hasCoordinates =
        hasLatitude &&
        hasLongitude;

    if (!hasCity && !hasCoordinates) {
        const error = new Error(
            "City or valid coordinates are required."
        );

        error.statusCode = 400;

        throw error;
    }

    if (
        latitude !== undefined &&
        !hasLatitude
    ) {
        const error = new Error(
            "Invalid latitude."
        );

        error.statusCode = 400;

        throw error;
    }

    if (
        longitude !== undefined &&
        !hasLongitude
    ) {
        const error = new Error(
            "Invalid longitude."
        );

        error.statusCode = 400;

        throw error;
    }

    if (
        hasLatitude &&
        (parsedLatitude < -90 ||
            parsedLatitude > 90)
    ) {
        const error = new Error(
            "Invalid latitude."
        );

        error.statusCode = 400;

        throw error;
    }

    if (
        hasLongitude &&
        (parsedLongitude < -180 ||
            parsedLongitude > 180)
    ) {
        const error = new Error(
            "Invalid longitude."
        );

        error.statusCode = 400;

        throw error;
    }

    const parsedDays =
        days !== undefined
            ? Number(days)
            : DEFAULT_ANALYTICS_DAYS;

    if (
        !Number.isInteger(parsedDays) ||
        parsedDays < MIN_ANALYTICS_DAYS ||
        parsedDays > MAX_ANALYTICS_DAYS
    ) {
        const error = new Error(
            `Days must be an integer between ${MIN_ANALYTICS_DAYS} and ${MAX_ANALYTICS_DAYS}.`
        );

        error.statusCode = 400;

        throw error;
    }

    return {
        city: hasCity
            ? city.trim()
            : null,

        latitude: hasCoordinates
            ? parsedLatitude
            : null,

        longitude: hasCoordinates
            ? parsedLongitude
            : null,

        days: parsedDays,
    };
};

// ==================================================
// WEATHER TRENDS & ADVANCED INSIGHTS
//
// GET /api/analytics/trends?city=Gorakhpur&days=7
// ==================================================

router.get(
    "/trends",
    async (req, res, next) => {
        try {
            const analyticsRequest =
                parseAnalyticsRequest(
                    req.query
                );

            const result =
                await getWeatherTrends(
                    analyticsRequest
                );

            const latestWeather =
                result.latestObservation
                    ?.weather || {};

            const advancedInsights =
                buildAdvancedWeatherInsights({
                    currentWeather: {
                        temperature:
                            latestWeather.temperature,

                        humidity:
                            latestWeather.humidity,

                        windSpeed:
                            latestWeather.windSpeed,
                    },

                    historicalTrends:
                        result.trends,

                    historicalSummary:
                        result.summary,
                });

            return res.status(200).json({
                success: true,

                data: {
                    ...result,
                    advancedInsights,
                },
            });
        } catch (error) {
            console.error(
                "Weather Analytics Error:",
                error.message
            );

            next(error);
        }
    }
);

// ==================================================
// AQI ANALYTICS
//
// GET /api/analytics/aqi?city=Gorakhpur&days=7
// ==================================================

router.get(
    "/aqi",
    async (req, res, next) => {
        try {
            const analyticsRequest =
                parseAnalyticsRequest(
                    req.query
                );

            const result =
                await getAQIAnalytics(
                    analyticsRequest
                );

            return res.status(200).json({
                success: true,
                data: result,
            });
        } catch (error) {
            console.error(
                "AQI Analytics Error:",
                error.message
            );

            next(error);
        }
    }
);

// ==================================================
// RAINFALL & TEMPERATURE ANALYTICS
//
// GET /api/analytics/rainfall-temperature
//     ?city=Gorakhpur&days=7
// ==================================================

router.get(
    "/rainfall-temperature",
    async (req, res, next) => {
        try {
            const analyticsRequest =
                parseAnalyticsRequest(
                    req.query
                );

            const result =
                await getRainfallTemperatureAnalytics(
                    analyticsRequest
                );

            return res.status(200).json({
                success: true,
                data: result,
            });
        } catch (error) {
            console.error(
                "Rainfall Temperature Analytics Error:",
                error.message
            );

            next(error);
        }
    }
);

module.exports = router;