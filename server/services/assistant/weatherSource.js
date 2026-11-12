const { TTLCache } = require("../../lib/cache");
const { getOverview } = require("../forecastService");
const { fetchYesterday } = require("../../providers/openMeteo");
const { searchPlaces } = require("../../providers/geocoder");
const { compareYesterday } = require("./context");

const yCache = new TTLCache({ ttlMs: 60 * 60 * 1000, max: 300 });

/** Resolves a place name (or the user's current place) to real weather + yesterday's comparison. */
const makeWeatherFor = (here) => async (place) => {
    let point = { latitude: here.latitude, longitude: here.longitude, name: here.name };

    if (place) {
        let hits = await searchPlaces(place, { scope: "india", limit: 1 });
        if (!hits.length) hits = await searchPlaces(place, { scope: "world", limit: 1 });
        if (!hits.length) {
            const err = new Error(`I couldn't find a place called "${place}".`);
            err.userMessage = err.message;
            throw err;
        }
        point = { latitude: hits[0].latitude, longitude: hits[0].longitude, name: hits[0].name };
    }

    const overview = await getOverview(point.latitude, point.longitude);
    const key = `${point.latitude.toFixed(2)},${point.longitude.toFixed(2)}`;
    const raw = await yCache.wrap(key, () => fetchYesterday(point.latitude, point.longitude)).catch(() => null);

    return { overview, place: point.name, yesterday: raw ? compareYesterday(overview, raw) : null };
};

/** Statistical analysis (trend, anomalies, sudden changes, heatwave risk) for a place, in the user's unit. */
const makeAnalysisFor = (here, unit) => async (place) => {
    const { getAnalysis } = require("../prediction/service");
    let point = { latitude: here.latitude, longitude: here.longitude, name: here.name };

    if (place) {
        let hits = await searchPlaces(place, { scope: "india", limit: 1 });
        if (!hits.length) hits = await searchPlaces(place, { scope: "world", limit: 1 });
        if (!hits.length) { const err = new Error(`I couldn't find a place called "${place}".`); err.userMessage = err.message; throw err; }
        point = { latitude: hits[0].latitude, longitude: hits[0].longitude, name: hits[0].name };
    }

    const a = await getAnalysis({ ...point, unit });
    return { ...a, place: point.name };
};

module.exports = { makeWeatherFor, makeAnalysisFor };
