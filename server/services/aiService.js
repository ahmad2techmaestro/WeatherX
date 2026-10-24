/**
 * WeatherX Intelligence: a plain-language briefing and question answering.
 *
 * Two engines share one contract:
 *  - Claude (when ANTHROPIC_API_KEY is set): the model only sees a compact JSON of the real
 *    forecast and is told to answer from it alone.
 *  - Rules (always available): deterministic text built from the same numbers, so the feature
 *    works offline, costs nothing and can never invent a value.
 * If the model call fails for any reason the rules answer, and the response says which engine spoke.
 */
const axios = require("axios");
const { TTLCache } = require("../lib/cache");

const cache = new TTLCache({ ttlMs: 15 * 60 * 1000, max: 300 });

const unitFn = (unit) => (c) => (Number.isFinite(c) ? (unit === "fahrenheit" ? `${Math.round((c * 9) / 5 + 32)}°F` : `${Math.round(c)}°C`) : "–");

const hourText = (time, offset) => {
    const d = new Date((time + (offset || 0)) * 1000);
    const h = d.getUTCHours();

    return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
};

// ── Rules engine ────────────────────────────────────────────────────────────

const briefingRules = (o, place, unit) => {
    const t = unitFn(unit);
    const { current: c, daily, intelligence: ai, advisories, airQuality } = o;
    const today = daily[0];
    const off = o.location.utcOffsetSeconds;
    const parts = [];

    parts.push(`${c.label} in ${place} at ${t(c.temperature)}${Math.abs(c.feelsLike - c.temperature) >= 2 ? `, feeling like ${t(c.feelsLike)}` : ""}.`);
    parts.push(`Today ranges from ${t(today.temperatureMin)} to ${t(today.temperatureMax)}.`);

    const r = ai.rainfall;
    if (r.next24h >= 1) parts.push(`Expect about ${r.next24h} mm of rain in the next 24 hours${r.peakHour ? `, heaviest around ${hourText(r.peakHour.time, off)}` : ""}.`);
    else parts.push("It stays dry for the next 24 hours.");

    const aqi = airQuality?.naqi;
    if (aqi && aqi.value > 100) parts.push(`Air quality is ${aqi.label.toLowerCase()} (AQI ${aqi.value}), so keep long outdoor exertion short.`);

    const walk = ai.activities.find((a) => a.key === "walking");
    if (walk?.bestTime && walk.bestScore >= 60) parts.push(`The best window for being outside is around ${hourText(walk.bestTime, off)}.`);

    const others = advisories.filter((a) => a.kind !== "air");
    const warn = others.find((a) => a.severity === "warning") || others[0];
    if (warn) parts.push(`Keep in mind: ${warn.title.replace(/^[^:]+:\s*/, "").toLowerCase()}.`);

    const headline = r.next24h >= 5 ? "A wet day ahead" : today.temperatureMax >= 38 ? "A hot day ahead" : today.temperatureMax <= 12 ? "A cold day ahead" : aqi?.value > 200 ? "Air quality needs attention" : "A settled day ahead";

    return { headline, text: parts.join(" ") };
};

const INTENTS = [
    { key: "rain", re: /\b(rain|umbrella|shower|drizzle|barish|baarish|monsoon|wet)\b/i },
    { key: "air", re: /\b(air|aqi|pollution|mask|smog|dust|breath)\b/i },
    { key: "uv", re: /\b(uv|sunscreen|sunburn|sun protection)\b/i },
    { key: "wind", re: /\b(wind|gust|storm|breeze|windy)\b/i },
    { key: "exercise", re: /\b(run|running|jog|walk|walking|workout|exercise|gym|cycle|cycling|sport|play)\b/i },
    { key: "drive", re: /\b(drive|driving|travel|trip|road|fog|visibility|commute)\b/i },
    { key: "wear", re: /\b(wear|clothes|jacket|sweater|carry|pack|dress)\b/i },
    { key: "hot", re: /\b(hot|heat|temperature|warm|cold|cool|chilly|humid|humidity|feels)\b/i },
    { key: "week", re: /\b(week|tomorrow|weekend|next days?|forecast|upcoming)\b/i },
    { key: "laundry", re: /\b(laundry|clothes dry|dry clothes|drying)\b/i },
];

const answerRules = (o, place, unit, question) => {
    const t = unitFn(unit);
    const { current: c, daily, intelligence: ai, airQuality, advisories } = o;
    const off = o.location.utcOffsetSeconds;
    const key = (INTENTS.find((i) => i.re.test(question)) || {}).key;
    const act = (k) => ai.activities.find((a) => a.key === k);
    const next12 = o.hourly.slice(0, 12);

    switch (key) {
        case "laundry": {
            const a = act("laundry");
            return a?.bestScore >= 50 ? `Clothes should dry best around ${hourText(a.bestTime, off)} in ${place}. Humidity is ${c.humidity}% right now.` : `Poor drying conditions in the next 24 hours in ${place}: it is humid or wet. Indoors with a fan is the safer choice.`;
        }
        case "rain": {
            const r = ai.rainfall;
            if (r.next24h < 0.5) return `No meaningful rain is forecast for ${place} in the next 24 hours, so you can leave the umbrella at home.`;
            return `Yes, carry an umbrella. About ${r.next24h} mm is expected in ${place} over the next 24 hours${r.peakHour ? `, heaviest around ${hourText(r.peakHour.time, off)}` : ""}. The 72-hour total is ${r.next72h} mm.`;
        }
        case "air": {
            const a = airQuality?.naqi;
            return a ? `Air quality in ${place} is ${a.label.toLowerCase()} (AQI ${a.value}, indicative). ${a.advice}` : "Air quality data isn't available for this place right now.";
        }
        case "uv": {
            const peak = next12.reduce((m, h) => (h.uvIndex > (m?.uvIndex ?? -1) ? h : m), null);
            return peak && peak.uvIndex >= 3 ? `UV peaks at ${peak.uvIndex} around ${hourText(peak.time, off)} in ${place}. Use sunscreen, and prefer shade between 11 AM and 3 PM.` : `UV stays low in the next 12 hours in ${place}; sunscreen is optional.`;
        }
        case "wind": {
            const g = o.hourly.slice(0, 24).reduce((m, h) => (h.windGust > (m?.windGust ?? -1) ? h : m), null);
            return `Wind is ${c.windSpeed} km/h now. Gusts could reach ${g?.windGust} km/h around ${g ? hourText(g.time, off) : "–"}${g?.windGust >= 45 ? ", strong enough to secure loose objects" : ", which is manageable"}.`;
        }
        case "exercise": {
            const a = act("walking");
            const cy = act("cycling");
            return a?.bestScore >= 50 ? `For a walk or run in ${place}, the best time is around ${hourText(a.bestTime, off)} (score ${a.bestScore}/100). For cycling, around ${cy?.bestTime ? hourText(cy.bestTime, off) : "–"} (${cy?.bestScore ?? 0}/100).` : `Conditions are poor for outdoor exercise in the next 24 hours in ${place} (heat, rain or air quality). An indoor session is the better call.`;
        }
        case "drive": {
            const low = o.hourly.slice(0, 24).filter((h) => h.visibilityKm !== null && h.visibilityKm < 2);
            const wet = o.hourly.slice(0, 24).filter((h) => h.precipitation >= 1).length;
            const notes = [];
            if (low.length) notes.push(`visibility drops below 2 km for ${low.length} h starting about ${hourText(low[0].time, off)}`);
            if (wet) notes.push(`${wet} h of steady rain`);
            return notes.length ? `Heads-up for the road in ${place}: ${notes.join(" and ")}. Leave extra time and keep lights on.` : `Road conditions look clear in ${place} for the next 24 hours: no fog or steady rain is forecast.`;
        }
        case "wear": {
            return ai.gear.length ? `For ${place} today: ${ai.gear.join("; ").toLowerCase()}.` : `Nothing special needed in ${place}. Dress for ${t(c.feelsLike)}.`;
        }
        case "hot": {
            return `It is ${t(c.temperature)} in ${place}, feeling like ${t(c.feelsLike)} with ${c.humidity}% humidity. Heat index ${ai.heatIndex ? t(ai.heatIndex.value) : "–"}, comfort ${ai.comfort.value}/100 (${ai.comfort.label.toLowerCase()}). Today peaks at ${t(daily[0].temperatureMax)}.`;
        }
        case "week": {
            const days = ai.bestDays.filter((d) => d.score !== null);
            const best = days.reduce((m, d) => (d.score > m.score ? d : m), days[0]);
            const wetDays = daily.slice(0, 7).filter((d) => d.precipitationSum >= 2.5).length;
            return `${place} this week: highs from ${t(Math.min(...daily.slice(0, 7).map((d) => d.temperatureMax)))} to ${t(Math.max(...daily.slice(0, 7).map((d) => d.temperatureMax)))}, ${wetDays ? `${wetDays} wet day${wetDays > 1 ? "s" : ""}` : "no significant rain"}. The best day outdoors looks like ${best.date} (${best.score}/100).`;
        }
        default: {
            const b = briefingRules(o, place, unit);
            const extra = advisories.length ? "" : "";
            return `${b.text}${extra} You can ask about rain, air quality, exercise, driving, what to wear, or the week ahead.`;
        }
    }
};

// ── Claude engine ───────────────────────────────────────────────────────────

const compactContext = (o, place, unit) => ({
    place,
    unit,
    note: "All temperatures in the data are Celsius; convert to the requested unit. Wind in km/h, rain in mm, times are local hours.",
    now: o.current,
    next24h: o.hourly.slice(0, 24).filter((_, i) => i % 2 === 0).map((h) => ({ hour: hourText(h.time, o.location.utcOffsetSeconds), temp: h.temperature, feels: h.feelsLike, rainChance: h.precipProbability, rainMm: h.precipitation, windGust: h.windGust, uv: h.uvIndex, visibilityKm: h.visibilityKm })),
    days: o.daily.slice(0, 7).map((d) => ({ date: d.date, summary: d.label, high: d.temperatureMax, low: d.temperatureMin, rainMm: d.precipitationSum, uvMax: d.uvIndexMax, gustMax: d.windGustMax })),
    airQuality: o.airQuality?.naqi ? { aqi: o.airQuality.naqi.value, label: o.airQuality.naqi.label } : null,
    advisories: o.advisories.map((a) => ({ severity: a.severity, title: a.title, detail: a.detail })),
    scores: { comfort: o.intelligence.comfort, heatIndex: o.intelligence.heatIndex, wetBulb: o.intelligence.wetBulb, activities: o.intelligence.activities, rainfall: o.intelligence.rainfall, rainySpell: o.intelligence.rainySpell },
});

const SYSTEM = `You are WeatherX Intelligence, the weather assistant inside a weather app for India.
Rules:
- Use ONLY the JSON data provided. Never invent numbers, places or events. If the data cannot answer, say so plainly.
- Be concise, warm and professional: 2 to 4 sentences, no markdown, no emojis, no preamble.
- Use the requested temperature unit and local times from the data.
- Give practical advice, but do not make medical claims. Forecasts are model output and advisories are not official warnings.`;

const askClaude = async ({ o, place, unit, instruction }) => {
    const res = await axios.post(
        "https://api.anthropic.com/v1/messages",
        {
            model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
            max_tokens: 350,
            system: SYSTEM,
            messages: [{ role: "user", content: `${instruction}\n\nDATA:\n${JSON.stringify(compactContext(o, place, unit))}` }],
        },
        { headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" }, timeout: 15000 }
    );

    const text = (res.data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
    if (!text) throw new Error("Empty model response");
    return text;
};

const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

const briefing = async (o, place, unit) => {
    const key = `b:${o.location.latitude},${o.location.longitude}:${unit}:${aiEnabled()}`;

    return cache.wrap(key, async () => {
        const rules = briefingRules(o, place, unit);

        if (aiEnabled()) {
            try {
                const text = await askClaude({ o, place, unit, instruction: "Write today's briefing for this place: what to expect, one thing to plan around, and the best time outdoors if any." });
                return { headline: rules.headline, text, source: "claude" };
            } catch (error) {
                console.error("[AI] briefing fell back to rules:", error.response?.status || error.message);
            }
        }

        return { ...rules, source: "rules" };
    });
};

const ask = async (o, place, unit, question) => {
    if (aiEnabled()) {
        try {
            const text = await askClaude({ o, place, unit, instruction: `Answer this question from the user: "${question}"` });
            return { text, source: "claude" };
        } catch (error) {
            console.error("[AI] answer fell back to rules:", error.response?.status || error.message);
        }
    }

    return { text: answerRules(o, place, unit, question), source: "rules" };
};

module.exports = { briefing, ask, briefingRules, answerRules, aiEnabled };
