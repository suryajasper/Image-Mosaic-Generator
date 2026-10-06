from piece_repository import PieceRepository

"""Persistent portrait masks and per-piece photo-group matching."""

import base64
import io
import json
import re
import uuid
from PIL import Image
from flask import jsonify, request, abort, send_from_directory
import segmentation
import effects

from piece_models import (
    piece_lock as _lock,
    mask_path,
    public_piece,
    validate_prompts,
    validate_settings,
)


def register(app, db, directory, open_photo, signature, foreground_portrait):
    repository = PieceRepository(db, directory, open_photo, signature)
    storage = repository.storage
    get_project = repository.get_project
    group_ids = repository.group_ids

    def checked_project():
        return repository.checked_project(request.json)

    @app.get("/api/project")
    def portrait_project():
        project, stamp = get_project()
        with db() as conn:
            items = [
                public_piece(r)
                for r in conn.execute(
                    "SELECT * FROM pieces WHERE project_id=? ORDER BY position,id",
                    (project["id"],),
                )
            ]
        project["remainder_groups"] = json.loads(project["remainder_groups"])
        project["remainder_effect"] = (
            json.loads(project["remainder_effect"])
            if project["remainder_effect"]
            else None
        )
        project.update(
            pieces=items,
            stale=project["signature"] != stamp,
            imageUrl="/api/project/image?project=" + project["id"] + "&v=" + stamp,
            selectionReady=segmentation.ready(directory / "models"),
            selectionAvailable=segmentation.available(),
        )
        return jsonify(project)

    @app.get("/api/project/image")
    def project_image():
        project, _ = get_project()
        if request.args.get("project") != project["id"]:
            abort(404)
        image = open_photo({"path": project["path"], "rotation": 0}, False)
        image.thumbnail((1024, 1024))
        output = io.BytesIO()
        image.save(output, "PNG")
        from flask import send_file

        output.seek(0)
        return send_file(output, mimetype="image/png")

    @app.get("/api/piece-masks/<name>")
    def piece_mask(name):
        if not re.fullmatch(r"[a-f0-9]{32}-[a-z0-9]+\.png", name):
            abort(404)
        return send_from_directory(storage, name, max_age=31536000)

    @app.post("/api/project/options")
    def project_options():
        project = checked_project()
        data = request.json
        validate_settings(data)
        updates = {}
        if "mode" in data:
            if data["mode"] not in ("original", "mosaic"):
                raise ValueError("Choose Mosaic or Keep original.")
            updates["remainder_mode"] = data["mode"]
        if "groups" in data:
            updates["remainder_groups"] = group_ids(data["groups"])
        if "effect" in data:
            with db() as conn:
                source_ids = {
                    r[0]
                    for r in conn.execute(
                        "SELECT id FROM pieces WHERE project_id=?", (project["id"],)
                    )
                }
            effects.validate(data["effect"], source_ids)
            updates["remainder_effect"] = (
                json.dumps(data["effect"]) if data["effect"] else None
            )
        for field in ("columns", "variety", "blend"):
            if field in data:
                updates["remainder_" + field] = data[field]
        assignments = ",".join(field + "=?" for field in updates)
        with _lock, db() as conn:
            conn.execute(
                "UPDATE projects SET enabled=1"
                + ("," + assignments if assignments else "")
                + " WHERE id=?",
                (*updates.values(), project["id"]),
            )
        return jsonify(ok=True)

    @app.post("/api/project/reset")
    def reset_project():
        project, stamp = get_project()
        if request.json.get("projectId") != project["id"]:
            raise ValueError("The active portrait changed.")
        image = open_photo({"path": project["path"], "rotation": 0}, False)
        image.thumbnail((1024, 1024))
        with _lock, db() as conn:
            if request.json.get("reuse"):
                for row in conn.execute(
                    "SELECT * FROM pieces WHERE project_id=?", (project["id"],)
                ).fetchall():
                    updated = dict(row)
                    updated["mask_revision"] += 1
                    with Image.open(mask_path(directory, row)) as mask:
                        mask.resize(image.size, Image.Resampling.BILINEAR).save(
                            mask_path(directory, updated)
                        )
                    conn.execute(
                        "UPDATE pieces SET mask_revision=? WHERE id=?",
                        (updated["mask_revision"], row["id"]),
                    )
            else:
                conn.execute("DELETE FROM pieces WHERE project_id=?", (project["id"],))
                conn.execute(
                    "UPDATE projects SET enabled=0,remainder_mode='original',remainder_groups='[]',remainder_columns=NULL,remainder_variety=NULL,remainder_blend=NULL,remainder_effect=NULL WHERE id=?",
                    (project["id"],),
                )
            conn.execute(
                "UPDATE projects SET signature=?,width=?,height=? WHERE id=?",
                (stamp, image.width, image.height, project["id"]),
            )
        return jsonify(ok=True)

    @app.post("/api/pieces")
    def create_piece():
        project = checked_project()
        name = str(request.json.get("name", "New piece")).strip()[:100] or "New piece"
        with _lock, db() as conn:
            position = conn.execute(
                "SELECT COALESCE(MAX(position),-1)+1 FROM pieces WHERE project_id=?",
                (project["id"],),
            ).fetchone()[0]
            if position >= 32:
                raise ValueError("Use at most 32 portrait pieces.")
            groups = [
                r[0] for r in conn.execute("SELECT id FROM groups WHERE enabled=1")
            ]
            piece = dict(id=uuid.uuid4().hex, mask_revision=0)
            Image.new("L", (project["width"], project["height"]), 0).save(
                mask_path(directory, piece)
            )
            conn.execute(
                "INSERT INTO pieces(id,project_id,name,position,groups) VALUES (?,?,?,?,?)",
                (piece["id"], project["id"], name, position, json.dumps(groups)),
            )
            conn.execute("UPDATE projects SET enabled=1 WHERE id=?", (project["id"],))
        return jsonify(id=piece["id"])

    @app.patch("/api/pieces/<piece_id>")
    def edit_piece(piece_id):
        project = checked_project()
        data = request.json
        with _lock, db() as conn:
            row = conn.execute(
                "SELECT * FROM pieces WHERE id=? AND project_id=?",
                (piece_id, project["id"]),
            ).fetchone()
            if not row:
                abort(404)
            row = dict(row)
            validate_settings(data)
            if "effect" in data:
                source_ids = {
                    r[0]
                    for r in conn.execute(
                        "SELECT id FROM pieces WHERE project_id=?", (project["id"],)
                    )
                }
                effects.validate(data["effect"], source_ids)
                row["effect"] = json.dumps(data["effect"]) if data["effect"] else None
            for field in ("columns", "variety", "blend"):
                if field in data:
                    row[field] = data[field]
            if "name" in data:
                name = str(data["name"]).strip()
                if not name or len(name) > 100:
                    raise ValueError(
                        "Give the piece a name between 1 and 100 characters."
                    )
                row["name"] = name
            if "mode" in data:
                if data["mode"] not in ("mosaic", "original"):
                    raise ValueError("Choose Mosaic or Keep original.")
                row["mode"] = data["mode"]
            if "groups" in data:
                row["groups"] = group_ids(data["groups"])
            if "prompts" in data:
                prompts = data["prompts"]
                if not isinstance(prompts, dict):
                    raise ValueError("Invalid selection prompts.")
                validate_prompts(prompts.get("points", []), prompts.get("box"))
                row["prompts"] = json.dumps(prompts)
            if "mask" in data:
                if data.get("revision") != row["mask_revision"]:
                    raise ValueError(
                        "This piece was edited elsewhere. Reopen it before saving."
                    )
                try:
                    payload = base64.b64decode(
                        data["mask"].split(",", 1)[1], validate=True
                    )
                    with Image.open(io.BytesIO(payload)) as source:
                        if source.format != "PNG" or source.size != (
                            project["width"],
                            project["height"],
                        ):
                            raise ValueError(
                                "Mask dimensions must match the portrait editor."
                            )
                        mask = source.convert("L")
                    row["mask_revision"] += 1
                    mask.save(mask_path(directory, row))
                except (IndexError, TypeError, OSError) as error:
                    raise ValueError("Invalid PNG selection mask.") from error
            conn.execute(
                "UPDATE pieces SET name=?,mode=?,groups=?,mask_revision=?,prompts=?,columns=?,variety=?,blend=?,effect=? WHERE id=?",
                (
                    row["name"],
                    row["mode"],
                    row["groups"],
                    row["mask_revision"],
                    row["prompts"],
                    row["columns"],
                    row["variety"],
                    row["blend"],
                    row["effect"],
                    piece_id,
                ),
            )
        return jsonify(ok=True)

    @app.delete("/api/pieces/<piece_id>")
    def delete_piece(piece_id):
        project = checked_project()
        with _lock, db() as conn:
            conn.execute(
                "DELETE FROM pieces WHERE id=? AND project_id=?",
                (piece_id, project["id"]),
            )
            for row in conn.execute(
                "SELECT id,effect FROM pieces WHERE project_id=?", (project["id"],)
            ).fetchall():
                if (
                    row["effect"]
                    and json.loads(row["effect"]).get("sourceId") == piece_id
                ):
                    conn.execute(
                        "UPDATE pieces SET effect=NULL WHERE id=?", (row["id"],)
                    )
            if (
                project["remainder_effect"]
                and json.loads(project["remainder_effect"]).get("sourceId") == piece_id
            ):
                conn.execute(
                    "UPDATE projects SET remainder_effect=NULL WHERE id=?",
                    (project["id"],),
                )
        return jsonify(ok=True)

    @app.post("/api/project/order")
    def reorder():
        project = checked_project()
        ids = request.json.get("ids")
        with _lock, db() as conn:
            known = {
                r[0]
                for r in conn.execute(
                    "SELECT id FROM pieces WHERE project_id=?", (project["id"],)
                )
            }
            if not isinstance(ids, list) or len(ids) != len(known) or set(ids) != known:
                raise ValueError("Include every piece exactly once.")
            conn.executemany(
                "UPDATE pieces SET position=? WHERE id=?",
                [(i, key) for i, key in enumerate(ids)],
            )
        return jsonify(ok=True)

    @app.post("/api/project/person")
    def seed_person():
        project = checked_project()
        with _lock, db() as conn:
            if conn.execute(
                "SELECT 1 FROM pieces WHERE project_id=?", (project["id"],)
            ).fetchone():
                raise ValueError("Start from Person only when the piece list is empty.")
            cutout, _ = foreground_portrait(project["path"])
            piece = dict(id=uuid.uuid4().hex, mask_revision=0)
            cutout.getchannel("A").resize((project["width"], project["height"])).save(
                mask_path(directory, piece)
            )
            groups = [
                r[0] for r in conn.execute("SELECT id FROM groups WHERE enabled=1")
            ]
            conn.execute(
                "INSERT INTO pieces(id,project_id,name,position,groups) VALUES (?,?,?,0,?)",
                (piece["id"], project["id"], "Person", json.dumps(groups)),
            )
            conn.execute("UPDATE projects SET enabled=1 WHERE id=?", (project["id"],))
        return jsonify(ok=True)

    @app.post("/api/selection/setup")
    def setup_selection():
        segmentation.prepare(directory / "models")
        return jsonify(ok=True)

    @app.post("/api/project/select")
    def smart_select():
        project = checked_project()
        points, box = request.json.get("points", []), request.json.get("box")
        validate_prompts(points, box, require_prompt=True)
        image = open_photo({"path": project["path"], "rotation": 0}, False)
        image.thumbnail((1024, 1024))
        masks, timings = segmentation.predict(
            image,
            project["id"] + project["signature"],
            points,
            box,
            directory / "models",
        )
        urls = []
        for mask in masks:
            name = uuid.uuid4().hex + "-draft.png"
            mask.save(storage / name)
            urls.append("/api/piece-masks/" + name)
        return jsonify(masks=urls, timings=timings)
