/**
 * Pure functions that turn raw Open-Meteo responses into the single "overview"
 * object the app renders: current conditions, 7 days of hourly data, 14 days of
 * daily data, air quality, astronomy, data-driven insights and forecast-based
 * advisories. Nothing here touches the network or the database, so every rule
 * can be unit-tested with fixtures.
 *
 * Units on the wire are always metric (°C, km/h, mm, hPa, km). The client does
 * the unit conversion, so toggling °C/°F never needs another request.
 */

const SunCalc = require("suncalc");
const { describeCode, isWetCondition } = require("../lib/wmo");

const HOUR = 3600;
const DAY = 86400;

const num = (value) => {
    if (value === null || value === undefined || value === "") return null;

    const n = Number(value);

    return Number.isFinite(n) ? n : null;
};

const round = (value, digits = 0) => {
    const n = num(value);

    if (n === null) return null;

    const f = 10 ** digits;

    return Math.round(n * f) / f;
};

const at = (list, index) => (Array.isArray(list) ? list[index] : undefined);

// ──────────────────────────────────────────────────────────────
// Time helpers (all timestamps are unix seconds)
// ──────────────────────────────────────────────────────────────

const localDate = (t, offset) => new Date((t + offset) * 1000).toISOString().slice(0, 10);

const localHour = (t, offset) => new Date((t + offset) * 1000).getUTCHours();

const hourLabel = (t, offset) => {
    const h = localHour(t, offset);
    const suffix = h >= 12 ? "PM" : "AM";

    return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`;
};

const clockLabel = (t, offset) => {
    const d = new Date((t + offset) * 1000);
    const h = d.getUTCHours();
    const m = String(d.getUTCMinutes()).padStart(2, "0");

    return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h >= 12 ? "PM" : "AM"}`;
};

const durationLabel = (seconds) => {
    const total = Math.max(0, Math.round(seconds / 60));
    const h = Math.floor(total / 60);
    const m = total % 60;

    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} h`;

    return `${h} h ${m} min`;
};

// ──────────────────────────────────────────────────────────────
// Astronomy
// ──────────────────────────────────────────────────────────────

const SYNODIC_MONTH = 29.530588853;

/** Moonrise and moonset (unix seconds) that fall on the location's local calendar day. */
const moonTimes = (unixSeconds, latitude, longitude, offset) => {
    const lat = num(latitude);
    const lon = num(longitude);

    if (lat === null || lon === null) return { rise: null, set: null };

    const dayStart = Math.floor((unixSeconds + offset) / DAY) * DAY - offset;
    const dayEnd = dayStart + DAY;
    let rise = null;
    let set = null;

    // SunCalc works in UTC days, so scan the neighbouring days and keep what lands on the local one.
    for (const shift of [-1, 0, 1]) {
        const times = SunCalc.getMoonTimes(new Date((dayStart + shift * DAY) * 1000), lat, lon, true);

        for (const [kind, value] of [["rise", times.rise], ["set", times.set]]) {
            if (!value) continue;

            const t = Math.round(value.getTime() / 1000);

            if (t < dayStart || t >= dayEnd) continue;
            if (kind === "rise" && rise === null) rise = t;
            if (kind === "set" && set === null) set = t;
        }
    }

    return { rise, set };
};

const moonPhase = (unixSeconds) => {
    // Julian date of the reference new moon: 2000-01-06 14:24 UTC.
    const daysSinceNew = unixSeconds / DAY + 2440587.5 - 2451550.1;
    const age = ((daysSinceNew % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
    const fraction = age / SYNODIC_MONTH;
    const illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2;

    const names = [
        [0.03, "New moon"],
        [0.22, "Waxing crescent"],
        [0.28, "First quarter"],
        [0.47, "Waxing gibbous"],
        [0.53, "Full moon"],
        [0.72, "Waning gibbous"],
        [0.78, "Last quarter"],
        [0.97, "Waning crescent"],
        [1.01, "New moon"],
    ];

    const name = names.find(([limit]) => fraction < limit)[1];

    return {
        phase: Number(fraction.toFixed(3)),
        illumination: Math.round(illumination * 100),
        name,
        waxing: fraction < 0.5,
    };
};

// ──────────────────────────────────────────────────────────────
// Air quality
// ──────────────────────────────────────────────────────────────

// CPCB (India) National AQI breakpoints: [concLow, concHigh, indexLow, indexHigh].
const NAQI_BREAKPOINTS = {
    pm2_5: [[0, 30, 0, 50], [30, 60, 50, 100], [60, 90, 100, 200], [90, 120, 200, 300], [120, 250, 300, 400], [250, 380, 400, 500]],
    pm10: [[0, 50, 0, 50], [50, 100, 50, 100], [100, 250, 100, 200], [250, 350, 200, 300], [350, 430, 300, 400], [430, 600, 400, 500]],
    no2: [[0, 40, 0, 50], [40, 80, 50, 100], [80, 180, 100, 200], [180, 280, 200, 300], [280, 400, 300, 400], [400, 800, 400, 500]],
    so2: [[0, 40, 0, 50], [40, 80, 50, 100], [80, 380, 100, 200], [380, 800, 200, 300], [800, 1600, 300, 400], [1600, 2400, 400, 500]],
    o3: [[0, 50, 0, 50], [50, 100, 50, 100], [100, 168, 100, 200], [168, 208, 200, 300], [208, 748, 300, 400], [748, 1000, 400, 500]],
    co: [[0, 1, 0, 50], [1, 2, 50, 100], [2, 10, 100, 200], [10, 17, 200, 300], [17, 34, 300, 400], [34, 50, 400, 500]],
};

const subIndex = (pollutant, concentration) => {
    const table = NAQI_BREAKPOINTS[pollutant];

    if (!table || concentration === null) return null;

    for (const [cLow, cHigh, iLow, iHigh] of table) {
        if (concentration <= cHigh) {
            return ((iHigh - iLow) / (cHigh - cLow)) * (Math.max(concentration, cLow) - cLow) + iLow;
        }
    }

    return 500;
};

const NAQI_CATEGORIES = [
    { max: 50, key: "good", label: "Good", advice: "Minimal impact. Great day to be outdoors." },
    { max: 100, key: "satisfactory", label: "Satisfactory", advice: "Minor breathing discomfort is possible for very sensitive people." },
    { max: 200, key: "moderate", label: "Moderate", advice: "People with lung or heart disease, children and older adults should reduce long outdoor exertion." },
    { max: 300, key: "poor", label: "Poor", advice: "Prolonged outdoor exposure may cause discomfort. Sensitive groups should stay indoors where possible." },
    { max: 400, key: "very-poor", label: "Very poor", advice: "Respiratory illness likely on prolonged exposure. Avoid outdoor exertion; consider a mask outdoors." },
    { max: 501, key: "severe", label: "Severe", advice: "Affects healthy people and seriously affects those with existing conditions. Stay indoors." },
];

const naqiCategory = (value) => NAQI_CATEGORIES.find((c) => value <= c.max) || NAQI_CATEGORIES[NAQI_CATEGORIES.length - 1];

/**
 * Indicative Indian AQI from modelled pollutant concentrations. The official
 * index averages 24 h of station readings; this uses the model's current values,
 * so the UI labels it "indicative".
 */
const computeNaqi = ({ pm2_5, pm10, no2, so2, o3, co }) => {
    const candidates = {
        pm2_5: subIndex("pm2_5", num(pm2_5)),
        pm10: subIndex("pm10", num(pm10)),
        no2: subIndex("no2", num(no2)),
        so2: subIndex("so2", num(so2)),
        o3: subIndex("o3", num(o3)),
        co: subIndex("co", num(co) === null ? null : num(co) / 1000), // µg/m³ → mg/m³
    };

    // The CPCB method needs at least one particulate reading.
    if (candidates.pm2_5 === null && candidates.pm10 === null) return null;

    let dominant = null;
    let value = -1;

    for (const [name, index] of Object.entries(candidates)) {
        if (index !== null && index > value) {
            value = index;
            dominant = name;
        }
    }

    const rounded = Math.round(value);
    const category = naqiCategory(rounded);

    return { value: rounded, key: category.key, label: category.label, advice: category.advice, dominant };
};

const usAqiLabel = (value) => {
    if (value === null) return null;
    if (value <= 50) return "Good";
    if (value <= 100) return "Moderate";
    if (value <= 150) return "Unhealthy for sensitive groups";
    if (value <= 200) return "Unhealthy";
    if (value <= 300) return "Very unhealthy";

    return "Hazardous";
};

const hourContaining = (times, t) => {
    let index = 0;

    for (let i = 0; i < times.length; i += 1) {
        if (times[i] <= t) index = i;
        else break;
    }

    return index;
};

const normalizeAirQuality = (rawAir, offset, nowSec) => {
    const current = rawAir?.current;

    if (!current) return null;

    const pollutants = {
        pm2_5: round(current.pm2_5, 1),
        pm10: round(current.pm10, 1),
        no2: round(current.nitrogen_dioxide, 1),
        so2: round(current.sulphur_dioxide, 1),
        o3: round(current.ozone, 1),
        co: round(current.carbon_monoxide, 0),
        dust: round(current.dust, 1),
    };

    const usAqi = round(current.us_aqi);
    const naqi = computeNaqi(pollutants);

    const hourly = [];
    const times = rawAir?.hourly?.time || [];
    const startAt = times.length ? times[hourContaining(times, nowSec)] : 0;

    for (let i = 0; i < times.length && hourly.length < 72; i += 1) {
        if (times[i] < startAt) continue;

        const pm25 = num(at(rawAir.hourly.pm2_5, i));
        const pm10 = num(at(rawAir.hourly.pm10, i));
        const hourNaqi = computeNaqi({ pm2_5: pm25, pm10 });

        hourly.push({
            time: times[i],
            pm2_5: round(pm25, 1),
            pm10: round(pm10, 1),
            usAqi: round(at(rawAir.hourly.us_aqi, i)),
            naqi: hourNaqi ? hourNaqi.value : null,
        });
    }

    return {
        pollutants,
        usAqi,
        usLabel: usAqiLabel(usAqi),
        europeanAqi: round(current.european_aqi),
        naqi,
        hourly,
        note: "Indicative values from an atmospheric model, not a ground-station reading.",
    };
};

// ──────────────────────────────────────────────────────────────
// Forecast normalisation
// ──────────────────────────────────────────────────────────────

const normalizeForecast = (raw, nowSec = Math.floor(Date.now() / 1000)) => {
    if (!raw?.current || !raw?.hourly?.time || !raw?.daily?.time) {
        const error = new Error("Weather provider returned an unexpected response.");
        error.status = 502;
        throw error;
    }

    const offset = Number(raw.utc_offset_seconds) || 0;
    const currentTime = Number(raw.current.time) || nowSec;
    const h = raw.hourly;

    // The hour that contains "now". Slots sit on *local* hour boundaries, which in
    // half-hour zones such as India (UTC+5:30) fall at :30 UTC, so never round to a UTC hour.
    const startIndex = hourContaining(h.time, currentTime);

    const hourly = [];

    for (let i = startIndex; i < h.time.length && hourly.length < 168; i += 1) {
        const code = num(at(h.weather_code, i));
        const visibility = num(at(h.visibility, i));
        const condition = describeCode(code);

        hourly.push({
            time: h.time[i],
            temperature: round(at(h.temperature_2m, i), 1),
            feelsLike: round(at(h.apparent_temperature, i), 1),
            humidity: round(at(h.relative_humidity_2m, i)),
            dewPoint: round(at(h.dew_point_2m, i), 1),
            precipProbability: round(at(h.precipitation_probability, i)),
            precipitation: round(at(h.precipitation, i), 1) ?? 0,
            code,
            condition: condition.key,
            label: condition.label,
            cloudCover: round(at(h.cloud_cover, i)),
            visibilityKm: visibility === null ? null : round(visibility / 1000, 1),
            windSpeed: round(at(h.wind_speed_10m, i)),
            windGust: round(at(h.wind_gusts_10m, i)),
            windDirection: round(at(h.wind_direction_10m, i)),
            uvIndex: round(at(h.uv_index, i), 1) ?? 0,
            pressure: round(at(h.pressure_msl, i)),
            isDay: at(h.is_day, i) === 1,
        });
    }

    const d = raw.daily;
    const daily = d.time.map((time, i) => {
        const code = num(at(d.weather_code, i));
        const condition = describeCode(code);

        return {
            date: localDate(time, offset),
            time,
            temperatureMax: round(at(d.temperature_2m_max, i), 1),
            temperatureMin: round(at(d.temperature_2m_min, i), 1),
            feelsLikeMax: round(at(d.apparent_temperature_max, i), 1),
            feelsLikeMin: round(at(d.apparent_temperature_min, i), 1),
            code,
            condition: condition.key,
            label: condition.label,
            sunrise: num(at(d.sunrise, i)),
            sunset: num(at(d.sunset, i)),
            daylightSeconds: round(at(d.daylight_duration, i)),
            uvIndexMax: round(at(d.uv_index_max, i), 1),
            precipitationSum: round(at(d.precipitation_sum, i), 1) ?? 0,
            precipProbability: round(at(d.precipitation_probability_max, i)),
            precipitationHours: round(at(d.precipitation_hours, i), 1) ?? 0,
            windSpeedMax: round(at(d.wind_speed_10m_max, i)),
            windGustMax: round(at(d.wind_gusts_10m_max, i)),
            windDirection: round(at(d.wind_direction_10m_dominant, i)),
        };
    });

    const c = raw.current;
    const now = hourly[0] || {};
    const condition = describeCode(c.weather_code);

    const current = {
        time: currentTime,
        temperature: round(c.temperature_2m, 1),
        feelsLike: round(c.apparent_temperature, 1),
        humidity: round(c.relative_humidity_2m),
        dewPoint: now.dewPoint ?? null,
        pressure: round(c.pressure_msl),
        windSpeed: round(c.wind_speed_10m),
        windGust: round(c.wind_gusts_10m),
        windDirection: round(c.wind_direction_10m),
        cloudCover: round(c.cloud_cover),
        visibilityKm: now.visibilityKm ?? null,
        precipitation: round(c.precipitation, 1) ?? 0,
        uvIndex: now.uvIndex ?? 0,
        isDay: c.is_day === 1,
        code: num(c.weather_code),
        condition: condition.key,
        label: condition.label,
    };

    const today = daily[0] || {};

    return {
        location: {
            latitude: round(raw.latitude, 4),
            longitude: round(raw.longitude, 4),
            elevation: round(raw.elevation),
            timezone: raw.timezone || "UTC",
            utcOffsetSeconds: offset,
        },
        current,
        hourly,
        daily,
        astronomy: {
            sunrise: today.sunrise ?? null,
            sunset: today.sunset ?? null,
            daylightSeconds: today.daylightSeconds ?? null,
            moon: { ...moonPhase(currentTime), ...(() => { const t = moonTimes(currentTime, raw.latitude, raw.longitude, offset); return { rise: t.rise, set: t.set }; })() },
        },
    };
};

// ──────────────────────────────────────────────────────────────
// Insights — each one is derived from numbers in the response
// ──────────────────────────────────────────────────────────────

const TONE_ORDER = { warn: 0, good: 1, info: 2 };

const bestOutdoorWindow = (hourly, sunset, offset) => {
    const comfortable = (hour) =>
        hour.isDay &&
        hour.feelsLike !== null &&
        hour.feelsLike >= 16 &&
        hour.feelsLike <= 33 &&
        (hour.precipProbability ?? 0) < 30 &&
        hour.uvIndex <= 7 &&
        (hour.windGust ?? 0) < 35;

    const limit = sunset ? Math.min(sunset, hourly[0].time + 18 * HOUR) : hourly[0].time + 12 * HOUR;
    let best = null;
    let run = [];

    const flush = () => {
        if (run.length >= 2 && (!best || run.length > best.length)) best = run;
        run = [];
    };

    for (const hour of hourly) {
        if (hour.time > limit) break;

        if (comfortable(hour)) run.push(hour);
        else flush();
    }

    flush();

    if (!best) return null;

    const first = best[0];
    const last = best[best.length - 1];
    const temps = best.map((hour) => hour.feelsLike);

    return {
        from: first.time,
        to: last.time + HOUR,
        label: `${hourLabel(first.time, offset)} – ${hourLabel(last.time + HOUR, offset)}`,
        minFeels: Math.round(Math.min(...temps)),
        maxFeels: Math.round(Math.max(...temps)),
        hours: best.length,
    };
};

const generateInsights = ({ current, hourly, daily, astronomy, location, airQuality }) => {
    const offset = location.utcOffsetSeconds;
    const insights = [];
    const next24 = hourly.slice(0, 24);

    // ── Rain timing
    const wet = next24.findIndex((hour) => (hour.precipProbability ?? 0) >= 50 || hour.precipitation >= 0.5);

    if (wet === 0) {
        insights.push({
            id: "rain-now",
            tone: "warn",
            icon: "rain",
            title: "Rain around right now",
            text: `${hourly[0].precipProbability ?? "—"}% chance this hour with about ${hourly[0].precipitation} mm expected. Keep an umbrella handy.`,
        });
    } else if (wet > 0) {
        const hour = next24[wet];

        insights.push({
            id: "rain-soon",
            tone: "warn",
            icon: "rain",
            title: `Rain likely around ${hourLabel(hour.time, offset)}`,
            text: `${hour.precipProbability ?? "—"}% chance in about ${wet} h, roughly ${hour.precipitation} mm that hour. Plan outdoor errands before then.`,
        });
    } else {
        const peak = Math.max(...next24.map((hour) => hour.precipProbability ?? 0));

        insights.push(
            peak < 30
                ? { id: "dry-24h", tone: "good", icon: "sun", title: "Dry for the next 24 hours", text: `Rain chance stays at or below ${peak}%.` }
                : { id: "showers-chance", tone: "info", icon: "cloud", title: "Slight chance of showers", text: `Rain chance peaks at ${peak}% in the next 24 hours, but nothing heavy is expected.` }
        );
    }

    // ── Best outdoor window
    const window = bestOutdoorWindow(hourly, astronomy.sunset, offset);

    if (window) {
        insights.push({
            id: "best-window",
            tone: "good",
            icon: "walk",
            title: `Best outdoor window: ${window.label}`,
            text: `${window.hours} comfortable hours — feels like ${window.minFeels}–${window.maxFeels}°C with low rain risk, moderate UV and light gusts.`,
        });
    } else if (current.isDay && astronomy.sunset && astronomy.sunset - current.time > 2 * HOUR) {
        insights.push({
            id: "no-window",
            tone: "warn",
            icon: "alert",
            title: "No comfortable outdoor stretch left today",
            text: "Heat, rain, strong sun or gusts rule out a stretch of two or more easy hours before sunset.",
        });
    }

    // ── UV
    const todayDate = daily[0]?.date;
    const todayHours = hourly.filter((hour) => localDate(hour.time, offset) === todayDate);
    const uvPeak = todayHours.reduce((top, hour) => (hour.uvIndex > (top?.uvIndex ?? -1) ? hour : top), null);

    if (uvPeak && uvPeak.uvIndex >= 6) {
        insights.push({
            id: "uv",
            tone: "warn",
            icon: "uv",
            title: `${uvPeak.uvIndex >= 8 ? "Very high" : "High"} UV peaks at ${hourLabel(uvPeak.time, offset)}`,
            text: `UV index reaches ${uvPeak.uvIndex}. Use SPF 30+, a hat and shade between 11 AM and 3 PM.`,
        });
    } else if (uvPeak && uvPeak.uvIndex >= 3) {
        insights.push({
            id: "uv",
            tone: "info",
            icon: "uv",
            title: `Moderate UV, peaking ${hourLabel(uvPeak.time, offset)}`,
            text: `UV index reaches ${uvPeak.uvIndex}. Sunscreen is sensible if you will be out for long.`,
        });
    }

    // ── Temperature trend
    if (daily[0] && daily[1] && daily[0].temperatureMax !== null && daily[1].temperatureMax !== null) {
        const change = daily[1].temperatureMax - daily[0].temperatureMax;

        if (Math.abs(change) >= 3) {
            insights.push({
                id: "trend",
                tone: "info",
                icon: change > 0 ? "up" : "down",
                title: change > 0 ? `Warmer tomorrow (+${Math.round(change)}°C)` : `Cooler tomorrow (${Math.round(change)}°C)`,
                text: `Tomorrow's high is ${Math.round(daily[1].temperatureMax)}°C against ${Math.round(daily[0].temperatureMax)}°C today.`,
            });
        }
    }

    // ── Feels-like gap
    if (current.temperature !== null && current.feelsLike !== null) {
        const gap = current.feelsLike - current.temperature;

        if (gap >= 4) {
            insights.push({
                id: "feels-hot",
                tone: "warn",
                icon: "thermo",
                title: `Feels ${Math.round(gap)}° hotter than the air`,
                text: `${Math.round(current.temperature)}°C with ${current.humidity}% humidity feels like ${Math.round(current.feelsLike)}°C. Drink water and slow down outdoors.`,
            });
        } else if (gap <= -4) {
            insights.push({
                id: "feels-cold",
                tone: "info",
                icon: "thermo",
                title: `Feels ${Math.round(-gap)}° colder than the air`,
                text: `Wind makes ${Math.round(current.temperature)}°C feel like ${Math.round(current.feelsLike)}°C. Add a layer.`,
            });
        }
    }

    // ── Wind
    const gustPeak = next24.slice(0, 12).reduce((top, hour) => ((hour.windGust ?? 0) > (top?.windGust ?? -1) ? hour : top), null);

    if (gustPeak && gustPeak.windGust >= 40) {
        insights.push({
            id: "gusts",
            tone: "warn",
            icon: "wind",
            title: `Gusts up to ${gustPeak.windGust} km/h`,
            text: `Strongest around ${hourLabel(gustPeak.time, offset)}. Secure loose objects and take care on two-wheelers.`,
        });
    }

    // ── Visibility
    if ((current.visibilityKm !== null && current.visibilityKm < 2) || current.condition === "fog") {
        insights.push({
            id: "visibility",
            tone: "warn",
            icon: "fog",
            title: "Reduced visibility",
            text: `Visibility is ${current.visibilityKm !== null ? `${current.visibilityKm} km` : "low"}. Slow down and use low-beam lights while driving.`,
        });
    }

    // ── Air quality
    if (airQuality?.naqi) {
        const { naqi } = airQuality;

        insights.push({
            id: "aqi",
            tone: naqi.value <= 100 ? "good" : naqi.value <= 200 ? "info" : "warn",
            icon: "air",
            title: `Air quality ${naqi.label.toLowerCase()} (AQI ${naqi.value})`,
            text: naqi.advice,
        });
    }

    // ── Daylight left
    if (astronomy.sunset && astronomy.sunrise) {
        if (current.time < astronomy.sunrise) {
            insights.push({ id: "sun", tone: "info", icon: "sunrise", title: `Sunrise at ${clockLabel(astronomy.sunrise, offset)}`, text: `${durationLabel(astronomy.sunrise - current.time)} until first light.` });
        } else if (current.time < astronomy.sunset) {
            insights.push({ id: "sun", tone: "info", icon: "sunset", title: `Sunset at ${clockLabel(astronomy.sunset, offset)}`, text: `${durationLabel(astronomy.sunset - current.time)} of daylight left today.` });
        } else if (daily[1]?.sunrise) {
            insights.push({ id: "sun", tone: "info", icon: "sunrise", title: `Sunrise tomorrow at ${clockLabel(daily[1].sunrise, offset)}`, text: `${durationLabel(daily[1].sunrise - current.time)} from now.` });
        }
    }

    return insights
        .sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone])
        .slice(0, 7);
};

// ──────────────────────────────────────────────────────────────
// Advisories — thresholds applied to the forecast. These are NOT official
// warnings; the UI says so and points to the national weather service.
// ──────────────────────────────────────────────────────────────

const advisory = (id, kind, severity, title, detail, start, end) => ({
    id,
    kind,
    severity, // "watch" | "warning"
    title,
    detail,
    start,
    end,
    official: false,
});

const generateAdvisories = ({ hourly, daily, location, airQuality }) => {
    const offset = location.utcOffsetSeconds;
    const list = [];
    const horizon = hourly.slice(0, 72);

    // ── Per-day rules over the next three days
    daily.slice(0, 3).forEach((day, index) => {
        const label = index === 0 ? "Today" : index === 1 ? "Tomorrow" : new Date(day.time * 1000 + offset * 1000).toLocaleDateString("en-IN", { weekday: "long", timeZone: "UTC" });
        const start = day.time;
        const end = day.time + DAY;

        if (day.temperatureMax !== null && (day.temperatureMax >= 45 || (day.feelsLikeMax ?? 0) >= 50)) {
            list.push(advisory(`heat-${day.date}`, "heat", "warning", `${label}: severe heat`, `High of ${Math.round(day.temperatureMax)}°C (feels like ${Math.round(day.feelsLikeMax ?? day.temperatureMax)}°C). Avoid outdoor work in the afternoon and keep hydrated.`, start, end));
        } else if (day.temperatureMax !== null && (day.temperatureMax >= 40 || (day.feelsLikeMax ?? 0) >= 43)) {
            list.push(advisory(`heat-${day.date}`, "heat", "watch", `${label}: very hot`, `High of ${Math.round(day.temperatureMax)}°C (feels like ${Math.round(day.feelsLikeMax ?? day.temperatureMax)}°C). Limit midday exposure.`, start, end));
        }

        if (day.temperatureMin !== null && day.temperatureMin <= 0) {
            list.push(advisory(`cold-${day.date}`, "cold", "warning", `${label}: freezing night`, `Low of ${Math.round(day.temperatureMin)}°C. Frost is possible; protect plants and pipes.`, start, end));
        } else if (day.temperatureMin !== null && day.temperatureMin <= 4) {
            list.push(advisory(`cold-${day.date}`, "cold", "watch", `${label}: very cold night`, `Low of ${Math.round(day.temperatureMin)}°C.`, start, end));
        }

        if (day.precipitationSum >= 64.5) {
            list.push(advisory(`rain-${day.date}`, "rain", "warning", `${label}: heavy rain`, `About ${Math.round(day.precipitationSum)} mm expected over the day. Watch for waterlogging and avoid low-lying roads.`, start, end));
        } else if (day.precipitationSum >= 35) {
            list.push(advisory(`rain-${day.date}`, "rain", "watch", `${label}: significant rain`, `About ${Math.round(day.precipitationSum)} mm expected over ${day.precipitationHours} h.`, start, end));
        }

        if ((day.uvIndexMax ?? 0) >= 11) {
            list.push(advisory(`uv-${day.date}`, "uv", "watch", `${label}: extreme UV`, `UV index peaks at ${day.uvIndexMax}. Unprotected skin can burn in minutes.`, start, end));
        }

        if ((day.windGustMax ?? 0) >= 60) {
            list.push(advisory(`wind-${day.date}`, "wind", "warning", `${label}: damaging gusts`, `Gusts up to ${day.windGustMax} km/h.`, start, end));
        } else if ((day.windGustMax ?? 0) >= 45) {
            list.push(advisory(`wind-${day.date}`, "wind", "watch", `${label}: strong gusts`, `Gusts up to ${day.windGustMax} km/h.`, start, end));
        }
    });

    // ── Thunderstorms (hourly, 48 h)
    const storm = horizon.slice(0, 48).filter((hour) => hour.code >= 95 && (hour.precipProbability ?? 100) >= 30);

    if (storm.length) {
        const hail = storm.some((hour) => hour.code >= 96);

        list.push(advisory("storm", "storm", "warning", hail ? "Thunderstorm with hail possible" : "Thunderstorms possible", `Storm conditions are forecast from ${hourLabel(storm[0].time, offset)} (${storm.length} h in the next 48 h). Stay indoors during lightning and avoid open ground and tall trees.`, storm[0].time, storm[storm.length - 1].time + HOUR));
    }

    // ── Fog (hourly, 24 h)
    const fog = horizon.slice(0, 24).filter((hour) => hour.condition === "fog" || (hour.visibilityKm !== null && hour.visibilityKm < 1));

    if (fog.length >= 2) {
        list.push(advisory("fog", "fog", "watch", "Dense fog likely", `Visibility is forecast under 1 km for ${fog.length} h, starting about ${hourLabel(fog[0].time, offset)}.`, fog[0].time, fog[fog.length - 1].time + HOUR));
    }

    // ── Air quality (now)
    if (airQuality?.naqi) {
        const { naqi } = airQuality;
        const now = horizon[0]?.time ?? 0;

        if (naqi.value > 300) {
            list.push(advisory("aqi", "air", "warning", `Air quality ${naqi.label.toLowerCase()}`, `Indicative AQI ${naqi.value}. ${naqi.advice}`, now, now + 12 * HOUR));
        } else if (naqi.value > 200) {
            list.push(advisory("aqi", "air", "watch", "Poor air quality", `Indicative AQI ${naqi.value}. ${naqi.advice}`, now, now + 12 * HOUR));
        }
    }

    return list.sort((a, b) => (a.severity === b.severity ? a.start - b.start : a.severity === "warning" ? -1 : 1));
};

// ──────────────────────────────────────────────────────────────
// Public builder
// ──────────────────────────────────────────────────────────────

const { buildIntelligence } = require("./intelligenceModel");

const buildOverview = ({ forecast, air, nowSec = Math.floor(Date.now() / 1000) }) => {
    const base = normalizeForecast(forecast, nowSec);
    const airQuality = normalizeAirQuality(air, base.location.utcOffsetSeconds, base.current.time);

    const withAir = { ...base, airQuality };

    return {
        ...withAir,
        insights: generateInsights(withAir),
        advisories: generateAdvisories(withAir),
        intelligence: buildIntelligence(withAir),
        meta: {
            sources: ["Open-Meteo"],
            generatedAt: nowSec,
            warnings: airQuality ? [] : ["air_quality_unavailable"],
        },
    };
};

module.exports = {
    buildOverview,
    normalizeForecast,
    normalizeAirQuality,
    generateInsights,
    generateAdvisories,
    computeNaqi,
    moonPhase,
    isWetCondition,
};
