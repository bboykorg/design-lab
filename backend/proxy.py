"""/api/proxy — same-origin relay to the AI providers.

The single-file frontend keeps its exact UI and logic, but ships with NO keys.
Every provider call goes to `/api/proxy?url=<encoded provider url>`; this relay
injects the correct server-side key (from .env / environment), so secrets never
live in the client or in git. Responses (incl. SSE streams) pass straight
through with their original status and content-type.

Only a fixed allow-list of AI hosts is proxied — it is NOT an open proxy.
"""
import json
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
    # Vyce AI — OpenAI-compatible, base_url https://vyceai.com/v1
    # Endpoints: /v1/chat/completions, /v1/messages, /v1/models, /v1/me
    "vyceai.com": ("VYCE_API_KEYS,VYCE_API_KEY", "bearer"),
    "www.vyceai.com": ("VYCE_API_KEYS,VYCE_API_KEY", "bearer"),
    "generativelanguage.googleapis.com": ("GEMINI_API_KEYS,GEMINI_API_KEY", "goog"),
    "open.bigmodel.cn": ("GLM_API_KEYS,GLM_API_KEY", "bearer"),
    "api.mistral.ai": ("MISTRAL_API_KEYS,MISTRAL_API_KEY", "bearer"),
}

_VYCE_ENV = "VYCE_API_KEYS,VYCE_API_KEY"
_VYCE_BASE = "https://vyceai.com/v1"
_VYCE_ENDPOINT = _VYCE_BASE + "/chat/completions"

# Models served by Vyce. The frontend is one huge file with several request
# paths (chat, constructor, streaming edits); instead of patching each of them,
# the relay looks at the "model" field and routes these to Vyce itself. Without
# this, a Vyce model could be sent to another provider's endpoint with the wrong
# key — which is exactly what produced 403s.
_VYCE_MODELS = {
    "auto",
    "claude-sonnet-5",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
    "claude-fable-5",
    "deepseek-v4-flash",
    "gemini-3.6-flash",
    "gemini-3.1-flash-lite",
    "glm-5.2",
    "minimax-m3",
    "mimo-v2.5-pro",
    "gpt-5.6-sol",
}

# vyceai.com sits behind Cloudflare, which challenges requests that do not look
# like they came from a normal client (httpx sends no User-Agent by default).
_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

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


def _model_of(body: bytes) -> str:
    try:
        data = json.loads(body.decode("utf-8", "ignore"))
    except (ValueError, AttributeError):
        return ""
    model = data.get("model") if isinstance(data, dict) else None
    return model.strip() if isinstance(model, str) else ""


def _vyce_headers(key: str) -> dict:
    return {
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Accept-Encoding": "identity",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": os.getenv("VYCE_USER_AGENT", _BROWSER_UA),
        "Origin": "https://vyceai.com",
        "Referer": "https://vyceai.com/",
    }


def _is_challenge(ctype: str, data: bytes) -> bool:
    """True when the provider replied with a Cloudflare interstitial, not JSON."""
    if "html" not in ctype.lower():
        return False
    head = data[:4096].decode("utf-8", "ignore").lower()
    return "just a moment" in head or "cf_chl_opt" in head or "cf-browser-verification" in head


@router.api_route("/proxy", methods=["POST"])
async def proxy(request: Request):
    target = request.query_params.get("url")
    if not target:
        raise HTTPException(status_code=400, detail="missing url")
    target = unquote(target)
    body = await request.body()

    host = (urlparse(target).hostname or "").lower()
    # Route by model first: a Vyce model always goes to Vyce, whatever endpoint
    # the frontend guessed.
    if _model_of(body) in _VYCE_MODELS and not host.endswith("vyceai.com"):
        target = _VYCE_ENDPOINT
        host = "vyceai.com"

    if host not in _HOSTS:
        raise HTTPException(status_code=403, detail=f"host not allowed: {host}")

    env_names, auth = _HOSTS[host]
    key = _next_key(host, _keys(env_names))
    if not key:
        first = env_names.split(",")[0]
        raise HTTPException(status_code=503, detail=f"нет ключа для {host} — задай {first} в .env")

    if host.endswith("vyceai.com"):
        headers = _vyce_headers(key)
    else:
        # Ask for an uncompressed body: the response is re-streamed to the
        # browser without a Content-Encoding header, so compressed bytes would
        # be garbage.
        headers = {"Content-Type": "application/json", "Accept-Encoding": "identity"}
        if auth == "goog":
            headers["x-goog-api-key"] = key
        else:
            headers["Authorization"] = "Bearer " + key
            if host == "openrouter.ai":
                headers["HTTP-Referer"] = os.getenv("PUBLIC_URL", "https://design-lab.onrender.com")
                headers["X-Title"] = "Design Lab"

    client = httpx.AsyncClient(timeout=config.AI_TIMEOUT, follow_redirects=True)
    try:
        req = client.build_request("POST", target, content=body, headers=headers)
        r = await client.send(req, stream=True)
    except httpx.HTTPError as e:
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"upstream error: {e}")

    ctype = r.headers.get("content-type", "application/json")

    # An HTML body always means "this is not an API answer" — usually a
    # Cloudflare bot check in front of the provider. Return a short, readable
    # error instead of dumping the challenge page into the chat.
    if "html" in ctype.lower():
        data = await r.aread()
        await r.aclose()
        await client.aclose()
        if _is_challenge(ctype, data):
            msg = (
                f"{host}: запрос заблокирован защитой Cloudflare (проверка браузера). "
                "Провайдер должен разрешить серверные запросы к API или дать отдельный адрес API."
            )
        else:
            msg = f"{host}: вместо ответа API вернулась HTML-страница (код {r.status_code})."
        return Response(
            content=json.dumps({"error": {"message": msg}}, ensure_ascii=False),
            status_code=502,
            media_type="application/json",
        )

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


@router.get("/vyce/check")
async def vyce_check():
    """Diagnose Vyce access from the server: key present? Cloudflare in the way?

    Calls the provider's own GET endpoints (/v1/me and /v1/models) and reports
    what came back. The key itself is never echoed — only how many are set.
    """
    keys = _keys(_VYCE_ENV)
    if not keys:
        return {
            "ok": False,
            "keys": 0,
            "reason": "no_key",
            "message": "Не задан VYCE_API_KEYS в переменных окружения.",
        }

    headers = _vyce_headers(keys[0])
    checks = {}
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        for name in ("me", "models"):
            entry = {"url": f"{_VYCE_BASE}/{name}"}
            try:
                r = await client.get(entry["url"], headers=headers)
            except httpx.HTTPError as e:
                entry.update(reason="network_error", message=str(e))
                checks[name] = entry
                continue

            ctype = r.headers.get("content-type", "")
            entry["status"] = r.status_code
            entry["contentType"] = ctype
            entry["cfRay"] = r.headers.get("cf-ray")
            if _is_challenge(ctype, r.content):
                entry.update(
                    reason="cloudflare_challenge",
                    message="Cloudflare вернул проверку браузера вместо ответа API.",
                )
            elif r.status_code in (401, 403):
                entry.update(
                    reason="auth_error",
                    message="Ключ отклонён провайдером.",
                    body=r.text[:300],
                )
            elif r.status_code >= 400:
                entry.update(reason="http_error", body=r.text[:300])
            else:
                entry.update(reason="ok", body=r.text[:300])
            checks[name] = entry

    ok = all(c.get("reason") == "ok" for c in checks.values())
    return {"ok": ok, "keys": len(keys), "checks": checks}
