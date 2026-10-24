/**
 * Outdoor suitability, 0–100. A transparent rule of thumb built from the forecast values the app
 * already shows — it is guidance, not a measurement.
 */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const finite = (v) => typeof v === "number" && Number.isFinite(v);

export function outdoorScore({ feels, temp, windKmh, rainMm, aqi, uv, humidity }) {
  const apparent = finite(feels) ? feels : temp;
  let score = 100;

  if (finite(apparent)) score -= clamp(apparent < 18 ? (18 - apparent) * 2.2 : apparent > 28 ? (apparent - 28) * 3.2 : 0, 0, 60);
  if (finite(rainMm)) score -= clamp(rainMm * 8, 0, 40);
  if (finite(windKmh)) score -= clamp((windKmh - 20) * 0.8, 0, 25);
  if (finite(aqi)) score -= clamp((aqi - 100) * 0.25, 0, 45);
  if (finite(uv)) score -= clamp((uv - 8) * 3, 0, 12);
  if (finite(humidity) && finite(apparent) && humidity > 80 && apparent > 28) score -= 8;

  return Math.round(clamp(score, 0, 100));
}

export const verdictFor = (score) => (score >= 80 ? "Excellent" : score >= 65 ? "Good" : score >= 45 ? "Fair" : "Poor");

export const scoreTone = (score) => (score >= 80 ? "great" : score >= 65 ? "good" : score >= 45 ? "fair" : "poor");

const sum = (list, key) => list.reduce((s, h) => s + (finite(h[key]) ? h[key] : 0), 0);

/** Next-24-hour figures taken from a summary row (as returned by /api/weather/multi). */
export function dayFigures(row) {
  const next = row.hourly.slice(0, 24);

  return {
    rainMm: sum(next, "precipitation"),
    rainChance: Math.max(0, ...next.map((h) => (finite(h.precipProbability) ? h.precipProbability : 0))),
    aqi: row.airQuality?.naqi?.value ?? null,
  };
}

export function currentScore(row) {
  const { rainMm, aqi } = dayFigures(row);
  const c = row.current;

  return outdoorScore({ temp: c.temperature, feels: c.feelsLike, windKmh: c.windSpeed, rainMm, aqi, uv: c.uvIndex, humidity: c.humidity });
}

/** Score for a forecast day from its daily aggregates. */
export const forecastDayScore = (d) =>
  outdoorScore({
    feels: finite(d.temperatureMax) && finite(d.temperatureMin) ? d.temperatureMax * 0.6 + d.temperatureMin * 0.4 : d.temperatureMax,
    windKmh: d.windSpeedMax * 0.8,
    rainMm: (d.precipitationSum || 0) * 0.6,
    uv: d.uvIndexMax,
  });
