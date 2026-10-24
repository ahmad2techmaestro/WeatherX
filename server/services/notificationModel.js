/**
 * Pure builders for the notification texts (no network, no database).
 * Everything here is computed from the overview payload so the numbers in a
 * notification always match what the app shows.
 */

const SEVERITY_ORDER = { warning: 0, watch: 1 };

const tempText = (celsius, unit) => {
    if (!Number.isFinite(celsius)) return "–";
    return unit === "fahrenheit" ? `${Math.round((celsius * 9) / 5 + 32)}°F` : `${Math.round(celsius)}°C`;
};

const placeKey = (overview) => `${overview.location.latitude},${overview.location.longitude}`;

const localParts = (overview, nowSec) => {
    const local = new Date((nowSec + (overview.location.utcOffsetSeconds || 0)) * 1000);

    return {
        hour: local.getUTCHours(),
        date: local.toISOString().slice(0, 10),
    };
};

/**
 * Turn the overview's advisories into alert notifications. The dedupe key contains the
 * advisory id and severity, so a *change* (watch -> warning, new day, new hazard)
 * produces a new notification while an unchanged hazard stays silent.
 */
const buildAlertNotifications = (overview, placeName) =>
    (overview.advisories || [])
        .filter((a) => a.severity in SEVERITY_ORDER)
        .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
        .map((a) => ({
            type: "weather_alert",
            title: `${a.severity === "warning" ? "Warning" : "Advisory"} · ${placeName}: ${a.title.replace(/^[^:]+:\s*/, "")}`,
            message: a.detail,
            dedupeKey: `adv:${placeKey(overview)}:${a.id}:${a.severity}`,
            metadata: { kind: a.kind, severity: a.severity, place: placeName, url: "/alerts" },
        }));

/** Morning summary built from today's numbers. */
const buildDailyDigest = (overview, placeName, { temperatureUnit = "celsius", nowSec = Math.floor(Date.now() / 1000) } = {}) => {
    const today = overview.daily?.[0];
    if (!today) return null;

    const { date } = localParts(overview, nowSec);
    const parts = [
        `${today.label}, ${tempText(today.temperatureMin, temperatureUnit)} to ${tempText(today.temperatureMax, temperatureUnit)}.`,
        today.precipProbability >= 30
            ? `Rain chance ${today.precipProbability}%${today.precipitationSum >= 1 ? ` (about ${Math.round(today.precipitationSum)} mm)` : ""}.`
            : "Little chance of rain.",
    ];

    if (today.uvIndexMax >= 6) parts.push(`UV peaks at ${today.uvIndexMax}.`);
    if (today.windGustMax >= 40) parts.push(`Gusts up to ${today.windGustMax} km/h.`);

    const aqi = overview.airQuality?.naqi;
    if (aqi?.value) parts.push(`Air quality ${aqi.label.toLowerCase()} (AQI ${aqi.value}, indicative).`);

    const risk = (overview.advisories || []).find((a) => a.severity === "warning");
    if (risk) parts.push(`Note: ${risk.title.replace(/^[^:]+:\s*/, "")}.`);

    return {
        type: "daily_forecast",
        title: `Today in ${placeName}: ${today.label}, ${tempText(today.temperatureMax, temperatureUnit)}`,
        message: parts.join(" "),
        dedupeKey: `digest:${placeKey(overview)}:${date}`,
        metadata: { place: placeName, date, url: "/" },
    };
};

/** True during the morning window in the place's own time zone (catch-up allowed). */
const isDigestWindow = (overview, nowSec, startHour = 7, endHour = 11) => {
    const { hour } = localParts(overview, nowSec);
    return hour >= startHour && hour < endHour;
};

module.exports = { buildAlertNotifications, buildDailyDigest, isDigestWindow, tempText };
