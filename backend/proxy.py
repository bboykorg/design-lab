"""/api/proxy — same-origin relay to the AI providers.

The single-file frontend keeps its exact UI and logic, but ships with NO keys.
Every provider call goes to `/api/proxy?url=<encoded provider url>`; this relay
injects the correct server-side key (from .env / environment), so secrets never
live in the client or in git. Responses (incl. SSE streams) pass straight
through with their original status and content-type.

Only a fixed allow-list of AI hosts is proxied — it is NOT an open proxy.
"""
import os
import threading
from urllib.parse import urlparse, unquote

import httpx
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import Response, StreamingResponse

from . import config

router = APIRouter(prefix="/api", tags=["proxy"])

# host -> auth style. Every host is authenticated with the single AI_API_KEY.
_HOSTS = {
    "api.cerebras.ai": "bearer",
    "openrouter.ai": "bearer",
    "generativelanguage.googleapis.com": "goog",
    "open.bigmodel.cn": "bearer",
    "api.mistral.ai": "bearer",
}
_counter = [0]
_lock = threading.Lock()


def _keys():
    """All keys come from the single AI_API_KEY env var (comma-separated allowed)."""
    return [k.strip() for k in os.getenv("AI_API_KEY", "").split(",") if k.strip()]


def _next_key(keys):
    """Round-robin the available keys so load spreads across them."""
    if not keys:
        return None
    with _lock:
        i = _counter[0] % len(keys)
        _counter[0] = (i + 1) % len(keys)
    return keys[i]


@router.api_route("/proxy", methods=["POST"])
async def proxy(request: Request):
    target = request.query_params.get("url")
    if not target:
        raise HTTPException(status_code=400, detail="missing url")
    target = unquote(target)
    host = (urlparse(target).hostname or "").lower()
    if host not in _HOSTS:
        raise HTTPException(status_code=403, detail=f"host not allowed: {host}")

    auth = _HOSTS[host]
    key = _next_key(_keys())
    if not key:
        raise HTTPException(status_code=503, detail="нет ключа — задай AI_API_KEY в .env")

    headers = {"Content-Type": "application/json"}
    if auth == "goog":
        headers["x-goog-api-key"] = key
    else:
        headers["Authorization"] = "Bearer " + key
        if host == "openrouter.ai":
            headers["HTTP-Referer"] = os.getenv("PUBLIC_URL", "https://design-lab.onrender.com")
            headers["X-Title"] = "Design Lab"

    body = await request.body()
    client = httpx.AsyncClient(timeout=config.AI_TIMEOUT)
    try:
        req = client.build_request("POST", target, content=body, headers=headers)
        r = await client.send(req, stream=True)
    except httpx.HTTPError as e:
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"upstream error: {e}")

    ctype = r.headers.get("content-type", "application/json")
    if r.status_code >= 400:
        data = await r.aread()
        await r.aclose()
        await client.aclose()
        return Response(content=data, status_code=r.status_code, media_type=ctype)

    async def gen():
        try:
            async for chunk in r.aiter_raw():
                yield chunk
        finally:
            await r.aclose()
            await client.aclose()

    return StreamingResponse(gen(), status_code=r.status_code, media_type=ctype)
