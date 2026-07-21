"""Optional authentication: register/login with token sessions.

Off by default (config.AUTH_ENABLED). When on, project endpoints become
private per user. Passwords hashed with PBKDF2-HMAC-SHA256 (stdlib); users and
tokens persisted in a small SQLite DB (data/auth.db), independent of the
project store backend.
"""
import hashlib
import re
import secrets
import threading
import time
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Header, Depends

from . import config
from .models import AuthIn, AuthOut, Me

router = APIRouter(prefix="/api/auth", tags=["auth"])
_lock = threading.Lock()
_PBKDF2_ITERS = 200_000


@contextmanager
def _db():
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(str(config.AUTH_DB))
    c.row_factory = sqlite3.Row
    try:
        yield c
        c.commit()
    finally:
        c.close()


def _init():
    with _lock, _db() as c:
        c.execute("CREATE TABLE IF NOT EXISTS users("
                  "id TEXT PRIMARY KEY, username TEXT UNIQUE, pwhash TEXT, salt TEXT, created TEXT)")
        c.execute("CREATE TABLE IF NOT EXISTS tokens(token TEXT PRIMARY KEY, uid TEXT, exp REAL)")


_init()


def _hash(pw: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), bytes.fromhex(salt), _PBKDF2_ITERS).hex()


def create_user(username: str, password: str) -> dict:
    username = (username or "").strip().lower()
    if not re.fullmatch(r"[a-z0-9_.-]{3,40}", username):
        raise HTTPException(status_code=400, detail="Логин: 3–40 символов из [a-z0-9_.-]")
    if len(password or "") < 6:
        raise HTTPException(status_code=400, detail="Пароль минимум 6 символов")
    salt, uid = secrets.token_hex(16), secrets.token_hex(8)
    with _lock, _db() as c:
        if c.execute("SELECT 1 FROM users WHERE username=?", (username,)).fetchone():
            raise HTTPException(status_code=409, detail="Логин уже занят")
        c.execute("INSERT INTO users(id,username,pwhash,salt,created) VALUES(?,?,?,?,?)",
                  (uid, username, _hash(password, salt), salt,
                   datetime.now(timezone.utc).isoformat(timespec="seconds")))
    return {"id": uid, "username": username}


def verify_user(username: str, password: str) -> dict:
    username = (username or "").strip().lower()
    with _lock, _db() as c:
        r = c.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
    if not r or _hash(password or "", r["salt"]) != r["pwhash"]:
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    return {"id": r["id"], "username": r["username"]}


def issue_token(uid: str) -> str:
    tok = secrets.token_urlsafe(32)
    exp = time.time() + config.AUTH_TOKEN_TTL * 86400
    with _lock, _db() as c:
        c.execute("INSERT INTO tokens(token,uid,exp) VALUES(?,?,?)", (tok, uid, exp))
    return tok


def user_by_token(tok):
    if not tok:
        return None
    with _lock, _db() as c:
        r = c.execute(
            "SELECT t.uid AS uid, t.exp AS exp, u.username AS username "
            "FROM tokens t JOIN users u ON u.id=t.uid WHERE t.token=?", (tok,)
        ).fetchone()
        if not r:
            return None
        if r["exp"] < time.time():
            c.execute("DELETE FROM tokens WHERE token=?", (tok,))
            return None
    return {"id": r["uid"], "username": r["username"]}


def revoke_token(tok):
    if not tok:
        return
    with _lock, _db() as c:
        c.execute("DELETE FROM tokens WHERE token=?", (tok,))


def _bearer(authorization):
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


def current_user(authorization: str = Header(None)):
    """Resolve the user from a Bearer token, or None. Never raises."""
    return user_by_token(_bearer(authorization))


def require_user(authorization: str = Header(None)):
    """Anonymous (None) when auth is disabled; otherwise a valid user or 401."""
    if not config.AUTH_ENABLED:
        return None
    user = user_by_token(_bearer(authorization))
    if not user:
        raise HTTPException(status_code=401, detail="Требуется вход")
    return user


@router.post("/register", response_model=AuthOut)
def register(body: AuthIn):
    u = create_user(body.username, body.password)
    return {"token": issue_token(u["id"]), "username": u["username"]}


@router.post("/login", response_model=AuthOut)
def login(body: AuthIn):
    u = verify_user(body.username, body.password)
    return {"token": issue_token(u["id"]), "username": u["username"]}


@router.get("/me", response_model=Me)
def me(user=Depends(current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Не авторизован")
    return {"username": user["username"], "enabled": config.AUTH_ENABLED}


@router.post("/logout", status_code=204)
def logout(authorization: str = Header(None)):
    revoke_token(_bearer(authorization))
    return None
