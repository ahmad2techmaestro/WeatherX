/** Date/time helpers. Every timestamp is unix seconds in UTC, shown in the *place's* timezone. */

const cache = new Map();

function formatter(timeZone, options) {
  const key = `${timeZone}|${JSON.stringify(options)}`;

  if (!cache.has(key)) cache.set(key, new Intl.DateTimeFormat("en-IN", { timeZone, ...options }));

  return cache.get(key);
}

const ms = (t) => t * 1000;

const safe = (fn) => {
  try {
    return fn();
  } catch {
    return "—";
  }
};

export const hourLabel = (t, tz) => safe(() => formatter(tz, { hour: "numeric", hour12: true }).format(ms(t)).replace(" ", " ").toUpperCase());

export const clockLabel = (t, tz) => safe(() => formatter(tz, { hour: "numeric", minute: "2-digit", hour12: true }).format(ms(t)).toUpperCase());

export const weekdayShort = (t, tz) => safe(() => formatter(tz, { weekday: "short" }).format(ms(t)));

export const weekdayLong = (t, tz) => safe(() => formatter(tz, { weekday: "long" }).format(ms(t)));

export const dayMonth = (t, tz) => safe(() => formatter(tz, { day: "numeric", month: "short" }).format(ms(t)));

export const fullDate = (t, tz) => safe(() => formatter(tz, { weekday: "long", day: "numeric", month: "long" }).format(ms(t)));

/** Local calendar date key (YYYY-MM-DD) for grouping hours by day. */
export const dateKey = (t, tz) =>
  safe(() => {
    const parts = formatter(tz, { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(ms(t));
    const get = (type) => parts.find((p) => p.type === type).value;

    return `${get("year")}-${get("month")}-${get("day")}`;
  });

export function relativeDay(t, nowT, tz) {
  const a = dateKey(t, tz);
  const b = dateKey(nowT, tz);

  if (a === b) return "Today";

  const tomorrow = dateKey(nowT + 86400, tz);

  return a === tomorrow ? "Tomorrow" : weekdayShort(t, tz);
}

export function durationLabel(seconds) {
  const total = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;

  if (h === 0) return `${m} min`;

  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function timeAgo(msTimestamp) {
  const seconds = Math.max(0, Math.round((Date.now() - msTimestamp) / 1000));

  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;

  return `${Math.round(seconds / 86400)} d ago`;
}
