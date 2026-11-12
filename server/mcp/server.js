#!/usr/bin/env node
/**
 * Runs the WeatherX MCP server over stdio:  npm run mcp
 * stdout is reserved for the protocol, so all logging goes to stderr.
 * Needs no database and no API key (Open-Meteo is keyless). Set RAG_EMBEDDINGS=local to avoid any Gemini call.
 */
console.log = (...a) => console.error(...a);
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");

const { createServer } = require("./tools");
const { makeWeatherFor, makeAnalysisFor } = require("../services/assistant/weatherSource");
const rag = require("../services/rag/rag");

const HERE = { latitude: 20.5937, longitude: 78.9629, name: "India" }; // unused: every tool requires a place name

const main = async () => {
    const server = createServer({ weatherFor: makeWeatherFor(HERE), analysisFor: makeAnalysisFor(HERE, "celsius"), guidanceFor: (q) => rag.retrieve(q, 3) });
    await server.connect(new StdioServerTransport());
    console.error("[WeatherX MCP] ready on stdio");
};

main().catch((e) => { console.error("[WeatherX MCP] failed to start:", e.message); process.exit(1); });
