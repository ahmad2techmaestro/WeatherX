/**
 * Weather intelligence: derived metrics and scores computed only from the overview
 * payload (real model data). Pure functions, no network or database. Scores are
 * heuristics, and the UI labels them as guidance, not measurements.
 */

const { buildLifestyle } = require("./lifestyleModel");
const { buildToday } = require("./todayModel");

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const isNum = (v) => Number.isFinite(v);
const HOUR = 3600;

// ── Heat index (NOAA Rothfusz regression, valid for T >= 27 °C and RH >= 40%)
const heatIndex = (tC, rh) => {
    if (!isNum(tC) || !isNum(rh)) return null;

    const t = (tC * 9) / 5 + 32;
    let hi = 0.5 * (t + 61 + (t - 68) * 1.2 + rh * 0.094);

    if (hi >= 80) {
        hi = -42.379 + 2.04901523 * t + 10.14333127 * rh - 0.22475541 * t * rh - 0.00683783 * t * t - 0.05481717 * rh * rh + 0.00122874 * t * t * rh + 0.00085282 * t * rh * rh - 0.00000199 * t * t * rh * rh;
        if (rh < 13 && t >= 80 && t <= 112) hi -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(t - 95)) / 17);
        if (rh > 85 && t >= 80 && t <= 87) hi += ((rh - 85) / 10) * ((87 - t) / 5);
    }

    const c = ((hi - 32) * 5) / 9;
    const value = Math.round(Math.max(c, tC));
    const level = value >= 54 ? "Extreme danger" : value >= 41 ? "Danger" : value >= 32 ? "Extreme caution" : value >= 27 ? "Caution" : "Comfortable";

    return { value, level };
};

// ── Wet-bulb temperature (Stull 2011), the best single number for heat stress
const wetBulb = (tC, rh) => {
    if (!isNum(tC) || !isNum(rh)) return null;

    const w = tC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) + Math.atan(tC + rh) - Math.atan(rh - 1.676331) + 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) - 4.686035;
    const value = Math.round(w * 10) / 10;
    const level = value >= 31 ? "Dangerous: sustained exposure can be lethal" : value >= 28 ? "Severe heat stress" : value >= 24 ? "Elevated heat stress" : "Low heat stress";

    return { value, level };
};

// ── Comfort 0–100 (feels-like, humidity, wind, air)
const comfortScore = (c, naqi) => {
    let s = 100;
    const f = c.feelsLike ?? c.temperature;

    if (isNum(f)) s -= f > 24 ? (f - 24) * 3.2 : f < 18 ? (18 - f) * 3.5 : 0;
    if (isNum(c.humidity)) s -= c.humidity > 70 ? (c.humidity - 70) * 0.6 : c.humidity < 25 ? (25 - c.humidity) * 0.4 : 0;
    if (isNum(c.windSpeed) && c.windSpeed > 25) s -= (c.windSpeed - 25) * 0.8;
    if (isNum(c.precipitation) && c.precipitation > 0) s -= 8;
    if (naqi?.value > 100) s -= Math.min(25, (naqi.value - 100) / 8);

    const value = Math.round(clamp(s));

    return { value, label: value >= 80 ? "Very comfortable" : value >= 60 ? "Comfortable" : value >= 40 ? "Fair" : value >= 20 ? "Uncomfortable" : "Harsh" };
};

const verdict = (score) => (score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Poor");

/** Activity suitability for one hour of data. */
const activityScores = (h, naqi) => {
    const t = h.feelsLike ?? h.temperature;
    const rain = (h.precipProbability ?? 0) >= 40 || (h.precipitation ?? 0) >= 0.3;
    const airPenalty = naqi?.value > 100 ? Math.min(40, (naqi.value - 100) / 5) : 0;
    const out = {};

    const tempPenalty = (ideal, spread) => Math.abs((t ?? ideal) - ideal) * spread;

    out.walking = 100 - tempPenalty(20, 3.2) - (rain ? 35 : 0) - (h.windGust > 45 ? 20 : 0) - airPenalty - ((h.uvIndex ?? 0) > 8 ? 12 : 0) - (h.isDay ? 0 : 8);
    out.cycling = 100 - tempPenalty(21, 3) - (rain ? 40 : 0) - Math.max(0, ((h.windSpeed ?? 0) - 18) * 2) - airPenalty * 1.2 - (h.isDay ? 0 : 15);
    out.driving = 100 - (rain ? 22 : 0) - ((h.visibilityKm ?? 10) < 1 ? 45 : (h.visibilityKm ?? 10) < 4 ? 20 : 0) - Math.max(0, ((h.windGust ?? 0) - 50) * 0.8) - (h.isDay ? 0 : 6);
    out.farming = 100 - (rain ? 50 : 0) - Math.max(0, ((h.windSpeed ?? 0) - 12) * 3.5) - ((t ?? 25) > 38 ? 25 : 0) - (h.isDay ? 0 : 35);
    out.laundry = 100 - Math.max(0, ((h.humidity ?? 50) - 45) * 1.3) - (rain ? 60 : 0) - ((h.cloudCover ?? 0) > 70 ? 15 : 0) - (h.isDay ? 0 : 40);
    out.stargazing = h.isDay ? 0 : 100 - (h.cloudCover ?? 0) * 0.9 - (rain ? 40 : 0) - ((h.visibilityKm ?? 10) < 8 ? 15 : 0) - airPenalty;

    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Math.round(clamp(v))]));
};

const ACTIVITIES = [
    ["walking", "Walking & running"],
    ["cycling", "Cycling"],
    ["driving", "Driving & travel"],
    ["farming", "Spraying & field work"],
    ["laundry", "Drying clothes"],
    ["stargazing", "Stargazing"],
];

/** Best one-hour window per activity over the next 24 h, plus the score right now. */
const activities = (hourly, naqi) => {
    const next = hourly.slice(0, 24);
    if (next.length === 0) return [];

    const scored = next.map((h) => ({ h, s: activityScores(h, naqi) }));

    return ACTIVITIES.map(([key, label]) => {
        const best = scored.reduce((a, b) => (b.s[key] > a.s[key] ? b : a));

        return { key, label, now: scored[0].s[key], verdict: verdict(scored[0].s[key]), bestTime: best.s[key] > 0 ? best.h.time : null, bestScore: best.s[key] };
    });
};

const sum = (list, f) => list.reduce((a, x) => a + (f(x) || 0), 0);

/** Rain accumulation and peak, from the hourly model precipitation. */
const rainfall = (hourly) => {
    const total = (n) => Math.round(sum(hourly.slice(0, n), (h) => h.precipitation) * 10) / 10;
    const next24 = hourly.slice(0, 24);
    const peak = next24.reduce((a, h) => (h.precipitation > (a?.precipitation ?? 0) ? h : a), null);

    return { next6h: total(6), next24h: total(24), next72h: total(72), peakHour: peak && peak.precipitation >= 0.5 ? { time: peak.time, mm: peak.precipitation } : null };
};

/** What is about to change in the next 24 h (temperature swing, pressure trend, wind pick-up). */
const changes = (current, hourly) => {
    const list = [];
    const next = hourly.slice(0, 24);

    if (next.length >= 6) {
        const hi = next.reduce((a, h) => (h.temperature > a.temperature ? h : a));
        const lo = next.reduce((a, h) => (h.temperature < a.temperature ? h : a));
        const drop = (next[0].temperature ?? 0) - lo.temperature;
        const rise = hi.temperature - (next[0].temperature ?? 0);

        if (drop >= 6) list.push({ id: "temp-drop", tone: "info", title: `Temperature falls ${Math.round(drop)}°C`, detail: `From ${Math.round(next[0].temperature)}°C now to ${Math.round(lo.temperature)}°C`, time: lo.time });
        if (rise >= 6) list.push({ id: "temp-rise", tone: "warn", title: `Temperature climbs ${Math.round(rise)}°C`, detail: `Up to ${Math.round(hi.temperature)}°C`, time: hi.time });
    }

    const p3 = hourly[3]?.pressure;
    if (isNum(current.pressure) && isNum(p3)) {
        const delta = p3 - current.pressure;
        if (delta <= -3) list.push({ id: "pressure-fall", tone: "warn", title: "Pressure dropping fast", detail: `${Math.abs(delta).toFixed(1)} hPa lower in 3 h: unsettled or stormy weather often follows.` });
        else if (delta >= 3) list.push({ id: "pressure-rise", tone: "good", title: "Pressure rising", detail: `+${delta.toFixed(1)} hPa in 3 h: weather is settling.` });
    }

    const gust = next.reduce((a, h) => (h.windGust > (a?.windGust ?? 0) ? h : a), null);
    if (gust && gust.windGust >= 40 && gust.windGust - (current.windGust ?? 0) >= 15) list.push({ id: "wind-up", tone: "warn", title: "Wind picks up", detail: `Gusts reach ${Math.round(gust.windGust)} km/h`, time: gust.time });

    return list;
};

/** Consecutive wet days. >=3 days of >=2.5 mm each is reported as a rainy (monsoon-type) spell. */
const rainySpell = (daily) => {
    let best = null;
    let run = [];

    for (const d of daily.slice(0, 10)) {
        if ((d.precipitationSum ?? 0) >= 2.5) run.push(d);
        else {
            if (run.length >= 3 && (!best || run.length > best.length)) best = run;
            run = [];
        }
    }
    if (run.length >= 3 && (!best || run.length > best.length)) best = run;
    if (!best) return null;

    const total = Math.round(sum(best, (d) => d.precipitationSum));

    return { days: best.length, totalMm: total, startDate: best[0].date, endDate: best[best.length - 1].date };
};

/** Day-by-day outdoor suitability for the week (daytime hours only). */
const bestDays = (hourly, daily, naqi, offset) => {
    return daily.slice(0, 7).map((d) => {
        const hours = hourly.filter((h) => h.isDay && h.time >= d.time && h.time < d.time + 24 * HOUR);
        const score = hours.length ? Math.round(hours.reduce((a, h) => a + (activityScores(h, naqi).walking + activityScores(h, naqi).cycling) / 2, 0) / hours.length) : null;

        return { date: d.date, label: d.label, high: d.temperatureMax, low: d.temperatureMin, rainMm: d.precipitationSum, score, verdict: score === null ? null : verdict(score) };
    });
};

const goldenHours = (astronomy) => {
    if (!isNum(astronomy.sunrise) || !isNum(astronomy.sunset)) return null;

    return { morning: { start: astronomy.sunrise, end: astronomy.sunrise + HOUR }, evening: { start: astronomy.sunset - HOUR, end: astronomy.sunset } };
};

/** What to wear / carry, from the next 12 hours. */
const gear = (current, hourly) => {
    const next = hourly.slice(0, 12);
    const items = [];
    const maxT = Math.max(...next.map((h) => h.feelsLike ?? h.temperature), current.feelsLike ?? current.temperature);
    const minT = Math.min(...next.map((h) => h.feelsLike ?? h.temperature), current.feelsLike ?? current.temperature);

    if (next.some((h) => (h.precipProbability ?? 0) >= 40 || h.precipitation >= 0.3)) items.push("Umbrella or rain jacket");
    if (maxT >= 34) items.push("Light cotton clothes, water bottle");
    if (minT <= 12) items.push("Warm layer");
    if (minT <= 5) items.push("Heavy jacket and gloves");
    if (next.some((h) => h.isDay && h.uvIndex >= 6)) items.push("Sunscreen and sunglasses");
    if (next.some((h) => (h.visibilityKm ?? 10) < 1)) items.push("Fog lights, drive slowly");

    return items;
};

const buildIntelligence = (overview) => {
    const days = bestDays(overview.hourly, overview.daily, overview.airQuality?.naqi || null, overview.location.utcOffsetSeconds);
    const { current, hourly, daily, astronomy, location, airQuality } = overview;
    const naqi = airQuality?.naqi || null;

    return {
        heatIndex: heatIndex(current.temperature, current.humidity),
        wetBulb: wetBulb(current.temperature, current.humidity),
        comfort: comfortScore(current, naqi),
        activities: activities(hourly, naqi),
        rainfall: rainfall(hourly),
        changes: changes(current, hourly),
        rainySpell: rainySpell(daily),
        bestDays: days,
        lifestyle: buildLifestyle(overview, days),
        today: buildToday(overview, { activityScores }),
        goldenHours: goldenHours(astronomy),
        gear: gear(current, hourly),
        note: "Scores are guidance derived from forecast data, not measurements.",
    };
};

module.exports = { buildIntelligence, heatIndex, wetBulb, comfortScore, activityScores, rainySpell, rainfall, changes, bestDays };
