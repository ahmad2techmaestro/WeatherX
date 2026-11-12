/**
 * WeatherX MCP server: read-only weather tools for any MCP client (Claude Desktop, IDEs, other agents).
 * Tools return the same deterministic summaries the app uses. They expose no user data and make no changes.
 */
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const z = require("zod");

const rules = require("../services/assistant/rules");
const airIntel = require("../services/air/airIntel");
const travel = require("../services/travel/planner");
const { clean } = require("./util");

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const place = z.string().min(2).max(80).describe("Place name in India or elsewhere, e.g. 'Pune' or 'Shimla'.");
const text = (t) => ({ content: [{ type: "text", text: t }] });
const fail = (e) => ({ isError: true, content: [{ type: "text", text: e.userMessage || "Weather data isn't available right now. Please try again." }] });

/** @param {{weatherFor:(place:string)=>Promise<object>, analysisFor:(place:string)=>Promise<object>, guidanceFor:(q:string)=>Promise<object>}} deps */
const createServer = (deps) => {
    const server = new McpServer({ name: "weatherx", version: "1.0.0" }, { instructions: "Weather, air quality, heatwave/anomaly analysis, trip scoring and safety guidance for places in India and worldwide. Values are model-based estimates, not official warnings." });
    const guard = (fn) => async (args) => { try { return await fn(args); } catch (e) { if (!e.userMessage) console.error("[MCP]", e.message); return fail(e); } };

    server.registerTool("get_weather", { title: "Current weather and outlook", description: "Current conditions, next hours and a short outlook for a place, with a comparison to yesterday.", inputSchema: { place }, annotations: READ_ONLY }, guard(async ({ place: p }) => {
        const w = await deps.weatherFor(clean(p));
        return text(rules.answer(w.overview, { place: w.place, unit: "celsius", question: "Give me the weather briefing", language: "en", yesterday: w.yesterday }).text);
    }));

    server.registerTool("get_air_quality", { title: "Air quality (Indian NAQI)", description: "Indian AQI now, 24-hour trend, cleanest hours and health guidance for a place.", inputSchema: { place, sensitive_group: z.boolean().optional().describe("Use the stricter threshold for asthma, heart disease, children or older adults.") }, annotations: READ_ONLY }, guard(async ({ place: p, sensitive_group }) => {
        const w = await deps.weatherFor(clean(p));
        return text(airIntel.summary(airIntel.analyze(w.overview, { sensitive: Boolean(sensitive_group) }), w.place));
    }));

    server.registerTool("get_weather_analysis", { title: "Heatwave, anomaly and sudden-change analysis", description: "Statistical analysis for the next week: heatwave risk, unusual temperatures versus 10 years of history, trends, rain probability and sudden changes. An estimate, not an official warning.", inputSchema: { place }, annotations: READ_ONLY }, guard(async ({ place: p }) => text((await deps.analysisFor(clean(p))).explanation.text)));

    server.registerTool("plan_trip", { title: "Trip weather planner", description: "Scores each day of a trip from 0 to 100 using the forecast and lists the best day, hazards and a packing list.", inputSchema: { destination: place, nights: z.number().int().min(1).max(6).optional(), start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD, within the forecast range.") }, annotations: READ_ONLY }, guard(async ({ destination, nights, start_date }) => {
        const w = await deps.weatherFor(clean(destination));
        return text(travel.summary(travel.planFor(w, { startDate: start_date, nights: nights || 3 }), "celsius"));
    }));

    server.registerTool("search_safety_guidance", { title: "Weather safety guidance", description: "Searches summarised public guidance (heat stroke, lightning, floods, AQI, masks, UV, cold, fog, storms). Returns numbered passages with their sources. General information, not medical advice.", inputSchema: { query: z.string().min(3).max(200) }, annotations: READ_ONLY }, guard(async ({ query }) => {
        const g = await deps.guidanceFor(clean(query));
        if (!g.results.length) return text("No relevant guidance found.");
        return text(g.results.map((r, i) => `[${i + 1}] ${r.title} (${r.source}): ${r.text}`).join("\n\n"));
    }));

    return server;
};

module.exports = { createServer };
