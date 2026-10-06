"""Local database schema, paths, and write lock."""

from pathlib import Path
import os
import sqlite3
import threading
import uuid

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("MOSAIC_DATA_DIR", ROOT / ".mosaic"))
DATA.mkdir(parents=True, exist_ok=True)
lock = threading.RLock()
EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".tif",
    ".tiff",
    ".bmp",
    ".heic",
    ".heif",
}
HEIC = {".heic", ".heif"}
CACHE = DATA / "cache"
CACHE.mkdir(exist_ok=True)


def db():
    connection = sqlite3.connect(DATA / "library.sqlite")
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    if (DATA / "library.sqlite").exists():
        with db() as source:
            if not source.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='groups'"
            ).fetchone():
                backups = DATA / "backups"
                backups.mkdir(exist_ok=True)
                with sqlite3.connect(
                    backups / ("before-groups-" + uuid.uuid4().hex + ".sqlite")
                ) as destination:
                    source.backup(destination)

    with db() as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, path TEXT UNIQUE, selected INTEGER DEFAULT 1, rotation INTEGER DEFAULT 0, x REAL DEFAULT 0.5, y REAL DEFAULT 0.5, size REAL DEFAULT 1, revision INTEGER DEFAULT 0)"
        )
        conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)"
        )
        columns = {r[1] for r in conn.execute("PRAGMA table_info(photos)")}
        for name, declaration in [
            ("active", "INTEGER DEFAULT 1"),
            ("signature", "TEXT DEFAULT ''"),
        ]:
            if name not in columns:
                conn.execute(f"ALTER TABLE photos ADD COLUMN {name} {declaration}")
        conn.execute(
            "CREATE TABLE IF NOT EXISTS portraits (id TEXT PRIMARY KEY, path TEXT)"
        )
        conn.execute(
            "CREATE TABLE IF NOT EXISTS heic_sources (path TEXT PRIMARY KEY, identity TEXT NOT NULL, signature TEXT NOT NULL, digest TEXT NOT NULL)"
        )
        conn.execute(
            "CREATE TABLE IF NOT EXISTS heic_conversions (digest TEXT PRIMARY KEY, filename TEXT NOT NULL)"
        )

        conn.execute(
            "CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT UNIQUE NOT NULL, status TEXT DEFAULT 'available', enabled INTEGER DEFAULT 1)"
        )
        conn.execute(
            "CREATE TABLE IF NOT EXISTS group_photos (group_id TEXT, photo_id TEXT, present INTEGER DEFAULT 1, PRIMARY KEY(group_id, photo_id))"
        )
        if not conn.execute("SELECT 1 FROM groups LIMIT 1").fetchone():
            saved = conn.execute(
                "SELECT value FROM settings WHERE key='folder'"
            ).fetchone()
            if saved and saved[0]:
                group_id = uuid.uuid4().hex
                conn.execute(
                    "INSERT INTO groups(id,name,path) VALUES (?,?,?)",
                    (group_id, Path(saved[0]).name, saved[0]),
                )
                conn.execute(
                    "INSERT INTO group_photos SELECT ?,id,1 FROM photos WHERE active=1",
                    (group_id,),
                )
