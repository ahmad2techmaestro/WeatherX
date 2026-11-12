/**
 * Automation triggers. Pure functions: given real forecast data (and the statistical analysis where needed) they
 * decide whether a workflow fires and write the message from the same numbers. No model decides anything here.
 */
const { tempText } = require("../notificationModel");
const airIntel = require("../air/airIntel");

const TEMPLATES = [
    { kind: "heatwave", title: "Heatwave risk", description: "Notify me when heatwave risk reaches a level at this place (IMD-style estimate).", unitLabel: "level", min: 1, max: 3, default: 2, options: [{ value: 1, label: "Watch or higher" }, { value: 2, label: "Heatwave or higher" }, { value: 3, label: "Severe only" }] },
    { kind: "rain", title: "Rain ahead", description: "Notify me when rain is likely today or tomorrow.", unitLabel: "% chance", min: 20, max: 95, default: 60 },
    { kind: "air", title: "Poor air quality", description: "Notify me when the Indian AQI reaches a level. The limit is lowered to 100 if your saved notes mention a health condition.", unitLabel: "NAQI", min: 50, max: 400, default: 200 },
    { kind: "temperature_above", title: "Hot days", description: "Notify me when a day in the next 3 days reaches a temperature.", unitLabel: "°C", min: 25, max: 50, default: 40 },
    { kind: "sudden_change", title: "Sudden weather change", description: "Notify me about sudden swings, pressure falls, gusts, rain onset or thunderstorms in the next 48 hours.", unitLabel: "level", min: 1, max: 2, default: 1, options: [{ value: 1, label: "Watch or higher" }, { value: 2, label: "Warnings only" }] },
    { kind: "anomaly", title: "Unusually hot or cold", description: "Notify me when upcoming temperatures are unusual compared with the last 10 years.", unitLabel: "level", min: 1, max: 2, default: 1, options: [{ value: 1, label: "Unusual or extreme" }, { value: 2, label: "Extreme only" }] },
    { kind: "briefing", title: "Morning agent briefing", description: "Every day at the hour you choose, the agent team writes a briefing for this place and sends it to you.", unitLabel: "hour", min: 0, max: 23, default: 7 },
];
const TEMPLATE = Object.fromEntries(TEMPLATES.map((t) => [t.kind, t]));
const NEEDS_ANALYSIS = new Set(["heatwave", "sudden_change", "anomaly"]);
const LEVEL = { watch: 1, heatwave: 2, severe: 3, warning: 2, unusual: 1, extreme: 2 };

const deltaText = (c, unit) => (unit === "fahrenheit" ? `${Math.round(c * 1.8)}°F` : `${Math.round(c * 10) / 10}°C`);
const localDate = (overview, nowSec) => new Date((nowSec + (overview.location?.utcOffsetSeconds || 0)) * 1000).toISOString().slice(0, 10);
const localHour = (overview, nowSec) => new Date((nowSec + (overview.location?.utcOffsetSeconds || 0)) * 1000).getUTCHours();
const dayName = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
const hourName = (t, off) => { const h = new Date((t + off) * 1000).getUTCHours(); return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`; };

const quiet = (message) => ({ fired: false, message });

/**
 * @returns {{fired:boolean, title?:string, message:string, kind?:string}}
 * @param {{wf:object, overview:object, analysis?:object, sensitive?:boolean, nowSec:number}} ctx
 */
const evaluate = ({ wf, overview, analysis, sensitive = false, nowSec }) => {
    const place = wf.place.name;
    const unit = wf.unit || "celsius";
    const off = overview.location?.utcOffsetSeconds || 0;
    const daily = overview.daily || [];
    const th = wf.threshold ?? TEMPLATE[wf.kind].default;

    switch (wf.kind) {
        case "heatwave": {
            const h = analysis?.findings?.heatwave;
            if (!h) return quiet("Heatwave analysis isn't available right now.");
            const lvl = LEVEL[h.level] || 0;
            if (lvl < th) return quiet(`No heatwave risk at the chosen level (currently ${h.level === "none" ? "none" : h.level}).`);
            const days = (h.qualifyingDates || []).slice(0, 3).map(dayName).join(", ");
            return { fired: true, title: `${h.level === "severe" ? "Severe heatwave" : h.level === "heatwave" ? "Heatwave" : "Heat"} risk · ${place}`, message: `${place} may see ${h.level === "watch" ? "very hot conditions" : "heatwave conditions"}${days ? ` on ${days}` : ""}${Number.isFinite(h.peak?.max) ? `, with highs near ${tempText(h.peak.max, unit)}` : ""}. This is a statistical estimate, not an official warning.` };
        }
        case "rain": {
            const next = daily.slice(0, 2);
            const day = next.reduce((m, d) => (d.precipProbability > (m?.precipProbability ?? -1) ? d : m), null);
            if (!day || day.precipProbability < th || (day.precipitationSum ?? 0) < 1) return quiet(`Rain isn't likely enough (highest chance ${day ? day.precipProbability : 0}%).`);
            return { fired: true, title: `Rain likely · ${place}`, message: `${dayName(day.date)}: ${day.precipProbability}% chance of rain, about ${Math.round(day.precipitationSum)} mm expected.` };
        }
        case "air": {
            const a = airIntel.analyze(overview, { sensitive });
            if (!a.available) return quiet(a.reason);
            const limit = sensitive ? Math.min(th, 100) : th;
            const peak = Math.max(a.now.value, ...a.series.slice(0, 12).map((p) => p.naqi));
            if (peak < limit) return quiet(`Air quality is within your limit (NAQI ${a.now.value}, limit ${limit}).`);
            return { fired: true, title: `Air quality ${a.now.label.toLowerCase()} · ${place}`, message: `NAQI is ${a.now.value} now and reaches ${peak} in the next 12 hours, above your limit of ${limit}${sensitive && limit < th ? " (lowered because of your health notes)" : ""}. ${sensitive ? a.verdict.sensitive : a.verdict.general}` };
        }
        case "temperature_above": {
            const hot = daily.slice(0, 3).filter((d) => d.temperatureMax >= th);
            if (!hot.length) return quiet(`No day in the next 3 reaches ${tempText(th, unit)}.`);
            const top = hot.reduce((m, d) => (d.temperatureMax > m.temperatureMax ? d : m));
            return { fired: true, title: `Hot day ahead · ${place}`, message: `${dayName(top.date)} is forecast to reach ${tempText(top.temperatureMax, unit)}${hot.length > 1 ? ` (${hot.length} days at or above ${tempText(th, unit)})` : ""}.` };
        }
        case "sudden_change": {
            const ev = (analysis?.findings?.suddenChanges || []).filter((e) => (LEVEL[e.severity] || 1) >= th);
            if (!ev.length) return quiet("No sudden changes expected in the next 48 hours.");
            const e = ev[0];
            const what = { temperature: "a sharp temperature swing", pressure: "a rapid pressure fall", gusts: "strong gusts", rain: "sudden heavy rain", thunderstorm: "thunderstorms" }[e.type] || "a sudden weather change";
            return { fired: true, title: `${e.severity === "warning" ? "Warning" : "Heads-up"} · ${place}`, message: `Expect ${what} around ${hourName(e.time, off)}${ev.length > 1 ? `, plus ${ev.length - 1} more change${ev.length > 2 ? "s" : ""} in the next 48 hours` : ""}.` };
        }
        case "anomaly": {
            const an = (analysis?.findings?.anomalies || []).filter((x) => x.kind === "temperature" && (LEVEL[x.level] || 1) >= th);
            if (!an.length) return quiet("Upcoming temperatures are within the usual range.");
            const top = an.reduce((m, x) => (Math.abs(x.z) > Math.abs(m.z) ? x : m));
            return { fired: true, title: `Unusually ${top.direction === "warm" ? "hot" : "cold"} · ${place}`, message: `${dayName(top.date)} may be unusually ${top.direction} for this time of year, about ${deltaText(Math.abs(top.departure), unit)} ${top.direction === "warm" ? "above" : "below"} the 10-year normal.` };
        }
        default:
            return quiet("Unknown trigger.");
    }
};

module.exports = { evaluate, TEMPLATES, TEMPLATE, NEEDS_ANALYSIS, localDate, localHour };
