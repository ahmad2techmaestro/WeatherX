const { TTLCache } = require("../lib/cache");
const { fetchForecast, fetchAirQuality, fetchCurrentMany, fetchForecastMany, fetchAirQualityMany } = require("../providers/openMeteo");
const { buildOverview } = require("./overviewModel");
const { saveHistoricalWeather } = require("./historicalWeatherService");

const forecastCache = new TTLCache({ ttlMs: 10 * 60 * 1000, max: 400 });
const gridCache = new TTLCache({ ttlMs: 10 * 60 * 1000, max: 200 });
const airCache = new TTLCache({ ttlMs: 30 * 60 * 1000, max: 400 });

// Snap to ~100 m: precise enough for a live location, still lets repeat requests share a cache entry.
const snap = (value) => Number(Number(value).toFixed(3));

const toUpstreamError = (error) => {
    // Errors we raised ourselves already carry a client-safe message. Axios errors also
    // have a `status` (the upstream's), which must never be passed through as ours.
    if (!error.isAxiosError && error.status) return error;

    const status = error.response?.status;
    const wrapped = new Error(
        status === 400
            ? "These coordinates are outside the weather model's coverage."
            : error.code === "ECONNABORTED"
              ? "The weather service took too long to respond."
              : "The weather service is temporarily unavailable."
    );

    wrapped.status = status === 400 ? 400 : error.code === "ECONNABORTED" ? 504 : 502;
    wrapped.cause = error;

    return wrapped;
};

/**
 * Full overview for one coordinate pair. Forecast data is required; air quality
 * is optional — if that provider is down the overview still loads and carries a
 * `air_quality_unavailable` warning rather than failing the whole page.
 */
const getOverview = async (latitude, longitude) => {
    const lat = snap(latitude);
    const lon = snap(longitude);
    const key = `${lat},${lon}`;

    const [forecast, air] = await Promise.allSettled([
        forecastCache.wrap(key, () => fetchForecast(lat, lon)),
        airCache.wrap(key, () => fetchAirQuality(lat, lon)),
    ]);

    if (forecast.status === "rejected") throw toUpstreamError(forecast.reason);

    return buildOverview({
        forecast: forecast.value,
        air: air.status === "fulfilled" ? air.value : null,
    });
};

/** Warm the caches for several places with one forecast request and one air-quality request. */
const prefetchMany = async (points) => {
    const unique = [...new Map(points.map((p) => [`${snap(p.latitude)},${snap(p.longitude)}`, { latitude: snap(p.latitude), longitude: snap(p.longitude) }])).entries()];
    const missingForecast = unique.filter(([key]) => forecastCache.get(key) === undefined);
    const missingAir = unique.filter(([key]) => airCache.get(key) === undefined);

    await Promise.allSettled([
        missingForecast.length > 1
            ? fetchForecastMany(missingForecast.map(([, p]) => p)).then((rows) => missingForecast.forEach(([key], i) => rows[i]?.current && forecastCache.set(key, rows[i])))
            : null,
        missingAir.length > 1
            ? fetchAirQualityMany(missingAir.map(([, p]) => p)).then((rows) => missingAir.forEach(([key], i) => rows[i]?.current && airCache.set(key, rows[i])))
            : null,
    ]);
};

/** Trimmed overview for side-by-side comparison. */
const getSummary = async (latitude, longitude) => {
    const overview = await getOverview(latitude, longitude);

    return {
        location: overview.location,
        current: overview.current,
        hourly: overview.hourly.slice(0, 48),
        daily: overview.daily.slice(0, 7),
        astronomy: overview.astronomy,
        airQuality: overview.airQuality
            ? { pollutants: overview.airQuality.pollutants, usAqi: overview.airQuality.usAqi, naqi: overview.airQuality.naqi }
            : null,
        advisories: overview.advisories,
        meta: overview.meta,
    };
};

const GRID_COLS = 7;
const GRID_ROWS = 5;
const GRID_STEP = 0.5;

/**
 * Live conditions on a coarse grid covering the map view, for the weather map's data layers.
 * Edges snap to 0.5° so panning a little reuses the cached grid; values are real model output
 * for each cell centre (nothing is interpolated or invented).
 */
const getGrid = async ({ south, west, north, east }) => {
    const snapDown = (v) => Math.floor(v / GRID_STEP) * GRID_STEP;
    const snapUp = (v) => Math.ceil(v / GRID_STEP) * GRID_STEP;
    const s = Math.max(-85, snapDown(south));
    const n = Math.min(85, snapUp(north));
    const w = Math.max(-180, snapDown(west));
    const e = Math.min(180, snapUp(east));
    const key = `${s},${w},${n},${e}`;

    return gridCache.wrap(key, async () => {
        const points = [];

        for (let r = 0; r < GRID_ROWS; r += 1) {
            for (let c = 0; c < GRID_COLS; c += 1) {
                points.push({
                    latitude: Number((s + ((r + 0.5) * (n - s)) / GRID_ROWS).toFixed(2)),
                    longitude: Number((w + ((c + 0.5) * (e - w)) / GRID_COLS).toFixed(2)),
                });
            }
        }

        let rows;

        try {
            rows = await fetchCurrentMany(points);
        } catch (error) {
            throw toUpstreamError(error);
        }

        return rows
            .map((row, i) => ({ row, point: points[i] }))
            .filter(({ row }) => row?.current)
            .map(({ row, point }) => ({
                latitude: point.latitude,
                longitude: point.longitude,
                temperature: row.current.temperature_2m,
                precipitation: row.current.precipitation,
                cloudCover: row.current.cloud_cover,
                pressure: row.current.pressure_msl,
                windSpeed: row.current.wind_speed_10m,
                windDirection: row.current.wind_direction_10m,
                weatherCode: row.current.weather_code,
            }));
    });
};

// OpenWeather-style 1–5 AQI bands, kept so the existing analytics keep working on new data.
const OWM_BANDS = {
    so2: [20, 80, 250, 350],
    no2: [40, 70, 150, 200],
    pm10: [20, 50, 100, 200],
    pm2_5: [10, 25, 50, 75],
    o3: [60, 100, 140, 180],
    co: [4400, 9400, 12400, 15400],
};

const legacyAqi = (components) => {
    let worst = 1;

    for (const [name, bands] of Object.entries(OWM_BANDS)) {
        const value = components[name];

        if (value === null || value === undefined) continue;

        const level = bands.findIndex((limit) => value < limit);
        worst = Math.max(worst, level === -1 ? 5 : level + 1);
    }

    return worst;
};

/**
 * Store one observation for the Analytics page. The history model was designed
 * around OpenWeather payloads, so the overview is mapped into that shape.
 * Best-effort: failures are logged by the caller and never reach the user.
 */
const recordSnapshot = async ({ overview, name, country = "" }) => {
    const { current, daily, location, airQuality } = overview;

    const weather = {
        name,
        sys: { country },
        coord: { lat: location.latitude, lon: location.longitude },
        dt: current.time,
        main: {
            temp: current.temperature,
            feels_like: current.feelsLike,
            temp_min: daily[0]?.temperatureMin ?? current.temperature,
            temp_max: daily[0]?.temperatureMax ?? current.temperature,
            humidity: current.humidity,
            pressure: current.pressure,
        },
        visibility: current.visibilityKm === null ? undefined : current.visibilityKm * 1000,
        wind: { speed: (current.windSpeed ?? 0) / 3.6, deg: current.windDirection ?? 0 },
        clouds: { all: current.cloudCover ?? 0 },
        weather: [{ main: current.condition, description: current.label, icon: "" }],
        rain: { "1h": current.precipitation },
    };

    let air = null;

    if (airQuality) {
        const components = {
            pm2_5: airQuality.pollutants.pm2_5,
            pm10: airQuality.pollutants.pm10,
            co: airQuality.pollutants.co,
            no2: airQuality.pollutants.no2,
            so2: airQuality.pollutants.so2,
            o3: airQuality.pollutants.o3,
        };

        air = { main: { aqi: legacyAqi(components) }, components };
    }

    return saveHistoricalWeather({ weather, airQuality: air, source: "open-meteo" });
};

module.exports = { getOverview, getSummary, prefetchMany, getGrid, recordSnapshot, _caches: { forecastCache, airCache }, _legacyAqi: legacyAqi };
