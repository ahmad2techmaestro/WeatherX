/**
 * Climate normals for a place from ERA5 reanalysis (Open-Meteo archive), same time of year, previous years only.
 * "Normal" here means the average over about ten recent years within +/-7 days of the date, not a 30-year WMO normal.
 */
const { mean, std, quantile, dayOfYear, doyDistance } = require("./stats");

const WINDOW_DAYS = 7;
const MIN_YEARS = 5;
const MIN_SAMPLES = 60;

/** Archive response -> clean records. Rows with a missing max or min temperature are dropped. */
const toRecords = (daily) => {
    const out = [];
    const t = daily?.time || [];
    for (let i = 0; i < t.length; i++) {
        const tmax = daily.temperature_2m_max?.[i];
        const tmin = daily.temperature_2m_min?.[i];
        if (!Number.isFinite(tmax) || !Number.isFinite(tmin)) continue;
        const rain = Number.isFinite(daily.precipitation_sum?.[i]) ? daily.precipitation_sum[i] : null;
        out.push({ date: t[i], year: Number(t[i].slice(0, 4)), doy: dayOfYear(t[i]), tmax, tmin, rain });
    }
    return out;
};

const build = (records, todayISO) => {
    const thisYear = Number(todayISO.slice(0, 4));
    const past = records.filter((r) => r.year < thisYear);
    const years = new Set(past.map((r) => r.year));
    const byYear = new Map();
    past.forEach((r) => { if (!byYear.has(r.year)) byYear.set(r.year, new Map()); byYear.get(r.year).set(r.doy, r); });

    /** Distribution of temperature and rain for one calendar date. */
    const forDate = (iso) => {
        const doy = dayOfYear(iso);
        const s = past.filter((r) => doyDistance(r.doy, doy) <= WINDOW_DAYS);
        if (years.size < MIN_YEARS || s.length < MIN_SAMPLES) return null;
        const tmax = s.map((r) => r.tmax);
        const wet = s.filter((r) => r.rain !== null);
        return {
            n: s.length,
            tmaxMean: mean(tmax),
            tmaxStd: std(tmax),
            tmaxP10: quantile(tmax, 0.1),
            tmaxP90: quantile(tmax, 0.9),
            tmax: tmax,
            tminMean: mean(s.map((r) => r.tmin)),
            rainFreq: wet.length ? wet.filter((r) => r.rain >= 1).length / wet.length : null,
        };
    };

    /** Distribution of 7-day rainfall totals starting around this calendar date (all prior years). */
    const weeklyRain = (iso, span = 7) => {
        const doy = dayOfYear(iso);
        const totals = [];
        for (const [, days] of byYear) {
            for (let off = -WINDOW_DAYS; off <= WINDOW_DAYS; off++) {
                let sum = 0, ok = true;
                for (let k = 0; k < span; k++) {
                    const r = days.get(doy + off + k);
                    if (!r || r.rain === null) { ok = false; break; }
                    sum += r.rain;
                }
                if (ok) totals.push(sum);
            }
        }
        return totals.length >= MIN_SAMPLES ? totals : null;
    };

    return { years: years.size, samples: past.length, forDate, weeklyRain };
};

module.exports = { toRecords, build, WINDOW_DAYS, MIN_YEARS, MIN_SAMPLES };
