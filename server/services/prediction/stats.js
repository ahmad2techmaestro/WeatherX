/** Small, dependency-free statistics used by the prediction & anomaly analysis. */
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const std = (a) => {
    if (a.length < 2) return NaN;
    const m = mean(a);
    return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};
const sorted = (a) => [...a].sort((x, y) => x - y);
const quantile = (a, q) => {
    if (!a.length) return NaN;
    const s = sorted(a);
    const pos = (s.length - 1) * q;
    const lo = Math.floor(pos);
    return s[lo] + (s[Math.ceil(pos)] - s[lo]) * (pos - lo);
};
/** Share of the sample that is at or below the value, 0..100 (mid-rank for ties). */
const percentileRank = (a, v) => {
    if (!a.length) return NaN;
    const below = a.filter((x) => x < v).length;
    const equal = a.filter((x) => x === v).length;
    return Math.round(((below + equal / 2) / a.length) * 100);
};
/** Least-squares slope of y against 0..n-1 (units of y per step). */
const slope = (ys) => {
    const n = ys.length;
    if (n < 3) return NaN;
    const xm = (n - 1) / 2;
    const ym = mean(ys);
    let num = 0, den = 0;
    ys.forEach((y, i) => { num += (i - xm) * (y - ym); den += (i - xm) ** 2; });
    return num / den;
};
const round = (n, d = 1) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null);

/** Day of year (1..366) for a YYYY-MM-DD string, ignoring time zones. */
const dayOfYear = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1;
};
/** Circular distance between two days of the year. */
const doyDistance = (a, b) => { const d = Math.abs(a - b); return Math.min(d, 365 - d); };
const addDaysISO = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

module.exports = { mean, std, quantile, percentileRank, slope, round, dayOfYear, doyDistance, addDaysISO };
