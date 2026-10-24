const Alert = require("../models/Alert");

/**
 * Evaluate current weather conditions and return
 * the alerts that should currently be active.
 */
function evaluateWeatherAlerts(weatherData) {
    const alerts = [];

    const temperature = Number(weatherData?.temperature);
    const humidity = Number(weatherData?.humidity);
    const windSpeed = Number(weatherData?.windSpeed);
    const condition = String(weatherData?.condition || "").toLowerCase();

    // Extreme heat
    if (Number.isFinite(temperature) && temperature >= 40) {
        alerts.push({
            type: "extreme_heat",
            severity: "danger",
            title: "Extreme heat",
            message: `Temperature has reached ${temperature}°C. Avoid prolonged outdoor exposure and stay hydrated.`,
        });
    }

    // High temperature
    else if (Number.isFinite(temperature) && temperature >= 35) {
        alerts.push({
            type: "high_temperature",
            severity: "warning",
            title: "High temperature",
            message: `Temperature is currently ${temperature}°C. Take precautions if you are spending extended time outdoors.`,
        });
    }

    // High humidity
    if (Number.isFinite(humidity) && humidity >= 85) {
        alerts.push({
            type: "high_humidity",
            severity: "warning",
            title: "High humidity",
            message: `Humidity is currently ${humidity}%. Conditions may feel significantly warmer and less comfortable.`,
        });
    }

    // Strong winds
    if (Number.isFinite(windSpeed) && windSpeed >= 40) {
        alerts.push({
            type: "strong_wind",
            severity: "danger",
            title: "Strong winds",
            message: `Wind speed is currently ${windSpeed} km/h. Exercise caution outdoors.`,
        });
    }

    // Rain
    if (
        condition.includes("rain") ||
        condition.includes("drizzle")
    ) {
        alerts.push({
            type: "rain",
            severity: "warning",
            title: "Rain conditions",
            message: "Rain is currently affecting the selected location.",
        });
    }

    // Thunderstorm
    if (condition.includes("thunderstorm")) {
        alerts.push({
            type: "thunderstorm",
            severity: "danger",
            title: "Thunderstorm conditions",
            message: "Thunderstorm conditions are currently reported. Consider avoiding exposed outdoor areas.",
        });
    }

    return alerts;
}

/**
 * Persist evaluated alerts for a user.
 *
 * This function:
 * - creates new alerts
 * - updates existing active alerts
 * - resolves alerts that are no longer active
 */
async function persistWeatherAlerts({
    userId,
    weatherData,
    location,
}) {
    const evaluatedAlerts = evaluateWeatherAlerts(weatherData);

    const city = location?.city || "Unknown";
    const country = location?.country || "";

    const activeTypes = evaluatedAlerts.map(
        (alert) => alert.type
    );

    // Resolve alerts that are no longer active.
    await Alert.updateMany(
        {
            user: userId,
            status: "active",
            "location.city": city,
            type: {
                $nin: activeTypes,
            },
        },
        {
            $set: {
                status: "resolved",
                resolvedAt: new Date(),
            },
        }
    );

    const persistedAlerts = [];

    for (const alert of evaluatedAlerts) {
        const existingAlert = await Alert.findOne({
            user: userId,
            type: alert.type,
            status: "active",
            "location.city": city,
        });

        if (existingAlert) {
            existingAlert.severity = alert.severity;
            existingAlert.title = alert.title;
            existingAlert.message = alert.message;

            existingAlert.location = {
                city,
                country,
            };

            existingAlert.weatherSnapshot = {
                temperature: Number.isFinite(
                    Number(weatherData?.temperature)
                )
                    ? Number(weatherData.temperature)
                    : null,

                humidity: Number.isFinite(
                    Number(weatherData?.humidity)
                )
                    ? Number(weatherData.humidity)
                    : null,

                windSpeed: Number.isFinite(
                    Number(weatherData?.windSpeed)
                )
                    ? Number(weatherData.windSpeed)
                    : null,

                condition: String(
                    weatherData?.condition || ""
                ),
            };

            existingAlert.lastDetectedAt = new Date();

            await existingAlert.save();

            persistedAlerts.push(existingAlert);
        } else {
            const newAlert = await Alert.create({
                user: userId,

                type: alert.type,

                severity: alert.severity,

                title: alert.title,

                message: alert.message,

                location: {
                    city,
                    country,
                },

                weatherSnapshot: {
                    temperature: Number.isFinite(
                        Number(weatherData?.temperature)
                    )
                        ? Number(weatherData.temperature)
                        : null,

                    humidity: Number.isFinite(
                        Number(weatherData?.humidity)
                    )
                        ? Number(weatherData.humidity)
                        : null,

                    windSpeed: Number.isFinite(
                        Number(weatherData?.windSpeed)
                    )
                        ? Number(weatherData.windSpeed)
                        : null,

                    condition: String(
                        weatherData?.condition || ""
                    ),
                },

                status: "active",

                isRead: false,

                firstDetectedAt: new Date(),

                lastDetectedAt: new Date(),
            });

            persistedAlerts.push(newAlert);
        }
    }

    return persistedAlerts;
}

module.exports = {
    evaluateWeatherAlerts,
    persistWeatherAlerts,
};