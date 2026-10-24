import { useMemo, useState } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Segmented } from "../ui/States";
import { useSettings } from "../../context/SettingsContext";
import { dateKey, hourLabel, weekdayShort } from "../../lib/format";
import { precip, precipUnitLabel, temp, wind, windUnitLabel } from "../../lib/units";

const TABS = [
  { value: "temperature", label: "Temp" },
  { value: "rain", label: "Rain" },
  { value: "wind", label: "Wind" },
  { value: "humidity", label: "Humidity" },
  { value: "uv", label: "UV" },
];

const AXIS = { fontSize: 12, fill: "var(--ink-3)" };

function nightRanges(rows) {
  const ranges = [];
  let start = null;

  rows.forEach((row, i) => {
    if (!row.isDay && start === null) start = row.time;
    if ((row.isDay || i === rows.length - 1) && start !== null) {
      ranges.push([start, row.time]);
      start = null;
    }
  });

  return ranges;
}

function Tip({ active, payload, timezone, units }) {
  if (!active || !payload?.length) return null;

  const row = payload[0].payload;

  return (
    <div className="chart-tip">
      <strong>
        {weekdayShort(row.time, timezone)} {hourLabel(row.time, timezone)}
      </strong>
      <span>{row.label}</span>
      <dl>
        <div>
          <dt>Temp</dt>
          <dd>
            {temp(row.temperature, units)}° <small>feels {temp(row.feelsLike, units)}°</small>
          </dd>
        </div>
        <div>
          <dt>Rain</dt>
          <dd>
            {row.precipProbability ?? 0}% · {precip(row.precipitation, units)} {precipUnitLabel(units)}
          </dd>
        </div>
        <div>
          <dt>Wind</dt>
          <dd>
            {wind(row.windSpeed, units)} {windUnitLabel(units)} <small>gusts {wind(row.windGust, units)}</small>
          </dd>
        </div>
        <div>
          <dt>Humidity / UV</dt>
          <dd>
            {row.humidity}% · UV {row.uvIndex}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Interactive hourly chart. One panel, five measures; night hours are shaded and
 * "now" is marked. A data table is available for screen readers and copy-paste.
 */
export default function HourlyChart({ overview, hours = 48, height = 280, tabs = TABS.map((t) => t.value) }) {
  const { units } = useSettings();
  const [tab, setTab] = useState(tabs[0]);
  const [table, setTable] = useState(false);
  const tz = overview.location.timezone;

  const rows = useMemo(() => overview.hourly.slice(0, hours), [overview.hourly, hours]);

  const data = useMemo(
    () =>
      rows.map((h) => ({
        ...h,
        t: temp(h.temperature, units, { decimals: 1 }),
        f: temp(h.feelsLike, units, { decimals: 1 }),
        w: wind(h.windSpeed, units),
        g: wind(h.windGust, units),
        p: precip(h.precipitation, units),
        prob: h.precipProbability ?? 0,
      })),
    [rows, units]
  );

  const step = hours <= 24 ? 3 : hours <= 72 ? 6 : 12;
  const ticks = rows.filter((_, i) => i % step === 0).map((r) => r.time);
  const night = useMemo(() => nightRanges(rows), [rows]);
  const nowT = rows[0]?.time;

  const tickFormat = (t) => {
    const key = dateKey(t, tz);
    const first = rows.find((r) => dateKey(r.time, tz) === key);

    return first && first.time === t && hourLabel(t, tz).startsWith("12") && hourLabel(t, tz).includes("AM") ? weekdayShort(t, tz) : hourLabel(t, tz);
  };

  const common = { data, margin: { top: 10, right: 8, bottom: 0, left: -12 } };
  const x = <XAxis dataKey="time" type="number" scale="time" domain={["dataMin", "dataMax"]} ticks={ticks} tickFormatter={tickFormat} tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--chart-grid)" }} />;
  const grid = <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 4" vertical={false} />;
  const bands = night.map(([a, b]) => <ReferenceArea key={a} x1={a} x2={b} fill="var(--night-band)" strokeOpacity={0} ifOverflow="hidden" />);
  const nowLine = nowT && <ReferenceLine x={nowT} stroke="var(--ink-3)" strokeDasharray="2 3" label={{ value: "Now", position: "insideTopLeft", fill: "var(--ink-3)", fontSize: 11 }} />;
  const tooltip = <Tooltip content={<Tip timezone={tz} units={units} />} cursor={{ stroke: "var(--ink-3)", strokeDasharray: "3 3" }} />;

  const summary = {
    temperature: `Temperature from ${Math.min(...data.map((d) => d.t))}° to ${Math.max(...data.map((d) => d.t))}° over the next ${hours} hours`,
    rain: `Chance of rain peaks at ${Math.max(...data.map((d) => d.prob))}% over the next ${hours} hours`,
    wind: `Wind up to ${Math.max(...data.map((d) => d.w))} ${windUnitLabel(units)}, gusts up to ${Math.max(...data.map((d) => d.g))}`,
    humidity: `Humidity between ${Math.min(...data.map((d) => d.humidity))}% and ${Math.max(...data.map((d) => d.humidity))}%`,
    uv: `UV index peaks at ${Math.max(...data.map((d) => d.uvIndex))}`,
  }[tab];

  return (
    <div className="chart">
      <div className="chart__bar">
        <Segmented label="Chart measure" size="sm" options={TABS.filter((t) => tabs.includes(t.value))} value={tab} onChange={setTab} />
        <button type="button" className="link-btn" onClick={() => setTable((v) => !v)} aria-pressed={table}>
          {table ? "Show chart" : "Show data table"}
        </button>
      </div>

      {table ? (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Hourly data table">
          <table>
            <caption className="sr-only">{summary}</caption>
            <thead>
              <tr>
                <th>Time</th>
                <th>Temp</th>
                <th>Feels</th>
                <th>Rain %</th>
                <th>Rain</th>
                <th>Wind</th>
                <th>Hum %</th>
                <th>UV</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.time}>
                  <td>
                    {weekdayShort(r.time, tz)} {hourLabel(r.time, tz)}
                  </td>
                  <td>{r.t}°</td>
                  <td>{r.f}°</td>
                  <td>{r.prob}</td>
                  <td>
                    {r.p} {precipUnitLabel(units)}
                  </td>
                  <td>
                    {r.w} {windUnitLabel(units)}
                  </td>
                  <td>{r.humidity}</td>
                  <td>{r.uvIndex}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <figure className="chart__figure" style={{ height }} role="img" aria-label={summary}>
          <ResponsiveContainer width="100%" height="100%">
            {tab === "temperature" ? (
              <ComposedChart {...common}>
                <defs>
                  <linearGradient id="g-temp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="var(--c-temp)" stopOpacity=".38" />
                    <stop offset="1" stopColor="var(--c-temp)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {grid}
                {bands}
                {x}
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} unit="°" domain={["dataMin - 2", "dataMax + 2"]} allowDecimals={false} />
                {tooltip}
                {nowLine}
                <Area type="monotone" dataKey="t" stroke="var(--c-temp)" strokeWidth={2.5} fill="url(#g-temp)" name="Temperature" dot={false} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="f" stroke="var(--ink-3)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Feels like" />
              </ComposedChart>
            ) : tab === "rain" ? (
              <ComposedChart {...common}>
                {grid}
                {bands}
                {x}
                <YAxis yAxisId="mm" tick={AXIS} tickLine={false} axisLine={false} width={44} unit={` ${precipUnitLabel(units)}`} allowDecimals />
                <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} width={40} unit="%" />
                {tooltip}
                {nowLine}
                <Bar yAxisId="mm" dataKey="p" fill="var(--c-rain)" radius={[3, 3, 0, 0]} name="Rain" maxBarSize={14} />
                <Line yAxisId="pct" type="monotone" dataKey="prob" stroke="var(--ink-2)" strokeWidth={1.8} dot={false} name="Chance" />
              </ComposedChart>
            ) : tab === "wind" ? (
              <ComposedChart {...common}>
                <defs>
                  <linearGradient id="g-wind" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="var(--c-wind)" stopOpacity=".4" />
                    <stop offset="1" stopColor="var(--c-wind)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {grid}
                {bands}
                {x}
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} />
                {tooltip}
                {nowLine}
                <Area type="monotone" dataKey="w" stroke="var(--c-wind)" strokeWidth={2.4} fill="url(#g-wind)" dot={false} name="Wind" />
                <Line type="monotone" dataKey="g" stroke="var(--ink-3)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Gusts" />
              </ComposedChart>
            ) : tab === "humidity" ? (
              <ComposedChart {...common}>
                {grid}
                {bands}
                {x}
                <YAxis domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} width={44} unit="%" />
                {tooltip}
                {nowLine}
                <Line type="monotone" dataKey="humidity" stroke="var(--c-humid)" strokeWidth={2.4} dot={false} name="Humidity" />
              </ComposedChart>
            ) : (
              <ComposedChart {...common}>
                {grid}
                {bands}
                {x}
                <YAxis domain={[0, "dataMax + 2"]} tick={AXIS} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
                {tooltip}
                {nowLine}
                <ReferenceLine y={6} stroke="var(--warn)" strokeDasharray="4 4" label={{ value: "High", position: "insideTopRight", fill: "var(--warn)", fontSize: 11 }} />
                <Bar dataKey="uvIndex" fill="var(--c-uv)" radius={[3, 3, 0, 0]} name="UV" maxBarSize={14} />
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </figure>
      )}
      <p className="chart__legend">
        <i className="swatch swatch--night" /> Night
        {tab === "temperature" && (
          <>
            {" · "}
            <i className="swatch swatch--feels" /> Feels like
          </>
        )}
        {tab === "wind" && (
          <>
            {" · "}
            <i className="swatch swatch--feels" /> Gusts
          </>
        )}
      </p>
    </div>
  );
}
