"""/api/profile — личный кабинет: смена логина и пароля.

Любое изменение требует текущий пароль. Новый пароль проходит ту же усиленную
проверку, что и пароль при регистрации.
"""
import re
import sqlite3

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from . import config
from . import auth as auth_module
from .auth import require_user, validate_new_password
from .ratelimit import guard

router = APIRouter(prefix="/api/profile", tags=["profile"])

_PASSWORD_PATHS = (
    "/v1/auth/change-password",
    "/v1/auth/password",
    "/v1/users/me/password",
)
_USERNAME_PATHS = (
    "/v1/auth/change-username",
    "/v1/auth/username",
    "/v1/users/me/username",
)


class UsernameIn(BaseModel):
    username: str = Field(min_length=3, max_length=40)
    password: str = Field(min_length=1, max_length=200)


class PasswordIn(BaseModel):
    password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=10, max_length=200)


def _check_username(username: str) -> str:
    username = (username or "").strip().lower()
    if not re.fullmatch(r"[a-z0-9_.-]{3,40}", username):
        raise HTTPException(status_code=400, detail="Логин: 3–40 символов из [a-z0-9_.-]")
    return username


async def _post(url: str, body: dict, authorization: str | None = None):
    headers = {"Authorization": authorization} if authorization else {}
    try:
        async with httpx.AsyncClient(
            timeout=config.USER_DB_SERVICE_TIMEOUT, follow_redirects=False
        ) as client:
            return await client.post(url, json=body, headers=headers)
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Сервис пользователей недоступен: {type(exc).__name__}",
        ) from exc


async def _verify_password(username: str, password: str) -> None:
    url = f"{config.USER_DB_SERVICE_URL}/v1/auth/login"
    response = await _post(url, {"username": username, "password": password})
    if response.status_code in (400, 401, 403):
        raise HTTPException(status_code=401, detail="Текущий пароль неверный")
    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Сервис пользователей ответил {response.status_code}",
        )


async def _try_paths(paths, body: dict, authorization: str | None):
    last = None
    for path in paths:
        response = await _post(config.USER_DB_SERVICE_URL + path, body, authorization)
        if response.status_code in (404, 405):
            last = response
            continue
        return response
    return last


def _unsupported() -> HTTPException:
    return HTTPException(
        status_code=501,
        detail=(
            "Сервис пользователей пока не умеет менять логин и пароль: "
            "нужно добавить туда маршруты /v1/auth/change-password и /v1/auth/change-username."
        ),
    )


def _local_set_username(uid: str, username: str) -> None:
    with auth_module._lock, auth_module._db() as connection:
        try:
            connection.execute("UPDATE users SET username=? WHERE id=?", (username, uid))
        except sqlite3.IntegrityError as exc:
            raise HTTPException(status_code=409, detail="Логин уже занят") from exc


def _local_set_password(uid: str, new_password: str) -> None:
    import secrets as _secrets

    salt = _secrets.token_hex(16)
    with auth_module._lock, auth_module._db() as connection:
        connection.execute(
            "UPDATE users SET pwhash=?, salt=? WHERE id=?",
            (auth_module._hash(new_password, salt), salt, uid),
        )
        connection.execute("DELETE FROM tokens WHERE uid=?", (uid,))


@router.get("")
async def profile(user=Depends(require_user)):
    return {
        "id": user.get("id"),
        "username": user.get("username") or "",
        "plan": user.get("plan") or "free",
        "canEdit": True,
    }


@router.post("/username")
async def change_username(
    body: UsernameIn,
    request: Request,
    user=Depends(require_user),
    authorization: str = Header(None),
):
    guard("login", request, user)
    username = _check_username(body.username)
    current = (user.get("username") or "").strip().lower()
    if username == current:
        raise HTTPException(status_code=400, detail="Это и есть текущий логин")

    if config.USER_DB_SERVICE_URL:
        await _verify_password(current, body.password)
        payload = {"username": username, "new_username": username, "password": body.password}
        response = await _try_paths(_USERNAME_PATHS, payload, authorization)
        if response is None or response.status_code in (404, 405):
            raise _unsupported()
        if response.status_code == 409:
            raise HTTPException(status_code=409, detail="Логин уже занят")
        if response.status_code >= 400:
            raise HTTPException(
                status_code=502,
                detail=f"Сервис пользователей ответил {response.status_code}: {response.text[:200]}",
            )
        auth_module._REMOTE_CACHE.clear()
        return {"ok": True, "username": username}

    auth_module.verify_user(current, body.password)
    _local_set_username(str(user["id"]), username)
    return {"ok": True, "username": username}


@router.post("/password")
async def change_password(
    body: PasswordIn,
    request: Request,
    user=Depends(require_user),
    authorization: str = Header(None),
):
    guard("login", request, user)
    validate_new_password(body.new_password)
    if body.new_password == body.password:
        raise HTTPException(status_code=400, detail="Новый пароль совпадает со старым")
    current = (user.get("username") or "").strip().lower()

    if config.USER_DB_SERVICE_URL:
        await _verify_password(current, body.password)
        payload = {
            "password": body.password,
            "old_password": body.password,
            "current_password": body.password,
            "new_password": body.new_password,
        }
        response = await _try_paths(_PASSWORD_PATHS, payload, authorization)
        if response is None or response.status_code in (404, 405):
            raise _unsupported()
        if response.status_code in (400, 401, 403):
            raise HTTPException(status_code=401, detail="Текущий пароль неверный")
        if response.status_code >= 400:
            raise HTTPException(
                status_code=502,
                detail=f"Сервис пользователей ответил {response.status_code}: {response.text[:200]}",
            )
        auth_module._REMOTE_CACHE.clear()
        return {"ok": True, "reauth": True}

    auth_module.verify_user(current, body.password)
    _local_set_password(str(user["id"]), body.new_password)
    return {"ok": True, "reauth": True}
