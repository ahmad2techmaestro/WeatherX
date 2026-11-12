const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { InMemoryTransport } = require("@modelcontextprotocol/sdk/inMemory.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { createServer } = require("../mcp/tools");
const mock = require("./mockUpstream");

const day = (date, o = {}) => ({ date, label: "Sunny", temperatureMax: 32, temperatureMin: 22, precipitationSum: 0, precipProbability: 5, uvIndexMax: 6, windGustMax: 20, ...o });
const fakeDeps = (log = []) => ({
    weatherFor: async (p) => { log.push(p); if (/nowhere/i.test(p)) throw Object.assign(new Error("x"), { userMessage: `I couldn't find a place called "${p}".` }); return { place: p, yesterday: null, overview: { location: { utcOffsetSeconds: 19800 }, current: { temperature: 30, feelsLike: 33, label: "Sunny", humidity: 40, windSpeed: 10, windDirection: 90, pressure: 1010, isDay: true, time: 1762830000 }, hourly: [], daily: [day("2026-11-11"), day("2026-11-12"), day("2026-11-13"), day("2026-11-14")], airQuality: null, advisories: [] } }; },
    analysisFor: async (p) => { log.push(p); return { explanation: { text: `Analysis for ${p}.` } }; },
    guidanceFor: async () => ({ results: [{ id: "x", title: "Heat", source: "WHO", text: "Move to a cool place." }] }),
});

const connect = async (deps) => {
    const server = createServer(deps);
    const client = new Client({ name: "test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    return client;
};

test("MCP: lists five read-only tools with schemas", async () => {
    const client = await connect(fakeDeps());
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ["get_air_quality", "get_weather", "get_weather_analysis", "plan_trip", "search_safety_guidance"]);
    assert.ok(tools.every((t) => t.annotations.readOnlyHint === true && t.annotations.destructiveHint === false));
    assert.deepEqual(tools.find((t) => t.name === "plan_trip").inputSchema.required, ["destination"]);
});

test("MCP: tools return summaries; input is cleaned; errors are safe", async () => {
    const log = [];
    const client = await connect(fakeDeps(log));
    const call = (name, args) => client.callTool({ name, arguments: args });

    assert.equal((await call("get_weather_analysis", { place: "  Pune\n\t" })).content[0].text, "Analysis for Pune.");
    assert.equal(log[0], "Pune");
    assert.match((await call("plan_trip", { destination: "Goa", nights: 2 })).content[0].text, /Goa looks (great|good)/);
    assert.match((await call("search_safety_guidance", { query: "heat stroke" })).content[0].text, /^\[1\] Heat \(WHO\)/);
    assert.match((await call("get_air_quality", { place: "Pune" })).content[0].text, /isn't available/);

    const miss = await call("get_weather", { place: "Nowhere" });
    assert.equal(miss.isError, true);
    assert.match(miss.content[0].text, /couldn't find a place/);

    // schema validation: too short, wrong type, out of range
    for (const [name, args] of [["get_weather", { place: "x" }], ["plan_trip", { destination: "Goa", nights: 99 }], ["plan_trip", { destination: "Goa", start_date: "tomorrow" }]]) {
        const r = await call(name, args).catch((e) => ({ isError: true, thrown: e }));
        assert.equal(r.isError, true, `${name} ${JSON.stringify(args)}`);
    }
});

test("MCP: the real stdio server answers using the (mock) weather upstream", async () => {
    const upstream = await mock.start(0);
    const root = `http://127.0.0.1:${upstream.address().port}`;
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: [path.join(__dirname, "..", "mcp", "server.js")],
        env: { ...process.env, OPEN_METEO_FORECAST_URL: `${root}/v1/forecast`, OPEN_METEO_ARCHIVE_URL: `${root}/v1/archive`, OPEN_METEO_AIR_QUALITY_URL: `${root}/v1/air-quality`, OPEN_METEO_GEOCODING_URL: `${root}/v1/search`, PHOTON_URL: `${root}/photon`, NOMINATIM_URL: `${root}/nominatim`, UPSTREAM_TIMEOUT_MS: "3000", RAG_EMBEDDINGS: "local", GEMINI_API_KEY: "" },
        stderr: "ignore",
    });
    const client = new Client({ name: "e2e", version: "1" });
    try {
        await client.connect(transport);
        const w = await client.callTool({ name: "get_weather", arguments: { place: "Pune" } });
        assert.ok(!w.isError, w.content[0].text);
        assert.match(w.content[0].text, /Pune/);
        const air = await client.callTool({ name: "get_air_quality", arguments: { place: "Pune" } });
        assert.ok(!air.isError, air.content[0].text);
        assert.match(air.content[0].text, /Air quality in Pune/);
        const guide = await client.callTool({ name: "search_safety_guidance", arguments: { query: "How do I recognise heat stroke?" } });
        assert.match(guide.content[0].text, /Heat exhaustion and heat stroke/);
        const trip = await client.callTool({ name: "plan_trip", arguments: { destination: "Jaipur", nights: 2 } });
        assert.match(trip.content[0].text, /Jaipur looks/);
    } finally {
        await client.close();
        upstream.close();
    }
});
