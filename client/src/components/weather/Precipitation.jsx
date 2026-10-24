import { useEffect, useRef } from "react";

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Canvas particle layer for rain, snow and hail. Particle count and speed follow the
 * real precipitation intensity; wind tilts the fall. The loop pauses with the tab
 * (requestAnimationFrame) and is skipped entirely for users who prefer reduced motion.
 */
export default function Precipitation({ kind, intensity = 0.5, wind = 0, className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;

    if (!canvas || !kind || reduceMotion()) return undefined;

    const ctx = canvas.getContext("2d");
    let width = 0;
    let height = 0;
    let particles = [];
    let raf = 0;
    let last = performance.now();

    // wind: -1 (to the left) … 1 (to the right)
    const tilt = Math.max(-0.6, Math.min(0.6, wind * 0.6));

    const spawn = (initial) => {
      const base = {
        x: Math.random() * (width + 100) - 50,
        y: initial ? Math.random() * height : -20,
      };

      if (kind === "snow") {
        return { ...base, r: 1 + Math.random() * 2.6, v: 28 + Math.random() * 50, sway: Math.random() * Math.PI * 2, amp: 10 + Math.random() * 22, a: 0.55 + Math.random() * 0.4 };
      }

      if (kind === "hail") {
        return { ...base, r: 1.6 + Math.random() * 1.8, v: 520 + Math.random() * 280, a: 0.8 };
      }

      const heavy = 0.5 + intensity;

      return { ...base, len: 8 + Math.random() * 16 * heavy, v: 520 + Math.random() * 480 * heavy, a: 0.22 + Math.random() * 0.4 };
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const density = kind === "snow" ? 0.00022 : kind === "hail" ? 0.00006 : 0.00052;
      const count = Math.max(12, Math.round(width * height * density * (0.35 + intensity)));

      particles = Array.from({ length: count }, () => spawn(true));
    };

    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);

      last = now;
      ctx.clearRect(0, 0, width, height);

      for (const p of particles) {
        if (kind === "snow") {
          p.sway += dt * 1.1;
          p.y += p.v * dt;
          p.x += (Math.sin(p.sway) * p.amp * 0.6 + tilt * 40) * dt;
          ctx.fillStyle = `rgba(255,255,255,${p.a})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        } else if (kind === "hail") {
          p.y += p.v * dt;
          p.x += tilt * p.v * dt * 0.7;
          ctx.fillStyle = `rgba(235,245,255,${p.a})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const dx = tilt * p.len;

          p.y += p.v * dt;
          p.x += tilt * p.v * dt;
          ctx.strokeStyle = `rgba(210,228,245,${p.a})`;
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - dx, p.y - p.len);
          ctx.stroke();
        }

        if (p.y > height + 10 || p.x < -60 || p.x > width + 60) Object.assign(p, spawn(false));
      }

      raf = requestAnimationFrame(frame);
    };

    resize();
    raf = requestAnimationFrame(frame);

    const observer = new ResizeObserver(resize);

    observer.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [kind, intensity, wind]);

  if (!kind) return null;

  return <canvas ref={ref} className={`wx-precip ${className}`} aria-hidden="true" />;
}
