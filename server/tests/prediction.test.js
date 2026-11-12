const test = require("node:test");
const assert = require("node:assert/strict");

const stats = require("../services/prediction/stats");
const climatology = require("../services/prediction/climatology");
const { analyze, T } = require("../services/prediction/analyzer");
const { rules, toUnit, numbersAreGrounded } = require("../services/prediction/explain");

/* ── fixtures ─────────────────────────────────────────────────────────── */
const TODAY = "2026-05-10";
const OFF = 19800;
// Deterministic "climate": Tmax around 38 in mid-May with a small wobble; rain mostly absent.
const wobble = (y, d) => ((y * 31 + d * 17) % 11) - 5; // -5..5
const archive = (() => {
    const a = { time: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_sum: [] };
    for (let y = 2016; y <= 2026; y++) {
        for (let d = 0; d < 365; d++) {
            const date = stats.addDaysISO(`${y}-01-01`, d);
            if (date >= "2026-05-01") continue;
            const doy = d + 1;
            const tmax = 30 + 9 * Math.sin(((doy - 80) / 365) * 2 * Math.PI) + wobble(y, d) * 0.4;
            a.time.push(date); a.temperature_2m_max.push(Number(tmax.toFixed(1))); a.temperature_2m_min.push(Number((tmax - 12).toFixed(1)));
            a.precipitation_sum.push((y + d) % 9 === 0 ? 6 : 0);
        }
    }
    return a;
})();
const normalMay = (iso) => climatology.build(climatology.toRecords(archive), TODAY).forDate(iso).tmaxMean;

const daily = (maxes, o = {}) => maxes.map((mx, i) => ({ date: stats.addDaysISO(TODAY, i), temperatureMax: mx, temperatureMin: mx - 12, precipitationSum: o.mm?.[i] ?? 0, precipProbability: o.prob?.[i] ?? 5 }));
const hours = (fn = () => ({})) => Array.from({ length: 72 }, (_, i) => ({ time: 1_780_000_000 + i * 3600, temperature: 30, pressure: 1005, windGust: 15, precipitation: 0, code: 1, ...fn(i) }));
const overview = (maxes, o = {}) => ({ location: { elevation: o.elevation ?? 100, utcOffsetSeconds: OFF }, daily: daily(maxes, o), hourly: o.hourly || hours() });
const recentBlock = (fn) => { const r = { time: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_sum: [] }; for (let i = 30; i >= 0; i--) { const d = stats.addDaysISO(TODAY, -i); const mx = fn(30 - i); r.time.push(d); r.temperature_2m_max.push(mx); r.temperature_2m_min.push(mx - 12); r.precipitation_sum.push(0); } return r; };

/* ── stats ────────────────────────────────────────────────────────────── */
test("stats: mean, std, quantile, percentile rank, slope, day of year", () => {
    assert.equal(stats.mean([1, 2, 3]), 2);
    assert.ok(Math.abs(stats.std([2, 4, 4, 4, 5, 5, 7, 9]) - 2.138) < 0.01);
    assert.equal(stats.quantile([1, 2, 3, 4, 5], 0.5), 3);
    assert.equal(stats.percentileRank([1, 2, 3, 4], 5), 100);
    assert.equal(stats.percentileRank([1, 2, 3, 4], 0), 0);
    assert.equal(stats.slope([1, 2, 3, 4, 5]), 1);
    assert.ok(Number.isNaN(stats.slope([1, 2])));
    assert.equal(stats.dayOfYear("2026-01-01"), 1);
    assert.equal(stats.dayOfYear("2026-12-31"), 365);
    assert.equal(stats.doyDistance(1, 365), 1);
});

/* ── climatology ──────────────────────────────────────────────────────── */
test("climatology: normal uses previous years only, and refuses thin data", () => {
    const c = climatology.build(climatology.toRecords(archive), TODAY);
    assert.ok(c.years >= 9);
    const n = c.forDate("2026-05-10");
    assert.ok(n.n > 100 && n.tmaxMean > 36 && n.tmaxMean < 41, `mean ${n.tmaxMean}`);
    assert.ok(n.tmaxP10 < n.tmaxMean && n.tmaxP90 > n.tmaxMean);
    const thin = climatology.build(climatology.toRecords({ time: archive.time.slice(0, 400), temperature_2m_max: archive.temperature_2m_max.slice(0, 400), temperature_2m_min: archive.temperature_2m_min.slice(0, 400) }), TODAY);
    assert.equal(thin.forDate("2026-05-10"), null);
    assert.equal(climatology.toRecords({ time: ["2020-01-01"], temperature_2m_max: [null], temperature_2m_min: [10] }).length, 0);
});

/* ── anomaly detection ────────────────────────────────────────────────── */
test("a forecast far above normal is flagged as an unusual warm anomaly; a normal one is not", () => {
    const n = normalMay(TODAY);
    const hot = analyze({ overview: overview([n + 6, n + 6, n, n, n, n, n]), recent: null, archive });
    const a = hot.anomalies.find((x) => x.kind === "temperature");
    assert.ok(a, "anomaly found");
    assert.equal(a.direction, "warm");
    assert.ok(a.z >= T.anomalyZ && a.departure >= 5);
    assert.ok(["unusual", "extreme"].includes(a.level));
    const calm = analyze({ overview: overview([n, n + 1, n - 1, n, n + 0.5, n, n]), recent: null, archive });
    assert.equal(calm.anomalies.filter((x) => x.kind === "temperature").length, 0);
    const cool = analyze({ overview: overview([n - 7, n, n, n, n, n, n]), recent: null, archive });
    assert.equal(cool.anomalies.find((x) => x.kind === "temperature").direction, "cool");
});

test("a tiny departure is never flagged even when the spread is small", () => {
    const n = normalMay(TODAY);
    const r = analyze({ overview: overview([n + 1.2, n, n, n, n, n, n]), recent: null, archive });
    assert.equal(r.anomalies.length, 0);
});

test("without a climate normal, comparisons are skipped rather than invented", () => {
    const r = analyze({ overview: overview([40, 41, 42, 40, 39, 38, 38]), recent: null, archive: null });
    assert.equal(r.basis.hasNormals, false);
    assert.equal(r.anomalies.length, 0);
    assert.ok(r.temperatureVsNormal.every((x) => x.normal === null));
    assert.match(r.heatwave.basis, /Absolute temperature only/);
});

/* ── trend ────────────────────────────────────────────────────────────── */
test("recent trend: warming, cooling and steady, with departure from normal", () => {
    const warm = analyze({ overview: overview([38, 38, 38, 38, 38, 38, 38]), recent: recentBlock((i) => 30 + (i >= 23 ? 4 : 0)), archive });
    assert.equal(warm.trend.recent.direction, "warming");
    assert.ok(warm.trend.recent.delta >= 3.5);
    const cool = analyze({ overview: overview([38, 38, 38, 38, 38, 38, 38]), recent: recentBlock((i) => 36 - (i >= 23 ? 4 : 0)), archive });
    assert.equal(cool.trend.recent.direction, "cooling");
    const steady = analyze({ overview: overview([38, 38, 38, 38, 38, 38, 38]), recent: recentBlock(() => 35), archive });
    assert.equal(steady.trend.recent.direction, "steady");
    assert.equal(typeof steady.trend.recent.vsNormal, "number");
    assert.equal(analyze({ overview: overview([38, 38, 38, 38, 38, 38, 38]), recent: recentBlock(() => 35).time.length && { time: ["2026-05-01"], temperature_2m_max: [30], temperature_2m_min: [20] }, archive }).trend.recent, null);
});

test("forecast trend: rising, falling, steady", () => {
    const up = analyze({ overview: overview([34, 34, 35, 37, 39, 40, 41]), recent: null, archive }).trend.forecast;
    assert.equal(up.direction, "rising");
    assert.ok(up.slopePerDay > 0);
    assert.equal(analyze({ overview: overview([41, 40, 39, 37, 35, 34, 33]), recent: null, archive }).trend.forecast.direction, "falling");
    assert.equal(analyze({ overview: overview([36, 36, 36, 36, 36, 36, 36]), recent: null, archive }).trend.forecast.direction, "steady");
});

/* ── rain ─────────────────────────────────────────────────────────────── */
test("rain analysis: probability, expected days, total and comparison with normal", () => {
    const n = normalMay(TODAY);
    const wet = analyze({ overview: overview(Array(7).fill(n), { prob: [90, 80, 70, 60, 60, 50, 50], mm: [20, 15, 10, 8, 5, 3, 2] }), recent: null, archive });
    assert.equal(wet.rain.totalMm, 63);
    assert.ok(wet.rain.anyRainChance > 99);
    assert.equal(wet.rain.expectedRainDays, 4.6);
    assert.equal(wet.rain.comparison, "wetter");
    assert.equal(wet.rain.wettest.date, TODAY);
    assert.equal(wet.rain.anomaly.kind, "rainfall");
    assert.equal(wet.rain.anomaly.direction, "wet");
    const dry = analyze({ overview: overview(Array(7).fill(n), { prob: Array(7).fill(0), mm: Array(7).fill(0) }), recent: null, archive });
    assert.equal(dry.rain.anyRainChance, 0);
    assert.equal(dry.rain.wettest, null);
    assert.equal(dry.rain.anomaly, null);
});

/* ── sudden change ────────────────────────────────────────────────────── */
test("sudden changes: temperature drop, pressure fall, gusts, rain burst, thunderstorm", () => {
    const drop = analyze({ overview: overview(Array(7).fill(36), { hourly: hours((i) => (i >= 10 ? { temperature: 20 } : {})) }), recent: null, archive }).suddenChanges;
    assert.ok(drop.some((e) => e.type === "temperature" && e.detail.change <= -8));
    const press = analyze({ overview: overview(Array(7).fill(36), { hourly: hours((i) => ({ pressure: 1010 - Math.min(i, 10) * 1.2 })) }), recent: null, archive }).suddenChanges;
    assert.ok(press.some((e) => e.type === "pressure"));
    const gust = analyze({ overview: overview(Array(7).fill(36), { hourly: hours((i) => (i === 20 ? { windGust: 70 } : {})) }), recent: null, archive }).suddenChanges;
    assert.equal(gust.find((e) => e.type === "wind").severity, "warning");
    const burst = analyze({ overview: overview(Array(7).fill(36), { hourly: hours((i) => (i === 15 ? { precipitation: 12 } : {})) }), recent: null, archive }).suddenChanges;
    assert.equal(burst.find((e) => e.type === "rain").severity, "warning");
    const storm = analyze({ overview: overview(Array(7).fill(36), { hourly: hours((i) => (i === 18 ? { code: 95 } : {})) }), recent: null, archive }).suddenChanges;
    assert.ok(storm.some((e) => e.type === "thunderstorm"));
    assert.equal(analyze({ overview: overview(Array(7).fill(36)), recent: null, archive }).suddenChanges.length, 0);
});

test("the normal day/night cycle is NOT reported as a sudden temperature change", () => {
    const cycle = hours((i) => ({ temperature: 30 + 9 * Math.sin(((((1_780_000_000 + i * 3600 + OFF) % 86400) / 3600 - 9) / 24) * 2 * Math.PI) }));
    const r = analyze({ overview: overview(Array(7).fill(36), { hourly: cycle }), recent: null, archive }).suddenChanges;
    assert.equal(r.filter((e) => e.type === "temperature").length, 0);
    // ...but a cold front on top of that same cycle is.
    const front = cycle.map((h, i) => (i >= 30 ? { ...h, temperature: h.temperature - 12 } : h));
    assert.ok(analyze({ overview: overview(Array(7).fill(36), { hourly: front }), recent: null, archive }).suddenChanges.some((e) => e.type === "temperature" && e.detail.unusualBy < 0));
});

test("sudden changes are de-duplicated and capped", () => {
    const noisy = analyze({ overview: overview(Array(7).fill(36), { hourly: hours((i) => ({ temperature: i % 2 ? 20 : 34, windGust: 60 })) }), recent: null, archive }).suddenChanges;
    assert.ok(noisy.length <= 5);
    assert.equal(new Set(noisy.map((e) => `${e.type}`)).size, noisy.filter((e, i) => noisy.findIndex((x) => x.type === e.type) === i).length);
});

/* ── heatwave ─────────────────────────────────────────────────────────── */
test("heatwave: needs 2+ qualifying days; one hot day is only a watch; absolute 45 always counts", () => {
    const n = normalMay(TODAY);
    const hot = Math.max(40.5, n + 5);
    const two = analyze({ overview: overview([n, hot, hot + 0.5, n, n, n, n]), recent: null, archive }).heatwave;
    assert.equal(two.level, "heatwave");
    assert.equal(two.qualifyingDates.length, 2);
    const one = analyze({ overview: overview([n, hot, n, n, n, n, n]), recent: null, archive }).heatwave;
    assert.equal(one.level, "watch");
    const sev = analyze({ overview: overview([n, 47.5, 47.8, n, n, n, n]), recent: null, archive }).heatwave;
    assert.equal(sev.level, "severe");
    assert.equal(analyze({ overview: overview([n, n, n, n, n, n, n]), recent: null, archive }).heatwave.level, "none");
    assert.match(two.note, /Not an official IMD/);
});

test("heatwave on hills uses the lower 30 degree threshold; without a normal only absolute heat counts", () => {
    const row = (d, mx, normal) => ({ date: d, max: mx, normal, departure: mx - normal });
    const hills = require("../services/prediction/analyzer").heatwave([row("a", 33, 27.5), row("b", 34, 28.5), row("c", 28, 27)], 2200);
    assert.equal(hills.terrain, "hills");
    assert.equal(hills.level, "heatwave");
    const plain = require("../services/prediction/analyzer").heatwave([row("a", 33, 27.5), row("b", 34, 28.5)], 100);
    assert.notEqual(plain.level, "heatwave");
    const noNormal = analyze({ overview: overview([46, 46, 46, 40, 40, 40, 40]), recent: null, archive: null }).heatwave;
    assert.equal(noNormal.level, "heatwave");
});

/* ── explanation: rules, units, grounding ─────────────────────────────── */
test("a long heatwave is summarised as a range, not a list of seven dates", () => {
    const f = analyze({ overview: overview(Array(7).fill(47.5)), recent: null, archive });
    const txt = rules(f, { place: "Ahmedabad" }).text;
    assert.match(txt, / to /);
    assert.ok((txt.match(/ and /g) || []).length <= 3);
    assert.ok(txt.length < 520, `length ${txt.length}`);
});

test("rules explanation: the user's example sentence, Hindi, and a calm day", () => {
    const n = normalMay(TODAY);
    const f = analyze({ overview: overview([n + 6, n, n, n, n, n, n]), recent: null, archive });
    const en = rules(f, { place: "Ahmedabad" });
    assert.match(en.text, /may experience an unusually high temperature compared with its recent historical pattern/);
    assert.match(en.text, /not official warnings/);
    assert.ok(["Unusually warm weather ahead", "Heat to watch"].includes(en.headline));
    assert.equal(rules(analyze({ overview: overview([n - 7, n, n, n, n, n, n]), recent: null, archive }), { place: "Pune" }).headline, "Unusually cool weather ahead");
    const hi = rules(f, { place: "अहमदाबाद", lang: "hi" });
    assert.match(hi.text, /असामान्य रूप से ज़्यादा तापमान/);
    const calm = rules(analyze({ overview: overview([n, n, n, n, n, n, n]), recent: null, archive }), { place: "Pune" });
    assert.equal(calm.headline, "Nothing unusual ahead");
    assert.match(calm.text, /within the normal range/);
});

test("Fahrenheit conversion happens in code: values and differences", () => {
    const n = normalMay(TODAY);
    const f = analyze({ overview: overview([n + 6, n, n, n, n, n, n]), recent: null, archive });
    const fh = toUnit(f, "fahrenheit");
    assert.equal(fh.anomalies[0].value, Math.round((f.anomalies[0].value * 1.8 + 32) * 10) / 10);
    assert.equal(fh.anomalies[0].departure, Math.round(f.anomalies[0].departure * 1.8 * 10) / 10);
    assert.match(rules(fh, { unit: "fahrenheit", place: "X" }).text, /°F/);
    assert.equal(toUnit(f, "celsius").anomalies[0].value, f.anomalies[0].value);
});

test("grounding check accepts numbers from the findings and rejects invented ones", () => {
    const n = normalMay(TODAY);
    const f = analyze({ overview: overview([n + 6, n, n, n, n, n, n]), recent: null, archive });
    const a = f.anomalies[0];
    assert.equal(numbersAreGrounded(`It may reach ${a.value} degrees, ${a.departure} above the usual ${a.normal}.`, f), true);
    assert.equal(numbersAreGrounded("It will hit 52 degrees on 3 days.", f), false);
    assert.equal(numbersAreGrounded(`इसका तापमान ${String(a.value).replace(/\d/g, (d) => "०१२३४५६७८९"[d])} है`, f), true);
    assert.equal(numbersAreGrounded("Over the next 7 days, expect a few showers.", f), true);
});
