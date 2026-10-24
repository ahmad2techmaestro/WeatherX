const UserPreferences = require("../models/UserPreferences");
const SavedLocation = require("../models/SavedLocation");
const { getOverview } = require("../services/forecastService");
const { notifyUser } = require("../services/notificationService");
const { buildAlertNotifications, buildDailyDigest, isDigestWindow } = require("../services/notificationModel");

const placeLabel = (loc) => loc.customLabel || loc.name;

/** Group saved locations by user. */
const locationsFor = async (userIds) => {
    const rows = await SavedLocation.find({ user: { $in: userIds } })
        .select("user name latitude longitude label customLabel createdAt")
        .sort({ createdAt: 1 })
        .lean();

    const byUser = new Map();
    for (const row of rows) {
        const key = String(row.user);
        if (!byUser.has(key)) byUser.set(key, []);
        byUser.get(key).push(row);
    }
    return byUser;
};

/**
 * Watches every saved place of users who enabled severe-weather alerts. New or
 * escalated hazards (heat, cold, heavy rain, strong wind, storm, fog, air quality)
 * become notifications; unchanged ones are skipped by their dedupe key.
 */
const watchWeatherChanges = async () => {
    const prefs = await UserPreferences.find({ "notifications.severeWeatherAlerts": true }).select("user").lean();
    const byUser = await locationsFor(prefs.map((p) => p.user));
    const stats = { users: 0, places: 0, created: 0, failed: 0 };

    for (const { user } of prefs) {
        const places = byUser.get(String(user)) || [];
        if (places.length === 0) continue;
        stats.users += 1;

        for (const place of places) {
            stats.places += 1;
            try {
                const overview = await getOverview(place.latitude, place.longitude);
                for (const item of buildAlertNotifications(overview, placeLabel(place))) {
                    stats.created += (await notifyUser({ userId: user, ...item })).length;
                }
            } catch (error) {
                stats.failed += 1;
                console.error(`[WeatherWatch] ${place.name}: ${error.message}`);
            }
        }
    }

    console.log(`[WeatherWatch] users=${stats.users} places=${stats.places} created=${stats.created} failed=${stats.failed}`);
    return stats;
};

/**
 * Sends each opted-in user one morning summary for their primary place
 * ("Home" if set, otherwise the first saved place) once their local morning starts.
 */
const sendDailyDigests = async () => {
    const prefs = await UserPreferences.find({ "notifications.dailyForecast": true })
        .select("user weather.temperatureUnit")
        .lean();
    const byUser = await locationsFor(prefs.map((p) => p.user));
    const stats = { users: 0, created: 0, failed: 0 };
    const nowSec = Math.floor(Date.now() / 1000);

    for (const pref of prefs) {
        const places = byUser.get(String(pref.user)) || [];
        const place = places.find((p) => p.label === "Home") || places[0];
        if (!place) continue;

        try {
            const overview = await getOverview(place.latitude, place.longitude);
            if (!isDigestWindow(overview, nowSec)) continue;

            stats.users += 1;
            const digest = buildDailyDigest(overview, placeLabel(place), {
                temperatureUnit: pref.weather?.temperatureUnit,
                nowSec,
            });
            if (digest) stats.created += (await notifyUser({ userId: pref.user, ...digest })).length;
        } catch (error) {
            stats.failed += 1;
            console.error(`[DailyDigest] ${place.name}: ${error.message}`);
        }
    }

    console.log(`[DailyDigest] users=${stats.users} created=${stats.created} failed=${stats.failed}`);
    return stats;
};

module.exports = { watchWeatherChanges, sendDailyDigests };
