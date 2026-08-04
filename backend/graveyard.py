"""Надгробия удалённых проектов.

Зачем это нужно. Удалённый сайт возвращался потому, что удаление убирало только
запись в хранилище, а открытый редактор продолжал автосохранение и тут же
создавал сайт заново. Защита в браузере помогала ненадёжно: другой браузер,
очищенное хранилище или старая вкладка — и сайт снова жив. Теперь решение
об удалении принимает сервер и помнит его сам.

Что запоминается:
  • id удалённого проекта — его нельзя ни открыть, ни сохранить снова;
  • отпечаток содержимого — автосохранение без id не создаст тот же сайт
    под новым именем.

Отпечаток живёт короче id: если пользователь через неделю захочет собрать такой
же сайт заново, никто ему мешать не должен. Отпечаток считается с учётом
владельца, чтобы чужое удаление никогда не блокировало чужие создания.

Файл с надгробиями лежит в DATA_DIR, а не в PROJECTS_DIR: JSON-хранилище считает
любой *.json рядом с проектами проектом.
"""
import hashlib
import json
import threading
import time
from pathlib import Path

from . import config

ID_TTL_SECONDS = 365 * 24 * 3600      # id не переиспользуются, можно держать долго
SIG_TTL_SECONDS = 7 * 24 * 3600       # отпечаток содержимого — только на неделю
MIN_HTML = 200                        # короткие заготовки слишком похожи друг на друга
MAX_RECORDS = 5000

_lock = threading.RLock()
_cache = None


def _path() -> Path:
    directory = Path(config.DATA_DIR)
    directory.mkdir(parents=True, exist_ok=True)
    return directory / "deleted-projects.json"


def _empty():
    return {"ids": {}, "sigs": {}}


def _load():
    global _cache
    if _cache is not None:
        return _cache
    data = _empty()
    try:
        raw = json.loads(_path().read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            ids = raw.get("ids")
            sigs = raw.get("sigs")
            if isinstance(ids, dict):
                data["ids"] = {str(k): v for k, v in ids.items() if isinstance(v, dict)}
            if isinstance(sigs, dict):
                data["sigs"] = {str(k): v for k, v in sigs.items() if isinstance(v, (int, float))}
    except Exception:
        data = _empty()
    _cache = data
    return _cache


def _sweep(data) -> None:
    now = time.time()
    for pid in [k for k, v in data["ids"].items()
                if now - float(v.get("at", 0) or 0) > ID_TTL_SECONDS]:
        data["ids"].pop(pid, None)
    for sig in [k for k, v in data["sigs"].items() if now - float(v or 0) > SIG_TTL_SECONDS]:
        data["sigs"].pop(sig, None)
    # Аварийный предел, чтобы файл не рос бесконечно.
    for key in ("ids", "sigs"):
        extra = len(data[key]) - MAX_RECORDS
        if extra <= 0:
            continue

        def stamp(item):
            value = item[1]
            return float(value.get("at", 0) or 0) if isinstance(value, dict) else float(value or 0)

        oldest = sorted(data[key].items(), key=stamp)[:extra]
        for k, _ in oldest:
            data[key].pop(k, None)


def _save(data) -> None:
    target = _path()
    temporary = target.with_suffix(".tmp")
    try:
        temporary.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        temporary.replace(target)
    except Exception:
        pass


def signature(owner: str, html: str) -> str:
    """Отпечаток содержимого; пустой для слишком коротких страниц."""
    body = html or ""
    if len(body) < MIN_HTML:
        return ""
    seed = f"{owner or ''}\n{len(body)}\n{body}".encode("utf-8", "ignore")
    return hashlib.sha256(seed).hexdigest()[:32]


def bury(pid: str, owner: str = "", html: str = "") -> None:
    """Пометить проект удалённым навсегда."""
    if not pid:
        return
    with _lock:
        data = _load()
        data["ids"][str(pid)] = {"at": time.time(), "owner": owner or ""}
        sig = signature(owner, html)
        if sig:
            data["sigs"][sig] = time.time()
        _sweep(data)
        _save(data)


def is_buried(pid: str) -> bool:
    if not pid:
        return False
    with _lock:
        data = _load()
        record = data["ids"].get(str(pid))
        if not record:
            return False
        if time.time() - float(record.get("at", 0) or 0) > ID_TTL_SECONDS:
            data["ids"].pop(str(pid), None)
            _save(data)
            return False
        return True


def is_buried_content(owner: str, html: str) -> bool:
    sig = signature(owner, html)
    if not sig:
        return False
    with _lock:
        data = _load()
        stamp = data["sigs"].get(sig)
        if stamp is None:
            return False
        if time.time() - float(stamp or 0) > SIG_TTL_SECONDS:
            data["sigs"].pop(sig, None)
            _save(data)
            return False
        return True


def dead_ids() -> set:
    with _lock:
        return set(_load()["ids"].keys())


def forget(pid: str) -> None:
    """Снять надгробие — на случай ручного восстановления."""
    if not pid:
        return
    with _lock:
        data = _load()
        if data["ids"].pop(str(pid), None) is not None:
            _save(data)


def stats() -> dict:
    with _lock:
        data = _load()
        return {"ids": len(data["ids"]), "sigs": len(data["sigs"])}
