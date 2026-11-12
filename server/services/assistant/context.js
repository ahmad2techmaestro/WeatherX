/**
 * Turns a real overview into the facts the assistant may use. Numbers that need arithmetic (differences,
 * comparisons with yesterday, which hours fall tomorrow) are computed HERE, in code, so the model never has to.
 */
const localDate = (time, offset) => new Date((time + (offset || 0)) * 1000).toISOString().slice(0, 10);
const localHour = (time, offset) => new Date((time + (offset || 0)) * 1000).getUTCHours();
const hourLabel = (time, offset) => { const h = localHour(time, offset); return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`; };
const round1 = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : null);

/** Yesterday vs now, from Open-Meteo's past_days response. Null if anything is missing. */
const compareYesterday = (overview, raw) => {
    try {
        const off = overview.location.utcOffsetSeconds;
        const d = raw.daily;
        const y = { high: d.temperature_2m_max[0], low: d.temperature_2m_min[0], rainMm: d.precipitation_sum[0] };
        if (![y.high, y.low].every(Number.isFinite)) return null;

        // Yesterday's temperature at the same local hour as "now".
        const nowH = localHour(overview.current.time, off);
        const idx = raw.hourly.time.findIndex((t) => localHour(t, off) === nowH && localDate(t, off) < localDate(overview.current.time, off));
        const sameHour = idx >= 0 ? raw.hourly.temperature_2m[idx] : null;
        const today = overview.daily[0];

        return {
            yesterday: { high: round1(y.high), low: round1(y.low), rainMm: round1(y.rainMm ?? 0), temperatureAtThisHour: round1(sameHour) },
            difference: {
                highToday_minus_yesterday: round1(today.temperatureMax - y.high),
                lowToday_minus_yesterday: round1(today.temperatureMin - y.low),
                nowVsSameHourYesterday: Number.isFinite(sameHour) ? round1(overview.current.temperature - sameHour) : null,
                rainTodayMm_minus_yesterday: round1((today.precipitationSum ?? 0) - (y.rainMm ?? 0)),
            },
            note: "Yesterday's figures are model reanalysis, not a station reading.",
        };
    } catch {
        return null;
    }
};

const compact = (overview, place, yesterday) => {
    const off = overview.location.utcOffsetSeconds;
    const ai = overview.intelligence;
    const days = overview.daily.slice(0, 7);
    const tomorrowDate = days[1]?.date;
    const hours = overview.hourly.slice(0, 36);
    const tomorrowHours = tomorrowDate ? overview.hourly.filter((h) => localDate(h.time, off) === tomorrowDate) : [];
    const row = (h) => ({ hour: hourLabel(h.time, off), temp: h.temperature, feels: h.feelsLike, rainChance: h.precipProbability, rainMm: h.precipitation, gust: h.windGust, uv: h.uvIndex, visibilityKm: h.visibilityKm });

    return {
        place,
        note: "Temperatures in Celsius, wind km/h, rain mm, times local. Convert to the user's unit when answering.",
        nowLocalHour: hourLabel(overview.current.time, off),
        now: overview.current,
        next24h: hours.slice(0, 24).filter((_, i) => i % 2 === 0).map(row),
        tomorrowByHour: tomorrowHours.filter((_, i) => i % 3 === 0).map(row),
        days: days.map((d) => ({ date: d.date, summary: d.label, high: d.temperatureMax, low: d.temperatureMin, rainMm: d.precipitationSum, rainChance: d.precipProbability, uvMax: d.uvIndexMax, gustMax: d.windGustMax })),
        airQuality: overview.airQuality?.naqi ? { aqi: overview.airQuality.naqi.value, label: overview.airQuality.naqi.label, advice: overview.airQuality.naqi.advice } : null,
        advisories: (overview.advisories || []).map((a) => ({ severity: a.severity, title: a.title, detail: a.detail })),
        scores: { comfort: ai.comfort, heatIndex: ai.heatIndex, activities: ai.activities.map((a) => ({ key: a.key, bestHour: a.bestTime ? hourLabel(a.bestTime, off) : null, bestScore: a.bestScore })), gear: ai.gear, rainfall: { next24h: ai.rainfall.next24h, next72h: ai.rainfall.next72h, peakHour: ai.rainfall.peakHour ? hourLabel(ai.rainfall.peakHour.time, off) : null } },
        comparedWithYesterday: yesterday || "unavailable",
    };
};

module.exports = { compact, compareYesterday, localDate, localHour, hourLabel };
