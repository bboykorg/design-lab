"""Design Lab authentication.

When USER_DB_SERVICE_URL is set, the public auth routes relay to the separate
persistent users/subscriptions service. Without it, the original local SQLite
implementation remains available for development and rollback.
"""
import hashlib
import re
import secrets
import threading
import time
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Header
from fastapi.responses import Response

from . import config
from .models import AuthIn, AuthOut, Me

router = APIRouter(prefix="/api/auth", tags=["auth"])
_lock = threading.Lock()
_PBKDF2_ITERS = 200_000


@contextmanager
def _db():
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(config.AUTH_DB))
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def _init():
    with _lock, _db() as connection:
        connection.execute(
            "CREATE TABLE IF NOT EXISTS users("
            "id TEXT PRIMARY KEY, username TEXT UNIQUE, pwhash TEXT, salt TEXT, created TEXT)"
        )
        connection.execute(
            "CREATE TABLE IF NOT EXISTS tokens(token TEXT PRIMARY KEY, uid TEXT, exp REAL)"
        )


_init()


def _hash(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), _PBKDF2_ITERS
    ).hex()


def create_user(username: str, password: str) -> dict:
    username = (username or "").strip().lower()
    if not re.fullmatch(r"[a-z0-9_.-]{3,40}", username):
        raise HTTPException(status_code=400, detail="Логин: 3–40 символов из [a-z0-9_.-]")
    if len(password or "") < 6:
        raise HTTPException(status_code=400, detail="Пароль минимум 6 символов")
    salt, uid = secrets.token_hex(16), secrets.token_hex(8)
    with _lock, _db() as connection:
        if connection.execute("SELECT 1 FROM users WHERE username=?", (username,)).fetchone():
            raise HTTPException(status_code=409, detail="Логин уже занят")
        connection.execute(
            "INSERT INTO users(id,username,pwhash,salt,created) VALUES(?,?,?,?,?)",
            (
                uid,
                username,
                _hash(password, salt),
                salt,
                datetime.now(timezone.utc).isoformat(timespec="seconds"),
            ),
        )
    return {"id": uid, "username": username}


def verify_user(username: str, password: str) -> dict:
    username = (username or "").strip().lower()
    with _lock, _db() as connection:
        row = connection.execute(
            "SELECT * FROM users WHERE username=?", (username,)
        ).fetchone()
    if not row or _hash(password or "", row["salt"]) != row["pwhash"]:
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    return {"id": row["id"], "username": row["username"]}


def issue_token(uid: str) -> str:
    token = secrets.token_urlsafe(32)
    expires = time.time() + config.AUTH_TOKEN_TTL * 86400
    with _lock, _db() as connection:
        connection.execute(
            "INSERT INTO tokens(token,uid,exp) VALUES(?,?,?)", (token, uid, expires)
        )
    return token


def user_by_token(token):
    if not token:
        return None
    with _lock, _db() as connection:
        row = connection.execute(
            "SELECT t.uid AS uid, t.exp AS exp, u.username AS username "
            "FROM tokens t JOIN users u ON u.id=t.uid WHERE t.token=?",
            (token,),
        ).fetchone()
        if not row:
            return None
        if row["exp"] < time.time():
            connection.execute("DELETE FROM tokens WHERE token=?", (token,))
            return None
    return {"id": row["uid"], "username": row["username"]}


def revoke_token(token):
    if not token:
        return
    with _lock, _db() as connection:
        connection.execute("DELETE FROM tokens WHERE token=?", (token,))


def _bearer(authorization):
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


def current_user(authorization: str = Header(None)):
    """Resolve a local fallback user. Project auth remains local for now."""
    return user_by_token(_bearer(authorization))


def require_user(authorization: str = Header(None)):
    """Anonymous when project auth is disabled; otherwise require a local user."""
    if not config.AUTH_ENABLED:
        return None
    user = user_by_token(_bearer(authorization))
    if not user:
        raise HTTPException(status_code=401, detail="Требуется вход")
    return user


async def _remote_auth(
    method: str,
    path: str,
    body: dict | None = None,
    authorization: str | None = None,
) -> Response:
    """Relay one auth request without logging credentials or session tokens."""
    headers = {}
    if authorization:
        headers["Authorization"] = authorization
    url = f"{config.USER_DB_SERVICE_URL}/v1/auth/{path}"
    try:
        async with httpx.AsyncClient(
            timeout=config.USER_DB_SERVICE_TIMEOUT,
            follow_redirects=False,
        ) as client:
            upstream = await client.request(method, url, json=body, headers=headers)
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Сервис пользователей недоступен: {type(exc).__name__}",
        ) from exc

    if upstream.status_code == 204:
        return Response(status_code=204)
    media_type = upstream.headers.get("content-type", "application/json").split(";", 1)[0]
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        media_type=media_type,
    )


@router.post("/register", response_model=AuthOut)
async def register(body: AuthIn):
    if config.USER_DB_SERVICE_URL:
        return await _remote_auth("POST", "register", body.model_dump())
    user = create_user(body.username, body.password)
    return {"token": issue_token(user["id"]), "username": user["username"], "plan": "free"}


@router.post("/login", response_model=AuthOut)
async def login(body: AuthIn):
    if config.USER_DB_SERVICE_URL:
        return await _remote_auth("POST", "login", body.model_dump())
    user = verify_user(body.username, body.password)
    return {"token": issue_token(user["id"]), "username": user["username"], "plan": "free"}


@router.get("/me", response_model=Me)
async def me(authorization: str = Header(None)):
    if config.USER_DB_SERVICE_URL:
        return await _remote_auth("GET", "me", authorization=authorization)
    user = current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Не авторизован")
    return {
        "id": user["id"],
        "username": user["username"],
        "plan": "free",
        "subscription_status": None,
        "subscription_expires_at": None,
        "enabled": config.AUTH_ENABLED,
    }


@router.post("/logout", status_code=204)
async def logout(authorization: str = Header(None)):
    if config.USER_DB_SERVICE_URL:
        return await _remote_auth("POST", "logout", authorization=authorization)
    revoke_token(_bearer(authorization))
    return Response(status_code=204)
