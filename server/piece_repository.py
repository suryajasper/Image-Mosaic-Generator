"""Portrait project persistence and validation, independent of HTTP routes."""

from pathlib import Path
import json
from piece_models import project_id, piece_lock as _lock


class PieceRepository:
    def __init__(self, db, directory, open_photo, signature):
        self.db = db
        self.open_photo = open_photo
        self.signature = signature
        self.storage = directory / "pieces"
        self.storage.mkdir(exist_ok=True)
        with self.db() as conn:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY,path TEXT NOT NULL,signature TEXT NOT NULL,width INTEGER,height INTEGER,enabled INTEGER DEFAULT 0,remainder_mode TEXT DEFAULT 'original',remainder_groups TEXT DEFAULT '[]')"
            )
            conn.execute(
                "CREATE TABLE IF NOT EXISTS pieces (id TEXT PRIMARY KEY,project_id TEXT NOT NULL,name TEXT NOT NULL,position INTEGER,mode TEXT DEFAULT 'mosaic',groups TEXT DEFAULT '[]',mask_revision INTEGER DEFAULT 0)"
            )
            if "prompts" not in {
                r[1] for r in conn.execute("PRAGMA table_info(pieces)")
            }:
                conn.execute(
                    'ALTER TABLE pieces ADD COLUMN prompts TEXT DEFAULT \'{"points":[],"box":null}\''
                )
            for table, prefix in (("pieces", ""), ("projects", "remainder_")):
                fields = {
                    r[1] for r in conn.execute("PRAGMA table_info(" + table + ")")
                }
                if prefix + "effect" not in fields:
                    conn.execute(f"ALTER TABLE {table} ADD COLUMN {prefix}effect TEXT")
                for field, kind in (
                    ("columns", "INTEGER"),
                    ("variety", "REAL"),
                    ("blend", "REAL"),
                ):
                    name = prefix + field
                    if name not in fields:
                        conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {kind}")

    def current(self):
        with self.db() as conn:
            target = conn.execute(
                "SELECT value FROM settings WHERE key='target'"
            ).fetchone()
        if not target:
            raise ValueError("Choose a portrait in Mosaic studio first.")
        path = Path(target[0])
        if not path.is_file():
            raise ValueError("The portrait file is unavailable.")
        return str(path), project_id(path), self.signature(path)

    def get_project(self):
        path, key, stamp = self.current()
        with _lock, self.db() as conn:
            project = conn.execute(
                "SELECT * FROM projects WHERE id=?", (key,)
            ).fetchone()
            if not project:
                image = self.open_photo({"path": path, "rotation": 0}, False)
                image.thumbnail((1024, 1024))
                conn.execute(
                    "INSERT INTO projects(id,path,signature,width,height) VALUES (?,?,?,?,?)",
                    (key, path, stamp, image.width, image.height),
                )
                project = conn.execute(
                    "SELECT * FROM projects WHERE id=?", (key,)
                ).fetchone()
        return dict(project), stamp

    def checked_project(self, data):
        project, stamp = self.get_project()
        if data and data.get("projectId") != project["id"]:
            raise ValueError("The active portrait changed. Reopen Portrait pieces.")
        if project["signature"] != stamp:
            raise ValueError(
                "The portrait image changed. Reset or reuse its pieces first."
            )
        return project

    def group_ids(self, value):
        if (
            not isinstance(value, list)
            or len(value) > 500
            or any(not isinstance(v, str) for v in value)
        ):
            raise ValueError("Invalid photo groups.")
        with self.db() as conn:
            known = {
                r[0] for r in conn.execute("SELECT id FROM groups WHERE enabled=1")
            }
        if any(v not in known for v in value):
            raise ValueError("A selected group is no longer registered.")
        return json.dumps(list(dict.fromkeys(value)))
