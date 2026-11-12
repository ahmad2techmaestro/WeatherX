import io

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app

client = TestClient(app)


def png_bytes(rgb=(90, 150, 230)):
    buf = io.BytesIO()
    Image.fromarray(np.ones((120, 160, 3), dtype="uint8") * np.array(rgb, dtype="uint8")).save(buf, "PNG")
    return buf.getvalue()


def test_sky_endpoint_happy_path():
    r = client.post("/v1/sky", content=png_bytes(), headers={"content-type": "image/png"})
    assert r.status_code == 200
    assert r.json()["label"] == "clear"


def test_sky_endpoint_rejections():
    assert client.post("/v1/sky", content=b"").status_code == 400
    assert client.post("/v1/sky", content=b"GIF89a....").status_code == 415
    assert client.post("/v1/sky", content=b"\xff\xd8\xff" + b"junk" * 20).status_code == 422
    assert client.post("/v1/sky", content=b"\x89PNG\r\n\x1a\n" + b"0" * (5 * 1024 * 1024 + 1)).status_code == 413
