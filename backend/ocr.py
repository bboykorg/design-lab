"""/api/ocr — OCR.space relay so every model can "see" screenshots.

The browser sends an image (data URL or bare base64); this endpoint forwards it
to OCR.space with a server-side key and returns the recognised text. The
frontend then puts that text into the prompt, so even models without vision get
the contents of the user's screenshot.

The OCR key never reaches the client, and the endpoint requires a login — same
approach as /api/proxy.
"""
import os
import threading
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from .auth import require_user
from .ratelimit import guard

router = APIRouter(prefix="/api", tags=["ocr"])

OCR_URL = "https://api.ocr.space/parse/image"
_ENV_NAMES = "OCR_SPACE_API_KEYS,OCR_SPACE_API_KEY,OCR_API_KEYS,OCR_API_KEY"
# OCR.space rejects payloads over ~1 MB on the free tier.
_MAX_B64 = 1024 * 1024

_counter = 0
_lock = threading.Lock()


def _keys():
    out = []
    for name in _ENV_NAMES.split(","):
        out += [k.strip() for k in os.getenv(name.strip(), "").split(",") if k.strip()]
    return out


def _next_key(keys):
    """Round-robin the keys, exactly like the provider proxy does."""
    global _counter
    if not keys:
        return None
    with _lock:
        i = _counter % len(keys)
        _counter = (i + 1) % len(keys)
    return keys[i]


class OcrRequest(BaseModel):
    image: str                          # data URL or bare base64
    language: Optional[str] = None      # "eng", "rus", ... (default: auto-try)
    engine: Optional[int] = None        # OCR.space OCREngine (1 or 2)


@router.post("/ocr")
async def ocr(req: OcrRequest, request: Request, user=Depends(require_user)):
    guard("ocr", request, user)
    key = _next_key(_keys())
    if not key:
        raise HTTPException(
            status_code=503,
            detail="нет ключа OCR — задай OCR_SPACE_API_KEYS в .env / Render",
        )

    image = (req.image or "").strip()
    if not image:
        raise HTTPException(status_code=400, detail="empty image")
    if not image.startswith("data:"):
        image = "data:image/png;base64," + image
    if len(image) > _MAX_B64:
        raise HTTPException(
            status_code=413,
            detail="скриншот больше 1 МБ — OCR.space такой не примет, сжми картинку",
        )

    # Engine 2 is the better Latin engine; engine 1 is the one that knows
    # Cyrillic. Without an explicit language: try 2/eng, then fall back to 1/rus.
    if req.language:
        attempts = [(req.language, req.engine or (2 if req.language == "eng" else 1))]
    else:
        attempts = [("eng", req.engine or 2), ("rus", 1)]

    errors = []
    async with httpx.AsyncClient(timeout=90) as client:
        for lang, engine in attempts:
            form = {
                "apikey": key,
                "base64Image": image,
                "language": lang,
                "OCREngine": str(engine),
                "isOverlayRequired": "false",
                "detectOrientation": "true",
                "scale": "true",
            }
            try:
                r = await client.post(OCR_URL, data=form)
            except httpx.HTTPError as e:
                raise HTTPException(status_code=502, detail=f"OCR upstream error: {e}")

            if r.status_code >= 400:
                raise HTTPException(status_code=r.status_code, detail=f"OCR error: {r.text[:300]}")

            try:
                data = r.json()
            except ValueError:
                raise HTTPException(status_code=502, detail="OCR: некорректный ответ сервиса")

            if data.get("IsErroredOnProcessing"):
                msg = data.get("ErrorMessage") or data.get("ErrorDetails") or "unknown error"
                if isinstance(msg, list):
                    msg = "; ".join(str(m) for m in msg)
                errors.append(f"{lang}/{engine}: {msg}")
                continue

            parts = data.get("ParsedResults") or []
            text = "\n".join((p.get("ParsedText") or "") for p in parts).strip()
            if text:
                return {"text": text, "language": lang, "engine": engine}

    # No error, just nothing readable on the image.
    if errors and len(errors) == len(attempts):
        raise HTTPException(status_code=502, detail="OCR: " + " | ".join(errors))
    return {"text": "", "language": attempts[-1][0], "engine": attempts[-1][1]}
