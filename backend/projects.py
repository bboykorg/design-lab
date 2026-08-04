"""/api/projects — CRUD. Private per-user when AUTH_ENABLED, else shared.

Storage backend (JSON default, SQLite optional) lives in store.py.

Удаление окончательное. Прежде удалённый сайт возвращался: открытый редактор
продолжал автосохранение и создавал его заново. Теперь сервер ведёт надгробия
(graveyard.py) и отказывает в воскрешении как по id, так и по отпечатку
содержимого — независимо от браузера, вкладки и чистки локального хранилища.
"""
import re
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Request

from . import config
from . import graveyard
from .models import ProjectIn, Project, ProjectMeta
from .store import get_store, new_id
from .auth import require_project_user
from .ratelimit import guard

router = APIRouter(prefix="/api/projects", tags=["projects"])
_store = get_store()

DELETED = "\u041f\u0440\u043e\u0435\u043a\u0442 \u0443\u0434\u0430\u043b\u0451\u043d"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _safe_id(pid: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", pid or ""):
        raise HTTPException(status_code=400, detail="Некорректный id")
    return pid


def _uid(user):
    return user["id"] if (config.AUTH_ENABLED and user) else ""


def _owned(data, user):
    """True if the current user may access this project (or auth is off)."""
    if not config.AUTH_ENABLED:
        return True
    return bool(user) and data.get("owner", "") == user["id"]


@router.get("", response_model=list[ProjectMeta])
def list_projects(request: Request, user=Depends(require_project_user)):
    guard("projects", request, user)
    items = _store.list()
    if config.AUTH_ENABLED:
        uid = _uid(user)
        items = [p for p in items if p.get("owner", "") == uid]
    # Защита от гонки: если запись успела лечь в хранилище после удаления,
    # в списке её всё равно не будет, и лишний файл подбирается сразу.
    dead = graveyard.dead_ids()
    if dead:
        alive = []
        for item in items:
            pid = str(item.get("id", ""))
            if pid in dead:
                try:
                    _store.delete(pid)
                except Exception:
                    pass
                continue
            alive.append(item)
        items = alive
    return items


@router.post("", response_model=Project)
def upsert_project(body: ProjectIn, request: Request, user=Depends(require_project_user)):
    guard("projects", request, user)
    now = _now()
    uid = _uid(user)

    if body.id:
        _safe_id(body.id)
        # Сохранение в удалённый проект больше не воскрешает его.
        if graveyard.is_buried(body.id):
            raise HTTPException(status_code=404, detail=DELETED)
        cur = _store.get(body.id)
        if not cur or not _owned(cur, user):
            raise HTTPException(status_code=404, detail="Проект не найден")
        cur.update(name=body.name, html=body.html, kind=body.kind, updated=now)
        return _store.save(cur)

    # Автосохранение без id — главный способ воскрешения: тот же сайт
    # появлялся под новым id. По отпечатку содержимого такое отклоняется.
    if graveyard.is_buried_content(uid, body.html):
        raise HTTPException(status_code=404, detail=DELETED)

    data = {"id": new_id(), "name": body.name, "html": body.html, "kind": body.kind,
            "created": now, "updated": now, "owner": uid}
    return _store.save(data)


@router.get("/{pid}", response_model=Project)
def get_project(pid: str, request: Request, user=Depends(require_project_user)):
    guard("projects", request, user)
    _safe_id(pid)
    if graveyard.is_buried(pid):
        raise HTTPException(status_code=404, detail=DELETED)
    d = _store.get(pid)
    if not d or not _owned(d, user):
        raise HTTPException(status_code=404, detail="Проект не найден")
    return d


@router.delete("/{pid}", status_code=204)
def delete_project(pid: str, request: Request, user=Depends(require_project_user)):
    guard("projects", request, user)
    _safe_id(pid)
    d = _store.get(pid)

    # Уже удалён — такое удаление считается успешным, чтобы кнопка удаления
    # срабатывала с первого раза и не показывала ошибку.
    if not d:
        graveyard.bury(pid, _uid(user), "")
        return None

    if not _owned(d, user):
        raise HTTPException(status_code=404, detail="Проект не найден")

    graveyard.bury(pid, d.get("owner", "") or _uid(user), d.get("html", "") or "")
    _store.delete(pid)
    return None
