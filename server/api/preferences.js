
const express = require("express");

const UserPreferences = require("../models/UserPreferences");

const { authenticate } = require("../middleware/auth");

const router = express.Router();

/*
 * GET /api/preferences
 *
 * Returns the authenticated user's preferences.
 */
router.get("/", authenticate, async (req, res, next) => {
    try {
        let preferences = await UserPreferences.findOne({
            user: req.user.id,
        }).lean();

        /*
         * Create default preferences automatically
         * for users who do not have a preferences document yet.
         */
        if (!preferences) {
            preferences = await UserPreferences.create({
                user: req.user.id,
            });

            preferences = preferences.toObject();
        }

        return res.status(200).json({
            success: true,
            data: preferences,
        });
    } catch (error) {
        next(error);
    }
});

/*
 * PUT /api/preferences
 *
 * Updates the authenticated user's preferences.
 */
router.put("/", authenticate, async (req, res, next) => {
    try {
        const {
            weather,
            appearance,
            notifications,
        } = req.body;

        const update = {};

        /*
         * Weather preferences
         */
        if (weather) {
            if (
                weather.temperatureUnit !== undefined
            ) {
                update["weather.temperatureUnit"] =
                    weather.temperatureUnit;
            }

            if (weather.windUnit !== undefined) {
                update["weather.windUnit"] =
                    weather.windUnit;
            }

            if (
                weather.defaultLocation !== undefined
            ) {
                update["weather.defaultLocation"] =
                    weather.defaultLocation;
            }
        }

        /*
         * Appearance preferences
         */
        if (appearance) {
            if (appearance.theme !== undefined) {
                update["appearance.theme"] =
                    appearance.theme;
            }
        }

        /*
         * Notification preferences
         */
        if (notifications) {
            if (
                notifications.severeWeatherAlerts !==
                undefined
            ) {
                update[
                    "notifications.severeWeatherAlerts"
                ] =
                    notifications.severeWeatherAlerts;
            }

            if (
                notifications.dailyForecast !==
                undefined
            ) {
                update[
                    "notifications.dailyForecast"
                ] =
                    notifications.dailyForecast;
            }

            if (
                notifications.weatherUpdates !==
                undefined
            ) {
                update[
                    "notifications.weatherUpdates"
                ] =
                    notifications.weatherUpdates;
            }

            /*
             * Phone number: digits with an optional leading +, or empty to clear it
             */
            if (notifications.phoneNumber !== undefined) {
                const phone = String(notifications.phoneNumber).replace(/[\s-]/g, "");

                if (phone && !/^\+?\d{7,15}$/.test(phone)) {
                    return res.status(400).json({
                        success: false,
                        message: "Enter a phone number using digits only, with the country code.",
                    });
                }

                update["notifications.phoneNumber"] = phone;
            }

            /*
             * Notification delivery channels
             */
            if (notifications.channels) {
                if (
                    notifications.channels.inApp !==
                    undefined
                ) {
                    update[
                        "notifications.channels.inApp"
                    ] =
                        notifications.channels.inApp;
                }

                if (
                    notifications.channels.email !==
                    undefined
                ) {
                    update[
                        "notifications.channels.email"
                    ] =
                        notifications.channels.email;
                }

                if (
                    notifications.channels.sms !==
                    undefined
                ) {
                    update[
                        "notifications.channels.sms"
                    ] =
                        notifications.channels.sms;
                }

                if (
                    notifications.channels.whatsapp !==
                    undefined
                ) {
                    update[
                        "notifications.channels.whatsapp"
                    ] =
                        notifications.channels.whatsapp;
                }
            }
        }

        const preferences =
            await UserPreferences.findOneAndUpdate(
                {
                    user: req.user.id,
                },
                {
                    $set: update,
                },
                {
                    new: true,
                    upsert: true,
                    runValidators: true,
                    setDefaultsOnInsert: true,
                }
            ).lean();

        return res.status(200).json({
            success: true,
            message: "Preferences updated successfully.",
            data: preferences,
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;

