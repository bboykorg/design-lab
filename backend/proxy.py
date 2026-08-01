"""/api/proxy — same-origin relay to allow-listed AI providers.

Доступен только авторизованным пользователям: сервер подставляет свои ключи,
поэтому публичный доступ означал бы бесплатный доступ к платным моделям.
Кроме хоста проверяется и путь: разрешены только chat-эндпоинты.
"""
import json
import os
import secrets as _secrets
import threading
from urllib.parse import urlparse, unquote, urlunparse

import httpx
from fastapi import APIRouter, Depends, Header, Request, HTTPException
from fastapi.responses import Response, StreamingResponse

from . import config
from .auth import require_user
from .ratelimit import guard

router = APIRouter(prefix="/api", tags=["proxy"])

_HOSTS = {
    "gorouter.app": ("GOROUTER_API_KEYS,GOROUTER_API_KEY", "bearer"),
    "www.gorouter.app": ("GOROUTER_API_KEYS,GOROUTER_API_KEY", "bearer"),
    "api.kiwillm.in": ("KIWILLM_API_KEYS,KIWILLM_API_KEY,KIWI_KEY", "bearer"),
    "api.cerebras.ai": ("CEREBRAS_API_KEYS,CEREBRAS_API_KEY", "bearer"),
    "openrouter.ai": ("OPENROUTER_API_KEYS,OPENROUTER_API_KEY", "bearer"),
    "vyceai.com": ("VYCE_API_KEYS,VYCE_API_KEY", "bearer"),
    "www.vyceai.com": ("VYCE_API_KEYS,VYCE_API_KEY", "bearer"),
    "generativelanguage.googleapis.com": ("GEMINI_API_KEYS,GEMINI_API_KEY", "goog"),
    "open.bigmodel.cn": ("GLM_API_KEYS,GLM_API_KEY", "bearer"),
    "api.mistral.ai": ("MISTRAL_API_KEYS,MISTRAL_API_KEY", "bearer"),
}

# На разрешённых хостах разрешены только эти пути.
_ALLOWED_SUFFIXES = ("/chat/completions", "/messages", "/responses")
_GOOGLE_HOST = "generativelanguage.googleapis.com"

_GOROUTER_ENV = "GOROUTER_API_KEYS,GOROUTER_API_KEY"
_GOROUTER_BASE = os.getenv("GOROUTER_BASE_URL", "https://gorouter.app/v1").rstrip("/")
_GOROUTER_ENDPOINT = _GOROUTER_BASE + "/chat/completions"
_GOROUTER_MODELS = {
    "claude-opus-4-8",
    "claude-opus-4-8-thinking",
    "claude-opus-5",
    "claude-opus-5-thinking",
}

_KIWI_ENV = "KIWILLM_API_KEYS,KIWILLM_API_KEY,KIWI_KEY"
_KIWI_BASE = os.getenv("KIWILLM_BASE_URL", "https://api.kiwillm.in/v1").rstrip("/")
_KIWI_ENDPOINT = _KIWI_BASE + "/chat/completions"
_KIWI_MODELS = {"DeepSeek-V4-Flash", "kiwi::glm-5.2", "Qwen3.6-35B-A3B"}

_VYCE_ENV = "VYCE_API_KEYS,VYCE_API_KEY"
_VYCE_BASE = os.getenv("VYCE_BASE_URL", "https://vyceai.com/v1").rstrip("/")
_VYCE_ENDPOINT = _VYCE_BASE + "/chat/completions"
_VYCE_MODELS = {
    "auto", "claude-sonnet-5", "claude-sonnet-4-6", "claude-haiku-4-5",
    "claude-fable-5", "deepseek-v4-flash", "gemini-3.6-flash",
    "gemini-3.1-flash-lite", "glm-5.2", "minimax-m3", "mimo-v2.5-pro",
    "gpt-5.6-sol",
}

_MODEL_ALIASES = {"kiwi::glm-5.2": "glm-5.2"}
_MODEL_ROUTES = {}
for _model in _VYCE_MODELS:
    _MODEL_ROUTES[_model] = (_VYCE_ENDPOINT, (urlparse(_VYCE_ENDPOINT).hostname or "").lower())
for _model in _KIWI_MODELS:
    _MODEL_ROUTES[_model] = (_KIWI_ENDPOINT, (urlparse(_KIWI_ENDPOINT).hostname or "").lower())
for _model in _GOROUTER_MODELS:
    _MODEL_ROUTES[_model] = (_GOROUTER_ENDPOINT, (urlparse(_GOROUTER_ENDPOINT).hostname or "").lower())

_counters = {}
_lock = threading.Lock()


def admin_only(x_admin_token: str = Header(None)):
    """Диагностика видна только с верным X-Admin-Token, иначе эндпоинта как бы нет."""
    expected = config.ADMIN_API_TOKEN
    if not expected or not x_admin_token or not _secrets.compare_digest(x_admin_token, expected):
        raise HTTPException(status_code=404, detail="Not Found")
    return True


def _keys(env_names: str):
    out = []
    for name in env_names.split(","):
        out += [key.strip() for key in os.getenv(name.strip(), "").split(",") if key.strip()]
    return out


def _next_key(host: str, keys):
    if not keys:
        return None
    with _lock:
        index = _counters.get(host, 0) % len(keys)
        _counters[host] = (index + 1) % len(keys)
    return keys[index]


def _model_of(body: bytes) -> str:
    try:
        data = json.loads(body.decode("utf-8", "ignore"))
    except (ValueError, AttributeError):
        return ""
    model = data.get("model") if isinstance(data, dict) else None
    return model.strip() if isinstance(model, str) else ""


def _rewrite_model(body: bytes, model: str) -> bytes:
    real_model = _MODEL_ALIASES.get(model)
    if not real_model:
        return body
    try:
        data = json.loads(body.decode("utf-8", "ignore"))
        data["model"] = real_model
        return json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    except (ValueError, AttributeError, TypeError):
        return body


def _clean_target(target: str) -> tuple[str, str, str]:
    """Отбросить query и fragment клиента, вернуть (url, host, path)."""
    parsed = urlparse(target)
    if parsed.scheme != "https":
        raise HTTPException(status_code=403, detail="разрешён только https")
    host = (parsed.hostname or "").lower()
    path = parsed.path or ""
    clean = urlunparse((parsed.scheme, parsed.netloc, path, "", "", ""))
    return clean, host, path


def _allowed_path(host: str, path: str) -> bool:
    if host == _GOOGLE_HOST:
        return path.startswith("/v1beta/models/") or path.startswith("/v1/models/")
    return path.endswith(_ALLOWED_SUFFIXES)


def _headers_for(host: str, key: str, auth: str) -> dict:
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Accept-Encoding": "identity",
    }
    if auth == "goog":
        headers["x-goog-api-key"] = key
    else:
        headers["Authorization"] = "Bearer " + key
        if host == "openrouter.ai":
            headers["HTTP-Referer"] = os.getenv("PUBLIC_URL", "https://design-lab.onrender.com")
            headers["X-Title"] = "Design Lab"
    return headers


def _is_challenge(content_type: str, data: bytes) -> bool:
    if "html" not in content_type.lower():
        return False
    head = data[:4096].decode("utf-8", "ignore").lower()
    return (
        "just a moment" in head or "cf_chl_opt" in head
        or "cf-browser-verification" in head or "cf_app_waf" in head
    )


@router.api_route("/proxy", methods=["POST"])
async def proxy(request: Request, user=Depends(require_user)):
    guard("proxy", request, user)
    target = request.query_params.get("url")
    if not target:
        raise HTTPException(status_code=400, detail="missing url")
    target = unquote(target)
    body = await request.body()

    target, host, path = _clean_target(target)
    model = _model_of(body)
    route = _MODEL_ROUTES.get(model)
    if route and host != route[1]:
        target, host, path = _clean_target(route[0])
    body = _rewrite_model(body, model)

    if host not in _HOSTS:
        raise HTTPException(status_code=403, detail=f"host not allowed: {host}")
    if not _allowed_path(host, path):
        raise HTTPException(status_code=403, detail="endpoint not allowed")
    env_names, auth = _HOSTS[host]
    key = _next_key(host, _keys(env_names))
    if not key:
        first = env_names.split(",")[0]
        raise HTTPException(status_code=503, detail=f"нет ключа для {host} — задай {first} в .env")

    headers = _headers_for(host, key, auth)
    client = httpx.AsyncClient(timeout=config.AI_TIMEOUT, follow_redirects=True)
    try:
        upstream_request = client.build_request("POST", target, content=body, headers=headers)
        response = await client.send(upstream_request, stream=True)
    except httpx.HTTPError as exc:
        await client.aclose()
        detail = f"{type(exc).__name__}: {exc}".rstrip()
        raise HTTPException(status_code=502, detail=f"upstream error: {detail}")

    content_type = response.headers.get("content-type", "application/json")
    if "html" in content_type.lower():
        data = await response.aread()
        await response.aclose()
        await client.aclose()
        if _is_challenge(content_type, data):
            message = f"{host}: запрос заблокирован проверкой браузера Cloudflare."
        else:
            message = f"{host}: вместо ответа API вернулась HTML-страница (код {response.status_code})."
        return Response(
            content=json.dumps({"error": {"message": message}}, ensure_ascii=False),
            status_code=502,
            media_type="application/json",
        )

    if response.status_code >= 400:
        data = await response.aread()
        await response.aclose()
        await client.aclose()
        return Response(content=data, status_code=response.status_code, media_type=content_type)

    async def generate():
        try:
            async for chunk in response.aiter_bytes():
                yield chunk
        finally:
            await response.aclose()
            await client.aclose()

    return StreamingResponse(generate(), status_code=response.status_code, media_type=content_type)


async def _probe(base: str, env_names: str, paths=("models",)):
    keys = _keys(env_names)
    if not keys:
        first = env_names.split(",")[0]
        return {
            "ok": False,
            "base": base,
            "keys": 0,
            "reason": "no_key",
            "message": f"Не задан {first} в переменных окружения.",
        }
    host = (urlparse(base).hostname or "").lower()
    headers = _headers_for(host, keys[0], "bearer")
    checks = {}
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        for path in paths:
            entry = {"url": f"{base}/{path}"}
            try:
                response = await client.get(entry["url"], headers=headers)
            except httpx.HTTPError as exc:
                entry.update(reason="network_error", message=f"{type(exc).__name__}: {exc}".rstrip())
                checks[path] = entry
                continue
            content_type = response.headers.get("content-type", "")
            entry.update(
                status=response.status_code,
                contentType=content_type,
                cfRay=response.headers.get("cf-ray"),
            )
            if _is_challenge(content_type, response.content):
                entry.update(reason="cloudflare_challenge", message="Провайдер вернул проверку браузера вместо API.")
            elif response.status_code in (404, 405, 501):
                entry.update(reason="unsupported_endpoint", body=response.text[:300])
            elif response.status_code in (401, 403):
                entry.update(reason="auth_error", body=response.text[:300])
            elif response.status_code >= 400:
                entry.update(reason="http_error", body=response.text[:300])
            else:
                entry.update(reason="ok", body=response.text[:500])
            checks[path] = entry
    ok = any(check.get("reason") == "ok" for check in checks.values())
    return {"ok": ok, "base": base, "keys": len(keys), "checks": checks}


@router.get("/gorouter/check")
async def gorouter_check(_admin=Depends(admin_only)):
    return await _probe(_GOROUTER_BASE, _GOROUTER_ENV)


@router.get("/kiwi/check")
async def kiwi_check(_admin=Depends(admin_only)):
    return await _probe(_KIWI_BASE, _KIWI_ENV)


@router.get("/vyce/check")
async def vyce_check(_admin=Depends(admin_only)):
    return await _probe(_VYCE_BASE, _VYCE_ENV, ("models", "me"))
