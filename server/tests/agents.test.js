const test = require("node:test");
const assert = require("node:assert/strict");

const supervisor = require("../services/agents/supervisor");
const { run } = require("../services/agents/graph");
const airIntel = require("../services/air/airIntel");
const travel = require("../services/travel/planner");
const { __setGeminiForTests } = require("../services/assistant/gemini");
const runs = require("../services/agents/runs");

test.beforeEach(() => { delete process.env.GEMINI_API_KEY; });
test.afterEach(() => __setGeminiForTests(null));

// ── supervisor routing ────────────────────────────────────────────────────────
test("supervisor rules: travel, air, intelligence, research, default weather", () => {
    const p = (g) => supervisor.rulePlan(g);
    assert.deepEqual(p("Plan a trip to Goa or Manali this weekend").agents, ["travel"]);
    assert.deepEqual(p("Plan a trip to Goa or Manali this weekend").places, ["Goa", "Manali"]);
    assert.equal(p("Plan a trip to Goa or Manali this weekend").when, "weekend");
    assert.equal(p("3 day trip to Jaipur").nights, 2);
    assert.equal(p("2 nights in Shimla trip").nights, 2);
    assert.ok(p("Is the air safe for my asthma?").agents.includes("air"));
    assert.ok(p("Is a heatwave coming?").agents.includes("intelligence"));
    assert.deepEqual(p("How do I recognise heat stroke?").agents, ["research"]);
    assert.deepEqual(p("Will it rain tomorrow?").agents, ["weather"]);
    assert.deepEqual(p("trip please").agents, ["weather"]); // travel without a destination is not routed
});

test("supervisor: model plan is validated against the whitelist; nonsense falls back to rules", async () => {
    process.env.GEMINI_API_KEY = "x";
    __setGeminiForTests(async () => ({ text: '```json\n{"agents":["air","hacker","air"],"places":["Pune"],"nights":99,"reason":"x"}\n```', calls: [], content: {} }));
    let plan = await supervisor.plan("What is the air like in Pune?");
    assert.equal(plan.engine, "gemini");
    assert.deepEqual(plan.agents, ["air"]);
    assert.equal(plan.nights, 7);

    __setGeminiForTests(async () => ({ text: '{"agents":["travel"],"places":[]}', calls: [], content: {} })); // travel without destination
    assert.equal((await supervisor.plan("Will it rain tomorrow?")).engine, "rules");
    __setGeminiForTests(async () => ({ text: "I think weather", calls: [], content: {} }));
    assert.equal((await supervisor.plan("Will it rain tomorrow?")).engine, "rules");
    __setGeminiForTests(async () => { throw new Error("quota"); });
    assert.equal((await supervisor.plan("Will it rain tomorrow?")).engine, "rules");
});

// ── air intelligence ─────────────────────────────────────────────────────────
const T0 = Date.UTC(2026, 10, 10, 0, 30) / 1000;
const air = (fn) => ({ naqi: { value: 250, label: "Poor", dominant: "pm2_5", advice: "x" }, pollutants: { pm2_5: 120 }, usAqi: 170, hourly: Array.from({ length: 72 }, (_, i) => ({ time: T0 + i * 3600, naqi: fn(i), pm2_5: 50 })) });
const ov = (a, daily) => ({ location: { utcOffsetSeconds: 19800 }, airQuality: a, daily });

test("air: trend, best and worst hour, clean window, verdicts, mask", () => {
    const a = airIntel.analyze(ov(air((i) => (i < 12 ? 320 : 120)), []));
    assert.equal(a.available, true);
    assert.equal(a.trend.direction, "improving");
    assert.equal(a.next24h.worst.naqi, 320);
    assert.equal(a.next24h.best.naqi, 120);
    assert.ok(a.cleanWindow.hours >= 12);
    assert.equal(a.mask, "A well-fitted N95/KN95 mask helps if you must be outside for long.");
    assert.match(a.verdict.general, /indoors/);

    const worse = airIntel.analyze(ov(air((i) => 100 + i * 5), []));
    assert.equal(worse.trend.direction, "worsening");
    assert.equal(airIntel.analyze(ov(air(() => 90), [])).trend.direction, "steady");
    assert.match(airIntel.summary(a, "Delhi"), /Delhi.*poor \(NAQI 250\).*fine particles/);
});

test("air: sensitive mode uses the stricter limit; missing data is reported not invented", () => {
    const h = air((i) => (i % 2 ? 150 : 90));
    const general = airIntel.analyze(ov(h, []));
    const sens = airIntel.analyze(ov(h, []), { sensitive: true });
    assert.equal(general.next24h.limit, 200);
    assert.equal(sens.next24h.limit, 100);
    assert.ok(sens.next24h.hoursOverLimit > general.next24h.hoursOverLimit);
    assert.equal(sens.sensitiveMode, true);
    const none = airIntel.analyze({ location: {}, airQuality: null, daily: [] });
    assert.equal(none.available, false);
    assert.match(airIntel.summary(none, "X"), /isn't available/);
});

// ── travel planner ───────────────────────────────────────────────────────────
const day = (date, o = {}) => ({ date, label: "Sunny", temperatureMax: 30, temperatureMin: 20, precipitationSum: 0, precipProbability: 5, uvIndexMax: 6, windGustMax: 20, ...o });

test("travel: day scoring is rule-based with reasons", () => {
    assert.equal(travel.scoreDay(day("d")).score, 100);
    const rain = travel.scoreDay(day("d", { precipitationSum: 15, precipProbability: 80 }));
    assert.equal(rain.score, 75);
    assert.match(rain.reasons[0], /heavy rain/);
    const bad = travel.scoreDay(day("d", { temperatureMax: 43, precipitationSum: 12, precipProbability: 90, label: "Thunderstorm" }), 320);
    assert.ok(bad.score < 40 && bad.verdict === "Poor");
    assert.match(travel.scoreDay(day("d", { temperatureMax: 41 }), null, "fahrenheit").reasons[0], /106°F/);
    assert.equal(travel.scoreDay(day("d"), 150).score, 95);
});

test("travel: plan picks best/worst day, packing list, honours start date and bounds", () => {
    const overview = { location: { utcOffsetSeconds: 19800 }, airQuality: null, daily: [day("2026-11-10"), day("2026-11-11", { precipitationSum: 20, precipProbability: 90, temperatureMax: 36 }), day("2026-11-12"), day("2026-11-13"), day("2026-11-14", { temperatureMin: 3 })] };
    const p = travel.planFor({ overview, place: "Shimla" }, { nights: 3 });
    assert.equal(p.days.length, 4);
    assert.equal(p.worst.date, "2026-11-11");
    assert.ok(["2026-11-10", "2026-11-12", "2026-11-13"].includes(p.best.date));
    assert.ok(p.packing.includes("Umbrella or light rain jacket"));
    assert.equal(p.airCoverage, false);
    assert.match(travel.summary(p), /Shimla looks/);

    const later = travel.planFor({ overview, place: "Shimla" }, { startDate: "2026-11-12", nights: 5 });
    assert.equal(later.days.length, 3); // forecast ends on the 14th
    assert.ok(later.packing.includes("Jacket, gloves and cap"));
    assert.match(travel.planFor({ overview, place: "X" }, { startDate: "2026-12-30" }).error, /only covers up to 2026-11-14/);
    assert.match(travel.planFor({ overview, place: "X" }, { startDate: "2026-11-01" }).error, /past/);
});

// ── graph ────────────────────────────────────────────────────────────────────
const okDeps = (calls = []) => ({
    weatherFor: async (place) => { calls.push(`weather:${place}`); throw Object.assign(new Error("down"), { userMessage: "The weather service is temporarily unavailable." }); },
    analysisFor: async () => { calls.push("analysis"); return { place: "Pune", explanation: { headline: "h", text: "Pune may see a unusually warm spell, 5 degrees above normal.", source: "rules" } }; },
    guidanceFor: async () => { calls.push("guidance"); return { results: [{ id: "heat-illness", title: "Heat", source: "WHO", text: "Move to a cool place and call 112." }] }; },
});

test("graph: single agent answers directly, trace has supervisor, agent and synthesizer in order", async () => {
    runs.__clear();
    const r = await run({ goal: "How do I recognise heat stroke?", deps: okDeps() });
    assert.equal(r.answer, "Move to a cool place and call 112. (WHO)");
    assert.deepEqual(r.steps.map((s) => s.agent), ["supervisor", "research", "synthesizer"]);
    assert.equal(r.engine, "rules");
});

test("graph: agents run in parallel, one failing agent does not stop the others and is reported", async () => {
    const calls = [];
    const r = await run({ goal: "Is a heatwave coming? Is it safe to go out?", deps: okDeps(calls) });
    assert.ok(r.plan.agents.includes("weather") && r.plan.agents.includes("intelligence") && r.plan.agents.includes("research"));
    const w = r.steps.find((s) => s.agent === "weather");
    assert.equal(w.status, "error");
    assert.equal(w.error, "The weather service is temporarily unavailable.");
    assert.equal(r.steps.find((s) => s.agent === "intelligence").status, "ok");
    assert.match(r.answer, /Pune may see/);
    assert.match(r.answer, /Weather Agent couldn't help: The weather service is temporarily unavailable\./);
});

test("graph: all agents failing gives an honest message, never an invented answer", async () => {
    const deps = { weatherFor: async () => { throw new Error("x"); }, analysisFor: async () => { throw new Error("x"); }, guidanceFor: async () => { throw new Error("x"); } };
    const r = await run({ goal: "Will it rain tomorrow?", deps });
    assert.match(r.answer, /couldn't help/);
    assert.equal(r.steps.find((s) => s.agent === "weather").status, "error");
});

test("graph: Gemini merge is used only when numbers are grounded in the findings", async () => {
    process.env.GEMINI_API_KEY = "x";
    const plan = '{"agents":["intelligence","research"],"places":[],"reason":"both"}';
    const merged = (text) => async ({ system }) => (/supervisor/.test(system) ? { text: plan, calls: [], content: {} } : { text, calls: [], content: {} });

    __setGeminiForTests(merged("Pune may be unusually warm, 5 degrees above normal. Move to a cool place and call 112 if you feel unwell."));
    let r = await run({ goal: "Heat risk and what to do", deps: okDeps() });
    assert.equal(r.engine, "gemini");
    assert.equal(r.plan.engine, "gemini");

    __setGeminiForTests(merged("Pune will hit 47 degrees tomorrow, so stay inside.")); // 47 is not in the findings
    r = await run({ goal: "Heat risk and what to do", deps: okDeps() });
    assert.equal(r.engine, "rules");
    assert.match(r.answer, /Move to a cool place/);
});

test("graph: rejects goals that are too short", async () => {
    await assert.rejects(run({ goal: "hi", deps: okDeps() }), (e) => e.status === 400);
});

test("run history keeps per-user runs and per-agent stats", () => {
    runs.__clear();
    runs.record({ id: "a", user: "u1", steps: [{ agent: "supervisor", ms: 1, status: "ok" }, { agent: "air", ms: 100, status: "ok" }, { agent: "weather", ms: 50, status: "error" }] });
    runs.record({ id: "b", user: "u2", steps: [] });
    assert.equal(runs.recent("u1").length, 1);
    assert.equal(runs.recent("u1")[0].user, undefined);
    assert.deepEqual(runs.stats("u1").agents.weather, { runs: 1, errors: 1, avgMs: 50 });
});
