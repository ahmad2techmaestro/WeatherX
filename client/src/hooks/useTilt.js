import { useCallback, useRef } from "react";

/**
 * Subtle 3D tilt that follows the pointer. Returns props to spread on the element.
 * Does nothing for touch input or when the user prefers reduced motion.
 */
export default function useTilt({ max = 5 } = {}) {
  const ref = useRef(null);
  const frame = useRef(0);

  const onPointerMove = useCallback(
    (event) => {
      if (event.pointerType === "touch" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

      const { clientX, clientY } = event;

      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const el = ref.current;

        if (!el) return;

        const r = el.getBoundingClientRect();
        const x = (clientX - r.left) / r.width - 0.5;
        const y = (clientY - r.top) / r.height - 0.5;

        el.style.setProperty("--tilt-x", `${(-y * max).toFixed(2)}deg`);
        el.style.setProperty("--tilt-y", `${(x * max).toFixed(2)}deg`);
        el.style.setProperty("--glow-x", `${((x + 0.5) * 100).toFixed(1)}%`);
        el.style.setProperty("--glow-y", `${((y + 0.5) * 100).toFixed(1)}%`);
      });
    },
    [max]
  );

  const onPointerLeave = useCallback(() => {
    cancelAnimationFrame(frame.current);
    ref.current?.style.setProperty("--tilt-x", "0deg");
    ref.current?.style.setProperty("--tilt-y", "0deg");
  }, []);

  return { ref, onPointerMove, onPointerLeave, "data-tilt": "" };
}
