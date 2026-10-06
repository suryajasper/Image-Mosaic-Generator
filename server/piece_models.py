"""Persistent portrait masks and per-piece photo-group matching."""

import hashlib
import json
import math
import threading
from PIL import Image, ImageChops

piece_lock = threading.RLock()


def project_id(path):
    return hashlib.sha256(str(path).encode()).hexdigest()[:32]


def mask_path(directory, piece):
    return directory / "pieces" / f"{piece['id']}-{piece['mask_revision']}.png"


def public_piece(row):
    piece = dict(row)
    piece["groups"] = json.loads(piece["groups"])
    piece["prompts"] = json.loads(piece["prompts"])
    piece["effect"] = json.loads(piece["effect"]) if piece.get("effect") else None
    piece["maskUrl"] = f"/api/piece-masks/{piece['id']}-{piece['mask_revision']}.png"
    return piece


def validate_prompts(points, box, require_prompt=False):
    if (
        not isinstance(points, list)
        or len(points) > 100
        or (require_prompt and not points and box is None)
    ):
        raise ValueError("Add selection points or a box first (at most 100 points).")
    for point in points:
        if (
            not isinstance(point, dict)
            or point.get("include") not in (0, 1)
            or any(
                not isinstance(point.get(k), (int, float)) or not 0 <= point[k] <= 1
                for k in ("x", "y")
            )
        ):
            raise ValueError("Invalid selection point.")
    if box is not None and (
        not isinstance(box, list)
        or len(box) != 4
        or any(not isinstance(v, (int, float)) or not 0 <= v <= 1 for v in box)
        or box[0] >= box[2]
        or box[1] >= box[3]
    ):
        raise ValueError("Draw a box with a nonzero width and height.")


def validate_settings(data):
    for key, low, high in (("columns", 12, 160), ("variety", 0, 1), ("blend", 0, 0.65)):
        if key not in data or data[key] is None:
            continue
        value = data[key]
        if (
            type(value) not in (int, float)
            or not math.isfinite(value)
            or not low <= value <= high
            or (key == "columns" and value != int(value))
        ):
            raise ValueError(f"Invalid {key} setting.")


def effective_masks(items, size, directory):
    # Topmost piece owns overlapping pixels, even when it keeps original pixels.
    remaining = Image.new("L", size, 255)
    result = []
    for item in items:
        with Image.open(mask_path(directory, item)) as source:
            mask = source.convert("L").resize(size, Image.Resampling.BILINEAR)
        effective = ImageChops.multiply(mask, remaining)
        remaining = ImageChops.multiply(remaining, ImageChops.invert(mask))
        result.append(effective)
    return result, remaining
