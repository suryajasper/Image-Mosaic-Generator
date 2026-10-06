"""Read, crop, rotate, and cache local photo variants."""

from pathlib import Path
import hashlib
from flask import abort
from PIL import Image, ImageOps, UnidentifiedImageError
from storage import CACHE, HEIC, db, lock
from file_identity import signature
from conversions import converted_path


def photo(photo_id):
    with db() as conn:
        row = conn.execute("SELECT * FROM photos WHERE id=?", (photo_id,)).fetchone()
    if not row:
        abort(404)
    return dict(row)


def open_photo(row, crop=True):
    try:
        path = Path(row["path"])
        readable = converted_path(path) if path.suffix.lower() in HEIC else path
        if not readable.exists():
            abort(404)
        with Image.open(readable) as source:
            image = ImageOps.exif_transpose(source).convert("RGB")
    except (OSError, UnidentifiedImageError):
        abort(404)
    image = image.rotate(-row["rotation"], expand=True)
    if crop:
        w, h = image.size
        side = min(w, h) * row["size"]
        left, top = (w - side) * row["x"], (h - side) * row["y"]
        image = image.crop(
            (round(left), round(top), round(left + side), round(top + side))
        )
    return image


def update_active(conn):
    conn.execute(
        "UPDATE photos SET active=EXISTS(SELECT 1 FROM group_photos gp JOIN groups g ON gp.group_id=g.id WHERE gp.photo_id=photos.id AND gp.present=1 AND g.enabled=1 AND g.status='available')"
    )


def thumbnail(row, size=256):
    key = hashlib.sha256(
        (
            row["path"]
            + signature(Path(row["path"]))
            + str((row["rotation"], row["x"], row["y"], row["size"]))
        ).encode()
    ).hexdigest()
    destination = CACHE / (key + ("-tile.jpg" if size == 256 else f"-tile-{size}.jpg"))
    with lock:
        if not destination.exists():
            image = open_photo(row)
            image.thumbnail((size, size))
            image.save(destination, "JPEG", quality=92)
    return destination
