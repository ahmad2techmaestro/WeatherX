import io

import numpy as np
import pytest
from PIL import Image

from app import sky

RNG = np.random.default_rng(1)


def png(arr):
    buf = io.BytesIO()
    Image.fromarray(np.clip(arr * 255, 0, 255).astype("uint8")).save(buf, "PNG")
    return buf.getvalue()


def canvas(h=240, w=320, rgb=(0.5, 0.5, 0.5), noise=0.01):
    a = np.ones((h, w, 3), dtype=np.float32) * np.array(rgb, dtype=np.float32)
    return a + RNG.normal(0, noise, a.shape).astype(np.float32)


def blobs(a, rgb, n, r=30):
    h, w, _ = a.shape
    yy, xx = np.mgrid[0:h, 0:w]
    for _ in range(n):
        cy, cx = RNG.integers(0, h * 0.6), RNG.integers(0, w)
        a[((yy - cy) ** 2 + (xx - cx) ** 2) < r * r] = rgb
    return a


def label(arr):
    return sky.analyse(png(arr))


def test_clear_blue_sky():
    a = canvas(rgb=(0.35, 0.6, 0.9))
    out = label(a)
    assert out["label"] == "clear"
    assert out["cloudCoverPercent"] < 15
    assert out["confidence"] > 0.5


def test_partly_cloudy():
    a = blobs(canvas(rgb=(0.35, 0.6, 0.9)), (0.95, 0.95, 0.95), 14, 28)
    out = label(a)
    assert out["label"] == "partly_cloudy"
    assert 15 <= out["cloudCoverPercent"] <= 85


def test_overcast_grey():
    out = label(canvas(rgb=(0.8, 0.8, 0.82)))
    assert out["label"] == "overcast"
    assert out["cloudCoverPercent"] >= 90


def test_dark_storm_clouds():
    out = label(canvas(rgb=(0.28, 0.29, 0.32)))
    assert out["label"] == "dark_clouds"


def test_night():
    out = label(canvas(rgb=(0.04, 0.05, 0.09)))
    assert out["label"] == "night_or_dark"
    assert out["cloudCoverPercent"] is None


def test_hazy_warm_low_contrast():
    out = label(canvas(rgb=(0.78, 0.7, 0.58), noise=0.005))
    assert out["label"] == "hazy"


def test_not_a_sky_is_uncertain():
    out = label(canvas(rgb=(0.2, 0.55, 0.15)))  # green field filling the frame
    assert out["label"] == "uncertain"
    assert out["confidence"] == 0.0
    assert out["note"]


def test_features_and_caveat_present():
    out = label(canvas(rgb=(0.35, 0.6, 0.9)))
    assert {"blueFraction", "contrast", "texture"} <= set(out["features"])
    assert "not a trained model" in out["caveat"]


def test_rejects_garbage_and_oversize():
    with pytest.raises(sky.BadImage):
        sky.analyse(b"not an image at all")
    with pytest.raises(sky.BadImage):
        sky.analyse(b"\xff\xd8\xff" + b"\x00" * 50)


def test_large_image_is_downscaled():
    out = label(canvas(h=1500, w=2000, rgb=(0.35, 0.6, 0.9)))
    assert out["label"] == "clear"
