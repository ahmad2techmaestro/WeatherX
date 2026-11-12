from __future__ import annotations

import os
from typing import List

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from . import anomaly, sky

VERSION = "1.0.0"
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAGIC = (b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n", b"RIFF")  # JPEG, PNG, WebP

app = FastAPI(title="WeatherX ML service", version=VERSION)


class Day(BaseModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    tmax: float = Field(ge=-90, le=65)
    tmin: float = Field(ge=-90, le=65)


class AnomalyRequest(BaseModel):
    history: List[Day] = Field(min_length=anomaly.MIN_SAMPLES, max_length=4000)
    days: List[Day] = Field(min_length=1, max_length=16)

    @field_validator("days")
    @classmethod
    def _pairs(cls, v):
        for d in v:
            if d.tmin > d.tmax + 0.5:
                raise ValueError("tmin cannot be above tmax")
        return v


@app.get("/health")
def health():
    return {"status": "ok", "version": VERSION, "features": ["anomaly", "sky"]}


@app.post("/v1/anomaly")
def post_anomaly(req: AnomalyRequest):
    return anomaly.analyse([h.model_dump() for h in req.history], [d.model_dump() for d in req.days])


@app.post("/v1/sky")
async def post_sky(request: Request):
    data = await request.body()
    if not data:
        raise HTTPException(400, "Send the image bytes as the request body.")
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Image is larger than 5 MB.")
    if not data.startswith(MAGIC):
        raise HTTPException(415, "Only JPEG, PNG or WebP images are supported.")
    try:
        return sky.analyse(data)
    except sky.BadImage as e:
        raise HTTPException(422, str(e))


@app.exception_handler(Exception)
async def unexpected(_: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": "Unexpected error in the ML service."})
