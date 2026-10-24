const hex = (h) => {
  const n = parseInt(h.replace("#", ""), 16);

  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** Linear blend of two hex colours. t=0 → a, t=1 → b. */
export const mix = (a, b, t) => {
  const A = hex(a);
  const B = hex(b);

  return toHex(A.map((v, i) => v + (B[i] - v) * t));
};

export const luminance = (h) => {
  const [r, g, b] = hex(h).map((v) => {
    const c = v / 255;

    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);

  return (hi + 0.05) / (lo + 0.05);
};

/** Small deterministic PRNG so "random" stars and trees are stable between renders. */
export function seeded(seed) {
  let a = seed >>> 0;

  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
