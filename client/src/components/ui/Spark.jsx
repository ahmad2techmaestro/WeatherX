/** Tiny trend line for a series of numbers. Decorative: the figures beside it carry the meaning. */
export default function Spark({ values, width = 120, height = 34 }) {
  const v = values.filter((n) => Number.isFinite(n));

  if (v.length < 2) return null;

  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || 1;
  const pts = v.map((n, i) => [(i / (v.length - 1)) * width, height - 4 - ((n - min) / span) * (height - 8)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");

  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true" focusable="false">
      <path d={`${d} L${width} ${height} L0 ${height}Z`} className="spark__fill" />
      <path d={d} className="spark__line" />
      <circle cx={pts[0][0]} cy={pts[0][1]} r="2.5" className="spark__dot" />
    </svg>
  );
}
