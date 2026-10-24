const UserPreferences = require("../models/UserPreferences");
const SavedLocation = require("../models/SavedLocation");

const {
    getCurrentWeatherByCoordinates,
} = require("../services/weatherFetchService");

const {
    persistWeatherAlerts,
} = require("../services/alertService");

const {
    createWeatherAlertNotifications,
} = require("../services/notificationService");

const evaluateWeatherForSavedLocations = async () => {
    const startedAt = Date.now();

    console.log(
        "[WeatherEvaluationJob] Starting weather evaluation..."
    );

    let usersProcessed = 0;
    let locationsProcessed = 0;
    let alertsDetected = 0;
    let notificationsCreated = 0;
    let locationsFailed = 0;

    try {
        const preferences =
            await UserPreferences.find({
                "notifications.severeWeatherAlerts": true,
            })
                .select("user")
                .lean();

        if (preferences.length === 0) {
            console.log(
                "[WeatherEvaluationJob] No users have severe weather alerts enabled."
            );

            return {
                usersProcessed: 0,
                locationsProcessed: 0,
                alertsDetected: 0,
                notificationsCreated: 0,
                locationsFailed: 0,
            };
        }

        const userIds = preferences.map(
            (preference) => preference.user
        );

        const savedLocations =
            await SavedLocation.find({
                user: {
                    $in: userIds,
                },
            })
                .select(
                    "user name state country latitude longitude label customLabel"
                )
                .lean();

        const locationsByUser = new Map();

        for (const location of savedLocations) {
            const userId =
                location.user.toString();

            if (!locationsByUser.has(userId)) {
                locationsByUser.set(
                    userId,
                    []
                );
            }

            locationsByUser
                .get(userId)
                .push(location);
        }

        usersProcessed = userIds.length;

        for (const userId of userIds) {
            const userLocations =
                locationsByUser.get(
                    userId.toString()
                ) || [];

            if (userLocations.length === 0) {
                continue;
            }

            for (const location of userLocations) {
                locationsProcessed += 1;

                try {
                    const weather =
                        await getCurrentWeatherByCoordinates(
                            {
                                latitude:
                                    location.latitude,

                                longitude:
                                    location.longitude,
                            }
                        );

                    const persistedAlerts =
                        await persistWeatherAlerts({
                            userId,

                            weatherData: weather,

                            location: {
                                city:
                                    weather.city ||
                                    location.name,

                                country:
                                    weather.country ||
                                    location.country,
                            },
                        });

                    alertsDetected +=
                        persistedAlerts.length;

                    for (const alert of persistedAlerts) {
                        const notifications =
                            await createWeatherAlertNotifications(
                                {
                                    userId,
                                    alert,
                                }
                            );

                        notificationsCreated +=
                            notifications.length;
                    }

                    console.log(
                        `[WeatherEvaluationJob] Evaluated ${location.name} for user ${userId}: ${persistedAlerts.length} active alert(s), ${persistedAlerts.length} alert(s) checked for notification`
                    );
                } catch (error) {
                    locationsFailed += 1;

                    console.error(
                        `[WeatherEvaluationJob] Failed for location "${location.name}":`,
                        error.message
                    );
                }
            }
        }

        const duration =
            Date.now() - startedAt;

        console.log(
            `[WeatherEvaluationJob] Completed in ${duration}ms`
        );

        console.log(
            `[WeatherEvaluationJob] Users: ${usersProcessed}, Locations: ${locationsProcessed}, Alerts: ${alertsDetected}, Notifications: ${notificationsCreated}, Failures: ${locationsFailed}`
        );

        return {
            usersProcessed,
            locationsProcessed,
            alertsDetected,
            notificationsCreated,
            locationsFailed,
            duration,
        };
    } catch (error) {
        console.error(
            "[WeatherEvaluationJob] Fatal error:",
            error.message
        );

        throw error;
    }
};

module.exports = {
    evaluateWeatherForSavedLocations,
};