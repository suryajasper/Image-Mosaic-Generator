"""Persistent portrait masks and per-piece photo-group matching."""
import base64
import hashlib
import io
import json
import math
import re
import threading
import uuid
from pathlib import Path
import numpy as np
from PIL import Image, ImageChops
from flask import jsonify, request, abort, send_from_directory
import segmentation
import effects

_lock = threading.RLock()


def project_id(path):
    return hashlib.sha256(str(path).encode()).hexdigest()[:32]


def mask_path(directory, piece):
    return directory / 'pieces' / f"{piece['id']}-{piece['mask_revision']}.png"


def public_piece(row):
    piece = dict(row)
    piece['groups'] = json.loads(piece['groups'])
    piece['prompts'] = json.loads(piece['prompts'])
    piece['effect'] = json.loads(piece['effect']) if piece.get('effect') else None
    piece['maskUrl'] = f"/api/piece-masks/{piece['id']}-{piece['mask_revision']}.png"
    return piece


def validate_prompts(points, box, require_prompt=False):
    if not isinstance(points, list) or len(points) > 100 or (require_prompt and not points and box is None):
        raise ValueError('Add selection points or a box first (at most 100 points).')
    for point in points:
        if not isinstance(point, dict) or point.get('include') not in (0, 1) or any(not isinstance(point.get(k), (int, float)) or not 0 <= point[k] <= 1 for k in ('x','y')):
            raise ValueError('Invalid selection point.')
    if box is not None and (not isinstance(box, list) or len(box) != 4 or any(not isinstance(v, (int, float)) or not 0 <= v <= 1 for v in box) or box[0] >= box[2] or box[1] >= box[3]):
        raise ValueError('Draw a box with a nonzero width and height.')


def validate_settings(data):
    for key, low, high in (('columns',12,160),('variety',0,1),('blend',0,.65)):
        if key not in data or data[key] is None:
            continue
        value = data[key]
        if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high or (key == 'columns' and value != int(value)):
            raise ValueError(f'Invalid {key} setting.')


def effective_masks(items, size, directory):
    # Topmost piece owns overlapping pixels, even when it keeps original pixels.
    remaining = Image.new('L', size, 255)
    result = []
    for item in items:
        with Image.open(mask_path(directory, item)) as source:
            mask = source.convert('L').resize(size, Image.Resampling.BILINEAR)
        effective = ImageChops.multiply(mask, remaining)
        remaining = ImageChops.multiply(remaining, ImageChops.invert(mask))
        result.append(effective)
    return result, remaining


def register(app, db, directory, open_photo, signature, foreground_portrait):
    storage = directory / 'pieces'
    storage.mkdir(exist_ok=True)
    with db() as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY,path TEXT NOT NULL,signature TEXT NOT NULL,width INTEGER,height INTEGER,enabled INTEGER DEFAULT 0,remainder_mode TEXT DEFAULT 'original',remainder_groups TEXT DEFAULT '[]')")
        conn.execute("CREATE TABLE IF NOT EXISTS pieces (id TEXT PRIMARY KEY,project_id TEXT NOT NULL,name TEXT NOT NULL,position INTEGER,mode TEXT DEFAULT 'mosaic',groups TEXT DEFAULT '[]',mask_revision INTEGER DEFAULT 0)")
        if 'prompts' not in {r[1] for r in conn.execute('PRAGMA table_info(pieces)')}:
            conn.execute("ALTER TABLE pieces ADD COLUMN prompts TEXT DEFAULT '{\"points\":[],\"box\":null}'")
        for table, prefix in (('pieces',''), ('projects','remainder_')):
            fields = {r[1] for r in conn.execute('PRAGMA table_info(' + table + ')')}
            if prefix + 'effect' not in fields:
                conn.execute(f'ALTER TABLE {table} ADD COLUMN {prefix}effect TEXT')
            for field, kind in (('columns','INTEGER'), ('variety','REAL'), ('blend','REAL')):
                name = prefix + field
                if name not in fields:
                    conn.execute(f'ALTER TABLE {table} ADD COLUMN {name} {kind}')


    def current():
        with db() as conn:
            target = conn.execute("SELECT value FROM settings WHERE key='target'").fetchone()
        if not target:
            raise ValueError('Choose a portrait in Mosaic studio first.')
        path = Path(target[0])
        if not path.is_file():
            raise ValueError('The portrait file is unavailable.')
        return str(path), project_id(path), signature(path)

    def get_project():
        path, key, stamp = current()
        with _lock, db() as conn:
            project = conn.execute('SELECT * FROM projects WHERE id=?', (key,)).fetchone()
            if not project:
                image = open_photo({'path': path, 'rotation': 0}, False)
                image.thumbnail((1024, 1024))
                conn.execute('INSERT INTO projects(id,path,signature,width,height) VALUES (?,?,?,?,?)', (key, path, stamp, image.width, image.height))
                project = conn.execute('SELECT * FROM projects WHERE id=?', (key,)).fetchone()
        return dict(project), stamp

    def checked_project():
        project, stamp = get_project()
        if request.json and request.json.get('projectId') != project['id']:
            raise ValueError('The active portrait changed. Reopen Portrait pieces.')
        if project['signature'] != stamp:
            raise ValueError('The portrait image changed. Reset or reuse its pieces first.')
        return project

    def group_ids(value):
        if not isinstance(value, list) or len(value) > 500 or any(not isinstance(v, str) for v in value):
            raise ValueError('Invalid photo groups.')
        with db() as conn:
            known = {r[0] for r in conn.execute('SELECT id FROM groups WHERE enabled=1')}
        if any(v not in known for v in value):
            raise ValueError('A selected group is no longer registered.')
        return json.dumps(list(dict.fromkeys(value)))

    @app.get('/api/project')
    def portrait_project():
        project, stamp = get_project()
        with db() as conn:
            items = [public_piece(r) for r in conn.execute('SELECT * FROM pieces WHERE project_id=? ORDER BY position,id', (project['id'],))]
        project['remainder_groups'] = json.loads(project['remainder_groups'])
        project['remainder_effect'] = json.loads(project['remainder_effect']) if project['remainder_effect'] else None
        project.update(pieces=items, stale=project['signature'] != stamp,
                       imageUrl='/api/project/image?project=' + project['id'] + '&v=' + stamp,
                       selectionReady=segmentation.ready(directory / 'models'), selectionAvailable=segmentation.available())
        return jsonify(project)

    @app.get('/api/project/image')
    def project_image():
        project, _ = get_project()
        if request.args.get('project') != project['id']:
            abort(404)
        image = open_photo({'path': project['path'], 'rotation': 0}, False)
        image.thumbnail((1024, 1024))
        output = io.BytesIO()
        image.save(output, 'PNG')
        from flask import send_file
        output.seek(0)
        return send_file(output, mimetype='image/png')

    @app.get('/api/piece-masks/<name>')
    def piece_mask(name):
        if not re.fullmatch(r'[a-f0-9]{32}-[a-z0-9]+\.png', name):
            abort(404)
        return send_from_directory(storage, name, max_age=31536000)

    @app.post('/api/project/options')
    def project_options():
        project = checked_project()
        data = request.json
        validate_settings(data)
        updates = {}
        if 'mode' in data:
            if data['mode'] not in ('original','mosaic'):
                raise ValueError('Choose Mosaic or Keep original.')
            updates['remainder_mode'] = data['mode']
        if 'groups' in data:
            updates['remainder_groups'] = group_ids(data['groups'])
        if 'effect' in data:
            with db() as conn:
                source_ids = {r[0] for r in conn.execute('SELECT id FROM pieces WHERE project_id=?', (project['id'],))}
            effects.validate(data['effect'], source_ids)
            updates['remainder_effect'] = json.dumps(data['effect']) if data['effect'] else None
        for field in ('columns','variety','blend'):
            if field in data:
                updates['remainder_' + field] = data[field]
        assignments = ','.join(field + '=?' for field in updates)
        with _lock, db() as conn:
            conn.execute('UPDATE projects SET enabled=1' + (',' + assignments if assignments else '') + ' WHERE id=?', (*updates.values(), project['id']))
        return jsonify(ok=True)

    @app.post('/api/project/reset')
    def reset_project():
        project, stamp = get_project()
        if request.json.get('projectId') != project['id']:
            raise ValueError('The active portrait changed.')
        image = open_photo({'path': project['path'], 'rotation': 0}, False)
        image.thumbnail((1024, 1024))
        with _lock, db() as conn:
            if request.json.get('reuse'):
                for row in conn.execute('SELECT * FROM pieces WHERE project_id=?', (project['id'],)).fetchall():
                    updated = dict(row);updated['mask_revision'] += 1
                    with Image.open(mask_path(directory, row)) as mask:
                        mask.resize(image.size, Image.Resampling.BILINEAR).save(mask_path(directory, updated))
                    conn.execute('UPDATE pieces SET mask_revision=? WHERE id=?', (updated['mask_revision'], row['id']))
            else:
                conn.execute('DELETE FROM pieces WHERE project_id=?', (project['id'],))
                conn.execute("UPDATE projects SET enabled=0,remainder_mode='original',remainder_groups='[]',remainder_columns=NULL,remainder_variety=NULL,remainder_blend=NULL,remainder_effect=NULL WHERE id=?", (project['id'],))
            conn.execute('UPDATE projects SET signature=?,width=?,height=? WHERE id=?', (stamp, image.width, image.height, project['id']))
        return jsonify(ok=True)

    @app.post('/api/pieces')
    def create_piece():
        project = checked_project()
        name = str(request.json.get('name', 'New piece')).strip()[:100] or 'New piece'
        with _lock, db() as conn:
            position = conn.execute('SELECT COALESCE(MAX(position),-1)+1 FROM pieces WHERE project_id=?', (project['id'],)).fetchone()[0]
            if position >= 32:
                raise ValueError('Use at most 32 portrait pieces.')
            groups = [r[0] for r in conn.execute('SELECT id FROM groups WHERE enabled=1')]
            piece = dict(id=uuid.uuid4().hex,mask_revision=0)
            Image.new('L', (project['width'], project['height']), 0).save(mask_path(directory, piece))
            conn.execute('INSERT INTO pieces(id,project_id,name,position,groups) VALUES (?,?,?,?,?)', (piece['id'], project['id'], name, position, json.dumps(groups)))
            conn.execute('UPDATE projects SET enabled=1 WHERE id=?', (project['id'],))
        return jsonify(id=piece['id'])

    @app.patch('/api/pieces/<piece_id>')
    def edit_piece(piece_id):
        project = checked_project()
        data = request.json
        with _lock, db() as conn:
            row = conn.execute('SELECT * FROM pieces WHERE id=? AND project_id=?', (piece_id, project['id'])).fetchone()
            if not row:
                abort(404)
            row = dict(row)
            validate_settings(data)
            if 'effect' in data:
                source_ids = {r[0] for r in conn.execute('SELECT id FROM pieces WHERE project_id=?', (project['id'],))}
                effects.validate(data['effect'], source_ids)
                row['effect'] = json.dumps(data['effect']) if data['effect'] else None
            for field in ('columns','variety','blend'):
                if field in data:
                    row[field] = data[field]
            if 'name' in data:
                name = str(data['name']).strip()
                if not name or len(name) > 100:
                    raise ValueError('Give the piece a name between 1 and 100 characters.')
                row['name'] = name
            if 'mode' in data:
                if data['mode'] not in ('mosaic', 'original'):
                    raise ValueError('Choose Mosaic or Keep original.')
                row['mode'] = data['mode']
            if 'groups' in data:
                row['groups'] = group_ids(data['groups'])
            if 'prompts' in data:
                prompts = data['prompts']
                if not isinstance(prompts, dict):
                    raise ValueError('Invalid selection prompts.')
                validate_prompts(prompts.get('points', []), prompts.get('box'))
                row['prompts'] = json.dumps(prompts)
            if 'mask' in data:
                if data.get('revision') != row['mask_revision']:
                    raise ValueError('This piece was edited elsewhere. Reopen it before saving.')
                try:
                    payload = base64.b64decode(data['mask'].split(',', 1)[1], validate=True)
                    with Image.open(io.BytesIO(payload)) as source:
                        if source.format != 'PNG' or source.size != (project['width'], project['height']):
                            raise ValueError('Mask dimensions must match the portrait editor.')
                        mask = source.convert('L')
                    row['mask_revision'] += 1
                    mask.save(mask_path(directory, row))
                except (IndexError, TypeError, OSError) as error:
                    raise ValueError('Invalid PNG selection mask.') from error
            conn.execute('UPDATE pieces SET name=?,mode=?,groups=?,mask_revision=?,prompts=?,columns=?,variety=?,blend=?,effect=? WHERE id=?', (row['name'], row['mode'], row['groups'], row['mask_revision'], row['prompts'], row['columns'], row['variety'], row['blend'], row['effect'], piece_id))
        return jsonify(ok=True)

    @app.delete('/api/pieces/<piece_id>')
    def delete_piece(piece_id):
        project = checked_project()
        with _lock, db() as conn:
            conn.execute('DELETE FROM pieces WHERE id=? AND project_id=?', (piece_id, project['id']))
            for row in conn.execute('SELECT id,effect FROM pieces WHERE project_id=?', (project['id'],)).fetchall():
                if row['effect'] and json.loads(row['effect']).get('sourceId') == piece_id:
                    conn.execute('UPDATE pieces SET effect=NULL WHERE id=?', (row['id'],))
            if project['remainder_effect'] and json.loads(project['remainder_effect']).get('sourceId') == piece_id:
                conn.execute('UPDATE projects SET remainder_effect=NULL WHERE id=?', (project['id'],))
        return jsonify(ok=True)

    @app.post('/api/project/order')
    def reorder():
        project = checked_project()
        ids = request.json.get('ids')
        with _lock, db() as conn:
            known = {r[0] for r in conn.execute('SELECT id FROM pieces WHERE project_id=?', (project['id'],))}
            if not isinstance(ids, list) or len(ids) != len(known) or set(ids) != known:
                raise ValueError('Include every piece exactly once.')
            conn.executemany('UPDATE pieces SET position=? WHERE id=?', [(i, key) for i, key in enumerate(ids)])
        return jsonify(ok=True)

    @app.post('/api/project/person')
    def seed_person():
        project = checked_project()
        with _lock, db() as conn:
            if conn.execute('SELECT 1 FROM pieces WHERE project_id=?', (project['id'],)).fetchone():
                raise ValueError('Start from Person only when the piece list is empty.')
            cutout, _ = foreground_portrait(project['path'])
            piece = dict(id=uuid.uuid4().hex, mask_revision=0)
            cutout.getchannel('A').resize((project['width'], project['height'])).save(mask_path(directory, piece))
            groups = [r[0] for r in conn.execute('SELECT id FROM groups WHERE enabled=1')]
            conn.execute('INSERT INTO pieces(id,project_id,name,position,groups) VALUES (?,?,?,0,?)', (piece['id'], project['id'], 'Person', json.dumps(groups)))
            conn.execute('UPDATE projects SET enabled=1 WHERE id=?', (project['id'],))
        return jsonify(ok=True)

    @app.post('/api/selection/setup')
    def setup_selection():
        segmentation.prepare(directory / 'models')
        return jsonify(ok=True)

    @app.post('/api/project/select')
    def smart_select():
        project = checked_project()
        points, box = request.json.get('points', []), request.json.get('box')
        validate_prompts(points, box, require_prompt=True)
        image = open_photo({'path': project['path'], 'rotation': 0}, False)
        image.thumbnail((1024, 1024))
        masks, timings = segmentation.predict(image, project['id'] + project['signature'], points, box, directory / 'models')
        urls = []
        for mask in masks:
            name = uuid.uuid4().hex + '-draft.png'
            mask.save(storage / name)
            urls.append('/api/piece-masks/' + name)
        return jsonify(masks=urls, timings=timings)


def render_project(path, photos, columns, variety, seed, db, open_photo, thumbnail, match_tiles, directory, blend=.2):
    with _lock, db() as conn:
        project = conn.execute('SELECT * FROM projects WHERE id=? AND enabled=1', (project_id(path),)).fetchone()
        if not project:
            return None
        items = [dict(r) for r in conn.execute('SELECT * FROM pieces WHERE project_id=? ORDER BY position,id', (project['id'],))]
        memberships = list(conn.execute("SELECT gp.photo_id,gp.group_id FROM group_photos gp JOIN groups g ON g.id=gp.group_id WHERE gp.present=1 AND g.enabled=1 AND g.status='available'"))
    stamp = f'{Path(path).stat().st_mtime_ns}:{Path(path).stat().st_size}'
    if stamp != project['signature']:
        raise ValueError('The portrait changed. Review its saved pieces before generating.')
    portrait = open_photo({'path': path, 'rotation': 0}, False)
    height = max(1, round(columns * portrait.height / portrait.width))
    size = (project['width'], project['height'])
    with _lock:
        masks, remainder = effective_masks(items, size, directory)
    items.append(dict(id='remainder', name='Everything else', mode=project['remainder_mode'], groups=project['remainder_groups'],columns=project['remainder_columns'],variety=project['remainder_variety'],blend=project['remainder_blend'],effect=project['remainder_effect']))
    masks.append(remainder)
    # Full-resolution original snapshot avoids applying an old mask to a changed source.
    original_key = hashlib.sha256((path + stamp).encode()).hexdigest()[:32] + '-original.png'
    destination = directory / 'pieces' / original_key
    if not destination.exists():
        portrait.save(destination)
    colors, total_counts, layers, usage = {}, np.zeros(len(photos),dtype=np.int64), [], []
    memberships_by_photo = {}
    for photo_id, group_id in memberships:
        memberships_by_photo.setdefault(photo_id, set()).add(group_id)
    rgb = portrait.resize(size, Image.Resampling.LANCZOS).convert('RGB')
    source_masks = {item['id']: mask_path(directory, item) for item in items if item['id'] != 'remainder'}
    for item, mask in zip(items, masks):
        if item['mode'] != 'mosaic':
            continue
        piece_columns = item['columns'] if item['columns'] is not None else columns
        piece_variety = item['variety'] if item['variety'] is not None else variety
        piece_blend = item['blend'] if item['blend'] is not None else blend
        piece_rows = max(1, math.ceil(piece_columns * portrait.height / portrait.width))
        if piece_columns * piece_rows > 40000:
            raise ValueError(f"{item['name']}: reduce tile resolution for this tall portrait.")
        grid = (piece_columns, piece_rows)
        cell_pixels = max(8, math.ceil(rgb.width / piece_columns))
        working_size = (piece_columns * cell_pixels, max(1, round(piece_columns * cell_pixels * portrait.height / portrait.width)))
        padded_size = (working_size[0], piece_rows * cell_pixels)
        padded_mask = Image.new('L', padded_size, 0);padded_mask.paste(mask.resize(working_size,Image.Resampling.NEAREST), (0,0))
        sampled_alpha = np.asarray(padded_mask.resize(grid, Image.Resampling.BOX)).reshape(-1)
        active = sampled_alpha > 0
        if not np.any(active):
            usage.append(dict(id=item['id'],name=item['name'],activeTiles=0,used=0,eligible=0))
            continue
        group_set = set(json.loads(item['groups']))
        eligible = [i for i,p in enumerate(photos) if memberships_by_photo.get(p['id'],set()) & group_set]
        if not eligible:
            raise ValueError(f"{item['name']}: no selected photos are available in its assigned groups.")
        for i in eligible:
            if i not in colors:
                if not Path(photos[i]['path']).is_file():
                    raise ValueError('A memory photo was removed. Scan its group again.')
                with Image.open(thumbnail(photos[i])) as tile:
                    colors[i] = np.asarray(tile.resize((1,1),Image.Resampling.BOX))[0,0].astype(float)
        effect = json.loads(item['effect']) if item.get('effect') else None
        effect_image = None
        if effect:
            effects.validate(effect, source_masks.keys())
            with Image.open(source_masks[effect['sourceId']]) as source:
                source = source.convert('L').resize(size, Image.Resampling.BILINEAR)
                effect_image = effects.build(effect, source)
        arrangement = effects.is_arrangement(effect)
        # Arrangement presets use generated targets, ignoring the portrait's background.
        matching_rgb = effect_image if arrangement else rgb
        # Pillow's premultiplied-alpha resize gives edge colors without adjacent-region contamination.
        rgba = matching_rgb.convert('RGBA');rgba.putalpha(mask)
        padded_rgba = Image.new('RGBA', padded_size, (0,0,0,0));padded_rgba.paste(rgba.resize(working_size,Image.Resampling.BOX), (0,0))
        pixels = np.asarray(padded_rgba.resize(grid,Image.Resampling.BOX)).reshape(-1,4)[:,:3].astype(float)
        piece_seed = seed + int(hashlib.sha256(item['id'].encode()).hexdigest()[:8],16)
        photo_colors = np.array([colors[i] for i in eligible])
        if arrangement:
            local_choices, counts = effects.arrange(effect, pixels[active], photo_colors, piece_seed)
            piece_variety, piece_blend = 1, 0
        else:
            local_choices, counts = match_tiles(pixels[active], photo_colors, piece_variety, piece_seed)
        choices = np.full(piece_columns*piece_rows,-1,dtype=np.int32)
        choices[active] = np.asarray(eligible)[local_choices]
        mapped_counts = np.zeros(len(photos),dtype=np.int64);mapped_counts[eligible] = counts
        total_counts += mapped_counts
        mask_key = hashlib.sha256(mask.tobytes() + str(size).encode()).hexdigest()[:32] + '-effective.png'
        effective_path = directory / 'pieces' / mask_key
        if not effective_path.exists():
            # Canvas destination-in uses alpha; store white RGB with mask alpha.
            alpha = Image.new('RGBA',size,(255,255,255,255));alpha.putalpha(mask);alpha.save(effective_path)
        treatment = None
        if effect and not arrangement:
            alpha = effect_image
            key = hashlib.sha256(alpha.tobytes() + str(size).encode()).hexdigest()[:32] + '-effect.png'
            effect_path = directory / 'pieces' / key
            if not effect_path.exists():
                overlay = Image.new('RGBA', size, (255,255,255,255));overlay.putalpha(alpha);overlay.save(effect_path)
            treatment = dict(preset=effect['preset'],alphaUrl='/api/piece-masks/' + key)
        layers.append(dict(arrangement=effect['preset'] if arrangement else None,treatment=treatment,id=item['id'],name=item['name'],columns=piece_columns,rows=piece_rows,variety=piece_variety,blend=piece_blend,maskUrl='/api/piece-masks/'+mask_key,tiles=choices.tolist(),colors=pixels.astype(int).tolist(),counts=mapped_counts.tolist(),activeTiles=int(active.sum())))
        usage.append(dict(id=item['id'],name=item['name'],activeTiles=int(active.sum()),used=int(np.count_nonzero(counts)),eligible=len(eligible)))
    group_usage=[]
    with db() as conn:
        groups = list(conn.execute('SELECT id,name FROM groups WHERE enabled=1 ORDER BY name'))
    for group in groups:
        indices=[i for i,p in enumerate(photos) if group[0] in memberships_by_photo.get(p['id'],set())]
        group_usage.append(dict(id=group[0],name=group[1],used=int(sum(total_counts[i]>0 for i in indices)),eligible=len(indices),placements=int(sum(total_counts[i] for i in indices))))
    return dict(columns=columns,rows=height,ids=[p['id'] for p in photos],revisions=[p['revision'] for p in photos],tiles=[],colors=[],counts=total_counts.tolist(),maskUrl=None,backgroundUrl='/api/piece-masks/'+original_key,aspectRatio=portrait.height/portrait.width,activeTiles=int(total_counts.sum()),mosaicRegion='pieces',layers=layers,pieceUsage=usage,groupUsage=group_usage)
