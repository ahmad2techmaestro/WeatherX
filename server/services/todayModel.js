/**
 * What the Today page shows beyond raw numbers: visibility and fog risk, a short rain outlook,
 * the UV picture for the next 24 hours and the best window to be outdoors. Pure functions on the
 * overview payload; everything is derived from forecast data and labelled as guidance.
 */
const isNum = (v) => Number.isFinite(v);
const HOUR = 3600;

const visLevel = (km) => (km >= 10 ? ["Excellent", "good"] : km >= 5 ? ["Good", "good"] : km >= 2 ? ["Moderate", "ok"] : km >= 1 ? ["Poor", "warn"] : ["Very poor", "bad"]);

const hourOf = (t, offset) => new Date((t + offset) * 1000).getUTCHours();
const clock = (t, offset) => {
    const h = hourOf(t, offset);

    return `${h % 12 === 0 ? 12 : h % 12} ${h >= 12 ? "PM" : "AM"}`;
};

/** Visibility now and over the next 24 h, with fog, mist and haze windows. */
const visibility = (overview) => {
    const { current, hourly, airQuality, location } = overview;
    const offset = location.utcOffsetSeconds || 0;
    const next = hourly.slice(0, 24);
    const km = isNum(current.visibilityKm) ? current.visibilityKm : next[0]?.visibilityKm;

    if (!isNum(km)) return null;

    const [label, tone] = visLevel(km);
    const series = next.map((h) => ({ time: h.time, km: isNum(h.visibilityKm) ? h.visibilityKm : null }));
    const lowest = series.filter((s) => s.km !== null).reduce((b, s) => (!b || s.km < b.km ? s : b), null);
    const dusty = isNum(airQuality?.pollutants?.pm2_5) && airQuality.pollutants.pm2_5 >= 90;

    const risky = next.map((h) => {
        const spread = isNum(h.temperature) && isNum(h.dewPoint) ? h.temperature - h.dewPoint : null;
        const damp = (h.humidity ?? 0) >= 93 && spread !== null && spread <= 1.5 && (h.windSpeed ?? 0) <= 10;
        const low = isNum(h.visibilityKm) && h.visibilityKm < 2;

        return low || damp ? { time: h.time, km: h.visibilityKm, cause: (h.humidity ?? 0) >= 90 ? "fog" : dusty ? "haze" : "mist" } : null;
    });

    const windows = [];

    risky.forEach((r, i) => {
        if (!r) return;

        const last = windows[windows.length - 1];

        if (last && last.endIndex === i - 1) {
            last.endIndex = i;
            last.end = r.time + HOUR;
            last.minKm = Math.min(last.minKm ?? Infinity, isNum(r.km) ? r.km : Infinity);
        } else windows.push({ start: r.time, end: r.time + HOUR, endIndex: i, minKm: isNum(r.km) ? r.km : null, cause: r.cause });
    });

    const clean = windows.map(({ start, end, minKm, cause }) => ({ start, end, minKm: Number.isFinite(minKm) ? Math.round(minKm * 10) / 10 : null, cause }));
    const first = clean[0];
    const worst = lowest && lowest.km < 1 ? lowest : null;

    let headline;
    let advice;

    if (first && first.start > current.time + HOUR / 2) {
        headline = `${first.cause === "fog" ? "Fog" : first.cause === "haze" ? "Haze" : "Mist"} likely from ${clock(first.start, offset)}`;
        advice = worst ? `Visibility may drop to ${Math.round(worst.km * 10) / 10} km. Leave extra distance if you are driving.` : "Visibility may reduce for a few hours.";
    } else if (km < 1) {
        headline = "Dense fog right now";
        advice = "Use fog lights, slow down and keep well back from the vehicle ahead.";
    } else if (km < 5) {
        headline = km < 2 ? "Poor visibility" : "Hazy conditions";
        advice = km < 2 ? "Take extra care on the road." : "Distant views will look washed out.";
    } else {
        headline = km >= 10 ? "Clear view" : "Good visibility";
        advice = clean.length ? "Brief mist is possible later, otherwise clear." : "No fog or haze expected in the next 24 hours.";
    }

    return { current: { km: Math.round(km * 10) / 10, label, tone }, headline, advice, series, lowest, windows: clean };
};

const wet = (h) => (h.precipitation ?? 0) >= 0.2 || (h.precipProbability ?? 0) >= 50;

/** Next 12 hours of rain: one plain sentence plus the bars behind it. */
const rainOutlook = (overview) => {
    const { hourly, location } = overview;
    const offset = location.utcOffsetSeconds || 0;
    const next = hourly.slice(0, 12);

    if (!next.length) return null;

    const bars = next.map((h) => ({ time: h.time, prob: Math.round(h.precipProbability ?? 0), mm: Math.round((h.precipitation ?? 0) * 10) / 10 }));
    const totalMm = Math.round(next.reduce((s, h) => s + (h.precipitation || 0), 0) * 10) / 10;
    const firstWet = next.findIndex(wet);
    const peak = bars.reduce((b, x) => (x.mm > (b?.mm ?? 0) ? x : b), null);

    let headline;

    if (firstWet === 0) {
        let end = 0;

        while (end + 1 < next.length && wet(next[end + 1])) end += 1;

        headline = end + 1 >= next.length ? "Rain continues through the next 12 hours" : `Rain now, easing around ${clock(next[end].time + HOUR, offset)}`;
    } else if (firstWet > 0) {
        headline = `Rain expected around ${clock(next[firstWet].time, offset)}`;
    } else {
        headline = "Dry for the next 12 hours";
    }

    return { headline, totalMm, peak: peak && peak.mm >= 0.5 ? peak : null, bars, firstWetInHours: firstWet };
};

/** UV over the next 24 hours, the peak, and when sun protection is advised (UV 3 and above). */
const uv = (overview) => {
    const { hourly, location } = overview;
    const offset = location.utcOffsetSeconds || 0;
    const next = hourly.slice(0, 24);
    const series = next.map((h) => ({ time: h.time, uv: isNum(h.uvIndex) ? Math.round(h.uvIndex * 10) / 10 : 0 }));
    const peak = series.reduce((b, s) => (s.uv > (b?.uv ?? -1) ? s : b), null);

    if (!peak) return null;

    const protect = series.filter((s) => s.uv >= 3);
    const window = protect.length ? { start: protect[0].time, end: protect[protect.length - 1].time + HOUR } : null;
    const level = peak.uv < 3 ? "Low" : peak.uv < 6 ? "Moderate" : peak.uv < 8 ? "High" : peak.uv < 11 ? "Very high" : "Extreme";

    return {
        peak,
        level,
        window,
        series,
        headline: peak.uv < 3 ? "No sun protection needed" : `Protect your skin ${clock(window.start, offset)} to ${clock(window.end, offset)}`,
    };
};

/** Best two to three daytime hours in the next 24 h for being outdoors (walking and cycling scores). */
const outside = (overview, activityScores) => {
    const { hourly, airQuality } = overview;
    const naqi = airQuality?.naqi || null;
    const next = hourly.slice(0, 24).map((h) => ({ h, score: (activityScores(h, naqi).walking + activityScores(h, naqi).cycling) / 2 }));
    let best = null;

    for (let i = 0; i + 2 < next.length; i += 1) {
        const win = next.slice(i, i + 3);

        if (!win.every((x) => x.h.isDay)) continue;

        const avg = win.reduce((s, x) => s + x.score, 0) / 3;

        if (!best || avg > best.avg) best = { start: win[0].h.time, end: win[2].h.time + HOUR, avg: Math.round(avg) };
    }

    return best && best.avg >= 40 ? best : null;
};

const buildToday = (overview, { activityScores }) => ({
    visibility: visibility(overview),
    rain: rainOutlook(overview),
    uv: uv(overview),
    outside: outside(overview, activityScores),
});

module.exports = { buildToday, visibility, rainOutlook, uv, outside, visLevel };
