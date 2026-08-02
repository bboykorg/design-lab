"""Design Lab authentication via the persistent users service.

Users, password hashes and sessions are stored only by USER_DB_SERVICE_URL.
This application deliberately has no local SQLite authentication fallback.
"""
import hashlib
import hmac
import os
import re
import time

import httpx
from fastapi import APIRouter, HTTPException, Header, Request
from fastapi.responses import Response

from pydantic import BaseModel, Field

from . import config
from .models import AuthIn, AuthOut, Me
from .ratelimit import guard

router = APIRouter(prefix="/api/auth", tags=["auth"])
_REMOTE_CACHE = {}
_REMOTE_CACHE_TTL = 60.0
_REMOTE_REJECT_TTL = 10.0


def _token_hash(token: str) -> str:
    return hashlib.sha256((token or "").encode("utf-8")).hexdigest()


def _bearer(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


def _service_url() -> str:
    if not config.USER_DB_SERVICE_URL:
        raise HTTPException(status_code=503, detail="Не задан USER_DB_SERVICE_URL")
    return config.USER_DB_SERVICE_URL


async def _remote_user(token: str):
    digest = _token_hash(token)
    now = time.time()
    cached = _REMOTE_CACHE.get(digest)
    if cached and cached[0] > now:
        return cached[1]
    try:
        async with httpx.AsyncClient(timeout=config.USER_DB_SERVICE_TIMEOUT, follow_redirects=False) as client:
            response = await client.get(
                _service_url() + "/v1/auth/me",
                headers={"Authorization": "Bearer " + token},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Сервис пользователей недоступен: {type(exc).__name__}") from exc
    if response.status_code in (401, 403):
        _REMOTE_CACHE[digest] = (now + _REMOTE_REJECT_TTL, None)
        return None
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Сервис пользователей ответил {response.status_code}")
    try:
        data = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Сервис пользователей вернул некорректный ответ") from exc
    uid = str(data.get("id") or data.get("user_id") or "").strip()
    if not uid:
        return None
    user = {"id": uid, "username": data.get("username") or "", "plan": data.get("plan") or "free"}
    if len(_REMOTE_CACHE) > 2000:
        _REMOTE_CACHE.clear()
    _REMOTE_CACHE[digest] = (now + _REMOTE_CACHE_TTL, user)
    return user


async def resolve_user(authorization: str | None):
    token = _bearer(authorization)
    if not token:
        return None
    return await _remote_user(token)


async def require_user(authorization: str = Header(None)):
    user = await resolve_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Требуется вход")
    return user


async def optional_user(authorization: str = Header(None)):
    try:
        return await resolve_user(authorization)
    except HTTPException:
        return None


async def require_project_user(authorization: str = Header(None)):
    if not config.AUTH_ENABLED:
        return await optional_user(authorization)
    return await require_user(authorization)


async def _remote_auth(method: str, path: str, body: dict | None = None, authorization: str | None = None) -> Response:
    headers = {"Authorization": authorization} if authorization else {}
    try:
        async with httpx.AsyncClient(timeout=config.USER_DB_SERVICE_TIMEOUT, follow_redirects=False) as client:
            upstream = await client.request(method, _service_url() + "/v1/auth/" + path, json=body, headers=headers)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Сервис пользователей недоступен: {type(exc).__name__}") from exc
    if upstream.status_code == 204:
        return Response(status_code=204)
    media_type = upstream.headers.get("content-type", "application/json").split(";", 1)[0]
    return Response(content=upstream.content, status_code=upstream.status_code, media_type=media_type)


@router.post("/register", response_model=AuthOut)
async def register(body: AuthIn, request: Request):
    guard("register", request)
    return await _remote_auth("POST", "register", body.model_dump())


@router.post("/login", response_model=AuthOut)
async def login(body: AuthIn, request: Request):
    guard("login", request)
    return await _remote_auth("POST", "login", body.model_dump())


@router.get("/me", response_model=Me)
async def me(authorization: str = Header(None)):
    return await _remote_auth("GET", "me", authorization=authorization)


# =====================================================================
#  Вход через GitHub (отдельный способ входа, без 2FA на нашей стороне)
#
#  Клиент присылает GitHub access token. Мы сами спрашиваем api.github.com,
#  кто этот пользователь, и заводим/открываем ему обычный аккаунт Design Lab.
#  Пароль никогда не виден клиенту: он выводится HMAC-ом от серверного
#  секрета и числового GitHub ID, так что подобрать его со стороны нельзя.
# =====================================================================

GITHUB_LOGIN_SECRET = os.getenv("GITHUB_LOGIN_SECRET", "") or os.getenv("SERVICE_API_TOKEN", "")
_GH_LOGIN_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$")


class GithubAuthIn(BaseModel):
    token: str = Field(..., min_length=8, max_length=500)


def _gh_username(login: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_-]", "", login or "")[:34]
    return ("gh_" + safe) if safe else ""


def _gh_password(github_id: str) -> str:
    if not GITHUB_LOGIN_SECRET:
        raise HTTPException(
            status_code=503,
            detail="Вход через GitHub не настроен: задай GITHUB_LOGIN_SECRET",
        )
    return hmac.new(
        GITHUB_LOGIN_SECRET.encode("utf-8"),
        ("design-lab:github:" + str(github_id)).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:48]


async def _github_identity(token: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=False) as client:
            response = await client.get(
                "https://api.github.com/user",
                headers={
                    "Authorization": "Bearer " + token,
                    "Accept": "application/vnd.github+json",
                    "User-Agent": "design-lab",
                },
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"GitHub недоступен: {type(exc).__name__}") from exc
    if response.status_code in (401, 403):
        raise HTTPException(status_code=401, detail="GitHub отклонил токен — подключись заново")
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"GitHub ответил {response.status_code}")
    try:
        data = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="GitHub вернул некорректный ответ") from exc
    login = str(data.get("login") or "").strip()
    gid = str(data.get("id") or "").strip()
    if not login or not gid or not _GH_LOGIN_RE.match(login):
        raise HTTPException(status_code=502, detail="GitHub не вернул корректный профиль")
    return {"login": login, "id": gid, "avatar": data.get("avatar_url") or "", "name": data.get("name") or login}


@router.post("/github", response_model=AuthOut)
async def github_login(body: GithubAuthIn, request: Request):
    """Вход/регистрация одним шагом по GitHub-токену."""
    guard("login", request)
    identity = await _github_identity(body.token.strip())
    username = _gh_username(identity["login"])
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Неподходящий логин GitHub")
    credentials = {"username": username, "password": _gh_password(identity["id"])}

    # Сначала пробуем войти; если аккаунта ещё нет — регистрируем и входим.
    result = await _remote_auth("POST", "login", credentials)
    if result.status_code < 400:
        return result
    created = await _remote_auth("POST", "register", credentials)
    if created.status_code < 400:
        return created
    return await _remote_auth("POST", "login", credentials)


@router.post("/logout", status_code=204)
async def logout(authorization: str = Header(None)):
    token = _bearer(authorization)
    if token:
        _REMOTE_CACHE.pop(_token_hash(token), None)
    return await _remote_auth("POST", "logout", authorization=authorization)
