"""
Sky condition from a photo using classical computer vision (colour and texture statistics on the sky region).

This is a transparent heuristic, not a trained neural network. It looks at the upper part of the photo, measures how
much of it is blue sky, bright/white cloud, grey cloud or dark cloud, how hazy (low contrast, warm tinted) it is,
and returns a label with a confidence and an estimated cloud cover. Photos that are mostly not sky return "uncertain".
"""
from __future__ import annotations

import io

import numpy as np
from PIL import Image, ImageOps

Image.MAX_IMAGE_PIXELS = 25_000_000  # refuse decompression bombs
MAX_SIDE = 640
SKY_TOP_FRACTION = 0.6


class BadImage(ValueError):
    pass


def load(data: bytes) -> np.ndarray:
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception as e:  # PIL raises many types
        raise BadImage("That file isn't a readable image.") from e
    img = ImageOps.exif_transpose(img).convert("RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    return np.asarray(img, dtype=np.float32) / 255.0


def _rgb_to_hsv(a: np.ndarray):
    mx = a.max(axis=2)
    mn = a.min(axis=2)
    d = mx - mn
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0.0)
    return mx, s


def classify(arr: np.ndarray) -> dict:
    h = arr.shape[0]
    sky = arr[: max(8, int(h * SKY_TOP_FRACTION))]
    r, g, b = sky[..., 0], sky[..., 1], sky[..., 2]
    v, s = _rgb_to_hsv(sky)
    lum = 0.299 * r + 0.587 * g + 0.114 * b

    blue = (b > r + 0.06) & (b >= g - 0.02) & (s > 0.18) & (v > 0.35)
    white = (s < 0.2) & (v > 0.7)
    grey = (s < 0.2) & (v >= 0.4) & (v <= 0.7)
    dark = (s < 0.3) & (v < 0.4) & (v > 0.12)
    haze = (s >= 0.1) & (s <= 0.45) & (r > b + 0.05) & (v > 0.5)  # warm, washed-out sky (dust, smog)
    n = float(blue.size)
    f = {k: float(m.sum() / n) for k, m in {"blue": blue, "white": white, "grey": grey, "dark": dark, "haze": haze}.items()}
    sky_like = f["blue"] + f["white"] + f["grey"] + f["dark"] + f["haze"]

    mean_v = float(v.mean())
    contrast = float(lum.std())
    warm = float((r - b).mean())  # > 0 = warm/brown tint
    gy, gx = np.gradient(lum)
    texture = float(np.hypot(gx, gy).mean())

    features = {
        "blueFraction": round(f["blue"], 3), "whiteCloudFraction": round(f["white"], 3), "greyCloudFraction": round(f["grey"], 3),
        "darkCloudFraction": round(f["dark"], 3), "hazeFraction": round(f["haze"], 3), "skyLikeFraction": round(sky_like, 3), "brightness": round(mean_v, 3),
        "contrast": round(contrast, 3), "warmTint": round(warm, 3), "texture": round(texture, 4),
    }

    cloudy = f["white"] + f["grey"] + f["dark"]
    visible = f["blue"] + cloudy
    cover = round(100 * cloudy / visible) if visible > 0.05 else None

    scores: dict[str, float] = {}
    scores["clear"] = max(0.0, f["blue"] - 0.5) * 2 + max(0.0, 0.15 - cloudy)
    scores["partly_cloudy"] = min(f["blue"], cloudy) * 2.2 if f["blue"] >= 0.15 and cloudy >= 0.12 else 0.0
    neutral = abs(warm) < 0.08
    scores["overcast"] = (cloudy - f["dark"]) * (1.0 if f["blue"] < 0.12 and neutral else 0.3) if cloudy > 0.55 and f["dark"] < 0.4 else 0.0
    scores["dark_clouds"] = f["dark"] * 1.4 if f["dark"] > 0.35 and f["blue"] < 0.15 else 0.0
    scores["hazy"] = (0.35 - contrast) * 2.5 + warm * 3 if (contrast < 0.12 and warm > 0.05 and mean_v > 0.45 and f["blue"] < 0.3) else 0.0

    if mean_v < 0.18:
        label, conf, note = "night_or_dark", 0.9, "The photo is very dark (night or heavy gloom)."
    elif sky_like < 0.45:
        label, conf = "uncertain", 0.0
        note = "Most of the upper part of the photo doesn't look like sky."
    else:
        label, top = max(scores.items(), key=lambda kv: kv[1])
        if top <= 0.15:
            label, conf, note = "uncertain", 0.0, "The sky doesn't clearly match any condition."
        else:
            second = sorted(scores.values())[-2]
            conf = round(min(0.95, 0.5 + 0.5 * min(1.0, (top - second) / max(top, 1e-6))) * min(1.0, 0.6 + sky_like / 2), 2)
            note = ""
    return {"label": label, "confidence": conf, "cloudCoverPercent": cover if label not in ("uncertain", "night_or_dark") else None, "features": features, "note": note,
            "method": "classical-cv (colour and texture statistics, upper 60% of the photo)",
            "caveat": "A heuristic estimate, not a trained model and not a weather observation."}


def analyse(data: bytes) -> dict:
    return classify(load(data))
