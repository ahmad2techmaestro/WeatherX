/** Real dependencies for the automation engine (weather, analysis, health notes, agent team). */
const memory = require("../rag/memory");

const realDeps = () => ({
    // Loaded lazily: the weather providers read their upstream URLs from the environment when first required.
    getOverview: (lat, lon) => require("../forecastService").getOverview(lat, lon),
    getAnalysis: (args) => require("../prediction/service").getAnalysis(args),
    isSensitive: async (userId) => (await memory.list(userId).catch(() => [])).some((m) => m.kind === "health"),
    runAgents: async ({ goal, wf, here }) => {
        const { run } = require("../agents/graph");
        const { makeWeatherFor, makeAnalysisFor } = require("../assistant/weatherSource");
        const rag = require("../rag/rag");
        const memories = await memory.recall(wf.user, goal).catch(() => []);
        return run({ goal, unit: wf.unit || "celsius", language: "auto", memories, deps: { weatherFor: makeWeatherFor(here), analysisFor: makeAnalysisFor(here, wf.unit || "celsius"), guidanceFor: (q) => rag.retrieve(q, 3) } });
    },
});

module.exports = { realDeps };
