"""/api/ocr — proxy to OCR.space.

Turns screenshots into plain text on the server (key stays server-side), so
EVERY model — even ones without native vision — can "see" what the user
attached. The same helper (`ocr_images`) is reused by the AI flow to prepend
recognized text to the prompt.
"""
import re
from typing import List, Optional, Tuple

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from . import config

router = APIRouter(prefix="/api", tags=["ocr"])

_DATAURL = re.compile(r"^data:(image/[a-z0-9.+-]+);base64,(.+)$", re.I)


class OCRRequest(BaseModel):
    images: List[str] = Field(..., min_length=1, max_length=12)  # data: URLs or public image URLs
    language: Optional[str] = None


class OCRResponse(BaseModel):
    text: str
    per_image: List[str]
    engine: str
    ok: bool


async def _ocr_one(client: httpx.AsyncClient, image: str, language: str) -> str:
    """Recognize one image (data URL or http(s) URL). Returns text ('' if none)."""
    image = image or ""
    form = {
        "apikey": config.OCR_API_KEY,
        "language": language or config.OCR_LANGUAGE,
        "OCREngine": config.OCR_ENGINE,
        "scale": "true",
        "isOverlayRequired": "false",
    }
    if _DATAURL.match(image):
        form["base64Image"] = image
    elif image.startswith("http://") or image.startswith("https://"):
        form["url"] = image
    else:
        return ""
    r = await client.post(config.OCR_ENDPOINT, data=form)
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"OCR.space вернул {r.status_code}: {r.text[:200]}")
    data = r.json()
    if data.get("IsErroredOnProcessing"):
        msg = data.get("ErrorMessage") or "ошибка распознавания"
        if isinstance(msg, list):
            msg = "; ".join(str(m) for m in msg)
        raise HTTPException(status_code=502, detail=f"OCR.space: {msg}")
    parts = [p.get("ParsedText", "") for p in (data.get("ParsedResults") or [])]
    return "\n".join(t.strip() for t in parts if t and t.strip())


async def ocr_images(images: List[str], language: Optional[str] = None) -> Tuple[str, List[str]]:
    """Recognize several images. Returns (joined_text, per_image_text). Raises on transport/API errors."""
    per: List[str] = []
    imgs = [i for i in (images or []) if i][: config.OCR_MAX_IMAGES]
    if not imgs:
        return "", []
    async with httpx.AsyncClient(timeout=config.OCR_TIMEOUT) as client:
        for img in imgs:
            per.append(await _ocr_one(client, img, language or config.OCR_LANGUAGE))
    return "\n\n".join(t for t in per if t), per


async def ocr_images_safe(images: List[str], language: Optional[str] = None) -> str:
    """Best-effort OCR that never raises — used inline by the AI flow."""
    try:
        text, _ = await ocr_images(images, language)
        return text
    except Exception:
        return ""


@router.post("/ocr", response_model=OCRResponse)
async def ocr(req: OCRRequest):
    if not config.OCR_ENABLED:
        raise HTTPException(status_code=503, detail="OCR отключён на сервере (OCR_ENABLED=0)")
    try:
        text, per = await ocr_images(req.images, req.language)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Не удалось связаться с OCR.space: {e}")
    return OCRResponse(text=text, per_image=per, engine=config.OCR_ENGINE, ok=bool(text))
