"""/api/proxy — same-origin relay to allow-listed AI providers.

Правила:
- только для вошедших пользователей — сервер подставляет свои ключи;
- адрес апстрима строит сам сервер по модели, затем по provider или host;
  параметр url от клиента используется только чтобы опознать провайдера;
- тариф решает, какие модели доступны и сколько генераций в сутки;
- размер тела запроса ограничен MAX_PROXY_BODY (по умолчанию 2 МБ);
- Gemini — единственный случай с моделью в пути, там разрешены только
  :generateContent и :streamGenerateContent;
- авторедиректы выключены, чтобы ключ не ушёл на чужой хост.
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
from .plans import consume_edit, ensure_model_allowed
from .ratelimit import guard

router = APIRouter(prefix="/api", tags=["proxy"])

MAX_PROXY_BODY = int(os.getenv("MAX_PROXY_BODY", str(2 * 1024 * 1024)))

_GOOGLE_HOST = "generativelanguage.googleapis.com"
_GOOGLE_ENV = "GEMINI_API_KEYS,GEMINI_API_KEY"
_GOOGLE_METHODS = (":generateContent", ":streamGenerateContent")

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

_CEREBRAS_ENV = "CEREBRAS_API_KEYS,CEREBRAS_API_KEY"
_CEREBRAS_BASE = os.getenv("CEREBRAS_BASE_URL", "https://api.cerebras.ai/v1").rstrip("/")
_CEREBRAS_ENDPOINT = _CEREBRAS_BASE + "/chat/completions"
_CEREBRAS_MODELS = {"zai-glm-4.7", "gpt-oss-120b", "gemma-4-31b"}

_OPENROUTER_ENV = "OPENROUTER_API_KEYS,OPENROUTER_API_KEY"
_OPENROUTER_BASE = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")
_OPENROUTER_ENDPOINT = _OPENROUTER_BASE + "/chat/completions"

_GLM_ENV = "GLM_API_KEYS,GLM_API_KEY"
_GLM_BASE = os.getenv("GLM_BASE_URL", "https://open.bigmodel.cn/api/paas/v4").rstrip("/")
_GLM_ENDPOINT = _GLM_BASE + "/chat/completions"

_MISTRAL_ENV = "MISTRAL_API_KEYS,MISTRAL_API_KEY"
_MISTRAL_BASE = os.getenv("MISTRAL_BASE_URL", "https://api.mistral.ai/v1").rstrip("/")
_MISTRAL_ENDPOINT = _MISTRAL_BASE + "/chat/completions"

_PROVIDERS = {
    "gorouter": (_GOROUTER_ENDPOINT, _GOROUTER_ENV, "bearer"),
    "kiwi": (_KIWI_ENDPOINT, _KIWI_ENV, "bearer"),
    "vyce": (_VYCE_ENDPOINT, _VYCE_ENV, "bearer"),
    "cerebras": (_CEREBRAS_ENDPOINT, _CEREBRAS_ENV, "bearer"),
    "openrouter": (_OPENROUTER_ENDPOINT, _OPENROUTER_ENV, "bearer"),
    "glm": (_GLM_ENDPOINT, _GLM_ENV, "bearer"),
    "mistral": (_MISTRAL_ENDPOINT, _MISTRAL_ENV, "bearer"),
}

_MODEL_ALIASES = {"kiwi::glm-5.2": "glm-5.2"}
_MODEL_PROVIDER = {}
for _model in _VYCE_MODELS:
    _MODEL_PROVIDER[_model] = "vyce"
for _model in _KIWI_MODELS:
    _MODEL_PROVIDER[_model] = "kiwi"
for _model in _GOROUTER_MODELS:
    _MODEL_PROVIDER[_model] = "gorouter"
for _model in _CEREBRAS_MODELS:
    _MODEL_PROVIDER[_model] = "cerebras"

_HOST_PROVIDER = {
    "gorouter.app": "gorouter",
    "www.gorouter.app": "gorouter",
    "api.kiwillm.in": "kiwi",
    "vyceai.com": "vyce",
    "www.vyceai.com": "vyce",
    "api.cerebras.ai": "cerebras",
    "openrouter.ai": "openrouter",
    "open.bigmodel.cn": "glm",
    "api.mistral.ai": "mistral",
}

_counters = {}
_lock = threading.Lock()


def admin_only(x_admin_token: str = Header(None)):
    expected = config.ADMIN_API_TOKEN
    if not expected or not x_admin_token or not _secrets.compare_digest(x_admin_token, expected):
        raise HTTPException(status_code=404, detail="Not Found")
    return True


async def read_limited_body(request: Request) -> bytes:
    """Читает тело запроса, но не больше MAX_PROXY_BODY байт."""
    declared = request.headers.get("content-length")
    if declared:
        try:
            length = int(declared)
        except ValueError:
            raise HTTPException(status_code=400, detail="Некорректный Content-Length")
        if length > MAX_PROXY_BODY:
            raise HTTPException(status_code=413, detail="Запрос слишком большой")
    chunks = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > MAX_PROXY_BODY:
            raise HTTPException(status_code=413, detail="Запрос слишком большой")
        chunks.append(chunk)
    return b"".join(chunks)


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


def _split(target: str):
    parsed = urlparse(target)
    if parsed.scheme != "https":
        raise HTTPException(status_code=403, detail="разрешён только https")
    host = (parsed.hostname or "").lower()
    path = parsed.path or ""
    clean = urlunparse((parsed.scheme, parsed.netloc, path, "", "", ""))
    return clean, host, path


def _google_target(target: str):
    clean, host, path = _split(target)
    if host != _GOOGLE_HOST:
        return None
    starts = path.startswith("/v1beta/models/") or path.startswith("/v1/models/")
    if not starts or not path.endswith(_GOOGLE_METHODS) or ".." in path:
        raise HTTPException(status_code=403, detail="endpoint not allowed")
    return clean, host, _GOOGLE_ENV, "goog", "google"


def _resolve(request: Request, target: str, model: str):
    name = _MODEL_PROVIDER.get(model, "")
    if not name:
        name = (request.query_params.get("provider") or "").strip().lower()
    if not name and target:
        google = _google_target(target)
        if google:
            return google
        name = _HOST_PROVIDER.get(_split(target)[1], "")
    if not name:
        raise HTTPException(status_code=403, detail="provider not allowed")
    entry = _PROVIDERS.get(name)
    if not entry:
        raise HTTPException(status_code=403, detail=f"provider not allowed: {name}")
    endpoint, env_names, auth = entry
    host = (urlparse(endpoint).hostname or "").lower()
    return endpoint, host, env_names, auth, name


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
            headers["HTTP-Referer"] = os.getenv("PUBLIC_URL", "https://desing-lab.onrender.com")
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
    raw = request.query_params.get("url")
    target = unquote(raw) if raw else ""
    body = await read_limited_body(request)

    model = _model_of(body)
    target, host, env_names, auth, provider = _resolve(request, target, model)
    ensure_model_allowed(user, provider, model)
    consume_edit(user)
    body = _rewrite_model(body, model)

    key = _next_key(host, _keys(env_names))
    if not key:
        first = env_names.split(",")[0]
        raise HTTPException(status_code=503, detail=f"нет ключа для {host} — задай {first} в .env")

    headers = _headers_for(host, key, auth)
    client = httpx.AsyncClient(timeout=config.AI_TIMEOUT, follow_redirects=False)
    try:
        upstream_request = client.build_request("POST", target, content=body, headers=headers)
        response = await client.send(upstream_request, stream=True)
    except httpx.HTTPError as exc:
        await client.aclose()
        detail = f"{type(exc).__name__}: {exc}".rstrip()
        raise HTTPException(status_code=502, detail=f"upstream error: {detail}")

    if 300 <= response.status_code < 400:
        location = response.headers.get("location", "")
        await response.aclose()
        await client.aclose()
        message = f"{host}: провайдер просит перейти на другой адрес ({response.status_code})."
        if location:
            message += " Обнови адрес провайдера в настройках сервера."
        return Response(content=json.dumps({"error": {"message": message}}, ensure_ascii=False), status_code=502, media_type="application/json")

    content_type = response.headers.get("content-type", "application/json")
    if "html" in content_type.lower():
        data = await response.aread()
        await response.aclose()
        await client.aclose()
        if _is_challenge(content_type, data):
            message = f"{host}: запрос заблокирован проверкой браузера Cloudflare."
        else:
            message = f"{host}: вместо ответа API вернулась HTML-страница (код {response.status_code})."
        return Response(content=json.dumps({"error": {"message": message}}, ensure_ascii=False), status_code=502, media_type="application/json")

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
        return {"ok": False, "base": base, "keys": 0, "reason": "no_key", "message": f"Не задан {first} в переменных окружения."}
    host = (urlparse(base).hostname or "").lower()
    headers = _headers_for(host, keys[0], "bearer")
    checks = {}
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=False) as client:
        for path in paths:
            entry = {"url": f"{base}/{path}"}
            try:
                response = await client.get(entry["url"], headers=headers)
            except httpx.HTTPError as exc:
                entry.update(reason="network_error", message=f"{type(exc).__name__}: {exc}".rstrip())
                checks[path] = entry
                continue
            content_type = response.headers.get("content-type", "")
            entry.update(status=response.status_code, contentType=content_type, cfRay=response.headers.get("cf-ray"))
            if _is_challenge(content_type, response.content):
                entry.update(reason="cloudflare_challenge", message="Провайдер вернул проверку браузера вместо API.")
            elif 300 <= response.status_code < 400:
                entry.update(reason="redirect", location=response.headers.get("location", ""))
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
