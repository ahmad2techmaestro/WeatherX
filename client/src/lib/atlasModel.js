/** Pure helpers behind the Atlas insight panels. Everything is derived from live city readings. */
const ok = Number.isFinite;

export const WATCH_RULES = [
  { id: "heat", title: "Severe heat", tone: "bad", test: (c) => c.current.temperature >= 40, value: (c, f) => f.temp(c.current.temperature) },
  { id: "cold", title: "Cold", tone: "info", test: (c) => c.current.temperature <= 8, value: (c, f) => f.temp(c.current.temperature) },
  { id: "wind", title: "Strong wind", tone: "warn", test: (c) => c.current.windSpeed >= 35, value: (c, f) => f.wind(c.current.windSpeed) },
  { id: "rain", title: "Raining now", tone: "info", test: (c) => c.current.precipitation >= 0.5, value: (c, f) => f.rain(c.current.precipitation) },
  { id: "vis", title: "Low visibility", tone: "warn", test: (c) => ok(c.current.visibilityKm) && c.current.visibilityKm < 1, value: (c) => `${Number(c.current.visibilityKm).toFixed(1)} km` },
  { id: "air", title: "Very poor air", tone: "bad", test: (c) => ok(c.aqi) && c.aqi >= 301, value: (c) => `AQI ${c.aqi}` },
];

export function watchlist(cities, fmt) {
  return WATCH_RULES.map((rule) => ({
    id: rule.id,
    title: rule.title,
    tone: rule.tone,
    cities: cities.filter(rule.test).map((c) => ({ name: c.name, latitude: c.latitude, longitude: c.longitude, text: rule.value(c, fmt) })),
  })).filter((r) => r.cities.length);
}

const extremes = (cities, get) => {
  const list = cities.filter((c) => ok(get(c)));

  if (!list.length) return null;

  const sorted = [...list].sort((a, b) => get(b) - get(a));

  return { high: sorted[0], low: sorted[sorted.length - 1], avg: list.reduce((s, c) => s + get(c), 0) / list.length, count: list.length };
};

export const fieldOf = (layer) => (c) => c.current[layer.field];

export const summarise = (cities, layer) => extremes(cities, fieldOf(layer));

/** Plain-language readout of the national picture. */
export function readout(cities, fmt) {
  const out = [];
  const t = extremes(cities, (c) => c.current.temperature);

  if (t && t.high !== t.low) out.push(`${t.high.name} is the warmest of the ${t.count} cities at ${fmt.temp(t.high.current.temperature)} and ${t.low.name} the coolest at ${fmt.temp(t.low.current.temperature)}, a spread of ${fmt.tempDelta(t.high.current.temperature - t.low.current.temperature)}.`);

  const raining = cities.filter((c) => c.current.precipitation >= 0.1);

  out.push(raining.length ? `${raining.length} of ${cities.length} cities report rain right now${raining.length <= 3 ? `: ${raining.map((c) => c.name).join(", ")}` : ""}.` : `No rain is falling over any of the ${cities.length} cities right now.`);

  const w = extremes(cities, (c) => c.current.windSpeed);

  if (w) out.push(`${w.high.name} has the strongest wind at ${fmt.wind(w.high.current.windSpeed)}.`);

  const a = extremes(cities, (c) => c.aqi);

  if (a && a.high !== a.low) out.push(`Air is cleanest in ${a.low.name} (AQI ${a.low.aqi}) and poorest in ${a.high.name} (AQI ${a.high.aqi}).`);

  return out;
}

export const airRanking = (cities) =>
  cities
    .filter((c) => ok(c.aqi))
    .sort((a, b) => b.aqi - a.aqi)
    .map((c) => ({ name: c.name, aqi: c.aqi, latitude: c.latitude, longitude: c.longitude }));
