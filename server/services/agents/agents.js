/** The specialist agents. Each returns { summary, data }: a plain-language summary built in code and the facts behind it. */
const rules = require("../assistant/rules");
const airIntel = require("../air/airIntel");
const travel = require("../travel/planner");

const needPlace = () => Object.assign(new Error("Tell me which place you mean."), { userMessage: "Tell me which place you mean." });

const weather = async (ctx) => {
    const w = await ctx.deps.weatherFor(ctx.places[0] || null);
    const { text, intent } = rules.answer(w.overview, { place: w.place, unit: ctx.unit, question: ctx.goal, language: ctx.lang, yesterday: w.yesterday });
    return { summary: text, data: { place: w.place, intent } };
};

const intelligence = async (ctx) => {
    const a = await ctx.deps.analysisFor(ctx.places[0] || null);
    return { summary: a.explanation.text, data: { place: a.place, headline: a.explanation.headline, source: a.explanation.source } };
};

const air = async (ctx) => {
    const w = await ctx.deps.weatherFor(ctx.places[0] || null);
    const a = airIntel.analyze(w.overview, { sensitive: ctx.memories.some((m) => m.kind === "health") });
    return { summary: airIntel.summary(a, w.place), data: { place: w.place, available: a.available, naqi: a.now?.value ?? null, sensitiveMode: a.sensitiveMode } };
};

const research = async (ctx) => {
    const g = await ctx.deps.guidanceFor(ctx.goal);
    if (!g.results.length) return { summary: "No relevant safety guidance was found for that question.", data: { sources: [] } };
    const top = g.results[0];
    return { summary: `${top.text} (${top.source})`, data: { sources: g.results.map((r) => ({ id: r.id, title: r.title, source: r.source })) } };
};

const nextWeekend = (daily) => daily.find((d) => new Date(`${d.date}T00:00:00Z`).getUTCDay() === 6)?.date;

const travelAgent = async (ctx) => {
    if (!ctx.places.length) throw needPlace();
    const plans = [];
    for (const p of ctx.places.slice(0, 3)) {
        try {
            const w = await ctx.deps.weatherFor(p);
            const startDate = ctx.when === "weekend" ? nextWeekend(w.overview.daily) : undefined;
            plans.push(travel.planFor(w, { startDate, nights: ctx.nights || 3, unit: ctx.unit }));
        } catch (e) {
            plans.push({ place: p, error: e.userMessage || "weather isn't available for it right now." });
        }
    }
    const ok = plans.filter((p) => !p.error).sort((a, b) => b.score - a.score);
    const lines = plans.map((p) => travel.summary(p, ctx.unit));
    if (ok.length > 1) lines.unshift(`Best of ${ok.length} for these dates: ${ok[0].place} (score ${ok[0].score}/100).`);
    return { summary: lines.join(" "), data: { plans: plans.map((p) => (p.error ? { place: p.place, error: p.error } : { place: p.place, score: p.score, verdict: p.verdict, start: p.startDate, end: p.endDate })) } };
};

module.exports = { weather, intelligence, air, research, travel: travelAgent };
