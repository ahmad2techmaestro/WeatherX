/**
 * Travel weather planner. Scores each day 0-100 from the forecast with fixed, explainable rules and lists the reasons.
 * No model is involved in the numbers; a narrative may be added on top (see agents/narrate.js).
 */
const SCORE = { great: 80, good: 60, fair: 40 };

const tf = (c, unit) => (unit === "fahrenheit" ? `${Math.round(c * 1.8 + 32)}°F` : `${Math.round(c)}°C`);
const label = (s) => (s >= SCORE.great ? "Great" : s >= SCORE.good ? "Good" : s >= SCORE.fair ? "Fair" : "Poor");

/** One day's score and reasons. `naqiMax` may be null (air data only covers ~3 days). */
const scoreDay = (d, naqiMax = null, unit = "celsius") => {
    let s = 100;
    const why = [];
    const hit = (pts, text) => { s -= pts; why.push(text); };
    const tmax = d.temperatureMax, tmin = d.temperatureMin;
    const pp = d.precipProbability ?? 0, mm = d.precipitationSum ?? 0;

    if (mm >= 10 || pp >= 70) hit(25, `heavy rain likely (${mm} mm, ${pp}% chance)`);
    else if (mm >= 2.5 || pp >= 40) hit(12, `rain possible (${mm} mm, ${pp}% chance)`);
    else if (pp >= 25) hit(4, `small chance of rain (${pp}%)`);
    if (/thunder/i.test(d.label || "")) hit(20, "thunderstorms");
    if (tmax >= 42) hit(35, `extreme heat (${tf(tmax, unit)} high)`);
    else if (tmax >= 38) hit(22, `very hot (${tf(tmax, unit)} high)`);
    else if (tmax >= 34) hit(8, `hot (${tf(tmax, unit)} high)`);
    if (tmin <= 0) hit(25, `freezing nights (${tf(tmin, unit)} low)`);
    else if (tmin <= 8) hit(12, `cold nights (${tf(tmin, unit)} low)`);
    if ((d.windGustMax ?? 0) >= 60) hit(18, `strong gusts (${Math.round(d.windGustMax)} km/h)`);
    else if ((d.windGustMax ?? 0) >= 45) hit(8, `windy (${Math.round(d.windGustMax)} km/h gusts)`);
    if ((d.uvIndexMax ?? 0) >= 11) hit(8, `extreme UV (${Math.round(d.uvIndexMax)})`);
    if (naqiMax !== null) {
        if (naqiMax > 300) hit(25, `very poor air (NAQI up to ${naqiMax})`);
        else if (naqiMax > 200) hit(15, `poor air (NAQI up to ${naqiMax})`);
        else if (naqiMax > 100) hit(5, `moderate air (NAQI up to ${naqiMax})`);
    }
    s = Math.max(0, Math.min(100, s));
    return { score: s, verdict: label(s), reasons: why };
};

const packing = (days) => {
    const list = new Set();
    const maxT = Math.max(...days.map((d) => d.high)), minT = Math.min(...days.map((d) => d.low));
    if (days.some((d) => d.rainChance >= 40 || d.rainMm >= 2.5)) { list.add("Umbrella or light rain jacket"); list.add("Waterproof bag cover"); }
    if (maxT >= 34) { list.add("Water bottle and electrolytes"); list.add("Sunscreen SPF 30+ and a hat"); list.add("Light cotton clothes"); }
    if (minT <= 12) list.add("Warm layer for evenings");
    if (minT <= 5) list.add("Jacket, gloves and cap");
    if (days.some((d) => (d.uvMax ?? 0) >= 8)) list.add("Sunglasses");
    if (days.some((d) => d.naqiMax !== null && d.naqiMax > 200)) list.add("N95 mask");
    if (days.some((d) => d.gustMax >= 45)) list.add("Secure loose items; avoid open-air activities in gusts");
    if (!list.size) list.add("Light, comfortable clothes");
    return [...list];
};

/**
 * @param {{overview:object, place:string}} p
 * @param {{startDate?:string, nights?:number}} opts  nights 1-7 (days = nights + 1 capped at 7)
 */
const planFor = ({ overview, place }, { startDate, nights = 3, unit = "celsius" } = {}) => {
    const off = overview.location?.utcOffsetSeconds || 0;
    const daily = overview.daily || [];
    let from = startDate ? daily.findIndex((d) => d.date === startDate) : 0;
    if (from < 0) return { place, error: startDate && startDate < daily[0]?.date ? "That date is in the past." : `The forecast only covers up to ${daily[daily.length - 1]?.date}.` };
    const count = Math.max(1, Math.min(7, Number(nights) + 1 || 4));
    const slice = daily.slice(from, from + count);

    // Daily maximum NAQI where hourly air data exists.
    const naqiBy = {};
    for (const h of overview.airQuality?.hourly || []) {
        if (!Number.isFinite(h.naqi)) continue;
        const date = new Date((h.time + off) * 1000).toISOString().slice(0, 10);
        naqiBy[date] = Math.max(naqiBy[date] ?? 0, h.naqi);
    }

    const days = slice.map((d) => {
        const naqiMax = naqiBy[d.date] ?? null;
        const sc = scoreDay(d, naqiMax, unit);
        return { date: d.date, summary: d.label, high: d.temperatureMax, low: d.temperatureMin, rainMm: d.precipitationSum ?? 0, rainChance: d.precipProbability ?? 0, uvMax: d.uvIndexMax ?? null, gustMax: d.windGustMax ?? null, naqiMax, ...sc };
    });
    const avg = Math.round(days.reduce((s, d) => s + d.score, 0) / days.length);
    const best = days.reduce((m, d) => (d.score > m.score ? d : m), days[0]);
    const worst = days.reduce((m, d) => (d.score < m.score ? d : m), days[0]);
    const hazards = [...new Set(days.filter((d) => d.score < SCORE.fair).flatMap((d) => d.reasons))].slice(0, 4);

    return { place, nights: days.length - 1, startDate: days[0].date, endDate: days[days.length - 1].date, score: avg, verdict: label(avg), days, best: { date: best.date, score: best.score }, worst: days.length > 1 && worst.score < best.score ? { date: worst.date, score: worst.score } : null, hazards, packing: packing(days), airCoverage: days.some((d) => d.naqiMax !== null), caveat: "Forecast scores are guidance from model data; check again before you travel. Air quality is only forecast for the first few days." };
};

const dayName = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

const summary = (p, unit = "celsius") => {
    if (p.error) return `${p.place}: ${p.error}`;
    const parts = [`${p.place} looks ${p.verdict.toLowerCase()} for ${dayName(p.startDate)} to ${dayName(p.endDate)} (score ${p.score}/100).`];
    const d = p.days.find((x) => x.date === p.best.date);
    if (p.days.length > 1) parts.push(`Best day: ${dayName(p.best.date)} (${tf(d.high, unit)} high, ${d.rainChance}% rain chance).`);
    if (p.worst) parts.push(`Toughest day: ${dayName(p.worst.date)}${p.days.find((x) => x.date === p.worst.date).reasons[0] ? `, ${p.days.find((x) => x.date === p.worst.date).reasons[0]}` : ""}.`);
    if (p.hazards.length) parts.push(`Watch for: ${p.hazards.join("; ")}.`);
    parts.push(`Pack: ${p.packing.slice(0, 3).join(", ")}.`);
    return parts.join(" ");
};

module.exports = { planFor, scoreDay, summary, label, SCORE };
