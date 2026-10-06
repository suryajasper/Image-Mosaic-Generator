from pathlib import Path
import io
import uuid
import numpy as np
from flask import Blueprint, abort, jsonify, request, send_file
from PIL import Image, UnidentifiedImageError
import background
from storage import DATA, HEIC, EXTENSIONS, db, lock
from file_identity import signature, identity
from conversions import conversion_pending, convert
from photo_service import photo, open_photo, thumbnail, update_active

bp = Blueprint("library", __name__)


@bp.patch("/api/groups/<group_id>")
def rename_group(group_id):
    name = str(request.json.get("name", "")).strip()
    if not name or len(name) > 100:
        raise ValueError("Use a group name between 1 and 100 characters.")
    with lock, db() as conn:
        if not conn.execute(
            "SELECT 1 FROM groups WHERE id=? AND enabled=1", (group_id,)
        ).fetchone():
            abort(404)
        conn.execute("UPDATE groups SET name=? WHERE id=?", (name, group_id))
    return jsonify(ok=True)


@bp.delete("/api/groups/<group_id>")
def remove_group(group_id):
    with lock, db() as conn:
        conn.execute("UPDATE groups SET enabled=0 WHERE id=?", (group_id,))
        update_active(conn)
    return jsonify(ok=True)


@bp.get("/api/library")
def library():
    with db() as conn:
        rows = [
            dict(r)
            for r in conn.execute("SELECT * FROM photos WHERE active=1 ORDER BY path")
        ]
        settings = dict(conn.execute("SELECT key,value FROM settings").fetchall())
        groups = [
            dict(r)
            for r in conn.execute(
                "SELECT g.*,COUNT(p.id) AS photoCount,COALESCE(SUM(p.selected),0) AS selectedCount FROM groups g LEFT JOIN group_photos gp ON gp.group_id=g.id AND gp.present=1 LEFT JOIN photos p ON p.id=gp.photo_id WHERE g.enabled=1 GROUP BY g.id ORDER BY g.name"
            )
        ]
        memberships = list(
            conn.execute(
                "SELECT gp.photo_id,gp.group_id FROM group_photos gp JOIN groups g ON gp.group_id=g.id WHERE gp.present=1 AND g.enabled=1"
            )
        )
    by_photo = {}
    for photo_id, group_id in memberships:
        by_photo.setdefault(photo_id, []).append(group_id)
    for row in rows:
        row["groups"] = by_photo.get(row["id"], [])
        row["name"] = Path(row["path"]).name
    return jsonify(
        groups=groups,
        photos=rows,
        folder=settings.get("folder", ""),
        target=settings.get("target"),
        foreground=settings.get("foreground") == "1",
        mosaicRegion=settings.get(
            "mosaicRegion", "foreground" if settings.get("foreground") == "1" else "all"
        ),
        backgroundReady=background.ready(DATA / "models"),
        backgroundAvailable=background.available(),
    )


@bp.post("/api/import")
def import_folder():
    folder = Path(request.json.get("path", "")).expanduser().resolve()
    if not folder.is_dir():
        with lock, db() as conn:
            group = conn.execute(
                "SELECT id FROM groups WHERE path=? AND enabled=1", (str(folder),)
            ).fetchone()
            if group:
                conn.execute(
                    "UPDATE groups SET status='unavailable' WHERE id=?", (group[0],)
                )
                update_active(conn)
                return jsonify(imported=0, skipped=[], unavailable=True)
        raise ValueError("Enter an existing folder on this computer.")
    paths = sorted(
        p.resolve()
        for p in folder.rglob("*")
        if p.is_file() and p.suffix.lower() in EXTENSIONS
    )
    pending = conversion_pending(paths)
    if pending and not request.json.get("convert") and not request.json.get("skipHeic"):
        return jsonify(needsConversion=pending)
    skipped, imported = [], 0
    with lock, db() as conn:
        group = conn.execute(
            "SELECT id FROM groups WHERE path=?", (str(folder),)
        ).fetchone()
        group_id = group[0] if group else uuid.uuid4().hex
        name = str(request.json.get("name") or folder.name).strip()[:100]
        conn.execute(
            "INSERT INTO groups(id,name,path) VALUES (?,?,?) ON CONFLICT(path) DO UPDATE SET status='available',enabled=1",
            (group_id, name, str(folder)),
        )
        conn.execute("UPDATE group_photos SET present=0 WHERE group_id=?", (group_id,))
        for path in paths:
            try:
                if str(path) in pending and not request.json.get("convert"):
                    continue
                photo_id, stamp = identity(path), signature(path)
                existing = conn.execute(
                    "SELECT * FROM photos WHERE id=? OR path=? ORDER BY id=? DESC",
                    (photo_id, str(path), photo_id),
                ).fetchone()
                if existing:
                    photo_id = existing["id"]
                if not existing or existing["signature"] != stamp:
                    readable = (
                        convert(path, conn) if path.suffix.lower() in HEIC else path
                    )
                    with Image.open(readable) as img:
                        img.verify()
                conn.execute(
                    "INSERT INTO photos (id,path,signature,active) VALUES (?,?,?,1) ON CONFLICT(id) DO UPDATE SET path=excluded.path, active=1, revision=photos.revision + (photos.signature != excluded.signature), signature=excluded.signature",
                    (photo_id, str(path), stamp),
                )
                conn.execute(
                    "INSERT INTO group_photos VALUES (?,?,1) ON CONFLICT(group_id,photo_id) DO UPDATE SET present=1",
                    (group_id, photo_id),
                )
                imported += 1
            except (
                OSError,
                ValueError,
                UnidentifiedImageError,
                Image.DecompressionBombError,
            ):
                skipped.append(path.name)
        update_active(conn)
        conn.execute(
            "INSERT OR REPLACE INTO settings VALUES (?,?)", ("folder", str(folder))
        )
    return jsonify(imported=imported, skipped=skipped)


@bp.post("/api/convert")
def convert_photos():
    paths = [Path(p).expanduser().resolve() for p in request.json.get("paths", [])]
    with lock:
        for path in paths:
            if path.suffix.lower() not in HEIC or not path.is_file():
                raise ValueError(
                    "Only existing local HEIC / HEIF images can be converted."
                )
            try:
                convert(path)
            except (OSError, ValueError, UnidentifiedImageError):
                raise ValueError(
                    f"Could not convert {path.name}. The original is unchanged."
                )
    return jsonify(converted=len(paths))


@bp.patch("/api/photos/<photo_id>")
def edit(photo_id):
    row, data = photo(photo_id), request.json
    for key in ("x", "y", "size"):
        if key in data:
            value = float(data[key])
            if (
                not np.isfinite(value)
                or not (0.05 if key == "size" else 0) <= value <= 1
            ):
                raise ValueError("Invalid crop coordinates.")
            row[key] = value
    if "rotation" in data:
        if data["rotation"] not in (0, 90, 180, 270):
            raise ValueError("Rotation must be a quarter turn.")
        row["rotation"] = data["rotation"]
    if "selected" in data:
        row["selected"] = bool(data["selected"])
    with lock, db() as conn:
        conn.execute(
            "UPDATE photos SET selected=?,rotation=?,x=?,y=?,size=?,revision=revision+1 WHERE id=?",
            (
                row["selected"],
                row["rotation"],
                row["x"],
                row["y"],
                row["size"],
                photo_id,
            ),
        )
    return jsonify(ok=True)


@bp.post("/api/selection")
def selection():
    with lock, db() as conn:
        ids = request.json.get("ids")
        if ids is None:
            conn.execute(
                "UPDATE photos SET selected=? WHERE active=1",
                (bool(request.json["selected"]),),
            )
        else:
            if not isinstance(ids, list) or len(ids) > 50000:
                raise ValueError("Invalid photo selection.")
            conn.executemany(
                "UPDATE photos SET selected=? WHERE id=? AND active=1",
                [(bool(request.json["selected"]), photo_id) for photo_id in ids],
            )
    return jsonify(ok=True)


@bp.get("/api/photos/<photo_id>/image")
def image(photo_id):
    row = photo(photo_id)
    if not Path(row["path"]).is_file():
        abort(404)
    if request.args.get("original") != "1":
        size = int(request.args.get("size", 256))
        if size not in (256, 512, 1024):
            raise ValueError("Photo size must be 256, 512, or 1024.")
        return send_file(thumbnail(row, size), mimetype="image/jpeg", max_age=31536000)
    image = open_photo(row, False)
    image.thumbnail((1600, 1600))
    output = io.BytesIO()
    image.save(output, "JPEG", quality=90)
    output.seek(0)
    return send_file(output, mimetype="image/jpeg", max_age=0)
