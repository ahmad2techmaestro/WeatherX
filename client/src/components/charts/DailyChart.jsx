import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useSettings } from "../../context/SettingsContext";
import { dayMonth, weekdayShort } from "../../lib/format";
import { precip, precipUnitLabel, temp } from "../../lib/units";

const AXIS = { fontSize: 12, fill: "var(--ink-3)" };

function Tip({ active, payload, timezone, units }) {
  if (!active || !payload?.length) return null;

  const d = payload[0].payload;

  return (
    <div className="chart-tip">
      <strong>
        {weekdayShort(d.time, timezone)}, {dayMonth(d.time, timezone)}
      </strong>
      <span>{d.label}</span>
      <dl>
        <div>
          <dt>High / low</dt>
          <dd>
            {temp(d.temperatureMax, units)}° / {temp(d.temperatureMin, units)}°
          </dd>
        </div>
        <div>
          <dt>Rain</dt>
          <dd>
            {d.precipProbability}% · {precip(d.precipitationSum, units)} {precipUnitLabel(units)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** Daily highs and lows as lines with daily rainfall as bars. */
export default function DailyChart({ overview, days = 14, height = 280 }) {
  const { units } = useSettings();
  const tz = overview.location.timezone;

  const data = useMemo(
    () =>
      overview.daily.slice(0, days).map((d) => ({
        ...d,
        hi: temp(d.temperatureMax, units, { decimals: 1 }),
        lo: temp(d.temperatureMin, units, { decimals: 1 }),
        rain: precip(d.precipitationSum, units),
      })),
    [overview.daily, days, units]
  );

  const summary = `Daily highs from ${Math.min(...data.map((d) => d.hi))}° to ${Math.max(...data.map((d) => d.hi))}° over the next ${days} days`;

  return (
    <div className="chart">
    <figure className="chart__figure" style={{ height }} role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="time" tickFormatter={(t) => weekdayShort(t, tz)} tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--chart-grid)" }} interval={days > 10 ? 1 : 0} />
          <YAxis yAxisId="t" tick={AXIS} tickLine={false} axisLine={false} width={44} unit="°" domain={["dataMin - 3", "dataMax + 3"]} allowDecimals={false} />
          <YAxis yAxisId="r" orientation="right" tick={AXIS} tickLine={false} axisLine={false} width={44} unit={` ${precipUnitLabel(units)}`} />
          <Tooltip content={<Tip timezone={tz} units={units} />} cursor={{ fill: "var(--surface-2)", opacity: 0.5 }} />
          <Bar yAxisId="r" dataKey="rain" fill="var(--c-rain)" opacity={0.55} radius={[3, 3, 0, 0]} maxBarSize={22} name="Rain" />
          <Line yAxisId="t" type="monotone" dataKey="hi" stroke="var(--c-temp)" strokeWidth={2.6} dot={{ r: 3 }} name="High" />
          <Line yAxisId="t" type="monotone" dataKey="lo" stroke="var(--c-rain)" strokeWidth={2.2} dot={{ r: 3 }} name="Low" />
        </ComposedChart>
      </ResponsiveContainer>
    </figure>
    <p className="chart__legend">
      <span><i className="swatch" /> High</span>
      <span><i className="swatch" style={{ background: "var(--c-rain)" }} /> Low</span>
      <span><i className="swatch" style={{ background: "var(--c-rain)", opacity: 0.5 }} /> Rain (bars, right axis)</span>
    </p>
    </div>
  );
}
