"""/api/projects — CRUD. Private per-user when AUTH_ENABLED, else shared.

Storage backend (JSON default, SQLite optional) lives in store.py.
"""
import re
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends

from . import config
from .models import ProjectIn, Project, ProjectMeta
from .store import get_store, new_id
from .auth import require_user

router = APIRouter(prefix="/api/projects", tags=["projects"])
_store = get_store()


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
def list_projects(user=Depends(require_user)):
    items = _store.list()
    if config.AUTH_ENABLED:
        uid = _uid(user)
        items = [p for p in items if p.get("owner", "") == uid]
    return items


@router.post("", response_model=Project)
def upsert_project(body: ProjectIn, user=Depends(require_user)):
    now = _now()
    if body.id:
        _safe_id(body.id)
        cur = _store.get(body.id)
        if not cur or not _owned(cur, user):
            raise HTTPException(status_code=404, detail="Проект не найден")
        cur.update(name=body.name, html=body.html, kind=body.kind, updated=now)
        return _store.save(cur)
    data = {"id": new_id(), "name": body.name, "html": body.html, "kind": body.kind,
            "created": now, "updated": now, "owner": _uid(user)}
    return _store.save(data)


@router.get("/{pid}", response_model=Project)
def get_project(pid: str, user=Depends(require_user)):
    _safe_id(pid)
    d = _store.get(pid)
    if not d or not _owned(d, user):
        raise HTTPException(status_code=404, detail="Проект не найден")
    return d


@router.delete("/{pid}", status_code=204)
def delete_project(pid: str, user=Depends(require_user)):
    _safe_id(pid)
    d = _store.get(pid)
    if not d or not _owned(d, user):
        raise HTTPException(status_code=404, detail="Проект не найден")
    _store.delete(pid)
    return None
