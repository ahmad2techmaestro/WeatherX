const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const express = require("express");

const mock = require("./mockUpstream");

let upstream;
let app;
let base;
let token;

// Point every provider at the local mock *before* the modules read their env.
test.before(async () => {
    upstream = await mock.start(0);

    const root = `http://127.0.0.1:${upstream.address().port}`;

    process.env.OPEN_METEO_FORECAST_URL = `${root}/v1/forecast`;
    process.env.OPEN_METEO_AIR_QUALITY_URL = `${root}/v1/air-quality`;
    process.env.OPEN_METEO_GEOCODING_URL = `${root}/v1/search`;
    process.env.PHOTON_URL = `${root}/photon`;
    process.env.NOMINATIM_URL = `${root}/nominatim`;
    process.env.JWT_ACCESS_SECRET = "test-secret";
    process.env.UPSTREAM_TIMEOUT_MS = "2000";

    // No database in tests: a stub user lookup lets real JWTs pass the real auth middleware.
    const User = require("../models/User");
    User.findById = () => ({ select: async () => ({ _id: "507f1f77bcf86cd799439011", name: "Test User", email: "t@example.com", role: "user", isEmailVerified: true }) });
    token = require("jsonwebtoken").sign({ sub: "507f1f77bcf86cd799439011", type: "access" }, "test-secret", { expiresIn: "10m" });

    const router = require("../api");
    const instance = express();

    instance.use(express.json());
    instance.use("/api", router);
    instance.use((err, req, res, next) => {
        res.status(err.status || 500).json({ success: false, message: err.message });
    });

    app = http.createServer(instance);

    await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));

    base = `http://127.0.0.1:${app.address().port}/api`;
});

test.after(() => {
    upstream.close();
    app.close();
    delete process.env.MOCK_FAIL;
});

const get = async (path, { auth = true } = {}) => {
    const res = await fetch(`${base}${path}`, { headers: auth ? { Authorization: `Bearer ${token}` } : {} });

    return { status: res.status, body: await res.json() };
};

test("GET /geo/search finds cities, merges villages, ranks big places first", async () => {
    const { status, body } = await get("/geo/search?q=gorakh");

    assert.equal(status, 200);
    assert.ok(body.count >= 3);

    const names = body.data.map((p) => `${p.name}|${p.state}`);

    assert.equal(body.data[0].name, "Gorakhpur");
    assert.equal(body.data[0].state, "Uttar Pradesh");
    assert.ok(names.includes("Gorakhpur Math|Uttar Pradesh"), "OSM village merged in");
    assert.ok(names.includes("Gorakhpur|Haryana"), "same-named place in another state kept");
    assert.ok(body.data.every((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && p.subtitle));
});

test("search finds a tiny village only OSM knows, and a state", async () => {
    const village = await get("/geo/search?q=mawsynram");

    assert.equal(village.body.data[0].name, "Mawsynram");
    assert.equal(village.body.data[0].kind, "village");
    assert.equal(village.body.data[0].state, "Meghalaya");

    const state = await get("/geo/search?q=uttar");

    assert.equal(state.body.data[0].kind, "state");
});

test("search validates input", async () => {
    assert.equal((await get("/geo/search?q=a")).status, 400);
    assert.equal((await get("/geo/search")).status, 400);
});

test("search survives one provider being down, and reports when both are", async () => {
    // geocoder caches successes, so use fresh queries
    process.env.MOCK_FAIL = "/photon";
    const oneDown = await get("/geo/search?q=jaipur");

    assert.equal(oneDown.status, 200);
    assert.equal(oneDown.body.data[0].name, "Jaipur");

    process.env.MOCK_FAIL = "/";
    const bothDown = await get("/geo/search?q=lucknow");

    assert.equal(bothDown.status, 502);
    assert.equal(bothDown.body.success, false);

    delete process.env.MOCK_FAIL;

    // A failure must not be cached as an empty result.
    const recovered = await get("/geo/search?q=lucknow");

    assert.equal(recovered.status, 200);
    assert.equal(recovered.body.data[0].name, "Lucknow");
});

test("GET /geo/reverse names a coordinate, rejects bad input", async () => {
    const ok = await get("/geo/reverse?lat=26.78&lon=83.38");

    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.name, "Gorakhpur Math");
    assert.equal(ok.body.data.state, "Uttar Pradesh");

    assert.equal((await get("/geo/reverse?lat=abc&lon=1")).status, 400);
    assert.equal((await get("/geo/reverse?lat=91&lon=1")).status, 400);
    assert.equal((await get("/geo/reverse")).status, 400);
});

test("GET /weather/overview returns the full payload", async () => {
    const { status, body } = await get("/weather/overview?lat=26.76&lon=83.37");

    assert.equal(status, 200);

    const d = body.data;

    assert.equal(d.daily.length, 14);
    assert.equal(d.hourly.length, 168);
    assert.ok(d.airQuality.naqi.value >= 0);
    assert.ok(Array.isArray(d.insights));
    assert.ok(Array.isArray(d.advisories));
    assert.ok(d.astronomy.moon.name);
});

test("overview validates coordinates", async () => {
    for (const q of ["", "?lat=1", "?lat=a&lon=b", "?lat=100&lon=0", "?lat=0&lon=181", "?lat=&lon="]) {
        assert.equal((await get(`/weather/overview${q}`)).status, 400, q);
    }
});

test("overview still loads when only air quality is down", async () => {
    process.env.MOCK_FAIL = "/v1/air-quality";

    const { status, body } = await get("/weather/overview?lat=19.07&lon=72.88");

    delete process.env.MOCK_FAIL;

    assert.equal(status, 200);
    assert.equal(body.data.airQuality, null);
    assert.deepEqual(body.data.meta.warnings, ["air_quality_unavailable"]);
});

test("overview reports a gateway error when the forecast provider is down", async () => {
    process.env.MOCK_FAIL = "/v1/forecast";

    const { status, body } = await get("/weather/overview?lat=12.34&lon=56.78");

    delete process.env.MOCK_FAIL;

    assert.equal(status, 502);
    assert.equal(body.success, false);
    assert.doesNotMatch(body.message, /127\.0\.0\.1|ECONN/, "no upstream details leak");
});

test("GET /weather/multi returns one summary per point, partial failures isolated", async () => {
    const { status, body } = await get("/weather/multi?points=28.65,77.23|19.07,72.88|13.08,80.28");

    assert.equal(status, 200);
    assert.equal(body.data.length, 3);
    assert.ok(body.data.every((p) => p.ok && p.hourly.length === 48 && p.daily.length === 7));

    assert.equal((await get("/weather/multi")).status, 400);
    assert.equal((await get("/weather/multi?points=1,2|3,4|5,6|7,8|9,10|11,12")).status, 400);
    assert.equal((await get("/weather/multi?points=x,y")).status, 400);
});

test("GET /weather/grid returns real values for a 7x5 grid and validates the area", async () => {
    const { status, body } = await get("/weather/grid?south=20&west=75&north=30&east=88");

    assert.equal(status, 200);
    assert.equal(body.data.length, 35);
    assert.ok(body.data.every((p) => Number.isFinite(p.temperature) && Number.isFinite(p.windSpeed) && Number.isFinite(p.pressure)));

    const bad = await get("/weather/grid?south=30&west=75&north=20&east=88");

    assert.equal(bad.status, 400);
});

test("legacy routes still mounted beside the new ones", async () => {
    // The legacy /weather/current needs an OpenWeather key; without one it must answer, not hang or crash.
    const res = await fetch(`${base}/weather/map/temp_new/1/1/1`);

    assert.equal(res.status, 401, "tile proxy refuses requests without a tile token");

    const cur = await get("/weather/current?lat=26.7&lon=83.3");

    assert.ok(cur.status >= 400 && cur.status !== 401, "legacy router is reachable once signed in");
});

test("OpenWeather map: status explains a missing key, tiles are proxied, cached and validated", async () => {
    const http2 = require("http");
    const saved = process.env.OPENWEATHER_API_KEY;
    let calls = 0;
    let mode = 200;

    const fake = http2.createServer((req, res) => {
        calls += 1;
        res.writeHead(mode, { "Content-Type": "image/png" });
        res.end(Buffer.from([137, 80, 78, 71]));
    });
    await new Promise((r) => fake.listen(0, "127.0.0.1", r));
    process.env.OPENWEATHER_TILE_URL = `http://127.0.0.1:${fake.address().port}`;

    try {
        delete process.env.OPENWEATHER_API_KEY;
        let r = await get("/weather/map/status");
        assert.equal(r.body.data.code, "missing");
        const noKey = await get("/weather/map/status");
        assert.equal(noKey.body.data.tileToken, null);

        process.env.OPENWEATHER_API_KEY = "test-openweather-api-key";
        const ok = await get("/weather/map/status");
        const tile = (path) => fetch(`${base}/weather/map/${path}?t=${ok.body.data.tileToken}`);
        assert.equal((await fetch(`${base}/weather/map/temp_new/3/4/2`)).status, 401, "tiles need a token");
        calls = 0; // the status check above made its own probe request
        const first = await tile("temp_new/3/4/2");
        assert.equal(first.status, 200);
        assert.equal(first.headers.get("content-type"), "image/png");
        await tile("temp_new/3/4/2");
        assert.equal(calls, 1, "second request is served from cache");

        assert.equal((await tile("nope/3/4/2")).status, 400);
        assert.equal((await tile("temp_new/3/9/2")).status, 400);

        mode = 401;
        process.env.OPENWEATHER_API_KEY = "ffffffffffffffffffffffffffffffff"; // new key: bypasses the 60 s status cache
        r = await get("/weather/map/status");
        assert.equal(r.body.data.code, "rejected");
        assert.match(r.body.data.message, /401/);
    } finally {
        if (saved === undefined) delete process.env.OPENWEATHER_API_KEY;
        else process.env.OPENWEATHER_API_KEY = saved;
        delete process.env.OPENWEATHER_TILE_URL;
        fake.close();
    }
});

test("AI: briefing and questions are answered from the data, with the engine reported", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const b = await get("/ai/briefing?lat=26.76&lon=83.37&name=Gorakhpur");
    assert.equal(b.status, 200);
    assert.equal(b.body.data.source, "rules");
    assert.match(b.body.data.text, /Gorakhpur/);
    assert.match(b.body.data.text, /°C/);

    const f = await get("/ai/briefing?lat=26.76&lon=83.37&name=Gorakhpur&unit=fahrenheit");
    assert.match(f.body.data.text, /°F/);

    const post = (body) => fetch(`${base}/ai/ask`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));

    const rain = await post({ lat: 26.76, lon: 83.37, name: "Gorakhpur", question: "Do I need an umbrella?" });
    assert.equal(rain.status, 200);
    assert.match(rain.body.data.text, /rain|umbrella/i);

    const air = await post({ lat: 26.76, lon: 83.37, name: "Gorakhpur", question: "Is the air safe today?" });
    assert.match(air.body.data.text, /AQI|Air quality/);

    const other = await post({ lat: 26.76, lon: 83.37, question: "tell me something" });
    assert.match(other.body.data.text, /ask about/i);

    assert.equal((await post({ lat: 26.76, lon: 83.37, question: "hi" })).status, 400);
    assert.equal((await post({ lat: 999, lon: 83.37, question: "rain today?" })).status, 400);
    assert.equal((await get("/ai/status")).body.data.engine, "rules");
});

test("signed-out requests are refused on every data route", async () => {
    for (const path of ["/weather/overview?lat=26.7&lon=83.3", "/weather/multi?points=26.7,83.3", "/weather/grid?south=20&west=70&north=30&east=80", "/geo/search?q=gor", "/geo/reverse?lat=26.7&lon=83.3", "/ai/briefing?lat=26.7&lon=83.3", "/ai/status", "/weather/map/status", "/weather/current?lat=26.7&lon=83.3"]) {
        const r = await get(path, { auth: false });
        assert.equal(r.status, 401, `${path} should require sign-in`);
    }

    const bad = await fetch(`${base}/weather/overview?lat=26.7&lon=83.3`, { headers: { Authorization: "Bearer not-a-token" } });
    assert.equal(bad.status, 401);
});
