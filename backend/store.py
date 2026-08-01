"""Project storage backends with one interface.

Default is JSON files (zero-setup). Set STORE=sqlite to use a single-file
SQLite DB instead — same API, ready for many projects. Swappable for Postgres
later by adding another class with list/get/save/delete.
"""
import json
import os
import sqlite3
import threading
import uuid
from pathlib import Path

from . import config

META_KEYS = ("id", "name", "kind", "created", "updated", "owner")


def new_id() -> str:
    return uuid.uuid4().hex[:16]


class JSONStore:
    def __init__(self, directory):
        self.dir = Path(directory)
        self.dir.mkdir(parents=True, exist_ok=True)

    def _p(self, pid):
        return self.dir / f"{pid}.json"

    def list(self):
        out = []
        for f in self.dir.glob("*.json"):
            try:
                d = json.loads(f.read_text(encoding="utf-8"))
                out.append({k: d.get(k, "") for k in META_KEYS})
            except Exception:
                continue
        out.sort(key=lambda d: d.get("updated", ""), reverse=True)
        return out

    def get(self, pid):
        p = self._p(pid)
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None

    def save(self, data):
        self._p(data["id"]).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        return data

    def delete(self, pid):
        p = self._p(pid)
        if p.exists():
            p.unlink()
            return True
        return False


class SQLiteStore:
    def __init__(self, path):
        self.path = str(path)
        self._lock = threading.Lock()
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self._conn() as c:
            c.execute(
                "CREATE TABLE IF NOT EXISTS projects("
                "id TEXT PRIMARY KEY, name TEXT, html TEXT, kind TEXT, created TEXT, updated TEXT, owner TEXT DEFAULT '')"
            )
            cols = [r[1] for r in c.execute("PRAGMA table_info(projects)").fetchall()]
            if "owner" not in cols:
                c.execute("ALTER TABLE projects ADD COLUMN owner TEXT DEFAULT ''")

    def _conn(self):
        c = sqlite3.connect(self.path)
        c.row_factory = sqlite3.Row
        return c

    def list(self):
        with self._lock, self._conn() as c:
            rows = c.execute(
                "SELECT id,name,kind,created,updated,owner FROM projects ORDER BY updated DESC"
            ).fetchall()
        return [dict(r) for r in rows]

    def get(self, pid):
        with self._lock, self._conn() as c:
            r = c.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
        return dict(r) if r else None

    def save(self, data):
        with self._lock, self._conn() as c:
            c.execute(
                "INSERT INTO projects(id,name,html,kind,created,updated,owner) VALUES(?,?,?,?,?,?,?) "
                "ON CONFLICT(id) DO UPDATE SET name=excluded.name,html=excluded.html,"
                "kind=excluded.kind,updated=excluded.updated",
                (data["id"], data["name"], data["html"], data["kind"], data["created"],
                 data["updated"], data.get("owner", "")),
            )
        return data

    def delete(self, pid):
        with self._lock, self._conn() as c:
            cur = c.execute("DELETE FROM projects WHERE id=?", (pid,))
        return cur.rowcount > 0


def get_store():
    kind = os.getenv("STORE", "json").lower()
    if kind == "sqlite":
        return SQLiteStore(config.DATA_DIR / "projects.db")
    return JSONStore(config.PROJECTS_DIR)
