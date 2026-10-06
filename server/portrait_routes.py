from pathlib import Path
import io
from flask import Blueprint, abort, jsonify, request, send_file, current_app
from PIL import Image, UnidentifiedImageError
import background
from storage import DATA, CACHE, HEIC, EXTENSIONS, db, lock
from file_identity import identity
from conversions import converted_path, conversion_pending, convert
from photo_service import open_photo
from portrait_service import foreground_portrait

bp = Blueprint("portraits", __name__)


@bp.post("/api/portraits")
def portrait_options():
    folder = Path(request.json.get("path", "")).expanduser().resolve()
    if not folder.is_dir():
        raise ValueError(
            "Portrait folder not found. You can also use any library photo as the portrait."
        )
    paths = sorted(
        p.resolve()
        for p in folder.rglob("*")
        if p.is_file() and p.suffix.lower() in EXTENSIONS
    )
    pending = conversion_pending(paths)
    if pending and not request.json.get("convert"):
        return jsonify(needsConversion=pending)
    options, skipped = [], []
    with lock, db() as conn:
        for path in paths:
            try:
                readable = convert(path, conn) if path.suffix.lower() in HEIC else path
                with Image.open(readable) as image:
                    image.verify()
                photo_id = identity(path)
                conn.execute(
                    "INSERT OR REPLACE INTO portraits VALUES (?,?)",
                    (photo_id, str(path)),
                )
                options.append(dict(id=photo_id, path=str(path), name=path.name))
            except (OSError, ValueError, UnidentifiedImageError):
                skipped.append(path.name)
    return jsonify(options=options, skipped=skipped)


@bp.get("/api/portraits/<photo_id>/image")
def portrait_thumbnail(photo_id):
    with db() as conn:
        row = conn.execute(
            "SELECT path FROM portraits WHERE id=?", (photo_id,)
        ).fetchone()
    if not row:
        abort(404)
    image = open_photo({"path": row[0], "rotation": 0}, False)
    image.thumbnail((256, 256))
    output = io.BytesIO()
    image.save(output, "JPEG")
    output.seek(0)
    return send_file(output, mimetype="image/jpeg")


@bp.post("/api/target")
def set_target():
    path = Path(request.json.get("path", "")).expanduser().resolve()
    try:
        if path.suffix.lower() in HEIC and not converted_path(path).exists():
            return jsonify(needsConversion=[str(path)])
        with Image.open(
            converted_path(path) if path.suffix.lower() in HEIC else path
        ) as image:
            image.verify()
    except (OSError, ValueError, UnidentifiedImageError):
        raise ValueError("Choose a readable JPG, PNG, WebP or TIFF portrait.")
    with db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO settings VALUES (?,?)", ("target", str(path))
        )
    return jsonify(ok=True)


@bp.post("/api/background/setup")
def prepare_background():
    try:
        background.prepare(DATA / "models")
    except Exception as error:
        current_app.logger.warning("Local model setup failed: %s", error)
        raise ValueError(
            "Could not prepare background removal. Check the internet connection for the one-time model download and install requirements-background.txt if needed."
        )
    return jsonify(ok=True)


@bp.post("/api/target/options")
def target_options():
    region = request.json.get("mosaicRegion")
    if region is not None and region not in ("all", "foreground", "background"):
        raise ValueError("Choose all, foreground, or background.")
    enabled = region != "all" if region is not None else request.json.get("foreground")
    if not isinstance(enabled, bool):
        raise ValueError("Foreground mode must be true or false.")
    if enabled and not background.ready(DATA / "models"):
        raise ValueError("Prepare the local background-removal model first.")
    region = region or ("foreground" if enabled else "all")
    with db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO settings VALUES (?,?)", ("mosaicRegion", region)
        )
        conn.execute(
            "INSERT OR REPLACE INTO settings VALUES (?,?)",
            ("foreground", "1" if enabled else "0"),
        )
    return jsonify(ok=True)


@bp.get("/api/masks/<key>.png")
def foreground_mask(key):
    if len(key) != 64 or any(c not in "0123456789abcdef" for c in key):
        abort(404)
    return send_file(
        CACHE / (key + "-mask.png"), mimetype="image/png", max_age=31536000
    )


@bp.get("/api/backgrounds/<key>.png")
def original_background(key):
    if len(key) != 64 or any(c not in "0123456789abcdef" for c in key):
        abort(404)
    return send_file(
        CACHE / (key + "-original.png"), mimetype="image/png", max_age=31536000
    )


@bp.get("/api/target/image")
def target_image():
    with db() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key='target'").fetchone()
    if not row:
        abort(404)
    if request.args.get("foreground") == "1":
        image, _ = foreground_portrait(row[0])
    else:
        image = open_photo({"path": row[0], "rotation": 0}, False)
    image.thumbnail((2000, 2000))
    output = io.BytesIO()
    image.save(output, "PNG")
    output.seek(0)
    response = send_file(output, mimetype="image/png")
    response.headers["Cache-Control"] = "no-store"
    return response
