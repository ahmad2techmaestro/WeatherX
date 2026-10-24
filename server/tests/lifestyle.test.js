const test = require("node:test");
const assert = require("node:assert/strict");

const { uvTip, skinTip, carWashTip, workoutTip, drivingTip, tripTip, mosquitoTip, buildLifestyle } = require("../services/lifestyleModel");

const hours = (n, over = {}) => Array.from({ length: n }, (_, i) => ({ time: 1000 + i * 3600, precipitation: 0, precipProbability: 0, visibilityKm: 10, windGust: 10, ...over }));

test("UV tip follows the WHO bands", () => {
    assert.equal(uvTip([{ uvIndexMax: 1 }]).tone, "good");
    assert.equal(uvTip([{ uvIndexMax: 6 }]).label, "High UV index");
    assert.equal(uvTip([{ uvIndexMax: 12 }]).label, "Extreme UV index");
    assert.equal(uvTip([{}]), null);
});

test("skin tip reacts to heat, dryness and cold", () => {
    assert.match(skinTip({ temperature: 32, humidity: 70 }).label, /oil-control/);
    assert.match(skinTip({ temperature: 24, humidity: 25 }).label, /Moisturise/);
    assert.match(skinTip({ temperature: 10, humidity: 50 }).label, /richer/);
    assert.equal(skinTip({ temperature: 24, humidity: 50 }).tone, "good");
});

test("car wash waits for rain and notes dust", () => {
    const current = { time: 1000 };

    assert.equal(carWashTip(hours(48), null, current).tone, "good");
    assert.equal(carWashTip(hours(48, { precipProbability: 70 }), null, current).tone, "warn");
    assert.equal(carWashTip(hours(48), { pollutants: { dust: 150 } }, current).label, "Dusty air today");
});

test("workout moves indoors for bad air, heat and rain", () => {
    assert.match(workoutTip({ feelsLike: 25 }, hours(2), { naqi: { value: 250 } }).label, /indoor/);
    assert.match(workoutTip({ feelsLike: 38 }, hours(2), null).label, /indoor/);
    assert.match(workoutTip({ feelsLike: 25 }, hours(2, { precipitation: 1 }), null).label, /indoor/);
    assert.match(workoutTip({ feelsLike: 24 }, hours(2), { naqi: { value: 60 } }).label, /outdoor/);
});

test("driving tip reports fog, rain and clear roads", () => {
    assert.equal(drivingTip({ visibilityKm: 0.4 }, hours(6)).tone, "bad");
    assert.equal(drivingTip({ visibilityKm: 10 }, hours(6, { precipitation: 2 })).label, "Heavy rain ahead");
    assert.equal(drivingTip({ visibilityKm: 10 }, hours(6)).tone, "good");
});

test("trip tip averages the next three days", () => {
    assert.equal(tripTip([{ score: 80 }, { score: 75 }, { score: 70 }]).tone, "good");
    assert.equal(tripTip([{ score: 55 }, { score: 60 }]).tone, "ok");
    assert.equal(tripTip([{ score: 20 }]).tone, "warn");
    assert.equal(tripTip([{ score: null }]), null);
});

test("mosquito tip needs warm, humid air", () => {
    assert.equal(mosquitoTip({ temperature: 28, humidity: 85 }, hours(48)).tone, "bad");
    assert.equal(mosquitoTip({ temperature: 26, humidity: 55 }, hours(48)).label, "Some mosquitoes");
    assert.equal(mosquitoTip({ temperature: 12, humidity: 40 }, hours(48)).tone, "good");
});

test("buildLifestyle never invents pollen or traffic", () => {
    const tips = buildLifestyle({ current: { temperature: 28, humidity: 60, time: 1000, feelsLike: 30 }, hourly: hours(48), daily: [{ uvIndexMax: 6 }], airQuality: null }, [{ score: 70 }]);

    assert.ok(tips.length >= 6);
    assert.ok(tips.every((t) => !/pollen|traffic/i.test(`${t.key}${t.label}`)));
});
