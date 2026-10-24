import { clockLabel, dayMonth, hourLabel } from "../../lib/format";
import { tempLabel } from "../../lib/units";

const label = "text-[12.5px] font-medium text-ink-3";

/** Compact heat-stress and comfort panel (used on Today and Planner). */
export function BodyConditions({ data, units }) {
  const ai = data.intelligence;

  if (!ai) return null;

  const cells = [
    ai.comfort && { label: "Comfort", value: `${ai.comfort.value}`, unit: "/100", note: ai.comfort.label },
    ai.heatIndex && { label: "Heat index", value: tempLabel(ai.heatIndex.value, units), note: ai.heatIndex.level },
    ai.wetBulb && { label: "Wet-bulb", value: tempLabel(ai.wetBulb.value, units), note: ai.wetBulb.level },
  ].filter(Boolean);

  return (
    <div className="mb-3 grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-3">
      {cells.map((c) => (
        <div key={c.label} className="grid gap-0.5 rounded-m border border-line bg-surface-2 px-3.5 py-3">
          <span className={label}>{c.label}</span>
          <strong className="font-display text-[2.1rem] font-normal leading-none">
            {c.value}
            {c.unit && <small className="ml-0.5 text-[0.8rem] font-medium opacity-60">{c.unit}</small>}
          </strong>
          <span className="text-[13px] text-ink-2">{c.note}</span>
        </div>
      ))}
    </div>
  );
}

export function Activities({ data }) {
  const tz = data.location.timezone;

  return (
    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-x-6 gap-y-4 p-0" role="list">
      {data.intelligence.activities.map((a) => (
        <li key={a.key}>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <strong>{a.label}</strong>
            <span className={`pill pill--${a.verdict.toLowerCase()}`}>{a.verdict}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line" role="img" aria-label={`${a.label}: ${a.now} out of 100 right now`}>
            <span className="block h-full rounded-full bg-accent" style={{ width: `${a.now}%` }} />
          </div>
          <p className="mt-1.5 text-[13px] text-ink-3">{a.bestTime && a.bestScore > 0 ? `Best around ${clockLabel(a.bestTime, tz)} (${a.bestScore}/100)` : "No good window in the next 24 h"}</p>
        </li>
      ))}
    </ul>
  );
}

export function BestDays({ data, units }) {
  const tz = data.location.timezone;
  const days = data.intelligence.bestDays.filter((d) => d.score !== null);
  const topIndex = days.reduce((best, d, i) => (d.score > days[best].score ? i : best), 0);

  return (
    <ol className="mb-2 grid list-none auto-cols-[minmax(64px,1fr)] grid-flow-col gap-2 overflow-x-auto p-0" role="list">
      {days.map((d, i) => (
        <li key={d.date} className={`grid justify-items-center gap-1 rounded-m border px-1.5 py-2.5 ${i === topIndex ? "border-accent bg-accent-soft" : "border-line"}`}>
          <span className="text-xs font-semibold">{dayMonth(data.daily.find((x) => x.date === d.date)?.time, tz)}</span>
          <span className="flex h-16 w-3.5 items-end overflow-hidden rounded-full bg-line">
            <i className="block w-full rounded-full bg-accent" style={{ height: `${Math.max(6, d.score)}%` }} />
          </span>
          <strong>{d.score}</strong>
          <span className="text-xs text-ink-3">{tempLabel(d.high, units)}</span>
          <span className="text-xs text-ink-3">{d.rainMm >= 1 ? `${Math.round(d.rainMm)} mm` : "dry"}</span>
        </li>
      ))}
    </ol>
  );
}

export function RainTotals({ data }) {
  const r = data.intelligence.rainfall;
  const tz = data.location.timezone;
  const cells = [["Next 6 h", r.next6h], ["Next 24 h", r.next24h], ["Next 72 h", r.next72h]];

  return (
    <div className="grid grid-cols-3 gap-3">
      {cells.map(([name, mm]) => (
        <div key={name} className="grid gap-0.5">
          <span className="text-[13px] text-ink-3">{name}</span>
          <strong className="font-display text-[1.7rem] font-normal">{mm} mm</strong>
        </div>
      ))}
      {r.peakHour && <p className="col-span-full m-0 text-[13px] text-ink-3">Heaviest hour: {hourLabel(r.peakHour.time, tz)} ({r.peakHour.mm} mm)</p>}
    </div>
  );
}
