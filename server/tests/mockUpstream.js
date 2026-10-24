/**
 * A local stand-in for Open-Meteo, Photon and Nominatim that returns responses in
 * the same shape as the real services. Used by the test-suite and for developing
 * offline:
 *
 *   node server/tests/mockUpstream.js 4010
 *
 * then start the server with
 *
 *   OPEN_METEO_FORECAST_URL=http://127.0.0.1:4010/v1/forecast \
 *   OPEN_METEO_AIR_QUALITY_URL=http://127.0.0.1:4010/v1/air-quality \
 *   OPEN_METEO_GEOCODING_URL=http://127.0.0.1:4010/v1/search \
 *   PHOTON_URL=http://127.0.0.1:4010/photon NOMINATIM_URL=http://127.0.0.1:4010/nominatim
 *
 * The numbers are synthetic (a smooth day/night curve per scenario) — this file is a
 * test fixture, never used by the production code path.
 */
const http = require("http");

const HOUR = 3600;
const IST = 19800;

const SCENARIOS = ["clear", "partly", "monsoon", "storm", "fog", "heat"];

const PLACES = [
    { name: "Gorakhpur", admin1: "Uttar Pradesh", admin2: "Gorakhpur", lat: 26.7606, lon: 83.3732, pop: 673446, code: "PPLA2" },
    { name: "Delhi", admin1: "Delhi", admin2: "New Delhi", lat: 28.6519, lon: 77.2315, pop: 10927986, code: "PPLA" },
    { name: "Mumbai", admin1: "Maharashtra", admin2: "Mumbai Suburban", lat: 19.0728, lon: 72.8826, pop: 12691836, code: "PPLA" },
    { name: "Jaipur", admin1: "Rajasthan", admin2: "Jaipur", lat: 26.9124, lon: 75.7873, pop: 3046163, code: "PPLA" },
    { name: "Bengaluru", admin1: "Karnataka", admin2: "Bengaluru Urban", lat: 12.9719, lon: 77.5937, pop: 8443675, code: "PPLA" },
    { name: "Shimla", admin1: "Himachal Pradesh", admin2: "Shimla", lat: 31.1048, lon: 77.1734, pop: 169578, code: "PPLA" },
    { name: "Chennai", admin1: "Tamil Nadu", admin2: "Chennai", lat: 13.0878, lon: 80.2785, pop: 4328063, code: "PPLA" },
    { name: "Kolkata", admin1: "West Bengal", admin2: "Kolkata", lat: 22.5697, lon: 88.3697, pop: 4631392, code: "PPLA" },
    { name: "Lucknow", admin1: "Uttar Pradesh", admin2: "Lucknow", lat: 26.8393, lon: 80.9231, pop: 2817105, code: "PPLA" },
    { name: "Pune", admin1: "Maharashtra", admin2: "Pune", lat: 18.5196, lon: 73.8553, pop: 3124458, code: "PPLA2" },
    { name: "Gorakhpur", admin1: "Haryana", admin2: "Fatehabad", lat: 29.6, lon: 75.5, pop: 4000, code: "PPL" },
    { name: "Uttar Pradesh", admin1: "", admin2: "", lat: 27.0, lon: 80.0, pop: 199812341, code: "ADM1" },
];

const VILLAGES = [
    { name: "Gorakhpur Math", county: "Gorakhpur", state: "Uttar Pradesh", lat: 26.78, lon: 83.38, value: "village" },
    { name: "Chaurichaura", county: "Gorakhpur", state: "Uttar Pradesh", lat: 26.6667, lon: 83.5833, value: "town" },
    { name: "Bhatpar Rani", county: "Deoria", state: "Uttar Pradesh", lat: 26.28, lon: 83.84, value: "village" },
    { name: "Mawsynram", county: "East Khasi Hills", state: "Meghalaya", lat: 25.2979, lon: 91.5821, value: "village" },
];

const scenarioFor = (lat, lon) => SCENARIOS[Math.abs(Math.round(lat * 10) + Math.round(lon * 10)) % SCENARIOS.length];

const sunUp = (localHour) => localHour >= 6 && localHour < 18;

const hourModel = (lat, lon, hourUtc, scenario) => {
    const local = new Date((hourUtc + IST) * 1000);
    const h = local.getUTCHours();
    const day = Math.floor((hourUtc + IST) / 86400);
    const base = 33 - Math.abs(lat - 20) * 0.45 + (scenario === "heat" ? 9 : 0) - (scenario === "monsoon" ? 5 : 0) - (scenario === "fog" ? 10 : 0);
    const diurnal = 6 * Math.sin(((h - 9) / 24) * 2 * Math.PI);
    const drift = Math.sin(day / 2.5) * 2;
    const temp = base + diurnal + drift;

    let code = 1;
    let prob = 5;
    let precip = 0;
    let cloud = 20;
    let visibility = 24000;

    if (scenario === "partly") { code = h % 7 < 4 ? 2 : 1; cloud = 45; prob = 10; }
    if (scenario === "monsoon") {
        const wet = (h + day) % 6 < 3;
        code = wet ? (h % 5 === 0 ? 65 : 63) : 3;
        prob = wet ? 80 : 40;
        precip = wet ? 2.6 : 0;
        cloud = 90;
        visibility = 9000;
    }
    if (scenario === "storm") {
        const wet = h >= 15 && h <= 19;
        code = wet ? 95 : 2;
        prob = wet ? 75 : 20;
        precip = wet ? 4.2 : 0;
        cloud = wet ? 95 : 50;
    }
    if (scenario === "fog") { code = h < 10 || h > 21 ? 45 : 3; cloud = 80; visibility = h < 10 || h > 21 ? 500 : 3000; }
    if (scenario === "heat") { code = 0; cloud = 5; prob = 0; }
    if (scenario === "clear") { code = 0; cloud = 8; prob = 2; }

    const elevation = sunUp(h) ? Math.sin(((h - 6) / 12) * Math.PI) : 0;
    const uv = Math.max(0, elevation * (scenario === "heat" || scenario === "clear" ? 10.5 : 6) * (1 - cloud / 220));

    return {
        temp,
        feels: temp + (scenario === "monsoon" ? 5 : scenario === "heat" ? 6 : 1),
        humidity: scenario === "monsoon" ? 88 : scenario === "heat" ? 24 : 55,
        dew: temp - 6,
        prob,
        precip,
        code,
        cloud,
        visibility,
        wind: scenario === "storm" ? 24 : 9 + (h % 5),
        gust: scenario === "storm" && h >= 15 && h <= 19 ? 58 : 18,
        dir: (200 + day * 9) % 360,
        uv: Number(uv.toFixed(1)),
        isDay: sunUp(h) ? 1 : 0,
        pressure: 1006 + Math.sin(day / 3) * 4,
    };
};

const buildForecast = (lat, lon, nowSec = Math.floor(Date.now() / 1000)) => {
    const scenario = scenarioFor(lat, lon);
    const startLocalMidnight = Math.floor((nowSec + IST) / 86400) * 86400 - IST;
    const hourly = { time: [] };
    const keys = ["temperature_2m", "apparent_temperature", "relative_humidity_2m", "dew_point_2m", "precipitation_probability", "precipitation", "weather_code", "cloud_cover", "visibility", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "uv_index", "is_day", "pressure_msl"];

    keys.forEach((k) => { hourly[k] = []; });

    for (let i = 0; i < 14 * 24; i += 1) {
        const t = startLocalMidnight + i * HOUR;
        const m = hourModel(lat, lon, t, scenario);

        hourly.time.push(t);
        hourly.temperature_2m.push(Number(m.temp.toFixed(1)));
        hourly.apparent_temperature.push(Number(m.feels.toFixed(1)));
        hourly.relative_humidity_2m.push(m.humidity);
        hourly.dew_point_2m.push(Number(m.dew.toFixed(1)));
        hourly.precipitation_probability.push(m.prob);
        hourly.precipitation.push(m.precip);
        hourly.weather_code.push(m.code);
        hourly.cloud_cover.push(m.cloud);
        hourly.visibility.push(m.visibility);
        hourly.wind_speed_10m.push(m.wind);
        hourly.wind_direction_10m.push(m.dir);
        hourly.wind_gusts_10m.push(m.gust);
        hourly.uv_index.push(m.uv);
        hourly.is_day.push(m.isDay);
        hourly.pressure_msl.push(Number(m.pressure.toFixed(1)));
    }

    const daily = { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [], apparent_temperature_max: [], apparent_temperature_min: [], sunrise: [], sunset: [], daylight_duration: [], uv_index_max: [], precipitation_sum: [], precipitation_probability_max: [], precipitation_hours: [], wind_speed_10m_max: [], wind_gusts_10m_max: [], wind_direction_10m_dominant: [] };

    for (let d = 0; d < 14; d += 1) {
        const slice = (arr) => arr.slice(d * 24, d * 24 + 24);
        const temps = slice(hourly.temperature_2m);
        const feels = slice(hourly.apparent_temperature);
        const midnight = startLocalMidnight + d * 86400;
        const codes = slice(hourly.weather_code);

        daily.time.push(midnight);
        daily.weather_code.push(codes[13]);
        daily.temperature_2m_max.push(Math.max(...temps));
        daily.temperature_2m_min.push(Math.min(...temps));
        daily.apparent_temperature_max.push(Math.max(...feels));
        daily.apparent_temperature_min.push(Math.min(...feels));
        daily.sunrise.push(midnight + 6 * HOUR + 12 * 60);
        daily.sunset.push(midnight + 18 * HOUR + 3 * 60);
        daily.daylight_duration.push(11 * HOUR + 51 * 60);
        daily.uv_index_max.push(Math.max(...slice(hourly.uv_index)));
        daily.precipitation_sum.push(Number(slice(hourly.precipitation).reduce((a, b) => a + b, 0).toFixed(1)));
        daily.precipitation_probability_max.push(Math.max(...slice(hourly.precipitation_probability)));
        daily.precipitation_hours.push(slice(hourly.precipitation).filter((p) => p > 0).length);
        daily.wind_speed_10m_max.push(Math.max(...slice(hourly.wind_speed_10m)));
        daily.wind_gusts_10m_max.push(Math.max(...slice(hourly.wind_gusts_10m)));
        daily.wind_direction_10m_dominant.push(slice(hourly.wind_direction_10m)[12]);
    }

    const nowHour = Math.floor(nowSec / HOUR) * HOUR;
    const idx = hourly.time.findIndex((t) => t >= nowHour);
    const pick = (key) => hourly[key][idx];

    return {
        latitude: Number(lat.toFixed(3)),
        longitude: Number(lon.toFixed(3)),
        elevation: 84,
        utc_offset_seconds: IST,
        timezone: "Asia/Kolkata",
        current: {
            time: nowSec - (nowSec % 900),
            temperature_2m: pick("temperature_2m"),
            relative_humidity_2m: pick("relative_humidity_2m"),
            apparent_temperature: pick("apparent_temperature"),
            is_day: pick("is_day"),
            precipitation: pick("precipitation"),
            weather_code: pick("weather_code"),
            cloud_cover: pick("cloud_cover"),
            pressure_msl: pick("pressure_msl"),
            wind_speed_10m: pick("wind_speed_10m"),
            wind_direction_10m: pick("wind_direction_10m"),
            wind_gusts_10m: pick("wind_gusts_10m"),
        },
        hourly,
        daily,
    };
};

const buildAir = (lat, lon, nowSec = Math.floor(Date.now() / 1000)) => {
    const scenario = scenarioFor(lat, lon);
    const dirty = lat > 26 && lat < 30 ? 2.4 : scenario === "fog" ? 2.0 : 1;
    const pm25 = 38 * dirty;
    const nowHour = Math.floor(nowSec / HOUR) * HOUR;
    const hourly = { time: [], pm10: [], pm2_5: [], us_aqi: [] };

    for (let i = 0; i < 72; i += 1) {
        const factor = 1 + 0.25 * Math.sin(i / 5);

        hourly.time.push(nowHour + i * HOUR);
        hourly.pm2_5.push(Number((pm25 * factor).toFixed(1)));
        hourly.pm10.push(Number((pm25 * 1.7 * factor).toFixed(1)));
        hourly.us_aqi.push(Math.round(pm25 * factor * 2.1));
    }

    return {
        latitude: lat,
        longitude: lon,
        utc_offset_seconds: IST,
        timezone: "Asia/Kolkata",
        current: {
            time: nowSec - (nowSec % 900),
            pm10: Number((pm25 * 1.7).toFixed(1)),
            pm2_5: Number(pm25.toFixed(1)),
            carbon_monoxide: 420,
            nitrogen_dioxide: 21,
            sulphur_dioxide: 9,
            ozone: 55,
            us_aqi: Math.round(pm25 * 2.1),
            european_aqi: Math.round(pm25 * 1.6),
            dust: 12,
        },
        hourly,
    };
};

const geocode = (q, country) => {
    const needle = q.toLowerCase();
    const results = PLACES.filter((p) => p.name.toLowerCase().includes(needle)).map((p) => ({
        id: Math.round(p.lat * 1000),
        name: p.name,
        latitude: p.lat,
        longitude: p.lon,
        feature_code: p.code,
        country_code: "IN",
        country: "India",
        admin1: p.admin1,
        admin2: p.admin2,
        population: p.pop,
        timezone: "Asia/Kolkata",
    }));

    return { results: country === "IN" || !country ? results : [], generationtime_ms: 0.4 };
};

const photon = (q) => {
    const needle = q.toLowerCase();

    return {
        type: "FeatureCollection",
        features: VILLAGES.filter((v) => v.name.toLowerCase().includes(needle)).map((v) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [v.lon, v.lat] },
            properties: { name: v.name, county: v.county, state: v.state, country: "India", countrycode: "IN", osm_key: "place", osm_value: v.value },
        })),
    };
};

const nominatim = (lat, lon) => {
    const near = [...PLACES, ...VILLAGES.map((v) => ({ name: v.name, admin1: v.state, admin2: v.county, lat: v.lat, lon: v.lon }))].sort(
        (a, b) => Math.hypot(a.lat - lat, a.lon - lon) - Math.hypot(b.lat - lat, b.lon - lon)
    )[0];

    return { address: { village: near.name, state_district: near.admin2, state: near.admin1, country: "India", country_code: "in" } };
};

const handler = (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const q = url.searchParams;
    const send = (body, status = 200) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
    };

    if (process.env.MOCK_FAIL && url.pathname.includes(process.env.MOCK_FAIL)) return send({ error: true }, 500);

    if (url.pathname === "/v1/forecast" && String(q.get("latitude")).includes(",")) {
        const lats = q.get("latitude").split(",").map(Number);
        const lons = q.get("longitude").split(",").map(Number);

        return send(lats.map((lat, i) => buildForecast(lat, lons[i])));
    }

    if (url.pathname === "/v1/air-quality" && String(q.get("latitude")).includes(",")) {
        const lats = q.get("latitude").split(",").map(Number);
        const lons = q.get("longitude").split(",").map(Number);

        return send(lats.map((lat, i) => buildAir(lat, lons[i])));
    }

    if (url.pathname === "/v1/forecast") return send(buildForecast(Number(q.get("latitude")), Number(q.get("longitude"))));
    if (url.pathname === "/v1/air-quality") return send(buildAir(Number(q.get("latitude")), Number(q.get("longitude"))));
    if (url.pathname === "/v1/search") return send(geocode(q.get("name") || "", q.get("countryCode")));
    if (url.pathname === "/photon/api/") return send(photon(q.get("q") || ""));
    if (url.pathname === "/nominatim/reverse") return send(nominatim(Number(q.get("lat")), Number(q.get("lon"))));

    return send({ error: "not found" }, 404);
};

const start = (port = 0) =>
    new Promise((resolve) => {
        const server = http.createServer(handler);

        server.listen(port, "127.0.0.1", () => resolve(server));
    });

if (require.main === module) {
    const port = Number(process.argv[2]) || 4010;

    start(port).then(() => console.log(`Mock weather upstream on http://127.0.0.1:${port}`));
}

module.exports = { start, buildForecast, buildAir, scenarioFor, SCENARIOS };
