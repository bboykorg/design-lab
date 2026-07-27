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

# host -> (comma-separated list of env var names to read keys from, auth style)
_HOSTS = {
    "api.cerebras.ai": ("CEREBRAS_API_KEYS,CEREBRAS_API_KEY", "bearer"),
    "openrouter.ai": ("OPENROUTER_API_KEYS,OPENROUTER_API_KEY", "bearer"),
    "api.anthropic.com": (
        "ANTHROPIC_API_KEYS,ANTHROPIC_API_KEY,CLAUDE_API_KEYS,CLAUDE_API_KEY",
        "anthropic",
    ),
    "generativelanguage.googleapis.com": ("GEMINI_API_KEYS,GEMINI_API_KEY", "goog"),
    "open.bigmodel.cn": ("GLM_API_KEYS,GLM_API_KEY", "bearer"),
    "api.mistral.ai": ("MISTRAL_API_KEYS,MISTRAL_API_KEY", "bearer"),
}
_counters = {}
_lock = threading.Lock()


def _keys(env_names: str):
    out = []
    for name in env_names.split(","):
        out += [k.strip() for k in os.getenv(name.strip(), "").split(",") if k.strip()]
    return out


def _next_key(host: str, keys):
    """Round-robin the available keys for a host so load spreads across them."""
    if not keys:
        return None
    with _lock:
        i = _counters.get(host, 0) % len(keys)
        _counters[host] = (i + 1) % len(keys)
    return keys[i]


@router.api_route("/proxy", methods=["POST"])
async def proxy(request: Request):
    target = request.query_params.get("url")
    if not target:
        raise HTTPException(status_code=400, detail="missing url")
    target = unquote(target)
    parsed = urlparse(target)
    host = (parsed.hostname or "").lower()
    if host not in _HOSTS:
        raise HTTPException(status_code=403, detail=f"host not allowed: {host}")

    env_names, auth = _HOSTS[host]
    key = _next_key(host, _keys(env_names))
    if not key:
        first = env_names.split(",")[0]
        raise HTTPException(status_code=503, detail=f"нет ключа для {host} — задай {first} в .env")

    # Ask for an uncompressed body: the response is re-streamed to the browser
    # without a Content-Encoding header, so compressed bytes would be garbage.
    headers = {"Content-Type": "application/json", "Accept-Encoding": "identity"}
    if auth == "goog":
        headers["x-goog-api-key"] = key
    elif auth == "anthropic":
        # Anthropic's native Messages API wants x-api-key + a version header;
        # its OpenAI-compatible /v1/chat/completions endpoint takes a Bearer
        # token, which is what the frontend speaks.
        if "/v1/messages" in (parsed.path or ""):
            headers["x-api-key"] = key
            headers["anthropic-version"] = os.getenv("ANTHROPIC_VERSION", "2023-06-01")
        else:
            headers["Authorization"] = "Bearer " + key
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
            # aiter_bytes (not aiter_raw) decodes gzip/deflate if the provider
            # compresses the body anyway, so the client always gets plain bytes.
            async for chunk in r.aiter_bytes():
                yield chunk
        finally:
            await r.aclose()
            await client.aclose()

    return StreamingResponse(gen(), status_code=r.status_code, media_type=ctype)
