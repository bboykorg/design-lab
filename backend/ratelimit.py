"""Простой in-memory rate limit: одна инстанция Render, без внешних зависимостей.

Лимиты настраиваются переменными окружения RATE_<BUCKET>_LIMIT и
RATE_<BUCKET>_WINDOW (окно в секундах).
"""
import os
import threading
import time

from fastapi import HTTPException, Request


def _rule(name: str, limit: int, window: int):
    return (
        int(os.getenv(f"RATE_{name}_LIMIT", str(limit))),
        int(os.getenv(f"RATE_{name}_WINDOW", str(window))),
    )


RULES = {
    "login": _rule("LOGIN", 5, 600),
    "register": _rule("REGISTER", 3, 3600),
    "proxy": _rule("PROXY", 60, 3600),
    "ocr": _rule("OCR", 40, 3600),
    "ai": _rule("AI", 40, 3600),
    "audit": _rule("AUDIT", 30, 3600),
    "projects": _rule("PROJECTS", 300, 3600),
}

_lock = threading.Lock()
_hits = {}
_last_sweep = 0.0


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def identity(request: Request, user=None) -> str:
    if user and user.get("id"):
        return "u:" + str(user["id"])
    return "ip:" + client_ip(request)


def _sweep(now: float) -> None:
    global _last_sweep
    if now - _last_sweep < 300:
        return
    _last_sweep = now
    longest = max(window for _, window in RULES.values())
    for key in list(_hits):
        stamps = [stamp for stamp in _hits[key] if now - stamp < longest]
        if stamps:
            _hits[key] = stamps
        else:
            _hits.pop(key, None)


def hit(bucket: str, who: str) -> None:
    limit, window = RULES.get(bucket, (60, 3600))
    now = time.time()
    with _lock:
        _sweep(now)
        key = (bucket, who)
        stamps = [stamp for stamp in _hits.get(key, []) if now - stamp < window]
        if len(stamps) >= limit:
            retry = max(int(window - (now - stamps[0])) + 1, 1)
            _hits[key] = stamps
            raise HTTPException(
                status_code=429,
                detail=f"Слишком много запросов. Попробуй через {retry} с.",
                headers={"Retry-After": str(retry)},
            )
        stamps.append(now)
        _hits[key] = stamps


def guard(bucket: str, request: Request, user=None) -> None:
    hit(bucket, identity(request, user))
