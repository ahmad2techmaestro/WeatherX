const test = require("node:test");
const assert = require("node:assert/strict");
const m = require("../services/intelligenceModel");

test("heat index: NOAA reference points and the cool-weather passthrough", () => {
    assert.equal(m.heatIndex(32.2, 70).value, 41); // 90°F/70% ≈ 105°F ≈ 41°C
    assert.equal(m.heatIndex(20, 50).value, 20);
    assert.equal(m.heatIndex(20, 50).level, "Comfortable");
    assert.equal(m.heatIndex(null, 50), null);
});

test("wet-bulb: Stull sample (20°C, 50%) is about 13.7°C, and grows with humidity", () => {
    assert.ok(Math.abs(m.wetBulb(20, 50).value - 13.7) < 0.3);
    assert.ok(m.wetBulb(35, 80).value > m.wetBulb(35, 40).value);
    assert.match(m.wetBulb(38, 85).level, /Dangerous|Severe/);
});

test("rainy spell needs 3+ consecutive wet days", () => {
    const d = (date, mm) => ({ date, precipitationSum: mm });
    assert.equal(m.rainySpell([d("a", 5), d("b", 0), d("c", 6), d("d", 7)]), null);
    const s = m.rainySpell([d("a", 0), d("b", 4), d("c", 6), d("d", 7.5), d("e", 0)]);
    assert.deepEqual(s, { days: 3, totalMm: 18, startDate: "b", endDate: "d" });
});

test("changes: flags a fast pressure fall and a big temperature drop", () => {
    const hourly = Array.from({ length: 24 }, (_, i) => ({ time: i * 3600, temperature: 34 - i * 0.5, pressure: 1006 - (i === 3 ? 4 : 0), windGust: 10 }));
    hourly[3].pressure = 1001;
    const list = m.changes({ pressure: 1006, windGust: 10 }, hourly);
    assert.ok(list.some((c) => c.id === "pressure-fall"));
    assert.ok(list.some((c) => c.id === "temp-drop"));
});

test("activities: rain wrecks field work, a calm dry night is good for stargazing", () => {
    const calm = { temperature: 22, feelsLike: 22, humidity: 40, precipProbability: 0, precipitation: 0, windSpeed: 5, windGust: 10, visibilityKm: 20, cloudCover: 5, uvIndex: 0, isDay: false };
    assert.ok(m.activityScores(calm, null).stargazing >= 80);
    assert.ok(m.activityScores({ ...calm, isDay: true, precipProbability: 80, precipitation: 3 }, null).farming <= 50);
});
