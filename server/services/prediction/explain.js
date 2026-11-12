/**
 * Putting findings into words. Two writers share one contract:
 *  - rules(): deterministic templates (English + Hindi), always available.
 *  - Gemini (see service.js): explains the SAME findings; its text is rejected if it contains a number the
 *    findings don't contain (numbersAreGrounded), in which case rules() answers instead.
 * Findings are converted to the user's unit in code (toUnit) so the model never converts anything.
 */
const f1 = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : null);
const cvt = (c, unit) => (Number.isFinite(c) ? f1(unit === "fahrenheit" ? c * 1.8 + 32 : c) : c);
const dlt = (c, unit) => (Number.isFinite(c) ? f1(unit === "fahrenheit" ? c * 1.8 : c) : c);

/** Deep copy with every temperature expressed in the requested unit (differences scaled, not offset). */
const toUnit = (f, unit) => {
    if (unit !== "fahrenheit") return JSON.parse(JSON.stringify(f));
    const o = JSON.parse(JSON.stringify(f));
    o.temperatureVsNormal.forEach((r) => { ["max", "min", "normal", "p10", "p90"].forEach((k) => { r[k] = cvt(r[k], unit); }); r.departure = dlt(r.departure, unit); });
    if (o.trend.recent) { ["last7Mean", "previous7Mean"].forEach((k) => { o.trend.recent[k] = cvt(o.trend.recent[k], unit); }); ["delta", "slopePerDay", "vsNormal"].forEach((k) => { o.trend.recent[k] = dlt(o.trend.recent[k], unit); }); }
    if (o.trend.forecast) { o.trend.forecast.delta = dlt(o.trend.forecast.delta, unit); o.trend.forecast.slopePerDay = dlt(o.trend.forecast.slopePerDay, unit); o.trend.forecast.daily.forEach((d) => { d.max = cvt(d.max, unit); d.min = cvt(d.min, unit); }); }
    o.anomalies.forEach((a) => { if (a.kind === "temperature") { a.value = cvt(a.value, unit); a.normal = cvt(a.normal, unit); a.departure = dlt(a.departure, unit); } });
    o.suddenChanges.forEach((e) => { if (e.type === "temperature") { e.detail.change = dlt(e.detail.change, unit); e.detail.from = cvt(e.detail.from, unit); e.detail.to = cvt(e.detail.to, unit); } });
    const h = o.heatwave;
    h.thresholds.minTemp = cvt(h.thresholds.minTemp, unit); h.thresholds.departure = dlt(h.thresholds.departure, unit); h.thresholds.absolute = cvt(h.thresholds.absolute, unit);
    if (h.peak) { h.peak.max = cvt(h.peak.max, unit); h.peak.normal = cvt(h.peak.normal, unit); h.peak.departure = dlt(h.peak.departure, unit); }
    return o;
};

const deg = (unit) => (unit === "fahrenheit" ? "°F" : "°C");
const L = (lang, en, hi) => (lang === "hi" ? hi : en);
const dayName = (iso, lang) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
/** "Wed, 11 Nov" for one day; "Wed, 11 Nov to Tue, 17 Nov" for a run. */
const dayRange = (dates, lang) => (dates.length <= 2 ? dates.map((x) => dayName(x, lang)).join(L(lang, " and ", " और ")) : `${dayName(dates[0], lang)} ${L(lang, "to", "से")} ${dayName(dates[dates.length - 1], lang)}`);
const hourName = (time, off) => { const h = new Date((time + (off || 0)) * 1000).getUTCHours(); return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`; };

/** `f` is already in the user's unit. */
const rules = (f, { place = "your area", unit = "celsius", lang = "en", utcOffsetSeconds = 0 } = {}) => {
    const d = deg(unit);
    const out = [];
    let headline = L(lang, "Nothing unusual ahead", "आगे कुछ असामान्य नहीं");

    const h = f.heatwave;
    if (h.level === "severe" || h.level === "heatwave") {
        headline = L(lang, h.level === "severe" ? "Severe heatwave risk" : "Heatwave risk", h.level === "severe" ? "भीषण लू का खतरा" : "लू का खतरा");
        out.push(L(lang, `${place} may see heatwave conditions on ${dayRange(h.qualifyingDates, lang)}, with highs near ${h.peak.max}${d}${h.peak.departure !== null ? ` (${Math.abs(h.peak.departure)}${d} above the usual for this time of year)` : ""}.`, `${place} में ${dayRange(h.qualifyingDates, lang)} को लू जैसे हालात हो सकते हैं, अधिकतम तापमान लगभग ${h.peak.max}${d}${h.peak.departure !== null ? ` (साल के इस समय के सामान्य से ${Math.abs(h.peak.departure)}${d} ज़्यादा)` : ""}।`));
    } else if (h.level === "watch") {
        headline = L(lang, "Heat to watch", "गर्मी पर नज़र रखें");
        out.push(L(lang, `Heat is building in ${place}: highs could reach ${h.peak.max}${d}. This is close to heatwave levels, so keep an eye on the forecast.`, `${place} में गर्मी बढ़ रही है: अधिकतम तापमान ${h.peak.max}${d} तक पहुँच सकता है। यह लू के स्तर के करीब है, इसलिए पूर्वानुमान पर नज़र रखें।`));
    }

    const heatSaid = h.level === "severe" || h.level === "heatwave"; // the heat sentence already states the departure
    const temp = heatSaid ? null : f.anomalies.filter((a) => a.kind === "temperature").sort((a, b) => Math.abs(b.z) - Math.abs(a.z))[0];
    if (temp) {
        if (headline.startsWith("Nothing") || headline.startsWith("आगे")) headline = temp.direction === "warm" ? L(lang, "Unusually warm weather ahead", "असामान्य रूप से गर्म मौसम") : L(lang, "Unusually cool weather ahead", "असामान्य रूप से ठंडा मौसम");
        out.push(temp.direction === "warm"
            ? L(lang, `${place} may experience an unusually high temperature compared with its recent historical pattern: ${dayName(temp.date, lang)} is forecast at ${temp.value}${d}, about ${Math.abs(temp.departure)}${d} above the usual ${temp.normal}${d} for this time of year.`, `${place} में हाल के ऐतिहासिक पैटर्न की तुलना में असामान्य रूप से ज़्यादा तापमान हो सकता है: ${dayName(temp.date, lang)} का पूर्वानुमान ${temp.value}${d} है, जो साल के इस समय के सामान्य ${temp.normal}${d} से लगभग ${Math.abs(temp.departure)}${d} ज़्यादा है।`)
            : L(lang, `${place} may feel unusually cool compared with its recent historical pattern: ${dayName(temp.date, lang)} is forecast at ${temp.value}${d}, about ${Math.abs(temp.departure)}${d} below the usual ${temp.normal}${d}.`, `${place} में हाल के ऐतिहासिक पैटर्न की तुलना में असामान्य रूप से ठंड हो सकती है: ${dayName(temp.date, lang)} का पूर्वानुमान ${temp.value}${d} है, जो सामान्य ${temp.normal}${d} से लगभग ${Math.abs(temp.departure)}${d} कम है।`));
    }

    const s = f.suddenChanges[0];
    if (s) {
        const at = hourName(s.time, utcOffsetSeconds);
        const txt = {
            temperature: L(lang, `a sharp ${s.detail.change > 0 ? "rise" : "drop"} of ${Math.abs(s.detail.change)}${d} within 6 hours`, `6 घंटे में ${Math.abs(s.detail.change)}${d} की तेज़ ${s.detail.change > 0 ? "बढ़त" : "गिरावट"}`),
            pressure: L(lang, `a fast fall in air pressure (${Math.abs(s.detail.change)} hPa in 6 hours), which often comes before unsettled weather`, `हवा के दबाव में तेज़ गिरावट (6 घंटे में ${Math.abs(s.detail.change)} hPa), जो अक्सर अस्थिर मौसम से पहले आती है`),
            wind: L(lang, `strong gusts up to ${s.detail.gust} km/h`, `${s.detail.gust} किमी/घंटा तक तेज़ झोंके`),
            rain: L(lang, `a sudden burst of rain (about ${s.detail.mmPerHour} mm in an hour)`, `अचानक तेज़ बारिश (एक घंटे में लगभग ${s.detail.mmPerHour} मिमी)`),
            thunderstorm: L(lang, "a thunderstorm", "आंधी-तूफ़ान"),
        }[s.type];
        out.push(L(lang, `Sudden change: expect ${txt} around ${at}.`, `अचानक बदलाव: ${at} के आसपास ${txt} की संभावना है।`));
        if (headline.startsWith("Nothing") || headline.startsWith("आगे")) headline = L(lang, "Sudden weather change expected", "अचानक मौसम बदलने की संभावना");
    }

    const r = f.trend.recent;
    if (r && r.direction !== "steady") out.push(L(lang, `Recently it has been ${r.direction} in ${place}: the last 7 days averaged ${Math.abs(r.delta)}${d} ${r.direction === "warming" ? "warmer" : "cooler"} than the week before.`, `हाल में ${place} में मौसम ${r.direction === "warming" ? "गर्म" : "ठंडा"} होता गया है: पिछले 7 दिन पिछले हफ़्ते से औसतन ${Math.abs(r.delta)}${d} ${r.direction === "warming" ? "ज़्यादा गर्म" : "ठंडे"} रहे।`));
    const ft = f.trend.forecast;
    if (ft && ft.direction !== "steady") out.push(L(lang, `The forecast shows temperatures ${ft.direction === "rising" ? "rising" : "falling"} by about ${Math.abs(ft.delta)}${d} over the coming week.`, `पूर्वानुमान के अनुसार आने वाले हफ़्ते में तापमान लगभग ${Math.abs(ft.delta)}${d} ${ft.direction === "rising" ? "बढ़ेगा" : "घटेगा"}।`));

    const ra = f.rain;
    if (ra.anomaly) out.push(ra.anomaly.direction === "wet" ? L(lang, `Rainfall looks heavier than usual: about ${ra.totalMm} mm over 7 days versus a typical ${ra.anomaly.typicalMm} mm.`, `बारिश सामान्य से ज़्यादा दिख रही है: 7 दिनों में लगभग ${ra.totalMm} मिमी, जबकि सामान्यतः ${ra.anomaly.typicalMm} मिमी।`) : L(lang, `It looks drier than usual: about ${ra.totalMm} mm over 7 days versus a typical ${ra.anomaly.typicalMm} mm.`, `सामान्य से सूखा दिख रहा है: 7 दिनों में लगभग ${ra.totalMm} मिमी, जबकि सामान्यतः ${ra.anomaly.typicalMm} मिमी।`));
    else if (ra.anyRainChance >= 60) out.push(L(lang, `Rain is likely this week (about ${ra.anyRainChance}% chance of some rain, ${ra.totalMm} mm in total).`, `इस हफ़्ते बारिश की संभावना ज़्यादा है (कुछ बारिश की लगभग ${ra.anyRainChance}% संभावना, कुल ${ra.totalMm} मिमी)।`));

    if (!out.length) out.push(f.basis.hasNormals ? L(lang, `Forecast temperatures in ${place} are within the normal range for this time of year, and no sudden changes or heat risk are expected in the next two days.`, `${place} में पूर्वानुमानित तापमान साल के इस समय की सामान्य सीमा में है, और अगले दो दिनों में कोई अचानक बदलाव या गर्मी का खतरा नहीं दिखता।`) : L(lang, "No sudden changes or heat risk are expected. Comparisons with normal weren't available.", "कोई अचानक बदलाव या गर्मी का खतरा नहीं दिखता। सामान्य से तुलना उपलब्ध नहीं थी।"));
    out.push(L(lang, "These are statistical estimates from model data, not official warnings.", "ये मॉडल डेटा से सांख्यिकीय अनुमान हैं, आधिकारिक चेतावनी नहीं।"));
    return { headline, text: out.join(" ") };
};

/** Every number in the text, with Devanagari digits normalised. */
const numbersIn = (text) => (String(text).replace(/[०-९]/g, (c) => String("०१२३४५६७८९".indexOf(c))).match(/\d+(?:\.\d+)?/g) || []).map(Number);

/**
 * True when every number >= 11 in the model's text appears in the findings (rounded or exact).
 * Small numbers (days, hours, "7-day") are allowed, as are years.
 */
const numbersAreGrounded = (text, findings) => {
    const allowed = new Set();
    const walk = (v) => {
        if (typeof v === "number") { allowed.add(Math.round(v * 10) / 10); allowed.add(Math.round(v)); allowed.add(Math.abs(Math.round(v))); allowed.add(Math.abs(Math.round(v * 10) / 10)); }
        else if (typeof v === "string") numbersIn(v).forEach((n) => allowed.add(n));
        else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(findings);
    return numbersIn(text).every((n) => n <= 10 || (n >= 1990 && n <= 2100) || allowed.has(n) || allowed.has(Math.round(n)));
};

/** Smaller payload for the model: only what the explanation needs. */
const forModel = (f) => ({
    heatwave: f.heatwave, anomalies: f.anomalies, suddenChanges: f.suddenChanges,
    trend: { recent: f.trend.recent && { direction: f.trend.recent.direction, delta: f.trend.recent.delta, vsNormal: f.trend.recent.vsNormal }, forecast: f.trend.forecast && { direction: f.trend.forecast.direction, delta: f.trend.forecast.delta } },
    rain: { totalMm: f.rain.totalMm, anyRainChance: f.rain.anyRainChance, expectedRainDays: f.rain.expectedRainDays, typicalRainDays: f.rain.typicalRainDays, comparison: f.rain.comparison, anomaly: f.rain.anomaly },
    days: f.temperatureVsNormal.map((r) => ({ date: r.date, high: r.max, normal: r.normal, departure: r.departure })),
    hasNormals: f.basis.hasNormals,
});

module.exports = { rules, toUnit, numbersAreGrounded, numbersIn, forModel };
