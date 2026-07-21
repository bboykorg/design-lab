"""Authentication: register/login with token sessions.

Accounts and sessions are kept in an in-process **cache** by default
(`AUTH_STORE=memory`) — fast and zero-setup, but cleared on restart. Set
`AUTH_STORE=sqlite` to persist them in `data/auth.db` instead.

Passwords are hashed with PBKDF2-HMAC-SHA256 (stdlib). When `AUTH_ENABLED=1`,
project endpoints become private per user; otherwise register/login still work
but projects stay shared.
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


def _use_memory() -> bool:
    return config.AUTH_STORE != "sqlite"


# ---------------------------------------------------------------------------
# In-memory cache backend (default)
# ---------------------------------------------------------------------------
_MEM_USERS = {}      # username -> {id, username, pwhash, salt, created}
_MEM_BY_ID = {}      # id -> username
_MEM_TOKENS = {}     # token -> {uid, exp}


# ---------------------------------------------------------------------------
# SQLite backend (opt-in via AUTH_STORE=sqlite)
# ---------------------------------------------------------------------------
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
    if _use_memory():
        return
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
    created = datetime.now(timezone.utc).isoformat(timespec="seconds")
    if _use_memory():
        with _lock:
            if username in _MEM_USERS:
                raise HTTPException(status_code=409, detail="Логин уже занят")
            _MEM_USERS[username] = {"id": uid, "username": username,
                                    "pwhash": _hash(password, salt), "salt": salt, "created": created}
            _MEM_BY_ID[uid] = username
        return {"id": uid, "username": username}
    with _lock, _db() as c:
        if c.execute("SELECT 1 FROM users WHERE username=?", (username,)).fetchone():
            raise HTTPException(status_code=409, detail="Логин уже занят")
        c.execute("INSERT INTO users(id,username,pwhash,salt,created) VALUES(?,?,?,?,?)",
                  (uid, username, _hash(password, salt), salt, created))
    return {"id": uid, "username": username}


def verify_user(username: str, password: str) -> dict:
    username = (username or "").strip().lower()
    if _use_memory():
        with _lock:
            r = _MEM_USERS.get(username)
        if not r or _hash(password or "", r["salt"]) != r["pwhash"]:
            raise HTTPException(status_code=401, detail="Неверный логин или пароль")
        return {"id": r["id"], "username": r["username"]}
    with _lock, _db() as c:
        r = c.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
    if not r or _hash(password or "", r["salt"]) != r["pwhash"]:
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    return {"id": r["id"], "username": r["username"]}


def issue_token(uid: str) -> str:
    tok = secrets.token_urlsafe(32)
    exp = time.time() + config.AUTH_TOKEN_TTL * 86400
    if _use_memory():
        with _lock:
            _MEM_TOKENS[tok] = {"uid": uid, "exp": exp}
        return tok
    with _lock, _db() as c:
        c.execute("INSERT INTO tokens(token,uid,exp) VALUES(?,?,?)", (tok, uid, exp))
    return tok


def user_by_token(tok):
    if not tok:
        return None
    if _use_memory():
        with _lock:
            t = _MEM_TOKENS.get(tok)
            if not t:
                return None
            if t["exp"] < time.time():
                _MEM_TOKENS.pop(tok, None)
                return None
            username = _MEM_BY_ID.get(t["uid"])
            if not username:
                return None
            return {"id": t["uid"], "username": username}
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
    if _use_memory():
        with _lock:
            _MEM_TOKENS.pop(tok, None)
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
