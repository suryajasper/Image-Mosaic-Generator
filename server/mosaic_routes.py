from pathlib import Path
import io
import uuid
import numpy as np
from flask import Blueprint, jsonify, request, send_from_directory
from PIL import Image, UnidentifiedImageError
import pieces
from storage import DATA, db
from photo_service import open_photo, thumbnail
from portrait_service import foreground_portrait
from matching import match_tiles

bp = Blueprint("mosaic", __name__)


@bp.post("/api/mosaic")
def mosaic():
    data = request.json
    columns, variety = int(data.get("columns", 60)), float(data.get("variety", 0.35))
    if not 12 <= columns <= 160 or not 0 <= variety <= 1:
        raise ValueError("Invalid mosaic configuration.")
    with db() as conn:
        rows = [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM photos WHERE selected=1 AND active=1 ORDER BY path"
            )
        ]
        target = conn.execute(
            "SELECT value FROM settings WHERE key='target'"
        ).fetchone()
        settings = dict(conn.execute("SELECT key,value FROM settings").fetchall())
        region = settings.get(
            "mosaicRegion", "foreground" if settings.get("foreground") == "1" else "all"
        )
    blend = data.get("blend", 0.2)
    pieces.validate_settings({"blend": blend})
    if blend is None:
        raise ValueError("A default portrait color blend is required.")
    if target:
        result = pieces.render_project(
            target[0],
            rows,
            columns,
            variety,
            int(data.get("seed", 42)),
            db,
            open_photo,
            thumbnail,
            match_tiles,
            DATA,
            blend,
        )
        if result is not None:
            return jsonify(result)
    if not rows or not target:
        raise ValueError("Add a portrait and select at least one memory photo first.")
    colors = []
    for row in rows:
        if not Path(row["path"]).is_file():
            raise ValueError(
                "A photo was removed. Scan the folder again to update the library."
            )
        with Image.open(thumbnail(row)) as tile:
            colors.append(np.asarray(tile.resize((1, 1), Image.Resampling.BOX))[0, 0])
    mask_url = None
    if region != "all":
        portrait, mask_url = foreground_portrait(target[0])
        if region == "background":
            alpha = portrait.getchannel("A").point(lambda value: 255 - value)
            portrait = (
                open_photo({"path": target[0], "rotation": 0}, False)
                .convert("RGBA")
                .resize(portrait.size)
            )
            portrait.putalpha(alpha)
    else:
        portrait = open_photo({"path": target[0], "rotation": 0}, False)
    height = max(1, round(columns * portrait.height / portrait.width))
    if columns * height > 40000:
        raise ValueError(
            "This portrait is too tall. Please use a less narrow portrait or reduce resolution."
        )
    sampled = np.asarray(
        portrait.resize((columns, height), Image.Resampling.BOX)
    ).reshape(-1, len(portrait.getbands()))
    pixels = sampled[:, :3].astype(float)
    active = sampled[:, 3] > 0 if mask_url else np.ones(len(pixels), dtype=bool)
    if not np.any(active):
        raise ValueError(
            "No tiles were found in the selected region. Choose another region or portrait."
        )
    active_choices, counts = match_tiles(
        pixels[active],
        np.asarray(colors, dtype=float),
        variety,
        int(data.get("seed", 42)),
    )
    choices = np.full(len(pixels), -1, dtype=np.int32)
    choices[active] = active_choices
    return jsonify(
        mosaicRegion=region,
        columns=columns,
        rows=height,
        ids=[r["id"] for r in rows],
        revisions=[r["revision"] for r in rows],
        tiles=choices.tolist(),
        colors=pixels.astype(int).tolist(),
        counts=counts.tolist(),
        maskUrl=mask_url,
        backgroundUrl=mask_url.replace("/api/masks/", "/api/backgrounds/")
        if mask_url
        else None,
        activeTiles=int(active.sum()),
    )


@bp.post("/api/exports")
def save_export():
    payload = request.get_data()
    try:
        with Image.open(io.BytesIO(payload)) as image:
            if image.format != "PNG" or image.width * image.height > 80_000_000:
                raise ValueError("Export must be a PNG under 80 megapixels.")
            image.verify()
    except (OSError, UnidentifiedImageError):
        raise ValueError("Invalid PNG export.")
    folder = DATA / "exports"
    folder.mkdir(exist_ok=True)
    name = "memory-mosaic-" + uuid.uuid4().hex[:12] + ".png"
    destination = folder / name
    destination.write_bytes(payload)
    return jsonify(url="/api/exports/" + name, path=str(destination.resolve()))


@bp.get("/api/exports/<name>")
def download_export(name):
    return send_from_directory(DATA / "exports", name, as_attachment=True)
