const PARTS = [
  { key: "night", label: "Night", from: 0, to: 6 },
  { key: "morning", label: "Morning", from: 6, to: 12 },
  { key: "afternoon", label: "Afternoon", from: 12, to: 18 },
  { key: "evening", label: "Evening", from: 18, to: 24 },
];

const localHour = (t, tz) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(new Date(t * 1000))) % 24;
const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);

/** Night/morning/afternoon/evening summary from one day's hourly rows (parts with under two hours of data are skipped). */
export function dayParts(hours, tz) {
  if (hours.length < 6) return [];

  return PARTS.map((p) => {
    const slice = hours.filter((h) => {
      const hr = localHour(h.time, tz);

      return hr >= p.from && hr < p.to;
    });

    if (slice.length < 2) return null;

    return { ...p, t: avg(slice.map((h) => h.temperature)), rain: Math.max(...slice.map((h) => h.precipProbability ?? 0)), mid: slice[Math.floor(slice.length / 2)] };
  }).filter(Boolean);
}
