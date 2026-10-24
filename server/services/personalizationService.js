
const UserPreferences = require("../models/UserPreferences");

/**
 * Get the user's complete personalization profile.
 *
 * This service keeps personalization logic
 * separate from controllers/routes so it can
 * later be reused by dashboard, recommendations,
 * alerts and other features.
 */
const getPersonalizationProfile = async (userId) => {
    if (!userId) {
        throw new Error(
            "User ID is required to load personalization profile."
        );
    }

    const preferences =
        await UserPreferences.findOne({
            user: userId,
        }).lean();

    /*
     * If preferences do not exist yet, return
     * safe application defaults.
     */
    if (!preferences) {
        return {
            weather: {
                temperatureUnit: "celsius",
                windUnit: "kmh",
                defaultLocation: "Gorakhpur",
            },

            appearance: {
                theme: "system",
            },

            notifications: {
                severeWeatherAlerts: true,
                dailyForecast: true,
                weatherUpdates: false,

                channels: {
                    inApp: true,
                    email: false,
                    sms: false,
                    whatsapp: false,
                },
            },
        };
    }

    return {
        weather: {
            temperatureUnit:
                preferences.weather
                    ?.temperatureUnit ||
                "celsius",

            windUnit:
                preferences.weather
                    ?.windUnit ||
                "kmh",

            defaultLocation:
                preferences.weather
                    ?.defaultLocation ||
                "Gorakhpur",
        },

        appearance: {
            theme:
                preferences.appearance
                    ?.theme ||
                "system",
        },

        notifications: {
            severeWeatherAlerts:
                preferences.notifications
                    ?.severeWeatherAlerts ??
                true,

            dailyForecast:
                preferences.notifications
                    ?.dailyForecast ??
                true,

            weatherUpdates:
                preferences.notifications
                    ?.weatherUpdates ??
                false,

            channels: {
                inApp:
                    preferences.notifications
                        ?.channels
                        ?.inApp ??
                    true,

                email:
                    preferences.notifications
                        ?.channels
                        ?.email ??
                    false,

                sms:
                    preferences.notifications
                        ?.channels
                        ?.sms ??
                    false,

                whatsapp:
                    preferences.notifications
                        ?.channels
                        ?.whatsapp ??
                    false,
            },
        },
    };
};

module.exports = {
    getPersonalizationProfile,
};
