"""Content-addressed HEIC conversion cache; originals are preserved."""

from pathlib import Path
from contextlib import nullcontext
import hashlib
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener
from storage import CACHE, HEIC, db, lock
from file_identity import signature, identity, file_digest

register_heif_opener()


def converted_path(path, connection=None):
    """Resolve by content, recovering old inode-based JPEGs without decoding HEIC."""
    path = Path(path).resolve()
    file_id, stamp = identity(path), signature(path)
    with lock, db() if connection is None else nullcontext(connection) as conn:
        source = conn.execute(
            "SELECT * FROM heic_sources WHERE path=?", (str(path),)
        ).fetchone()
        unchanged = (
            source and source["identity"] == file_id and source["signature"] == stamp
        )
        digest = source["digest"] if unchanged else file_digest(path)
        if not unchanged and (identity(path) != file_id or signature(path) != stamp):
            raise ValueError(
                "A HEIC image changed while reading it. Scan the folder again."
            )
        cached = conn.execute(
            "SELECT filename FROM heic_conversions WHERE digest=?", (digest,)
        ).fetchone()
        destination = CACHE / ("heic-" + digest + ".jpg")
        if (
            cached
            and Path(cached[0]).name == cached[0]
            and (CACHE / cached[0]).is_file()
        ):
            destination = CACHE / cached[0]
        elif not source:
            # Older versions recorded the original file identity in photos, but
            # looked up conversions with a newly computed identity after restart.
            # Trust the legacy JPEG only on this first migration, with matching
            # recorded size/mtime. Subsequent invalidation compares content hashes.
            saved = conn.execute(
                "SELECT id FROM photos WHERE path=? AND signature=?", (str(path), stamp)
            ).fetchone()
            candidates = [saved[0]] if saved else []
            candidates.append(file_id)
            for candidate in candidates:
                legacy = CACHE / (
                    hashlib.sha256((candidate + stamp).encode()).hexdigest() + ".jpg"
                )
                if legacy.is_file():
                    destination = legacy
                    conn.execute(
                        "INSERT OR REPLACE INTO heic_conversions VALUES (?,?)",
                        (digest, legacy.name),
                    )
                    break
        if not unchanged:
            conn.execute(
                "INSERT OR REPLACE INTO heic_sources VALUES (?,?,?,?)",
                (str(path), file_id, stamp, digest),
            )
        return destination


def conversion_pending(paths):
    with lock, db() as conn:
        return [
            str(p)
            for p in paths
            if p.suffix.lower() in HEIC and not converted_path(p, conn).is_file()
        ]


def convert(path, connection=None):
    with lock, db() if connection is None else nullcontext(connection) as conn:
        destination = converted_path(path, conn)
        if not destination.is_file():
            source_record = conn.execute(
                "SELECT identity,signature,digest FROM heic_sources WHERE path=?",
                (str(Path(path).resolve()),),
            ).fetchone()
            with Image.open(path) as source:
                image = ImageOps.exif_transpose(source).convert("RGB")
                temporary = destination.with_suffix(".tmp")
                try:
                    image.save(temporary, "JPEG", quality=95)
                    if (
                        identity(path) != source_record["identity"]
                        or signature(path) != source_record["signature"]
                    ):
                        raise ValueError(
                            "A HEIC image changed during conversion. Try scanning again."
                        )
                    temporary.replace(destination)
                finally:
                    temporary.unlink(missing_ok=True)
            conn.execute(
                "INSERT OR REPLACE INTO heic_conversions VALUES (?,?)",
                (source_record["digest"], destination.name),
            )
        return destination
