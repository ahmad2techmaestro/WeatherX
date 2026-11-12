/**
 * Sky Check that runs in the browser. Same transparent heuristic as ml-service/app/sky.py (colour and texture
 * statistics on the upper 60% of the photo), so the feature works without the optional Python ML service.
 * The photo never leaves the device: only the resulting numbers are sent to the server for the forecast comparison.
 */
const MAX_SIDE = 640;
const SKY_TOP = 0.6;
const r3 = (x) => Math.round(x * 1000) / 1000;

async function pixels(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(8, Math.round(bmp.width * scale));
  const h = Math.max(8, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return { data: ctx.getImageData(0, 0, w, h).data, w, h };
}

export async function classifySky(file) {
  let img;
  try {
    img = await pixels(file);
  } catch {
    throw new Error("That file isn't a readable image.");
  }

  const { data, w } = img;
  const rows = Math.max(8, Math.floor(img.h * SKY_TOP));
  const n = rows * w;
  const lum = new Float32Array(n);
  const c = { blue: 0, white: 0, grey: 0, dark: 0, haze: 0 };
  let sumV = 0;
  let sumWarm = 0;
  let sumLum = 0;

  for (let i = 0; i < n; i += 1) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;
    const v = Math.max(r, g, b);
    const s = v > 1e-6 ? (v - Math.min(r, g, b)) / v : 0;
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    lum[i] = l;
    sumV += v;
    sumWarm += r - b;
    sumLum += l;
    if (b > r + 0.06 && b >= g - 0.02 && s > 0.18 && v > 0.35) c.blue += 1;
    if (s < 0.2 && v > 0.7) c.white += 1;
    if (s < 0.2 && v >= 0.4 && v <= 0.7) c.grey += 1;
    if (s < 0.3 && v < 0.4 && v > 0.12) c.dark += 1;
    if (s >= 0.1 && s <= 0.45 && r > b + 0.05 && v > 0.5) c.haze += 1;
  }

  const f = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v / n]));
  const skyLike = f.blue + f.white + f.grey + f.dark + f.haze;
  const meanV = sumV / n;
  const meanLum = sumLum / n;
  const warm = sumWarm / n;
  let varSum = 0;
  for (let i = 0; i < n; i += 1) varSum += (lum[i] - meanLum) ** 2;
  const contrast = Math.sqrt(varSum / n);

  let grad = 0;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const gx = x === 0 ? lum[i + 1] - lum[i] : x === w - 1 ? lum[i] - lum[i - 1] : (lum[i + 1] - lum[i - 1]) / 2;
      const gy = y === 0 ? lum[i + w] - lum[i] : y === rows - 1 ? lum[i] - lum[i - w] : (lum[i + w] - lum[i - w]) / 2;
      grad += Math.hypot(gx, gy);
    }
  }
  const texture = grad / n;

  const cloudy = f.white + f.grey + f.dark;
  const visible = f.blue + cloudy;
  const cover = visible > 0.05 ? Math.round((100 * cloudy) / visible) : null;

  const scores = {
    clear: Math.max(0, f.blue - 0.5) * 2 + Math.max(0, 0.15 - cloudy),
    partly_cloudy: f.blue >= 0.15 && cloudy >= 0.12 ? Math.min(f.blue, cloudy) * 2.2 : 0,
    overcast: cloudy > 0.55 && f.dark < 0.4 ? (cloudy - f.dark) * (f.blue < 0.12 && Math.abs(warm) < 0.08 ? 1 : 0.3) : 0,
    dark_clouds: f.dark > 0.35 && f.blue < 0.15 ? f.dark * 1.4 : 0,
    hazy: contrast < 0.12 && warm > 0.05 && meanV > 0.45 && f.blue < 0.3 ? (0.35 - contrast) * 2.5 + warm * 3 : 0,
  };

  let label;
  let confidence;
  let note = "";
  if (meanV < 0.18) {
    label = "night_or_dark";
    confidence = 0.9;
    note = "The photo is very dark (night or heavy gloom).";
  } else if (skyLike < 0.45) {
    label = "uncertain";
    confidence = 0;
    note = "Most of the upper part of the photo doesn't look like sky.";
  } else {
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [top, topScore] = sorted[0];
    if (topScore <= 0.15) {
      label = "uncertain";
      confidence = 0;
      note = "The sky doesn't clearly match any condition.";
    } else {
      label = top;
      const second = sorted[1][1];
      confidence = Math.round(Math.min(0.95, 0.5 + 0.5 * Math.min(1, (topScore - second) / Math.max(topScore, 1e-6))) * Math.min(1, 0.6 + skyLike / 2) * 100) / 100;
    }
  }

  return {
    label,
    confidence,
    cloudCoverPercent: label === "uncertain" || label === "night_or_dark" ? null : cover,
    note,
    features: {
      blueFraction: r3(f.blue), whiteCloudFraction: r3(f.white), greyCloudFraction: r3(f.grey), darkCloudFraction: r3(f.dark), hazeFraction: r3(f.haze),
      skyLikeFraction: r3(skyLike), brightness: r3(meanV), contrast: r3(contrast), warmTint: r3(warm), texture: Math.round(texture * 10000) / 10000,
    },
    method: "colour and texture statistics on the upper 60% of the photo, computed on your device",
    caveat: "A heuristic estimate, not a trained model and not a weather observation.",
  };
}
