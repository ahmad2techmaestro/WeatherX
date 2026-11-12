/**
 * Air quality intelligence from the modelled Indian AQI (NAQI) in the overview. All numbers are computed here.
 * Thresholds follow the CPCB categories and the exercise guidance in the knowledge base:
 *  - healthy adults: light activity up to NAQI 200, move hard exercise indoors above 200;
 *  - sensitive groups (asthma, heart disease, children, older adults): reduce exertion from NAQI 100.
 */
const T = { trendDelta: 20, goodMax: 100, sensitiveMax: 100, generalMax: 200 };

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const category = (v) => (v <= 50 ? "Good" : v <= 100 ? "Satisfactory" : v <= 200 ? "Moderate" : v <= 300 ? "Poor" : v <= 400 ? "Very poor" : "Severe");
const localHourOf = (t, off) => new Date((t + (off || 0)) * 1000).getUTCHours();
const hourLabel = (t, off) => { const h = localHourOf(t, off); return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`; };
const DOMINANT = { pm2_5: "fine particles (PM2.5)", pm10: "coarse dust (PM10)", no2: "nitrogen dioxide (NO2)", so2: "sulphur dioxide (SO2)", o3: "ozone (O3)", co: "carbon monoxide (CO)" };

/** @param {object} overview @param {{sensitive?:boolean}} opts */
const analyze = (overview, { sensitive = false } = {}) => {
    const aq = overview.airQuality;
    const off = overview.location?.utcOffsetSeconds || 0;
    if (!aq?.naqi) return { available: false, reason: "Air quality data isn't available for this place right now." };

    const now = aq.naqi;
    const series = (aq.hourly || []).filter((h) => Number.isFinite(h.naqi));
    const next24 = series.slice(0, 24);
    const first = next24.slice(0, 6).map((h) => h.naqi);
    const last = next24.slice(-6).map((h) => h.naqi);
    const delta = first.length >= 3 && last.length >= 3 ? Math.round(mean(last) - mean(first)) : null;
    const direction = delta === null ? "unknown" : delta >= T.trendDelta ? "worsening" : delta <= -T.trendDelta ? "improving" : "steady";

    const best = next24.reduce((m, h) => (!m || h.naqi < m.naqi ? h : m), null);
    const worst = next24.reduce((m, h) => (!m || h.naqi > m.naqi ? h : m), null);
    const limit = sensitive ? T.sensitiveMax : T.generalMax;
    const hoursOver = next24.filter((h) => h.naqi > limit).length;

    // Longest run of consecutive hours at or under the limit, in the next 24 h.
    let run = [], bestRun = [];
    for (const h of next24) {
        if (h.naqi <= limit) { run.push(h); if (run.length > bestRun.length) bestRun = [...run]; } else run = [];
    }
    const cleanWindow = bestRun.length >= 2 ? { from: hourLabel(bestRun[0].time, off), to: hourLabel(bestRun[bestRun.length - 1].time + 3600, off), hours: bestRun.length, maxNaqi: Math.max(...bestRun.map((h) => h.naqi)) } : null;

    const v = now.value;
    const verdict = {
        general: v <= T.generalMax ? (v <= T.goodMax ? "Fine for outdoor exercise." : "Light outdoor activity is fine; keep hard exercise short.") : "Move hard exercise indoors.",
        sensitive: v <= 50 ? "Fine for outdoor activity." : v <= T.sensitiveMax ? "Take it easy and watch for symptoms." : "Reduce time and effort outdoors; prefer indoors.",
    };
    const mask = v > 300 ? "A well-fitted N95/KN95 mask is advisable outdoors." : v > 200 ? "A well-fitted N95/KN95 mask helps if you must be outside for long." : null;

    return {
        available: true,
        now: { value: v, label: now.label, dominant: now.dominant, dominantName: DOMINANT[now.dominant] || now.dominant, pollutants: aq.pollutants, usAqi: aq.usAqi, advice: now.advice },
        trend: { direction, delta },
        next24h: { best: best && { hour: hourLabel(best.time, off), naqi: best.naqi }, worst: worst && { hour: hourLabel(worst.time, off), naqi: worst.naqi }, hoursOverLimit: hoursOver, limit },
        cleanWindow,
        verdict,
        mask,
        sensitiveMode: sensitive,
        series: series.slice(0, 48).map((h) => ({ time: h.time, naqi: h.naqi, label: category(h.naqi), pm2_5: h.pm2_5 })),
        caveat: "Indicative values from an atmospheric model, not a ground-station reading.",
    };
};

/** Plain-language summary, in code. */
const summary = (a, place) => {
    if (!a.available) return a.reason;
    const { now, trend, next24h, cleanWindow } = a;
    const parts = [`Air quality in ${place} is ${now.label.toLowerCase()} (NAQI ${now.value}), mainly from ${now.dominantName}.`];
    if (trend.direction !== "unknown" && trend.direction !== "steady") parts.push(`It is expected to ${trend.direction === "improving" ? "improve" : "worsen"} over the next 24 hours.`);
    if (next24h.best && next24h.worst && next24h.worst.naqi - next24h.best.naqi >= 30) parts.push(`Cleanest around ${next24h.best.hour} (NAQI ${next24h.best.naqi}), worst around ${next24h.worst.hour} (NAQI ${next24h.worst.naqi}).`);
    if (cleanWindow) parts.push(`${a.sensitiveMode ? "For sensitive people, the" : "The"} best outdoor window is ${cleanWindow.from} to ${cleanWindow.to}.`);
    else if (next24h.hoursOverLimit >= 20) parts.push(`No hour in the next day stays under NAQI ${next24h.limit}, so plan indoor exercise.`);
    parts.push(a.sensitiveMode ? a.verdict.sensitive : a.verdict.general);
    if (a.mask) parts.push(a.mask);
    return parts.join(" ");
};

module.exports = { analyze, summary, T, category };
