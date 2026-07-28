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

_HOSTS = {
    "api.cerebras.ai": ("CEREBRAS_API_KEYS,CEREBRAS_API_KEY", "bearer"),
    "openrouter.ai": ("OPENROUTER_API_KEYS,OPENROUTER_API_KEY", "bearer"),
    "vyceai.com": ("VYCE_API_KEYS,VYCE_API_KEY", "bearer"),
    "www.vyceai.com": ("VYCE_API_KEYS,VYCE_API_KEY", "bearer"),
    "co.agentrouter.org": ("AGENTROUTER_API_KEYS,AGENTROUTER_API_KEY", "bearer"),
    "agentrouter.org": ("AGENTROUTER_API_KEYS,AGENTROUTER_API_KEY", "bearer"),
    "generativelanguage.googleapis.com": ("GEMINI_API_KEYS,GEMINI_API_KEY", "goog"),
    "open.bigmodel.cn": ("GLM_API_KEYS,GLM_API_KEY", "bearer"),
    "api.mistral.ai": ("MISTRAL_API_KEYS,MISTRAL_API_KEY", "bearer"),
}

_VYCE_ENV = "VYCE_API_KEYS,VYCE_API_KEY"
_VYCE_BASE = os.getenv("VYCE_BASE_URL", "https://vyceai.com/v1").rstrip("/")
_VYCE_ENDPOINT = _VYCE_BASE + "/chat/completions"

# The token console and the official Codex config both use the root domain.
# AgentRouter must receive ordinary SDK-style headers: adding browser Origin /
# Referer can route a server request to the website/WAF and produce HTML 405.
_AR_ENV = "AGENTROUTER_API_KEYS,AGENTROUTER_API_KEY"
_AR_BASE = os.getenv("AGENTROUTER_BASE_URL", "https://agentrouter.org/v1").rstrip("/")
_AR_ENDPOINT = _AR_BASE + "/chat/completions"

_VYCE_MODELS = {
    "auto", "claude-sonnet-5", "claude-sonnet-4-6", "claude-haiku-4-5",
    "claude-fable-5", "deepseek-v4-flash", "gemini-3.6-flash",
    "gemini-3.1-flash-lite", "glm-5.2", "minimax-m3", "mimo-v2.5-pro",
    "gpt-5.6-sol",
}
_AR_MODELS = {"claude-opus-4-6", "gpt-5.5", "kimi-k3"}

_MODEL_ROUTES = {}
for _m in _VYCE_MODELS:
    _MODEL_ROUTES[_m] = (_VYCE_ENDPOINT, (urlparse(_VYCE_ENDPOINT).hostname or "").lower())
for _m in _AR_MODELS:
    _MODEL_ROUTES[_m] = (_AR_ENDPOINT, (urlparse(_AR_ENDPOINT).hostname or "").lower())

_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
# Only Vyce needs the browser-looking request. AgentRouter behaves like an
# OpenAI API and must not receive browser Origin/Referer headers.
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
        elif r.status_code in (404, 405, 501):
            msg = f"{host}: API вернул HTML вместо JSON (код {r.status_code})."
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


async def _probe_agentrouter():
    """Test the exact authenticated POST used by the app, not optional GET APIs."""
    keys = _keys(_AR_ENV)
    if not keys:
        return {"ok": False, "base": _AR_BASE, "keys": 0, "reason": "no_key"}
    host = (urlparse(_AR_BASE).hostname or "").lower()
    headers = _headers_for(host, keys[0], "bearer")
    payload = {
        "model": "gpt-5",
        "messages": [{"role": "user", "content": "Reply with OK"}],
        "max_tokens": 1,
        "stream": False,
    }
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            r = await client.post(_AR_ENDPOINT, headers=headers, json=payload)
    except httpx.HTTPError as e:
        return {"ok": False, "base": _AR_BASE, "keys": len(keys), "reason": "network_error", "message": str(e)}

    ctype = r.headers.get("content-type", "")
    body = r.text[:500]
    result = {
        "ok": 200 <= r.status_code < 300,
        "base": _AR_BASE,
        "url": _AR_ENDPOINT,
        "keys": len(keys),
        "status": r.status_code,
        "contentType": ctype,
        "body": body,
    }
    if _is_challenge(ctype, r.content):
        result.update(ok=False, reason="challenge")
    elif "html" in ctype.lower():
        result.update(ok=False, reason="html_response")
    elif r.status_code in (401, 403):
        result.update(ok=False, reason="auth_error")
    elif r.status_code >= 400:
        # A JSON model/quota error still proves that URL and authentication
        # reached the API; return it verbatim so the remaining issue is clear.
        result.update(reason="api_error")
    else:
        result.update(reason="ok")
    return result


@router.get("/vyce/check")
async def vyce_check():
    return await _probe(_VYCE_BASE, _VYCE_ENV)


@router.get("/agentrouter/check")
async def agentrouter_check():
    return await _probe_agentrouter()
