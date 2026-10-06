"""Persistent portrait masks and per-piece photo-group matching."""

import hashlib
import json
import math
from pathlib import Path
import numpy as np
from PIL import Image
import effects

from piece_models import piece_lock as _lock, project_id, mask_path, effective_masks


def render_project(
    path,
    photos,
    columns,
    variety,
    seed,
    db,
    open_photo,
    thumbnail,
    match_tiles,
    directory,
    blend=0.2,
):
    with _lock, db() as conn:
        project = conn.execute(
            "SELECT * FROM projects WHERE id=? AND enabled=1", (project_id(path),)
        ).fetchone()
        if not project:
            return None
        items = [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM pieces WHERE project_id=? ORDER BY position,id",
                (project["id"],),
            )
        ]
        memberships = list(
            conn.execute(
                "SELECT gp.photo_id,gp.group_id FROM group_photos gp JOIN groups g ON g.id=gp.group_id WHERE gp.present=1 AND g.enabled=1 AND g.status='available'"
            )
        )
    stamp = f"{Path(path).stat().st_mtime_ns}:{Path(path).stat().st_size}"
    if stamp != project["signature"]:
        raise ValueError(
            "The portrait changed. Review its saved pieces before generating."
        )
    portrait = open_photo({"path": path, "rotation": 0}, False)
    height = max(1, round(columns * portrait.height / portrait.width))
    size = (project["width"], project["height"])
    with _lock:
        masks, remainder = effective_masks(items, size, directory)
    items.append(
        dict(
            id="remainder",
            name="Everything else",
            mode=project["remainder_mode"],
            groups=project["remainder_groups"],
            columns=project["remainder_columns"],
            variety=project["remainder_variety"],
            blend=project["remainder_blend"],
            effect=project["remainder_effect"],
        )
    )
    masks.append(remainder)
    # Full-resolution original snapshot avoids applying an old mask to a changed source.
    original_key = (
        hashlib.sha256((path + stamp).encode()).hexdigest()[:32] + "-original.png"
    )
    destination = directory / "pieces" / original_key
    if not destination.exists():
        portrait.save(destination)
    colors, total_counts, layers, usage = (
        {},
        np.zeros(len(photos), dtype=np.int64),
        [],
        [],
    )
    memberships_by_photo = {}
    for photo_id, group_id in memberships:
        memberships_by_photo.setdefault(photo_id, set()).add(group_id)
    rgb = portrait.resize(size, Image.Resampling.LANCZOS).convert("RGB")
    source_masks = {
        item["id"]: mask_path(directory, item)
        for item in items
        if item["id"] != "remainder"
    }
    for item, mask in zip(items, masks):
        if item["mode"] != "mosaic":
            continue
        piece_columns = item["columns"] if item["columns"] is not None else columns
        piece_variety = item["variety"] if item["variety"] is not None else variety
        piece_blend = item["blend"] if item["blend"] is not None else blend
        piece_rows = max(1, math.ceil(piece_columns * portrait.height / portrait.width))
        if piece_columns * piece_rows > 40000:
            raise ValueError(
                f"{item['name']}: reduce tile resolution for this tall portrait."
            )
        grid = (piece_columns, piece_rows)
        cell_pixels = max(8, math.ceil(rgb.width / piece_columns))
        working_size = (
            piece_columns * cell_pixels,
            max(
                1, round(piece_columns * cell_pixels * portrait.height / portrait.width)
            ),
        )
        padded_size = (working_size[0], piece_rows * cell_pixels)
        padded_mask = Image.new("L", padded_size, 0)
        padded_mask.paste(mask.resize(working_size, Image.Resampling.NEAREST), (0, 0))
        sampled_alpha = np.asarray(
            padded_mask.resize(grid, Image.Resampling.BOX)
        ).reshape(-1)
        active = sampled_alpha > 0
        if not np.any(active):
            usage.append(
                dict(
                    id=item["id"], name=item["name"], activeTiles=0, used=0, eligible=0
                )
            )
            continue
        group_set = set(json.loads(item["groups"]))
        eligible = [
            i
            for i, p in enumerate(photos)
            if memberships_by_photo.get(p["id"], set()) & group_set
        ]
        if not eligible:
            raise ValueError(
                f"{item['name']}: no selected photos are available in its assigned groups."
            )
        for i in eligible:
            if i not in colors:
                if not Path(photos[i]["path"]).is_file():
                    raise ValueError(
                        "A memory photo was removed. Scan its group again."
                    )
                with Image.open(thumbnail(photos[i])) as tile:
                    colors[i] = np.asarray(tile.resize((1, 1), Image.Resampling.BOX))[
                        0, 0
                    ].astype(float)
        effect = json.loads(item["effect"]) if item.get("effect") else None
        effect_image = None
        if effect:
            effects.validate(effect, source_masks.keys())
            with Image.open(source_masks[effect["sourceId"]]) as source:
                source = source.convert("L").resize(size, Image.Resampling.BILINEAR)
                effect_image = effects.build(effect, source)
        arrangement = effects.is_arrangement(effect)
        # Arrangement presets use generated targets, ignoring the portrait's background.
        matching_rgb = effect_image if arrangement else rgb
        # Pillow's premultiplied-alpha resize gives edge colors without adjacent-region contamination.
        rgba = matching_rgb.convert("RGBA")
        rgba.putalpha(mask)
        padded_rgba = Image.new("RGBA", padded_size, (0, 0, 0, 0))
        padded_rgba.paste(rgba.resize(working_size, Image.Resampling.BOX), (0, 0))
        pixels = (
            np.asarray(padded_rgba.resize(grid, Image.Resampling.BOX))
            .reshape(-1, 4)[:, :3]
            .astype(float)
        )
        piece_seed = seed + int(hashlib.sha256(item["id"].encode()).hexdigest()[:8], 16)
        photo_colors = np.array([colors[i] for i in eligible])
        if arrangement:
            local_choices, counts = effects.arrange(
                effect, pixels[active], photo_colors, piece_seed
            )
            piece_variety, piece_blend = 1, 0
        else:
            local_choices, counts = match_tiles(
                pixels[active], photo_colors, piece_variety, piece_seed
            )
        choices = np.full(piece_columns * piece_rows, -1, dtype=np.int32)
        choices[active] = np.asarray(eligible)[local_choices]
        mapped_counts = np.zeros(len(photos), dtype=np.int64)
        mapped_counts[eligible] = counts
        total_counts += mapped_counts
        mask_key = (
            hashlib.sha256(mask.tobytes() + str(size).encode()).hexdigest()[:32]
            + "-effective.png"
        )
        effective_path = directory / "pieces" / mask_key
        if not effective_path.exists():
            # Canvas destination-in uses alpha; store white RGB with mask alpha.
            alpha = Image.new("RGBA", size, (255, 255, 255, 255))
            alpha.putalpha(mask)
            alpha.save(effective_path)
        treatment = None
        if effect and not arrangement:
            alpha = effect_image
            key = (
                hashlib.sha256(alpha.tobytes() + str(size).encode()).hexdigest()[:32]
                + "-effect.png"
            )
            effect_path = directory / "pieces" / key
            if not effect_path.exists():
                overlay = Image.new("RGBA", size, (255, 255, 255, 255))
                overlay.putalpha(alpha)
                overlay.save(effect_path)
            treatment = dict(
                preset=effect["preset"], alphaUrl="/api/piece-masks/" + key
            )
        layers.append(
            dict(
                arrangement=effect["preset"] if arrangement else None,
                treatment=treatment,
                id=item["id"],
                name=item["name"],
                columns=piece_columns,
                rows=piece_rows,
                variety=piece_variety,
                blend=piece_blend,
                maskUrl="/api/piece-masks/" + mask_key,
                tiles=choices.tolist(),
                colors=pixels.astype(int).tolist(),
                counts=mapped_counts.tolist(),
                activeTiles=int(active.sum()),
            )
        )
        usage.append(
            dict(
                id=item["id"],
                name=item["name"],
                activeTiles=int(active.sum()),
                used=int(np.count_nonzero(counts)),
                eligible=len(eligible),
            )
        )
    group_usage = []
    with db() as conn:
        groups = list(
            conn.execute("SELECT id,name FROM groups WHERE enabled=1 ORDER BY name")
        )
    for group in groups:
        indices = [
            i
            for i, p in enumerate(photos)
            if group[0] in memberships_by_photo.get(p["id"], set())
        ]
        group_usage.append(
            dict(
                id=group[0],
                name=group[1],
                used=int(sum(total_counts[i] > 0 for i in indices)),
                eligible=len(indices),
                placements=int(sum(total_counts[i] for i in indices)),
            )
        )
    return dict(
        columns=columns,
        rows=height,
        ids=[p["id"] for p in photos],
        revisions=[p["revision"] for p in photos],
        tiles=[],
        colors=[],
        counts=total_counts.tolist(),
        maskUrl=None,
        backgroundUrl="/api/piece-masks/" + original_key,
        aspectRatio=portrait.height / portrait.width,
        activeTiles=int(total_counts.sum()),
        mosaicRegion="pieces",
        layers=layers,
        pieceUsage=usage,
        groupUsage=group_usage,
    )
