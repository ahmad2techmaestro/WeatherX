const test = require("node:test");
const assert = require("node:assert/strict");

const { visibility, rainOutlook, uv, outside, visLevel } = require("../services/todayModel");

const T0 = 1_700_000_000;
const hr = (i, o = {}) => ({ time: T0 + i * 3600, temperature: 25, dewPoint: 15, humidity: 55, windSpeed: 8, visibilityKm: 20, precipitation: 0, precipProbability: 0, uvIndex: 0, isDay: true, ...o });
const make = (fn, extra = {}) => ({ current: { visibilityKm: 20, time: T0 }, hourly: Array.from({ length: 48 }, (_, i) => hr(i, fn ? fn(i) : {})), airQuality: null, location: { utcOffsetSeconds: 19800 }, ...extra });

test("visibility levels", () => {
    assert.equal(visLevel(24)[0], "Excellent");
    assert.equal(visLevel(6)[0], "Good");
    assert.equal(visLevel(3)[0], "Moderate");
    assert.equal(visLevel(1.4)[0], "Poor");
    assert.equal(visLevel(0.3)[0], "Very poor");
});

test("clear day reports a clear view and no windows", () => {
    const v = visibility(make());

    assert.equal(v.headline, "Clear view");
    assert.equal(v.windows.length, 0);
    assert.equal(v.series.length, 24);
});

test("dense fog now is called out", () => {
    const v = visibility(make((i) => (i < 4 ? { visibilityKm: 0.3, humidity: 98, dewPoint: 24.5 } : {}), { current: { visibilityKm: 0.3, time: T0 } }));

    assert.equal(v.headline, "Dense fog right now");
    assert.equal(v.current.tone, "bad");
    assert.equal(v.windows[0].cause, "fog");
});

test("fog later in the night is flagged ahead of time", () => {
    const v = visibility(make((i) => (i >= 5 && i <= 8 ? { visibilityKm: 0.5, humidity: 96, dewPoint: 24.8 } : {})));

    assert.match(v.headline, /^Fog likely from/);
    assert.equal(v.windows.length, 1);
    assert.equal(v.windows[0].minKm, 0.5);
});

test("rain outlook: dry, upcoming, and ongoing", () => {
    assert.equal(rainOutlook(make()).headline, "Dry for the next 12 hours");
    assert.match(rainOutlook(make((i) => (i === 4 ? { precipitation: 1.2, precipProbability: 80 } : {}))).headline, /^Rain expected around/);
    assert.match(rainOutlook(make((i) => (i < 3 ? { precipitation: 2, precipProbability: 90 } : {}))).headline, /^Rain now, easing/);
    assert.equal(rainOutlook(make(() => ({ precipitation: 1, precipProbability: 90 }))).headline, "Rain continues through the next 12 hours");
});

test("uv: protection window covers hours at UV 3 and above", () => {
    const r = uv(make((i) => ({ uvIndex: i >= 4 && i <= 8 ? [3, 6, 8, 6, 3][i - 4] : 0 })));

    assert.equal(r.peak.uv, 8);
    assert.equal(r.level, "Very high");
    assert.equal(r.window.end - r.window.start, 5 * 3600);
    assert.equal(uv(make()).headline, "No sun protection needed");
});

test("outside window picks the best daytime stretch", () => {
    const scores = (h) => ({ walking: h.temperature > 30 ? 20 : 90, cycling: h.temperature > 30 ? 20 : 90 });
    const w = outside(make((i) => ({ temperature: i < 6 ? 36 : 24 })), scores);

    assert.ok(w.start >= T0 + 6 * 3600);
    assert.equal(w.avg, 90);
    assert.equal(outside(make(() => ({ isDay: false })), scores), null);
});
