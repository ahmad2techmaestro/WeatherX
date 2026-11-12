/**
 * Runs one workflow: fetch real data, evaluate the trigger, and (unless dry-run) say what to notify.
 * Persistence and delivery are done by the caller (job or API), so this stays easy to test.
 */
const { evaluate, TEMPLATE, NEEDS_ANALYSIS, localDate, localHour } = require("./triggers");

/**
 * @param {object} wf
 * @param {{getOverview:Function, getAnalysis:Function, isSensitive:(userId:string)=>Promise<boolean>, runAgents:Function}} deps
 * @param {{dryRun?:boolean, nowSec?:number}} opts
 * @returns {Promise<{status:'triggered'|'quiet'|'skipped'|'error', message:string, notification?:object, date?:string}>}
 */
const runWorkflow = async (wf, deps, { dryRun = false, nowSec = Math.floor(Date.now() / 1000) } = {}) => {
    try {
        const overview = await deps.getOverview(wf.place.latitude, wf.place.longitude, wf.user && String(wf.user));
        const date = localDate(overview, nowSec);
        if (!dryRun && wf.lastTriggeredDate === date) return { status: "skipped", message: "Already notified today.", date };

        const url = "/ai/alerts";
        const base = { userId: wf.user, type: "smart_alert", metadata: { kind: wf.kind, workflow: String(wf.id), place: wf.place.name, url } };

        if (wf.kind === "briefing") {
            const hour = wf.hourLocal ?? TEMPLATE.briefing.default;
            if (!dryRun && localHour(overview, nowSec) < hour) return { status: "quiet", message: `Waiting for ${String(hour).padStart(2, "0")}:00 local time.`, date };
            const goal = wf.goal || "Give me a morning briefing for today.";
            const out = await deps.runAgents({ goal, wf, here: { latitude: wf.place.latitude, longitude: wf.place.longitude, name: wf.place.name } });
            const message = out.answer;
            return { status: "triggered", message, date, notification: { ...base, title: `Morning briefing · ${wf.place.name}`, message, dedupeKey: `wf:${wf.id}:${date}` } };
        }

        const sensitive = wf.kind === "air" ? await deps.isSensitive(wf.user) : false;
        const analysis = NEEDS_ANALYSIS.has(wf.kind) ? await deps.getAnalysis({ latitude: wf.place.latitude, longitude: wf.place.longitude, name: wf.place.name, unit: "celsius" }) : null;
        const r = evaluate({ wf, overview, analysis, sensitive, nowSec });
        if (!r.fired) return { status: "quiet", message: r.message, date };
        return { status: "triggered", message: r.message, date, notification: { ...base, title: r.title, message: r.message, dedupeKey: `wf:${wf.id}:${date}` } };
    } catch (e) {
        return { status: "error", message: e.userMessage || "Couldn't get weather data for this check." };
    }
};

module.exports = { runWorkflow };
