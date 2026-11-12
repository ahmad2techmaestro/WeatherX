/**
 * Weather prediction & anomaly analysis. EVERYTHING here is deterministic statistics over real data:
 *  - the forecast itself comes from the weather model (Open-Meteo NWP), never from an LLM;
 *  - "normal" comes from ERA5 reanalysis for the same time of year over previous years;
 *  - thresholds are explicit and exported, so every finding can be traced to a number.
 * The LLM (see explain.js / service.js) only puts these findings into words.
 */
const { mean, std, slope, percentileRank, quantile, round, dayOfYear, addDaysISO } = require("./stats");
const climatology = require("./climatology");

const T = {
    anomalyZ: 1.5, extremeZ: 2, minDepartureC: 2, stdFloorC: 1,
    trendDeltaC: 1.5,
    sudden: { tempSwing6h: 8, tempSwingWarn: 12, pressureDrop6h: 4, pressureDropWarn: 6, gustWatch: 50, gustWarn: 65, gustJump3h: 25, rainHourWatch: 5, rainHourWarn: 10 },
    heat: { plains: { minTemp: 40, absolute: 45, severeAbsolute: 47, departure: 4.5, severeDeparture: 6.5 }, hills: { minTemp: 30, absolute: null, severeAbsolute: null, departure: 4.5, severeDeparture: 6.5 }, hillsAboveM: 1000 },
};

const localISO = (time, off) => new Date((time + (off || 0)) * 1000).toISOString().slice(0, 10);

/* ── temperature vs normal, per forecast day ─────────────────────────────── */
const temperatureVsNormal = (daily, clim) =>
    daily.slice(0, 7).map((d) => {
        const c = clim ? clim.forDate(d.date) : null;
        const entry = { date: d.date, max: d.temperatureMax, min: d.temperatureMin, normal: null, p10: null, p90: null, departure: null, z: null, percentile: null };
        if (!c) return entry;
        const sd = Math.max(c.tmaxStd, T.stdFloorC);
        return { ...entry, normal: round(c.tmaxMean), p10: round(c.tmaxP10), p90: round(c.tmaxP90), departure: round(d.temperatureMax - c.tmaxMean), z: round((d.temperatureMax - c.tmaxMean) / sd, 2), percentile: percentileRank(c.tmax, d.temperatureMax) };
    });

const temperatureAnomalies = (rows) =>
    rows
        .filter((r) => r.z !== null && Math.abs(r.z) >= T.anomalyZ && Math.abs(r.departure) >= T.minDepartureC)
        .map((r) => ({ kind: "temperature", date: r.date, direction: r.departure > 0 ? "warm" : "cool", level: Math.abs(r.z) >= T.extremeZ ? "extreme" : "unusual", value: r.max, normal: r.normal, departure: r.departure, z: r.z, percentile: r.percentile }));

/* ── trend ───────────────────────────────────────────────────────────────── */
const trend = (recent, daily, clim, today) => {
    const out = { recent: null, forecast: null };
    const t = recent?.time || [];
    const rows = [];
    for (let i = 0; i < t.length; i++) {
        if (t[i] >= today) continue;
        const hi = recent.temperature_2m_max?.[i], lo = recent.temperature_2m_min?.[i];
        if (Number.isFinite(hi) && Number.isFinite(lo)) rows.push({ date: t[i], max: hi, mean: (hi + lo) / 2 });
    }
    if (rows.length >= 14) {
        const last7 = rows.slice(-7), prev7 = rows.slice(-14, -7);
        const delta = mean(last7.map((r) => r.mean)) - mean(prev7.map((r) => r.mean));
        const sl = slope(rows.slice(-21).map((r) => r.mean));
        out.recent = { days: rows.length, last7Mean: round(mean(last7.map((r) => r.mean))), previous7Mean: round(mean(prev7.map((r) => r.mean))), delta: round(delta), slopePerDay: round(sl, 2), direction: delta >= T.trendDeltaC ? "warming" : delta <= -T.trendDeltaC ? "cooling" : "steady", vsNormal: null };
        if (clim) {
            const normals = last7.map((r) => clim.forDate(r.date)).filter(Boolean);
            if (normals.length === 7) out.recent.vsNormal = round(mean(last7.map((r) => r.max)) - mean(normals.map((c) => c.tmaxMean)));
        }
    }
    const maxes = daily.slice(0, 7).map((d) => d.temperatureMax);
    if (maxes.length >= 7) {
        const delta = mean(maxes.slice(4, 7)) - mean(maxes.slice(0, 3));
        out.forecast = { delta: round(delta), slopePerDay: round(slope(maxes), 2), direction: delta >= T.trendDeltaC ? "rising" : delta <= -T.trendDeltaC ? "falling" : "steady", daily: daily.slice(0, 7).map((d) => ({ date: d.date, max: d.temperatureMax, min: d.temperatureMin })) };
    }
    return out;
};

/* ── rain ────────────────────────────────────────────────────────────────── */
const rain = (daily, clim) => {
    const days = daily.slice(0, 7).map((d) => ({ date: d.date, probability: d.precipProbability ?? null, mm: d.precipitationSum ?? 0 }));
    const p = days.map((d) => (d.probability ?? 0) / 100);
    const totalMm = round(days.reduce((s, d) => s + d.mm, 0));
    const expectedRainDays = round(p.reduce((s, x) => s + x, 0));
    const wettest = days.reduce((m, d) => (d.mm > (m?.mm ?? -1) ? d : m), null);
    const freqs = clim ? days.map((d) => clim.forDate(d.date)?.rainFreq).filter((f) => f !== null && f !== undefined) : [];
    const typicalRainDays = freqs.length === days.length ? round(freqs.reduce((s, f) => s + f, 0)) : null;
    let comparison = null;
    if (typicalRainDays !== null) {
        const diff = expectedRainDays - typicalRainDays;
        comparison = expectedRainDays >= typicalRainDays * 1.5 && diff >= 1 ? "wetter" : expectedRainDays <= typicalRainDays * 0.5 && diff <= -1 ? "drier" : "typical";
    }
    return { days, totalMm, expectedRainDays, typicalRainDays, comparison, wettest: wettest && wettest.mm > 0 ? { date: wettest.date, mm: wettest.mm } : null, anyRainChance: Math.round((1 - p.reduce((a, x) => a * (1 - x), 1)) * 100), note: "Chance of any rain assumes days are independent, so it is an approximation." };
};

const rainAnomaly = (rainFinding, clim, today) => {
    const dist = clim?.weeklyRain(today);
    if (!dist) return null;
    const pct = percentileRank(dist, rainFinding.totalMm);
    const median = quantile(dist, 0.5);
    if (rainFinding.totalMm >= 10 && pct >= 90) return { kind: "rainfall", direction: "wet", level: pct >= 97 ? "extreme" : "unusual", totalMm: rainFinding.totalMm, typicalMm: round(median), percentile: pct };
    if (median >= 10 && pct <= 10) return { kind: "rainfall", direction: "dry", level: "unusual", totalMm: rainFinding.totalMm, typicalMm: round(median), percentile: pct };
    return null;
};

/* ── sudden changes in the next 48 hours ─────────────────────────────────── */
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * The normal day/night cycle is not a "sudden change": a 6-hour rise of 8 C from dawn to noon is routine in dry
 * weather. So a temperature swing is measured against the typical swing for that hour of the day across the
 * available forecast (about 72 hours), excluding the hour being tested. Needs the same hour on at least one other
 * day, otherwise it is skipped.
 */
const temperatureSwings = (h, off) => {
    const d = [];
    for (let i = 0; i + 6 < h.length; i++) d.push({ i, hour: new Date((h[i].time + off) * 1000).getUTCHours(), change: h[i + 6].temperature - h[i].temperature });
    const byHour = new Map();
    d.forEach((x) => { if (!byHour.has(x.hour)) byHour.set(x.hour, []); byHour.get(x.hour).push(x); });
    const out = [];
    for (const x of d) {
        const others = byHour.get(x.hour).filter((y) => y !== x && Math.abs(y.i - x.i) >= 12).map((y) => y.change);
        if (!others.length || x.i >= 48) continue;
        const unusual = x.change - median(others);
        if (Math.abs(unusual) >= T.sudden.tempSwing6h) out.push({ type: "temperature", severity: Math.abs(unusual) >= T.sudden.tempSwingWarn ? "warning" : "watch", time: h[x.i].time, detail: { change: round(x.change), unusualBy: round(unusual), from: round(h[x.i].temperature), to: round(h[x.i + 6].temperature), hours: 6 } });
    }
    return out;
};

const suddenChanges = (hourly, off = 0) => {
    const h = hourly.slice(0, 96);
    const first48 = h.slice(0, 48);
    const S = T.sudden;
    const events = temperatureSwings(h, off);
    const add = (type, severity, time, detail) => events.push({ type, severity, time, detail });

    for (let i = 0; i + 6 < first48.length; i++) {
        const dP = first48[i + 6].pressure - first48[i].pressure;
        if (Number.isFinite(dP) && -dP >= S.pressureDrop6h) add("pressure", -dP >= S.pressureDropWarn ? "warning" : "watch", first48[i].time, { change: round(dP), hours: 6 });
    }
    for (let i = 0; i < first48.length; i++) {
        const g = first48[i].windGust;
        const jump = i >= 3 ? g - first48[i - 3].windGust : 0;
        if (g >= S.gustWatch || (jump >= S.gustJump3h && g >= 40)) add("wind", g >= S.gustWarn ? "warning" : "watch", first48[i].time, { gust: round(g, 0), jump: round(jump, 0) });
        if (i >= 3 && first48.slice(i - 3, i).every((x) => (x.precipitation || 0) < 0.2) && first48[i].precipitation >= S.rainHourWatch) add("rain", first48[i].precipitation >= S.rainHourWarn ? "warning" : "watch", first48[i].time, { mmPerHour: round(first48[i].precipitation) });
        if (i >= 3 && first48[i].code >= 95 && first48[i].code <= 99 && first48.slice(i - 3, i).every((x) => !(x.code >= 95 && x.code <= 99))) add("thunderstorm", "watch", first48[i].time, {});
    }

    // One event per type per 6 hours: keep the strongest, then the earliest few overall.
    const rank = { warning: 2, watch: 1 };
    const kept = [];
    for (const e of events.sort((a, b) => a.time - b.time)) {
        const prev = kept.findLast((k) => k.type === e.type);
        if (prev && e.time - prev.time < 6 * 3600) { if (rank[e.severity] > rank[prev.severity]) kept[kept.indexOf(prev)] = e; continue; }
        kept.push(e);
    }
    return kept.slice(0, 5);
};

/* ── heatwave risk (IMD-style criteria, an estimate) ─────────────────────── */
const heatwave = (rows, elevation) => {
    const hills = Number.isFinite(elevation) && elevation >= T.heat.hillsAboveM;
    const th = hills ? T.heat.hills : T.heat.plains;
    const hasNormal = rows.some((r) => r.normal !== null);
    const flag = (r) => {
        const dep = r.departure;
        const abs = th.absolute !== null && r.max >= th.absolute;
        const byDep = dep !== null && r.max >= th.minTemp && dep >= th.departure;
        const severe = (th.severeAbsolute !== null && r.max >= th.severeAbsolute) || (dep !== null && r.max >= th.minTemp && dep >= th.severeDeparture);
        const watch = !abs && !byDep && r.max >= th.minTemp - 2 && (dep === null || dep >= 3);
        return { qualifies: abs || byDep, severe: (abs || byDep) && severe, watch: watch && (hasNormal || r.max >= th.minTemp) };
    };
    const flags = rows.map((r) => ({ r, ...flag(r) }));
    let run = 0, bestRun = 0, runSevere = false, anySevereRun = false;
    for (const f of flags) {
        if (f.qualifies) { run++; runSevere = runSevere || f.severe; bestRun = Math.max(bestRun, run); if (run >= 2 && runSevere) anySevereRun = true; }
        else { run = 0; runSevere = false; }
    }
    const qualifying = flags.filter((f) => f.qualifies);
    const level = anySevereRun ? "severe" : bestRun >= 2 ? "heatwave" : qualifying.length || flags.some((f) => f.watch) ? "watch" : "none";
    const peak = rows.reduce((m, r) => (r.max > (m?.max ?? -Infinity) ? r : m), null);
    return {
        level, terrain: hills ? "hills" : "plains", qualifyingDates: qualifying.map((f) => f.r.date),
        peak: peak ? { date: peak.date, max: peak.max, normal: peak.normal, departure: peak.departure } : null,
        thresholds: { minTemp: th.minTemp, departure: th.departure, absolute: th.absolute },
        basis: hasNormal ? "IMD-style criteria using ERA5 normals" : "Absolute temperature only (no climate normal available)",
        note: "An estimate from model data. Not an official IMD heatwave warning.",
    };
};

/**
 * @param {{overview:object, recent:object|null, archive:object|null}} p  recent/archive are Open-Meteo `daily` blocks
 */
const analyze = ({ overview, recent, archive }) => {
    const today = overview.daily[0].date;
    const clim = archive ? climatology.build(climatology.toRecords(archive), today) : null;
    const usable = clim && clim.forDate(today) ? clim : null;

    const rows = temperatureVsNormal(overview.daily, usable);
    const rainFinding = rain(overview.daily, usable);
    const anomalies = [...temperatureAnomalies(rows)];
    const ra = rainAnomaly(rainFinding, usable, today);
    if (ra) anomalies.push(ra);

    return {
        generatedFor: today,
        basis: { climatologyYears: usable ? usable.years : 0, climatologySamples: usable ? usable.samples : 0, hasNormals: Boolean(usable), recentDays: recent?.time?.length || 0 },
        trend: trend(recent, overview.daily, usable, today),
        temperatureVsNormal: rows,
        anomalies,
        rain: { ...rainFinding, anomaly: ra },
        suddenChanges: suddenChanges(overview.hourly, overview.location.utcOffsetSeconds),
        heatwave: heatwave(rows, overview.location.elevation),
        caveats: [
            "Forecast values come from a numerical weather model; this analysis adds statistics, not a new forecast.",
            usable ? `Normal = average of about ${usable.years} previous years (ERA5) within a week of the date.` : "No climate normal was available, so comparisons with normal are skipped.",
            "Estimates only. For official warnings see the India Meteorological Department.",
        ],
    };
};

module.exports = { analyze, T, temperatureVsNormal, temperatureAnomalies, trend, rain, suddenChanges, heatwave };
