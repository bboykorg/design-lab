"""/api/proxy — same-origin relay to the AI providers.

The frontend ships with no provider keys. Calls go through this allow-listed
relay, which injects server-side keys and streams responses back to the client.
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

_HOSTS = {
    "api.kiwillm.in": ("KIWILLM_API_KEYS,KIWILLM_API_KEY,KIWI_KEY", "bearer"),
    "api.cerebras.ai": ("CEREBRAS_API_KEYS,CEREBRAS_API_KEY", "bearer"),
    "openrouter.ai": ("OPENROUTER_API_KEYS,OPENROUTER_API_KEY", "bearer"),
    "vyceai.com": ("VYCE_API_KEYS,VYCE_API_KEY", "bearer"),
    "www.vyceai.com": ("VYCE_API_KEYS,VYCE_API_KEY", "bearer"),
    "generativelanguage.googleapis.com": ("GEMINI_API_KEYS,GEMINI_API_KEY", "goog"),
    "open.bigmodel.cn": ("GLM_API_KEYS,GLM_API_KEY", "bearer"),
    "api.mistral.ai": ("MISTRAL_API_KEYS,MISTRAL_API_KEY", "bearer"),
}

_KIWI_ENV = "KIWILLM_API_KEYS,KIWILLM_API_KEY,KIWI_KEY"
_KIWI_BASE = os.getenv("KIWILLM_BASE_URL", "https://api.kiwillm.in/v1").rstrip("/")
_KIWI_ENDPOINT = _KIWI_BASE + "/chat/completions"
_KIWI_MODELS = {"DeepSeek-V4-Flash", "glm-5.2", "Qwen3.6-35B-A3B"}

_VYCE_ENV = "VYCE_API_KEYS,VYCE_API_KEY"
_VYCE_BASE = os.getenv("VYCE_BASE_URL", "https://vyceai.com/v1").rstrip("/")
_VYCE_ENDPOINT = _VYCE_BASE + "/chat/completions"
_VYCE_MODELS = {
    "auto", "claude-sonnet-5", "claude-sonnet-4-6", "claude-haiku-4-5",
    "claude-fable-5", "deepseek-v4-flash", "gemini-3.6-flash",
    "gemini-3.1-flash-lite", "glm-5.2", "minimax-m3", "mimo-v2.5-pro",
    "gpt-5.6-sol",
}

_MODEL_ROUTES = {}
for _m in _VYCE_MODELS:
    _MODEL_ROUTES[_m] = (_VYCE_ENDPOINT, (urlparse(_VYCE_ENDPOINT).hostname or "").lower())
# Kiwi is active while Vyce is hidden; put Kiwi last so the shared glm-5.2 ID
# routes to Kiwi rather than to the disabled gateway.
for _m in _KIWI_MODELS:
    _MODEL_ROUTES[_m] = (_KIWI_ENDPOINT, (urlparse(_KIWI_ENDPOINT).hostname or "").lower())

_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
_UA_HOSTS = ("vyceai.com",)
_counters = {}
_lock = threading.Lock()


def _keys(env_names: str):
    out = []
    for name in env_names.split(","):
        out += [k.strip() for k in os.getenv(name.strip(), "").split(",") if k.strip()]
    return out


def _next_key(host: str, keys):
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


def _headers_for(host: str, key: str, auth: str) -> dict:
    if host.endswith(_UA_HOSTS):
        origin = "https://" + host
        return {
            "Authorization": "Bearer " + key,
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "Accept-Encoding": "identity",
            "Accept-Language": "en-US,en;q=0.9",
            "User-Agent": os.getenv("VYCE_USER_AGENT", _BROWSER_UA),
            "Origin": origin,
            "Referer": origin + "/",
        }
    h = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Accept-Encoding": "identity",
    }
    if auth == "goog":
        h["x-goog-api-key"] = key
    else:
        h["Authorization"] = "Bearer " + key
        if host == "openrouter.ai":
            h["HTTP-Referer"] = os.getenv("PUBLIC_URL", "https://design-lab.onrender.com")
            h["X-Title"] = "Design Lab"
    return h


def _is_challenge(ctype: str, data: bytes) -> bool:
    if "html" not in ctype.lower():
        return False
    head = data[:4096].decode("utf-8", "ignore").lower()
    return (
        "just a moment" in head or "cf_chl_opt" in head
        or "cf-browser-verification" in head or "cf_app_waf" in head
    )


@router.api_route("/proxy", methods=["POST"])
async def proxy(request: Request):
    target = request.query_params.get("url")
    if not target:
        raise HTTPException(status_code=400, detail="missing url")
    target = unquote(target)
    body = await request.body()

    host = (urlparse(target).hostname or "").lower()
    route = _MODEL_ROUTES.get(_model_of(body))
    if route and host != route[1]:
        target, host = route[0], route[1]

    if host not in _HOSTS:
        raise HTTPException(status_code=403, detail=f"host not allowed: {host}")

    env_names, auth = _HOSTS[host]
    key = _next_key(host, _keys(env_names))
    if not key:
        first = env_names.split(",")[0]
        raise HTTPException(status_code=503, detail=f"нет ключа для {host} — задай {first} в .env")

    headers = _headers_for(host, key, auth)
    client = httpx.AsyncClient(timeout=config.AI_TIMEOUT, follow_redirects=True)
    try:
        req = client.build_request("POST", target, content=body, headers=headers)
        r = await client.send(req, stream=True)
    except httpx.HTTPError as e:
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"upstream error: {e}")

    ctype = r.headers.get("content-type", "application/json")
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
            async for chunk in r.aiter_bytes():
                yield chunk
        finally:
            await r.aclose()
            await client.aclose()

    return StreamingResponse(gen(), status_code=r.status_code, media_type=ctype)


async def _probe(base: str, env_names: str, paths=("models", "me")):
    keys = _keys(env_names)
    if not keys:
        first = env_names.split(",")[0]
        return {
            "ok": False, "base": base, "keys": 0, "reason": "no_key",
            "message": f"Не задан {first} в переменных окружения.",
        }
    host = (urlparse(base).hostname or "").lower()
    headers = _headers_for(host, keys[0], "bearer")
    checks = {}
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        for name in paths:
            entry = {"url": f"{base}/{name}"}
            try:
                r = await client.get(entry["url"], headers=headers)
            except httpx.HTTPError as e:
                entry.update(reason="network_error", message=str(e))
                checks[name] = entry
                continue
            ctype = r.headers.get("content-type", "")
            entry.update(status=r.status_code, contentType=ctype, cfRay=r.headers.get("cf-ray"))
            if _is_challenge(ctype, r.content):
                entry.update(reason="cloudflare_challenge", message="Провайдер вернул проверку браузера вместо ответа API.")
            elif r.status_code in (404, 405, 501):
                entry.update(reason="unsupported_endpoint", message="Этот диагностический GET-эндпоинт не поддерживается.", body=r.text[:300])
            elif r.status_code in (401, 403):
                entry.update(reason="auth_error", message="Ключ отклонён провайдером.", body=r.text[:300])
            elif r.status_code >= 400:
                entry.update(reason="http_error", body=r.text[:300])
            else:
                entry.update(reason="ok", body=r.text[:300])
            checks[name] = entry
    ok = any(c.get("reason") == "ok" for c in checks.values())
    return {"ok": ok, "base": base, "keys": len(keys), "checks": checks}


@router.get("/kiwi/check")
async def kiwi_check():
    return await _probe(_KIWI_BASE, _KIWI_ENV, ("models",))


@router.get("/vyce/check")
async def vyce_check():
    return await _probe(_VYCE_BASE, _VYCE_ENV)
