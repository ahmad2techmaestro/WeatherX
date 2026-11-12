/** The specialist agents the supervisor can call. `tools` are the real data sources each one is allowed to use. */
const AGENTS = {
    weather: { key: "weather", name: "Weather Agent", role: "Current conditions, next 24 hours, 7-day outlook and a comparison with yesterday.", tools: ["Open-Meteo forecast", "Yesterday comparison"] },
    intelligence: { key: "intelligence", name: "Intelligence Agent", role: "Heatwave risk, unusual temperature, trends and sudden changes versus 10 years of history.", tools: ["Open-Meteo forecast", "ERA5 climatology", "Statistical analyzers"] },
    air: { key: "air", name: "Air Quality Agent", role: "Indian AQI now and over the next day, dominant pollutant, cleanest hours, advice for sensitive groups.", tools: ["Open-Meteo air quality", "CPCB NAQI categories"] },
    travel: { key: "travel", name: "Travel Agent", role: "Scores each travel day from the forecast, finds the best day and builds a packing list.", tools: ["Open-Meteo forecast", "Open-Meteo air quality", "Place search"] },
    research: { key: "research", name: "Research Agent", role: "Safety and how-to guidance from the knowledge base, with sources.", tools: ["Vector search over 16 guides"] },
};
const KEYS = Object.keys(AGENTS);
const MAX_AGENTS = 4;

module.exports = { AGENTS, KEYS, MAX_AGENTS };
