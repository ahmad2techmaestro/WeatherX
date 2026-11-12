const test = require("node:test");
const assert = require("node:assert/strict");

const { evaluate } = require("../services/automation/triggers");
const { runWorkflow } = require("../services/automation/engine");
const { runDueWorkflows } = require("../jobs/workflowJob");
const store = require("../services/automation/store");

const NOW = Date.UTC(2026, 10, 11, 3, 0) / 1000; // 08:30 in India (UTC+5:30)
const day = (date, o = {}) => ({ date, label: "Sunny", temperatureMax: 32, temperatureMin: 22, precipitationSum: 0, precipProbability: 5, ...o });
const overview = (o = {}) => ({ location: { utcOffsetSeconds: 19800 }, daily: [day("2026-11-11"), day("2026-11-12"), day("2026-11-13"), day("2026-11-14")], airQuality: null, ...o });
const wf = (kind, extra = {}) => ({ id: "w1", user: "u1", kind, place: { name: "Jaipur", latitude: 26.9, longitude: 75.8 }, unit: "celsius", threshold: null, hourLocal: 7, goal: "", ...extra });
const aq = (v, hourly = []) => ({ naqi: { value: v, label: v > 200 ? "Poor" : "Moderate", dominant: "pm2_5", advice: "" }, pollutants: {}, hourly: hourly.length ? hourly : Array.from({ length: 24 }, (_, i) => ({ time: NOW + i * 3600, naqi: v })) });

test("rain trigger: needs both chance and amount", () => {
    const wet = overview({ daily: [day("2026-11-11", { precipProbability: 80, precipitationSum: 12 }), day("2026-11-12")] });
    const r = evaluate({ wf: wf("rain", { threshold: 60 }), overview: wet, nowSec: NOW });
    assert.equal(r.fired, true);
    assert.match(r.message, /80% chance of rain, about 12 mm/);
    const drizzle = overview({ daily: [day("2026-11-11", { precipProbability: 90, precipitationSum: 0.2 })] });
    assert.equal(evaluate({ wf: wf("rain", { threshold: 60 }), overview: drizzle, nowSec: NOW }).fired, false);
    assert.equal(evaluate({ wf: wf("rain", { threshold: 60 }), overview: overview(), nowSec: NOW }).fired, false);
});

test("temperature trigger honours the unit in its message", () => {
    const hot = overview({ daily: [day("2026-11-11", { temperatureMax: 41 }), day("2026-11-12", { temperatureMax: 43 })] });
    assert.match(evaluate({ wf: wf("temperature_above", { threshold: 40 }), overview: hot, nowSec: NOW }).message, /43°C.*2 days/);
    assert.match(evaluate({ wf: wf("temperature_above", { threshold: 40, unit: "fahrenheit" }), overview: hot, nowSec: NOW }).message, /109°F/);
    assert.equal(evaluate({ wf: wf("temperature_above", { threshold: 45 }), overview: hot, nowSec: NOW }).fired, false);
});

test("air trigger: sensitive users get the stricter limit and it is explained", () => {
    const o = overview({ airQuality: aq(150) });
    assert.equal(evaluate({ wf: wf("air", { threshold: 200 }), overview: o, nowSec: NOW }).fired, false);
    const r = evaluate({ wf: wf("air", { threshold: 200 }), overview: o, sensitive: true, nowSec: NOW });
    assert.equal(r.fired, true);
    assert.match(r.message, /limit of 100 \(lowered because of your health notes\)/);
    assert.equal(evaluate({ wf: wf("air", { threshold: 200 }), overview: overview(), nowSec: NOW }).fired, false); // no air data
});

test("analysis triggers: heatwave level, sudden change severity, anomaly level", () => {
    const hw = (level) => ({ findings: { heatwave: { level, qualifyingDates: ["2026-11-12", "2026-11-13"], peak: { max: 46 } } } });
    assert.equal(evaluate({ wf: wf("heatwave", { threshold: 2 }), overview: overview(), analysis: hw("watch"), nowSec: NOW }).fired, false);
    const fired = evaluate({ wf: wf("heatwave", { threshold: 2 }), overview: overview(), analysis: hw("heatwave"), nowSec: NOW });
    assert.equal(fired.fired, true);
    assert.match(fired.message, /highs near 46°C/);
    assert.match(fired.message, /not an official warning/);
    assert.equal(evaluate({ wf: wf("heatwave", { threshold: 3 }), overview: overview(), analysis: hw("heatwave"), nowSec: NOW }).fired, false);
    assert.match(evaluate({ wf: wf("heatwave"), overview: overview(), analysis: null, nowSec: NOW }).message, /isn't available/);

    const sc = { findings: { suddenChanges: [{ type: "pressure", severity: "watch", time: NOW + 7200 }] } };
    assert.equal(evaluate({ wf: wf("sudden_change", { threshold: 1 }), overview: overview(), analysis: sc, nowSec: NOW }).fired, true);
    assert.equal(evaluate({ wf: wf("sudden_change", { threshold: 2 }), overview: overview(), analysis: sc, nowSec: NOW }).fired, false);

    const an = { findings: { anomalies: [{ kind: "temperature", date: "2026-11-12", direction: "warm", level: "unusual", departure: 6.2, z: 1.8 }] } };
    assert.match(evaluate({ wf: wf("anomaly", { threshold: 1 }), overview: overview(), analysis: an, nowSec: NOW }).message, /unusually warm.*6\.2°C above/);
    assert.equal(evaluate({ wf: wf("anomaly", { threshold: 2 }), overview: overview(), analysis: an, nowSec: NOW }).fired, false);
});

const deps = (over = {}) => ({ getOverview: async () => overview({ daily: [day("2026-11-11", { precipProbability: 80, precipitationSum: 12 })] }), getAnalysis: async () => ({ findings: {} }), isSensitive: async () => false, runAgents: async () => ({ answer: "Today is clear and warm." }), ...over });

test("engine: notification has a per-day dedupe key; a day already notified is skipped; dry-run ignores that", async () => {
    const w = wf("rain", { threshold: 60 });
    const out = await runWorkflow(w, deps(), { nowSec: NOW });
    assert.equal(out.status, "triggered");
    assert.equal(out.notification.dedupeKey, "wf:w1:2026-11-11");
    assert.equal(out.notification.type, "smart_alert");
    assert.equal(out.notification.userId, "u1");
    assert.equal((await runWorkflow({ ...w, lastTriggeredDate: "2026-11-11" }, deps(), { nowSec: NOW })).status, "skipped");
    assert.equal((await runWorkflow({ ...w, lastTriggeredDate: "2026-11-11" }, deps(), { nowSec: NOW, dryRun: true })).status, "triggered");
});

test("engine: briefing waits for its hour, then runs the agent team once", async () => {
    let calls = 0;
    const d = deps({ runAgents: async ({ goal }) => { calls++; return { answer: `Briefing for: ${goal.slice(0, 7)}` }; } });
    assert.equal((await runWorkflow(wf("briefing", { hourLocal: 9 }), d, { nowSec: NOW })).status, "quiet"); // 08:30 < 09:00
    assert.equal(calls, 0);
    const out = await runWorkflow(wf("briefing", { hourLocal: 8 }), d, { nowSec: NOW });
    assert.equal(out.status, "triggered");
    assert.match(out.notification.message, /Briefing for: Give me/);
    assert.equal(out.notification.title, "Morning briefing · Jaipur");
    assert.equal(calls, 1);
});

test("engine: data failures become an error outcome with a safe message, never a thrown error", async () => {
    const boom = deps({ getOverview: async () => { throw new Error("secret stack details"); } });
    const out = await runWorkflow(wf("rain"), boom, { nowSec: NOW });
    assert.equal(out.status, "error");
    assert.doesNotMatch(out.message, /secret/);
});

const memStore = () => {
    const rows = [];
    return { rows, async list(u) { return rows.filter((r) => r.user === u); }, async listEnabled() { return rows.filter((r) => r.enabled); }, async get(u, id) { return rows.find((r) => r.user === u && r.id === id) || null; }, async create(d) { const r = { id: `w${rows.length + 1}`, runCount: 0, triggerCount: 0, ...d }; rows.push(r); return r; }, async update(u, id, p) { const r = rows.find((x) => x.user === u && x.id === id); Object.assign(r, p); return r; }, async remove(u, id) { const i = rows.findIndex((r) => r.user === u && r.id === id); if (i < 0) return false; rows.splice(i, 1); return true; } };
};

test("job: triggers once per day, records results, reports missing channels, isolates failures", async () => {
    const s = memStore();
    store.__setStoreForTests(s);
    s.rows.push({ id: "a", user: "u1", enabled: true, kind: "rain", threshold: 60, place: { name: "Jaipur", latitude: 1, longitude: 2 }, unit: "celsius" });
    s.rows.push({ id: "b", user: "u2", enabled: true, kind: "temperature_above", threshold: 45, place: { name: "Pune", latitude: 3, longitude: 4 }, unit: "celsius" });
    s.rows.push({ id: "c", user: "u3", enabled: true, kind: "rain", threshold: 60, place: { name: "Bad", latitude: 5, longitude: 6 }, unit: "celsius" });
    s.rows.push({ id: "d", user: "u4", enabled: false, kind: "rain", place: { name: "Off", latitude: 7, longitude: 8 } });

    const sent = [];
    const notify = async (n) => { sent.push(n); return n.userId === "u1" ? [{ id: 1 }] : []; };
    const d = deps({ getOverview: async (lat) => { if (lat === 5) throw new Error("down"); return overview({ daily: [day("2026-11-11", { precipProbability: 80, precipitationSum: 12 })] }); } });

    const stats = await runDueWorkflows({ deps: d, notify, nowSec: NOW });
    assert.deepEqual(stats, { checked: 3, triggered: 1, quiet: 1, skipped: 0, failed: 1, delivered: 1 });
    assert.equal(sent.length, 1);
    assert.equal(s.rows[0].triggerCount, 1);
    assert.equal(s.rows[0].lastResult.status, "triggered");
    assert.equal(s.rows[1].lastResult.status, "quiet");
    assert.equal(s.rows[2].lastResult.status, "error");
    assert.equal(s.rows[3].runCount, undefined); // disabled workflow untouched

    const again = await runDueWorkflows({ deps: d, notify, nowSec: NOW });
    assert.equal(again.skipped, 1); // already notified today
    assert.equal(sent.length, 1);

    // a workflow that triggers but has no enabled channel says so honestly
    s.rows.push({ id: "e", user: "u5", enabled: true, kind: "rain", threshold: 60, place: { name: "Delhi", latitude: 9, longitude: 9 }, unit: "celsius" });
    await runDueWorkflows({ deps: d, notify, nowSec: NOW });
    assert.match(s.rows.find((r) => r.id === "e").lastResult.message, /No notification channel is enabled/);
});
