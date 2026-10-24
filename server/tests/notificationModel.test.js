const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAlertNotifications, buildDailyDigest, isDigestWindow, tempText } = require("../services/notificationModel");

const overview = (extra = {}) => ({
    location: { latitude: 26.76, longitude: 83.37, utcOffsetSeconds: 19800 },
    daily: [{ label: "Light rain", temperatureMin: 24, temperatureMax: 33, precipProbability: 70, precipitationSum: 12.4, uvIndexMax: 8, windGustMax: 52 }],
    airQuality: { naqi: { value: 142, label: "Moderate" } },
    advisories: [
        { id: "rain-2026-10-19", kind: "rain", severity: "watch", title: "Mon: significant rain", detail: "About 12 mm expected." },
        { id: "storm", kind: "storm", severity: "warning", title: "Thunderstorms possible", detail: "Stay indoors." },
        { id: "x", kind: "uv", severity: "info", title: "ignored", detail: "" },
    ],
    ...extra,
});

test("alerts: warnings first, unknown severities dropped, stable dedupe keys", () => {
    const list = buildAlertNotifications(overview(), "Gorakhpur");

    assert.equal(list.length, 2);
    assert.equal(list[0].metadata.kind, "storm");
    assert.match(list[0].title, /^Warning · Gorakhpur/);
    assert.equal(list[1].title, "Advisory · Gorakhpur: significant rain");
    assert.equal(list[1].dedupeKey, "adv:26.76,83.37:rain-2026-10-19:watch");
    assert.deepEqual(buildAlertNotifications(overview(), "Gorakhpur").map((n) => n.dedupeKey), list.map((n) => n.dedupeKey));
});

test("alerts: an escalation (watch -> warning) gets a new key, so it is re-notified", () => {
    const a = buildAlertNotifications(overview(), "G").find((n) => n.metadata.kind === "rain");
    const esc = overview({ advisories: [{ id: "rain-2026-10-19", kind: "rain", severity: "warning", title: "Mon: heavy rain", detail: "x" }] });
    assert.notEqual(buildAlertNotifications(esc, "G")[0].dedupeKey, a.dedupeKey);
});

test("digest: built from today's numbers, in the user's unit, one per local day", () => {
    const now = Date.UTC(2026, 9, 18, 2, 0) / 1000; // 07:30 IST
    const d = buildDailyDigest(overview(), "Gorakhpur", { nowSec: now });
    assert.match(d.title, /Gorakhpur: Light rain, 33°C/);
    assert.match(d.message, /24°C to 33°C/);
    assert.match(d.message, /Rain chance 70% \(about 12 mm\)/);
    assert.match(d.message, /UV peaks at 8/);
    assert.match(d.message, /Gusts up to 52 km\/h/);
    assert.match(d.message, /AQI 142/);
    assert.equal(d.dedupeKey, "digest:26.76,83.37:2026-10-18");

    assert.match(buildDailyDigest(overview(), "G", { nowSec: now, temperatureUnit: "fahrenheit" }).title, /91°F/);
    assert.equal(tempText(null), "–");
});

test("digest window follows the place's local time", () => {
    const o = overview();
    assert.equal(isDigestWindow(o, Date.UTC(2026, 9, 18, 2, 0) / 1000), true); // 07:30 IST
    assert.equal(isDigestWindow(o, Date.UTC(2026, 9, 18, 12, 0) / 1000), false); // 17:30 IST
});
