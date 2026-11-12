const { getJson, client } = require("../lib/httpClient");

// Base URLs are overridable so tests and local development can point at a mock upstream.
// With OPEN_METEO_API_KEY (paid plan) the server calls the dedicated "customer-" hosts, which are not subject to the
// shared free-tier limit that cloud IPs often hit. Explicit *_URL overrides (tests, mocks) always win.
const paid = Boolean(process.env.OPEN_METEO_API_KEY);
const host = (name) => `https://${paid ? "customer-" : ""}${name}.open-meteo.com`;

const FORECAST_URL = process.env.OPEN_METEO_FORECAST_URL || `${host("api")}/v1/forecast`;

const ARCHIVE_URL = process.env.OPEN_METEO_ARCHIVE_URL || `${host("archive-api")}/v1/archive`;

const AIR_QUALITY_URL = process.env.OPEN_METEO_AIR_QUALITY_URL || `${host("air-quality-api")}/v1/air-quality`;

// What the browser may call: always the free public hosts, never a keyed URL.
const PUBLIC_FORECAST_URL = process.env.OPEN_METEO_FORECAST_URL || "https://api.open-meteo.com/v1/forecast";
const PUBLIC_AIR_URL = process.env.OPEN_METEO_AIR_QUALITY_URL || "https://air-quality-api.open-meteo.com/v1/air-quality";

const CURRENT_VARS = [
    "temperature_2m",
    "relative_humidity_2m",
    "apparent_temperature",
    "is_day",
    "precipitation",
    "weather_code",
    "cloud_cover",
    "pressure_msl",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
];

const HOURLY_VARS = [
    "temperature_2m",
    "apparent_temperature",
    "relative_humidity_2m",
    "dew_point_2m",
    "precipitation_probability",
    "precipitation",
    "weather_code",
    "cloud_cover",
    "visibility",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
    "uv_index",
    "is_day",
    "pressure_msl",
];

const DAILY_VARS = [
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "apparent_temperature_max",
    "apparent_temperature_min",
    "sunrise",
    "sunset",
    "daylight_duration",
    "uv_index_max",
    "precipitation_sum",
    "precipitation_probability_max",
    "precipitation_hours",
    "wind_speed_10m_max",
    "wind_gusts_10m_max",
    "wind_direction_10m_dominant",
];

const AQ_CURRENT_VARS = [
    "pm10",
    "pm2_5",
    "carbon_monoxide",
    "nitrogen_dioxide",
    "sulphur_dioxide",
    "ozone",
    "us_aqi",
    "european_aqi",
    "dust",
];

const AQ_HOURLY_VARS = ["pm10", "pm2_5", "us_aqi"];

const forecastParams = () => ({
    timezone: "auto",
    timeformat: "unixtime",
    forecast_days: 14,
    wind_speed_unit: "kmh",
    temperature_unit: "celsius",
    precipitation_unit: "mm",
    current: CURRENT_VARS.join(","),
    hourly: HOURLY_VARS.join(","),
    daily: DAILY_VARS.join(","),
});

const airQualityParams = () => ({
    timezone: "auto",
    timeformat: "unixtime",
    forecast_days: 3,
    current: AQ_CURRENT_VARS.join(","),
    hourly: AQ_HOURLY_VARS.join(","),
});

/** 14-day forecast with current conditions and hourly data. Times are unix seconds. */
const fetchForecast = (latitude, longitude) => getJson(FORECAST_URL, { params: { latitude, longitude, ...forecastParams() } });

/** Current air quality plus the next three days, hourly. */
const fetchAirQuality = (latitude, longitude) => getJson(AIR_QUALITY_URL, { params: { latitude, longitude, ...airQualityParams() } });

/**
 * The exact upstream URLs the server would call. When Open-Meteo rate-limits the server's
 * shared IP, the browser can request these itself (from the visitor's own IP) and hand the raw
 * JSON back through POST /weather/overview/relay.
 */
const browserFallbackUrls = (latitude, longitude) => ({
    forecast: client.getUri({ url: PUBLIC_FORECAST_URL, params: { latitude, longitude, ...forecastParams() } }),
    air: client.getUri({ url: PUBLIC_AIR_URL, params: { latitude, longitude, ...airQualityParams() } }),
});

/** Yesterday's observed-model values (reanalysis, not a station reading) for "compare with yesterday". */
const fetchYesterday = (latitude, longitude) =>
    getJson(FORECAST_URL, {
        params: {
            latitude,
            longitude,
            timezone: "auto",
            timeformat: "unixtime",
            past_days: 1,
            forecast_days: 1,
            wind_speed_unit: "kmh",
            temperature_unit: "celsius",
            precipitation_unit: "mm",
            hourly: "temperature_2m",
            daily: "temperature_2m_max,temperature_2m_min,precipitation_sum",
        },
    });

const DAILY_BASICS = "temperature_2m_max,temperature_2m_min,precipitation_sum";

/** The last `pastDays` days of daily values (model reanalysis), ending today. ISO dates in the place's own time zone. */
const fetchRecentDaily = (latitude, longitude, pastDays = 30) =>
    getJson(FORECAST_URL, { params: { latitude, longitude, timezone: "auto", past_days: pastDays, forecast_days: 1, daily: DAILY_BASICS } });

/** Daily history from ERA5 reanalysis, used for climate normals. */
const fetchArchive = (latitude, longitude, startDate, endDate) =>
    getJson(ARCHIVE_URL, { params: { latitude, longitude, timezone: "auto", start_date: startDate, end_date: endDate, daily: DAILY_BASICS } });

const asList = (data) => (Array.isArray(data) ? data : [data]);

/** Forecast for several coordinates in ONE request (keeps comparisons clear of upstream rate limits). */
const fetchForecastMany = async (points) =>
    asList(
        await getJson(FORECAST_URL, {
            params: { latitude: points.map((p) => p.latitude).join(","), longitude: points.map((p) => p.longitude).join(","), ...forecastParams() },
        })
    );

const fetchAirQualityMany = async (points) =>
    asList(
        await getJson(AIR_QUALITY_URL, {
            params: { latitude: points.map((p) => p.latitude).join(","), longitude: points.map((p) => p.longitude).join(","), ...airQualityParams() },
        })
    );

const GRID_VARS = ["temperature_2m", "precipitation", "weather_code", "cloud_cover", "pressure_msl", "wind_speed_10m", "wind_direction_10m", "is_day"];

/** Current conditions for many points in one request (Open-Meteo accepts comma-separated coordinates). */
const fetchCurrentMany = async (points) => {
    const data = await getJson(FORECAST_URL, {
        params: {
            latitude: points.map((p) => p.latitude).join(","),
            longitude: points.map((p) => p.longitude).join(","),
            timezone: "auto",
            timeformat: "unixtime",
            wind_speed_unit: "kmh",
            current: GRID_VARS.join(","),
        },
    });

    return Array.isArray(data) ? data : [data];
};

module.exports = { fetchRecentDaily, fetchArchive, fetchYesterday, fetchForecast, fetchAirQuality, fetchCurrentMany, fetchForecastMany, fetchAirQualityMany, browserFallbackUrls };
