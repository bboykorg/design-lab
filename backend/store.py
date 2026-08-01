"""Project storage backends with one interface.

PROJECTS_DATABASE_URL selects persistent PostgreSQL. JSON remains a locked,
atomic fallback for development, but an ordinary Render filesystem is ephemeral.
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
        self._lock = threading.RLock()

    def _p(self, pid):
        return self.dir / f"{pid}.json"

    def list(self):
        with self._lock:
            out = []
            for file in self.dir.glob("*.json"):
                try:
                    data = json.loads(file.read_text(encoding="utf-8"))
                    out.append({key: data.get(key, "") for key in META_KEYS})
                except Exception:
                    continue
        out.sort(key=lambda data: data.get("updated", ""), reverse=True)
        return out

    def get(self, pid):
        with self._lock:
            path = self._p(pid)
            return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None

    def save(self, data):
        destination = self._p(data["id"])
        temporary = destination.with_suffix(".tmp")
        with self._lock:
            temporary.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            temporary.replace(destination)
        return data

    def delete(self, pid):
        with self._lock:
            path = self._p(pid)
            if path.exists():
                path.unlink()
                return True
            return False


class SQLiteStore:
    def __init__(self, path):
        self.path = str(path)
        self._lock = threading.Lock()
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self._conn() as connection:
            connection.execute(
                "CREATE TABLE IF NOT EXISTS projects("
                "id TEXT PRIMARY KEY, name TEXT, html TEXT, kind TEXT, created TEXT, updated TEXT, owner TEXT DEFAULT '')"
            )
            columns = [row[1] for row in connection.execute("PRAGMA table_info(projects)").fetchall()]
            if "owner" not in columns:
                connection.execute("ALTER TABLE projects ADD COLUMN owner TEXT DEFAULT ''")

    def _conn(self):
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        return connection

    def list(self):
        with self._lock, self._conn() as connection:
            rows = connection.execute(
                "SELECT id,name,kind,created,updated,owner FROM projects ORDER BY updated DESC"
            ).fetchall()
        return [dict(row) for row in rows]

    def get(self, pid):
        with self._lock, self._conn() as connection:
            row = connection.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
        return dict(row) if row else None

    def save(self, data):
        with self._lock, self._conn() as connection:
            connection.execute(
                "INSERT INTO projects(id,name,html,kind,created,updated,owner) VALUES(?,?,?,?,?,?,?) "
                "ON CONFLICT(id) DO UPDATE SET name=excluded.name,html=excluded.html,"
                "kind=excluded.kind,updated=excluded.updated",
                (data["id"], data["name"], data["html"], data["kind"], data["created"],
                 data["updated"], data.get("owner", "")),
            )
        return data

    def delete(self, pid):
        with self._lock, self._conn() as connection:
            cursor = connection.execute("DELETE FROM projects WHERE id=?", (pid,))
        return cursor.rowcount > 0


class PostgresStore:
    """Persistent project storage; all values use bound SQL parameters."""

    def __init__(self, database_url: str):
        try:
            import psycopg
            from psycopg.rows import dict_row
        except ImportError as exc:
            raise RuntimeError("Install psycopg[binary] for PostgreSQL projects") from exc
        self._psycopg = psycopg
        self._dict_row = dict_row
        self.database_url = database_url
        with self._conn() as connection:
            connection.execute(
                "CREATE TABLE IF NOT EXISTS design_lab_projects ("
                "id TEXT PRIMARY KEY, name TEXT NOT NULL, html TEXT NOT NULL, "
                "kind TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL, "
                "owner TEXT NOT NULL DEFAULT '')"
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS design_lab_projects_owner_updated "
                "ON design_lab_projects(owner, updated DESC)"
            )

    def _conn(self):
        return self._psycopg.connect(self.database_url, row_factory=self._dict_row)

    def list(self):
        with self._conn() as connection:
            rows = connection.execute(
                "SELECT id,name,kind,created,updated,owner "
                "FROM design_lab_projects ORDER BY updated DESC"
            ).fetchall()
        return [dict(row) for row in rows]

    def get(self, pid):
        with self._conn() as connection:
            row = connection.execute(
                "SELECT id,name,html,kind,created,updated,owner "
                "FROM design_lab_projects WHERE id=%s", (pid,)
            ).fetchone()
        return dict(row) if row else None

    def save(self, data):
        with self._conn() as connection:
            connection.execute(
                "INSERT INTO design_lab_projects(id,name,html,kind,created,updated,owner) "
                "VALUES(%s,%s,%s,%s,%s,%s,%s) "
                "ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,html=EXCLUDED.html,"
                "kind=EXCLUDED.kind,updated=EXCLUDED.updated",
                (data["id"], data["name"], data["html"], data["kind"], data["created"],
                 data["updated"], data.get("owner", "")),
            )
        return data

    def delete(self, pid):
        with self._conn() as connection:
            cursor = connection.execute(
                "DELETE FROM design_lab_projects WHERE id=%s", (pid,)
            )
            return cursor.rowcount > 0


def _truthy(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}


def get_store():
    database_url = os.getenv("PROJECTS_DATABASE_URL", "").strip()
    if database_url:
        try:
            store = PostgresStore(database_url)
            print("[projects] PostgreSQL storage connected", flush=True)
            return store
        except Exception as exc:
            # Keep the whole website online if a Render internal hostname is
            # unavailable (for example services are in different regions).
            print(
                f"[projects] PostgreSQL unavailable ({type(exc).__name__}: {exc}); "
                "using temporary JSON storage",
                flush=True,
            )
            if _truthy("PROJECTS_DATABASE_REQUIRED"):
                raise
            return JSONStore(config.PROJECTS_DIR)

    kind = os.getenv("STORE", "json").lower()
    if kind == "postgres":
        if _truthy("PROJECTS_DATABASE_REQUIRED"):
            raise RuntimeError("STORE=postgres requires PROJECTS_DATABASE_URL")
        print("[projects] PROJECTS_DATABASE_URL is empty; using temporary JSON storage", flush=True)
        return JSONStore(config.PROJECTS_DIR)
    if kind == "sqlite":
        return SQLiteStore(config.DATA_DIR / "projects.db")
    return JSONStore(config.PROJECTS_DIR)
