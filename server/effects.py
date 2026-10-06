"""Local piece treatments build overlay alpha maps or photo arrangement targets.

New presets register a validator, builder, and optional arrangement strategy.
Reach is a fraction of the portrait's shorter side, independent of tile resolution.
"""

import math
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
from arrangements import balanced_gradient


def validate_soft_halo(effect):
    if set(effect) - {"preset", "sourceId", "reach", "strength", "reverse", "shape"}:
        raise ValueError("Unknown halo setting.")
    if not isinstance(effect.get("sourceId"), str):
        raise ValueError("Choose a source piece for the halo.")
    for field, low, high in (("reach", 0.02, 1), ("strength", 0, 0.85)):
        value = effect.get(field)
        if (
            type(value) not in (int, float)
            or not math.isfinite(value)
            or not low <= value <= high
        ):
            raise ValueError(f"Invalid halo {field}.")
    if type(effect.get("reverse")) is not bool or effect.get("shape") not in (
        "silhouette",
        "ellipse",
    ):
        raise ValueError("Invalid halo direction or shape.")


def halo_progress(effect, source):
    inside = np.asarray(source) >= 128
    if not inside.any():
        raise ValueError(
            "The halo source piece has an empty selection. Paint or select its subject first."
        )
    height, width = inside.shape
    reach = effect["reach"] * min(width, height)
    if effect["shape"] == "silhouette":
        distance = distance_transform_edt(~inside)
    else:
        ys, xs = np.nonzero(inside)
        cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
        rx, ry = (
            max(1, (xs.max() - xs.min() + 1) / 2),
            max(1, (ys.max() - ys.min() + 1) / 2),
        )
        y, x = np.ogrid[:height, :width]
        radius = np.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2)
        distance = np.maximum(0, radius - 1) * min(rx, ry)
    progress = np.clip(distance / reach, 0, 1)
    smooth = progress * progress * (3 - 2 * progress)
    return 1 - smooth if effect["reverse"] else smooth


def soft_halo(effect, source):
    weight = 1 - halo_progress(effect, source)
    return Image.fromarray(
        np.round(weight * effect["strength"] * 255).astype(np.uint8), "L"
    )


PALETTES = {
    "brightness": ("Brightness only", "#ffffff", "#000000"),
    "cream-charcoal": ("Cream to charcoal", "#fff2d3", "#242b35"),
    "gold-navy": ("Pale gold to navy", "#ffe6a3", "#142745"),
    "rose-plum": ("Rose to plum", "#f8dce2", "#392540"),
}


def validate_gradient_halo(effect):
    if set(effect) - {
        "preset",
        "sourceId",
        "reach",
        "strength",
        "reverse",
        "shape",
        "innerBrightness",
        "outerBrightness",
        "palette",
        "innerColor",
        "outerColor",
    }:
        raise ValueError("Unknown gradient halo setting.")
    shared = {k: effect.get(k) for k in ("sourceId", "reach", "reverse", "shape")}
    validate_soft_halo({**shared, "preset": "soft-halo", "strength": 0})
    for field in ("strength", "innerBrightness", "outerBrightness"):
        value = effect.get(field)
        if (
            type(value) not in (int, float)
            or not math.isfinite(value)
            or not 0 <= value <= 1
        ):
            raise ValueError(f"Invalid gradient {field}.")
    if effect.get("palette") not in {*PALETTES, "custom"}:
        raise ValueError("Choose a gradient palette.")
    import re

    for field in ("innerColor", "outerColor"):
        if not isinstance(effect.get(field), str) or not re.fullmatch(
            r"#[0-9a-fA-F]{6}", effect[field]
        ):
            raise ValueError("Choose valid gradient colors.")


def gradient_halo(effect, source):
    progress = halo_progress(effect, source)
    brightness = (
        effect["innerBrightness"] * (1 - progress)
        + effect["outerBrightness"] * progress
    )
    palette = PALETTES.get(effect["palette"])
    inner, outer = (
        (palette[1], palette[2])
        if palette
        else (effect["innerColor"], effect["outerColor"])
    )

    def rgb(color):
        return (
            np.array([int(color[i : i + 2], 16) for i in (1, 3, 5)], dtype=float) / 255
        )

    hue = rgb(inner) * (1 - progress[..., None]) + rgb(outer) * progress[..., None]
    # Separate brightness from hue, keeping the brightness sliders meaningful.
    chroma = hue - (hue @ np.array([0.2126, 0.7152, 0.0722]))[..., None]
    target = np.clip(brightness[..., None] + chroma, 0, 1)
    return Image.fromarray(np.round(target * 255).astype(np.uint8), "RGB")


# A preset produces either an overlay alpha channel or matching targets.
PRESETS = {
    "soft-halo": dict(validate=validate_soft_halo, build=soft_halo, channel="alpha"),
    "balanced-gradient-halo": dict(
        validate=validate_gradient_halo,
        build=gradient_halo,
        channel="targets",
        arrange=balanced_gradient,
    ),
}


def validate(effect, source_ids):
    if effect is None:
        return
    if not isinstance(effect, dict) or effect.get("preset") not in PRESETS:
        raise ValueError("Unknown piece treatment.")
    PRESETS[effect["preset"]]["validate"](effect)
    if effect["sourceId"] not in source_ids:
        raise ValueError("The halo source must be a piece in this portrait.")


def build(effect, source):
    return PRESETS[effect["preset"]]["build"](effect, source)


def is_arrangement(effect):
    return effect is not None and PRESETS[effect["preset"]]["channel"] == "targets"


def arrange(effect, target, colors, seed):
    return PRESETS[effect["preset"]]["arrange"](
        target, colors, effect["strength"], seed, effect["palette"] == "brightness"
    )
