"""Design Lab authentication via the persistent users service.

Users, password hashes and sessions are stored only by USER_DB_SERVICE_URL.
This application deliberately has no local SQLite authentication fallback.
"""
import hashlib
import time

import httpx
from fastapi import APIRouter, HTTPException, Header, Request
from fastapi.responses import Response

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


@router.post("/logout", status_code=204)
async def logout(authorization: str = Header(None)):
    token = _bearer(authorization)
    if token:
        _REMOTE_CACHE.pop(_token_hash(token), None)
    return await _remote_auth("POST", "logout", authorization=authorization)
