const test = require("node:test");
const assert = require("node:assert/strict");

const model = require("../services/overviewModel");
const { buildForecast, buildAir, SCENARIOS } = require("./mockUpstream");

// A fixed "now": 2026-10-17 10:00 IST (04:30 UTC).
const NOW = Date.UTC(2026, 9, 17, 4, 30) / 1000;

// Coordinates that deterministically produce each scenario in the mock.
const coordsFor = (scenario) => {
    const { scenarioFor } = require("./mockUpstream");

    for (let lat = 10; lat < 30; lat += 0.1) {
        if (scenarioFor(lat, 80) === scenario) return [Number(lat.toFixed(1)), 80];
    }

    throw new Error(`no coords for ${scenario}`);
};

const overviewFor = (scenario) => {
    const [lat, lon] = coordsFor(scenario);

    return model.buildOverview({ forecast: buildForecast(lat, lon, NOW), air: buildAir(lat, lon, NOW), nowSec: NOW });
};

test("overview has the expected shape and sizes", () => {
    const o = overviewFor("clear");

    assert.equal(o.daily.length, 14);
    assert.equal(o.hourly.length, 168);
    assert.equal(o.location.timezone, "Asia/Kolkata");
    // The first hourly slot is the hour that contains "now" (slots sit on local hours, i.e. :30 UTC in India).
    assert.ok(o.hourly[0].time <= o.current.time && o.current.time < o.hourly[0].time + 3600);
    assert.ok(o.current.temperature > 10 && o.current.temperature < 50);
    assert.equal(typeof o.current.isDay, "boolean");
    assert.ok(o.airQuality.hourly.length > 0);
    assert.deepEqual(o.meta.warnings, []);
});

test("daily dates are local calendar dates", () => {
    const o = overviewFor("clear");

    assert.equal(o.daily[0].date, "2026-10-17");
    assert.equal(o.daily[1].date, "2026-10-18");
});

test("missing air quality degrades gracefully", () => {
    const [lat, lon] = coordsFor("clear");
    const o = model.buildOverview({ forecast: buildForecast(lat, lon, NOW), air: null, nowSec: NOW });

    assert.equal(o.airQuality, null);
    assert.deepEqual(o.meta.warnings, ["air_quality_unavailable"]);
    assert.ok(o.insights.length > 0);
});

test("malformed provider payload is rejected with a 502", () => {
    assert.throws(() => model.normalizeForecast({ current: {} }), (e) => e.status === 502);
});

test("every scenario builds without throwing and yields insights", () => {
    for (const scenario of SCENARIOS) {
        const o = overviewFor(scenario);

        assert.ok(o.insights.length > 0, scenario);
        assert.ok(o.insights.every((i) => i.id && i.title && i.text && ["warn", "good", "info"].includes(i.tone)));
    }
});

test("NAQI matches CPCB sub-index arithmetic", () => {
    // PM2.5 45 µg/m³ sits halfway between 30→50 and 60→100: 75.
    assert.equal(model.computeNaqi({ pm2_5: 45 }).value, 75);
    assert.equal(model.computeNaqi({ pm2_5: 45 }).key, "satisfactory");
    // PM2.5 at the top of "good".
    assert.equal(model.computeNaqi({ pm2_5: 30 }).value, 50);
    // The worst pollutant sets the index and is reported as dominant.
    const mixed = model.computeNaqi({ pm2_5: 10, pm10: 300 });
    assert.equal(mixed.dominant, "pm10");
    assert.equal(mixed.key, "poor");
    // Off-scale values are capped.
    assert.equal(model.computeNaqi({ pm2_5: 5000 }).value, 500);
    // No particulate reading → no index (CPCB requires one).
    assert.equal(model.computeNaqi({ o3: 80 }), null);
    // CO is supplied in µg/m³ and converted to mg/m³.
    assert.equal(model.computeNaqi({ pm2_5: 10, co: 5000 }).dominant, "co");
});

test("moon phase is astronomically plausible", () => {
    const newMoon = model.moonPhase(Date.UTC(2000, 0, 6, 18, 14) / 1000);
    const fullMoon = model.moonPhase(Date.UTC(2000, 0, 21, 4, 40) / 1000);

    assert.ok(newMoon.illumination <= 2, `new moon illumination ${newMoon.illumination}`);
    assert.equal(newMoon.name, "New moon");
    assert.ok(fullMoon.illumination >= 98, `full moon illumination ${fullMoon.illumination}`);
    assert.equal(fullMoon.name, "Full moon");
});

test("monsoon scenario: rain insight and no 'dry' claim", () => {
    const o = overviewFor("monsoon");
    const rain = o.insights.find((i) => i.id === "rain-now" || i.id === "rain-soon");

    assert.ok(rain, "expected a rain insight");
    assert.ok(!o.insights.some((i) => i.id === "dry-24h"));
});

test("clear scenario: dry insight and a best-window recommendation", () => {
    const o = overviewFor("clear");

    assert.ok(o.insights.some((i) => i.id === "dry-24h"));
    // 10 AM with strong UV may or may not leave a window, but the id must be consistent if present.
    const win = o.insights.find((i) => i.id === "best-window");

    if (win) assert.match(win.title, /^Best outdoor window: \d{1,2} (AM|PM) – \d{1,2} (AM|PM)$/);
});

test("storm scenario: thunderstorm advisory is flagged, unofficial, with a time window", () => {
    const o = overviewFor("storm");
    const storm = o.advisories.find((a) => a.kind === "storm");

    assert.ok(storm, "expected a storm advisory");
    assert.equal(storm.severity, "warning");
    assert.equal(storm.official, false);
    assert.ok(storm.end > storm.start);
    assert.ok(o.advisories.every((a) => a.official === false));
});

test("heat scenario raises a heat advisory; clear scenario does not", () => {
    assert.ok(overviewFor("heat").advisories.some((a) => a.kind === "heat"));
    assert.ok(!overviewFor("clear").advisories.some((a) => a.kind === "heat"));
});

test("fog scenario raises a fog advisory", () => {
    assert.ok(overviewFor("fog").advisories.some((a) => a.kind === "fog"));
});

test("severe air quality produces an air advisory", () => {
    const [lat, lon] = coordsFor("clear");
    const forecast = buildForecast(lat, lon, NOW);
    const air = buildAir(lat, lon, NOW);

    air.current.pm2_5 = 220;
    air.current.pm10 = 380;

    const o = model.buildOverview({ forecast, air, nowSec: NOW });
    const aqi = o.advisories.find((a) => a.kind === "air");

    assert.ok(aqi);
    assert.ok(o.airQuality.naqi.value > 300);
    assert.equal(aqi.severity, "warning");
    assert.ok(o.insights.find((i) => i.id === "aqi").tone === "warn");
});

test("advisories are ordered warnings first", () => {
    const o = overviewFor("storm");
    const severities = o.advisories.map((a) => a.severity);
    const firstWatch = severities.indexOf("watch");

    if (firstWatch !== -1) assert.ok(!severities.slice(firstWatch).includes("warning"));
});

test("weather code table: unknown codes fall back instead of crashing", () => {
    const { describeCode } = require("../lib/wmo");

    assert.equal(describeCode(95).key, "thunderstorm");
    assert.equal(describeCode(1234).key, "overcast");
    assert.equal(describeCode(null).key, "overcast");
});
