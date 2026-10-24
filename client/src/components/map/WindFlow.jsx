import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

const COUNT = 1100;
const MAX_AGE = 90;

/** Wind vector (east, north) in km/h from a "from" direction in degrees. */
const vector = (speed, fromDeg) => {
  const rad = (fromDeg * Math.PI) / 180;

  return [-speed * Math.sin(rad), -speed * Math.cos(rad)];
};

/** Inverse-distance blend of the nearest grid values: smooth, and exact at the grid points. */
function sample(points, lat, lon) {
  let wSum = 0;
  let u = 0;
  let v = 0;

  for (const p of points) {
    const d2 = (p.latitude - lat) ** 2 + ((p.longitude - lon) * Math.cos((lat * Math.PI) / 180)) ** 2;
    const w = 1 / (d2 + 0.02);
    const [pu, pv] = p.vec;

    wSum += w;
    u += pu * w;
    v += pv * w;
  }

  return wSum ? [u / wSum, v / wSum] : [0, 0];
}

/**
 * Animated wind streamlines drawn from the live grid values. Pure decoration of real data:
 * direction and relative speed at any point come from the nearest measured grid points.
 */
export default function WindFlow({ grid, enabled }) {
  const map = useMap();
  const canvasRef = useRef(null);
  const gridRef = useRef([]);

  useEffect(() => {
    gridRef.current = grid
      .filter((p) => Number.isFinite(p.windSpeed) && Number.isFinite(p.windDirection))
      .map((p) => ({ ...p, vec: vector(p.windSpeed, p.windDirection) }));
  }, [grid]);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (!enabled || reduce) return undefined;

    const canvas = document.createElement("canvas");

    canvas.className = "windflow";
    map.getContainer().appendChild(canvas);
    canvasRef.current = canvas;

    const ctx = canvas.getContext("2d");
    let w = 0;
    let h = 0;
    let raf = 0;
    let particles = [];

    const resize = () => {
      const size = map.getSize();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      w = size.x;
      h = size.y;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
    };

    const spawn = () => ({ x: Math.random() * w, y: Math.random() * h, age: Math.floor(Math.random() * MAX_AGE) });

    const reset = () => {
      resize();
      particles = Array.from({ length: COUNT }, spawn);
    };

    const frame = () => {
      const pts = gridRef.current;

      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.07)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";

      if (pts.length) {
        ctx.lineWidth = 1.25;

        for (const p of particles) {
          const ll = map.containerPointToLatLng([p.x, p.y]);
          const [u, v] = sample(pts, ll.lat, ll.lng);
          const speed = Math.hypot(u, v);
          const k = 0.045; // pixels per km/h per frame
          const nx = p.x + u * k;
          const ny = p.y - v * k;

          ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.9, 0.25 + speed / 60)})`;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(nx, ny);
          ctx.stroke();

          p.x = nx;
          p.y = ny;
          p.age += 1;

          if (p.age > MAX_AGE || p.x < 0 || p.x > w || p.y < 0 || p.y > h) Object.assign(p, spawn(), { age: 0 });
        }
      }

      raf = requestAnimationFrame(frame);
    };

    const clear = () => ctx.clearRect(0, 0, w, h);

    reset();
    map.on("movestart zoomstart", clear);
    map.on("moveend zoomend resize", reset);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      map.off("movestart zoomstart", clear);
      map.off("moveend zoomend resize", reset);
      canvas.remove();
    };
  }, [enabled, map]);

  return null;
}
