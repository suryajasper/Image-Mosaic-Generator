"""Loopback-only photo library. Originals are read, never overwritten."""
from pathlib import Path
import hashlib
import io
import os
import sqlite3
import threading
import uuid
from urllib.parse import urlparse
import numpy as np
from flask import Flask, abort, jsonify, request, send_file, send_from_directory
from PIL import Image, ImageOps, UnidentifiedImageError
import background
from pillow_heif import register_heif_opener
register_heif_opener()

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get('MOSAIC_DATA_DIR', ROOT / '.mosaic'))
DATA.mkdir(parents=True, exist_ok=True)
app = Flask(__name__, static_folder=None)
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024
lock = threading.RLock()
EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.bmp', '.heic', '.heif'}
HEIC = {'.heic', '.heif'}
CACHE = DATA / 'cache'
CACHE.mkdir(exist_ok=True)

def db():
    connection = sqlite3.connect(DATA / 'library.sqlite')
    connection.row_factory = sqlite3.Row
    return connection

with db() as conn:
    conn.execute('CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, path TEXT UNIQUE, selected INTEGER DEFAULT 1, rotation INTEGER DEFAULT 0, x REAL DEFAULT 0.5, y REAL DEFAULT 0.5, size REAL DEFAULT 1, revision INTEGER DEFAULT 0)')
    conn.execute('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)')
    columns = {r[1] for r in conn.execute('PRAGMA table_info(photos)')}
    for name, declaration in [('active', 'INTEGER DEFAULT 1'), ('signature', "TEXT DEFAULT ''")]:
        if name not in columns:
            conn.execute(f'ALTER TABLE photos ADD COLUMN {name} {declaration}')
    conn.execute('CREATE TABLE IF NOT EXISTS portraits (id TEXT PRIMARY KEY, path TEXT)')

@app.before_request
def local_only():
    if request.remote_addr not in {'127.0.0.1', '::1'} or urlparse('http://' + request.host).hostname not in {'127.0.0.1', 'localhost', '::1'}:
        abort(403)
    origin = request.headers.get('Origin')
    if origin and urlparse(origin).hostname not in {'localhost', '127.0.0.1', '::1'}:
        abort(403)
    if request.headers.get('Sec-Fetch-Site') == 'cross-site':
        abort(403)

@app.after_request
def private_response(response):
    response.headers['Content-Security-Policy'] = "default-src 'self'; img-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'no-referrer'
    return response


@app.errorhandler(OSError)
def file_error(error):
    return jsonify(error='A local file could not be read or saved. Check the folder and file permissions.'), 400


@app.errorhandler(ValueError)
def invalid(error):
    return jsonify(error=str(error)), 400

@app.errorhandler(404)
def missing(error):
    return jsonify(error='Photo or file not found. Check that the local folder is still available.'), 404

def photo(photo_id):
    with db() as conn:
        row = conn.execute('SELECT * FROM photos WHERE id=?', (photo_id,)).fetchone()
    if not row:
        abort(404)
    return dict(row)

def open_photo(row, crop=True):
    try:
        path = Path(row['path'])
        readable = converted_path(path) if path.suffix.lower() in HEIC else path
        if not readable.exists():
            abort(404)
        with Image.open(readable) as source:
            image = ImageOps.exif_transpose(source).convert('RGB')
    except (OSError, UnidentifiedImageError):
        abort(404)
    image = image.rotate(-row['rotation'], expand=True)
    if crop:
        w, h = image.size
        side = min(w, h) * row['size']
        left, top = (w - side) * row['x'], (h - side) * row['y']
        image = image.crop((round(left), round(top), round(left + side), round(top + side)))
    return image

@app.get('/api/library')
def library():
    with db() as conn:
        rows = [dict(r) for r in conn.execute('SELECT * FROM photos WHERE active=1 ORDER BY path')]
        settings = dict(conn.execute('SELECT key,value FROM settings').fetchall())
    for row in rows:
        row['name'] = Path(row['path']).name
    return jsonify(photos=rows, folder=settings.get('folder', ''), target=settings.get('target'), foreground=settings.get('foreground') == '1', mosaicRegion=settings.get('mosaicRegion', 'foreground' if settings.get('foreground') == '1' else 'all'), backgroundReady=background.ready(DATA / 'models'), backgroundAvailable=background.available())

def signature(path):
    stat = path.stat()
    return f'{stat.st_mtime_ns}:{stat.st_size}'


def identity(path):
    stat = path.stat()
    return hashlib.sha256(f'{stat.st_dev}:{stat.st_ino}'.encode()).hexdigest()[:24]


def converted_path(path):
    return CACHE / (hashlib.sha256((identity(path) + signature(path)).encode()).hexdigest() + '.jpg')


def conversion_pending(paths):
    return [str(p) for p in paths if p.suffix.lower() in HEIC and not converted_path(p).exists()]


def convert(path):
    destination = converted_path(path)
    if not destination.exists():
        with Image.open(path) as source:
            image = ImageOps.exif_transpose(source).convert('RGB')
            temporary = destination.with_suffix('.tmp')
            image.save(temporary, 'JPEG', quality=95)
            temporary.replace(destination)
    return destination


@app.post('/api/import')
def import_folder():
    folder = Path(request.json.get('path', '')).expanduser().resolve()
    if not folder.is_dir():
        raise ValueError('Enter an existing folder on this computer.')
    paths = sorted(p.resolve() for p in folder.rglob('*') if p.is_file() and p.suffix.lower() in EXTENSIONS)
    pending = conversion_pending(paths)
    if pending and not request.json.get('convert') and not request.json.get('skipHeic'):
        return jsonify(needsConversion=pending)
    skipped, imported = [], 0
    with lock, db() as conn:
        conn.execute('UPDATE photos SET active=0')
        for path in paths:
            try:
                if str(path) in pending and not request.json.get('convert'):
                    continue
                photo_id, stamp = identity(path), signature(path)
                existing = conn.execute('SELECT * FROM photos WHERE id=? OR path=? ORDER BY id=? DESC', (photo_id, str(path), photo_id)).fetchone()
                if existing:
                    photo_id = existing['id']
                if not existing or existing['signature'] != stamp:
                    readable = convert(path) if path.suffix.lower() in HEIC else path
                    with Image.open(readable) as img:
                        img.verify()
                conn.execute("INSERT INTO photos (id,path,signature,active) VALUES (?,?,?,1) ON CONFLICT(id) DO UPDATE SET path=excluded.path, active=1, revision=photos.revision + (photos.signature != excluded.signature), signature=excluded.signature", (photo_id, str(path), stamp))
                imported += 1
            except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError):
                skipped.append(path.name)
        conn.execute('INSERT OR REPLACE INTO settings VALUES (?,?)', ('folder', str(folder)))
    return jsonify(imported=imported, skipped=skipped)


@app.post('/api/convert')
def convert_photos():
    paths = [Path(p).expanduser().resolve() for p in request.json.get('paths', [])]
    with lock:
        for path in paths:
            if path.suffix.lower() not in HEIC or not path.is_file():
                raise ValueError('Only existing local HEIC / HEIF images can be converted.')
            try:
                convert(path)
            except (OSError, ValueError, UnidentifiedImageError):
                raise ValueError(f'Could not convert {path.name}. The original is unchanged.')
    return jsonify(converted=len(paths))


@app.post('/api/portraits')
def portrait_options():
    folder = Path(request.json.get('path', '')).expanduser().resolve()
    if not folder.is_dir():
        raise ValueError('Portrait folder not found. You can also use any library photo as the portrait.')
    paths = sorted(p.resolve() for p in folder.rglob('*') if p.is_file() and p.suffix.lower() in EXTENSIONS)
    pending = conversion_pending(paths)
    if pending and not request.json.get('convert'):
        return jsonify(needsConversion=pending)
    options, skipped = [], []
    with lock, db() as conn:
        for path in paths:
            try:
                readable = convert(path) if path.suffix.lower() in HEIC else path
                with Image.open(readable) as image:
                    image.verify()
                photo_id = identity(path)
                conn.execute('INSERT OR REPLACE INTO portraits VALUES (?,?)', (photo_id, str(path)))
                options.append(dict(id=photo_id, path=str(path), name=path.name))
            except (OSError, ValueError, UnidentifiedImageError):
                skipped.append(path.name)
    return jsonify(options=options, skipped=skipped)


@app.get('/api/portraits/<photo_id>/image')
def portrait_thumbnail(photo_id):
    with db() as conn:
        row = conn.execute('SELECT path FROM portraits WHERE id=?', (photo_id,)).fetchone()
    if not row:
        abort(404)
    image = open_photo({'path': row[0], 'rotation': 0}, False)
    image.thumbnail((256, 256))
    output = io.BytesIO()
    image.save(output, 'JPEG')
    output.seek(0)
    return send_file(output, mimetype='image/jpeg')


@app.patch('/api/photos/<photo_id>')
def edit(photo_id):
    row, data = photo(photo_id), request.json
    for key in ('x', 'y', 'size'):
        if key in data:
            value = float(data[key])
            if not np.isfinite(value) or not (0.05 if key == 'size' else 0) <= value <= 1:
                raise ValueError('Invalid crop coordinates.')
            row[key] = value
    if 'rotation' in data:
        if data['rotation'] not in (0, 90, 180, 270):
            raise ValueError('Rotation must be a quarter turn.')
        row['rotation'] = data['rotation']
    if 'selected' in data:
        row['selected'] = bool(data['selected'])
    with lock, db() as conn:
        conn.execute('UPDATE photos SET selected=?,rotation=?,x=?,y=?,size=?,revision=revision+1 WHERE id=?', (row['selected'], row['rotation'], row['x'], row['y'], row['size'], photo_id))
    return jsonify(ok=True)

@app.post('/api/selection')
def selection():
    with lock, db() as conn:
        conn.execute('UPDATE photos SET selected=? WHERE active=1', (bool(request.json['selected']),))
    return jsonify(ok=True)

def thumbnail(row):
    key = hashlib.sha256((row['path'] + signature(Path(row['path'])) + str((row['rotation'], row['x'], row['y'], row['size']))).encode()).hexdigest()
    destination = CACHE / (key + '-tile.jpg')
    with lock:
        if not destination.exists():
            image = open_photo(row)
            image.thumbnail((256, 256))
            image.save(destination, 'JPEG', quality=92)
    return destination


@app.get('/api/photos/<photo_id>/image')
def image(photo_id):
    row = photo(photo_id)
    if not Path(row['path']).is_file():
        abort(404)
    if request.args.get('original') != '1':
        return send_file(thumbnail(row), mimetype='image/jpeg', max_age=31536000)
    image = open_photo(row, False)
    image.thumbnail((1600, 1600))
    output = io.BytesIO()
    image.save(output, 'JPEG', quality=90)
    output.seek(0)
    return send_file(output, mimetype='image/jpeg', max_age=0)


@app.post('/api/target')
def set_target():
    path = Path(request.json.get('path', '')).expanduser().resolve()
    try:
        if path.suffix.lower() in HEIC and not converted_path(path).exists():
            return jsonify(needsConversion=[str(path)])
        with Image.open(converted_path(path) if path.suffix.lower() in HEIC else path) as image:
            image.verify()
    except (OSError, ValueError, UnidentifiedImageError):
        raise ValueError('Choose a readable JPG, PNG, WebP or TIFF portrait.')
    with db() as conn:
        conn.execute('INSERT OR REPLACE INTO settings VALUES (?,?)', ('target', str(path)))
    return jsonify(ok=True)

@app.post('/api/background/setup')
def prepare_background():
    try:
        background.prepare(DATA / 'models')
    except Exception as error:
        app.logger.warning('Local model setup failed: %s', error)
        raise ValueError('Could not prepare background removal. Check the internet connection for the one-time model download and install requirements-background.txt if needed.')
    return jsonify(ok=True)


@app.post('/api/target/options')
def target_options():
    region = request.json.get('mosaicRegion')
    if region is not None and region not in ('all', 'foreground', 'background'):
        raise ValueError('Choose all, foreground, or background.')
    enabled = region != 'all' if region is not None else request.json.get('foreground')
    if not isinstance(enabled, bool):
        raise ValueError('Foreground mode must be true or false.')
    if enabled and not background.ready(DATA / 'models'):
        raise ValueError('Prepare the local background-removal model first.')
    region = region or ('foreground' if enabled else 'all')
    with db() as conn:
        conn.execute('INSERT OR REPLACE INTO settings VALUES (?,?)', ('mosaicRegion', region))
        conn.execute('INSERT OR REPLACE INTO settings VALUES (?,?)', ('foreground', '1' if enabled else '0'))
    return jsonify(ok=True)


def foreground_portrait(path):
    path = Path(path)
    key = hashlib.sha256((str(path) + signature(path) + background.MODEL + '-v1').encode()).hexdigest()
    cutout = CACHE / (key + '-foreground.png')
    with lock:
        if not cutout.exists() or not (CACHE / (key + '-mask.png')).exists() or not (CACHE / (key + '-original.png')).exists():
            image = open_photo({'path': str(path), 'rotation': 0}, False)
            image.save(CACHE / (key + '-original.png'), 'PNG')
            image.thumbnail((2400, 2400))
            result = background.remove_background(image, DATA / 'models')
            result.save(cutout, 'PNG')
            mask = Image.new('RGBA', result.size, (0, 0, 0, 255))
            mask.putalpha(result.getchannel('A'))
            mask.save(CACHE / (key + '-mask.png'), 'PNG')
    with Image.open(cutout) as image:
        return image.copy(), '/api/masks/' + key + '.png'


@app.get('/api/masks/<key>.png')
def foreground_mask(key):
    if len(key) != 64 or any(c not in '0123456789abcdef' for c in key):
        abort(404)
    return send_file(CACHE / (key + '-mask.png'), mimetype='image/png', max_age=31536000)


@app.get('/api/backgrounds/<key>.png')
def original_background(key):
    if len(key) != 64 or any(c not in '0123456789abcdef' for c in key):
        abort(404)
    return send_file(CACHE / (key + '-original.png'), mimetype='image/png', max_age=31536000)


@app.get('/api/target/image')
def target_image():
    with db() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key='target'").fetchone()
    if not row:
        abort(404)
    if request.args.get('foreground') == '1':
        image, _ = foreground_portrait(row[0])
    else:
        image = open_photo({'path': row[0], 'rotation': 0}, False)
    image.thumbnail((2000, 2000))
    output = io.BytesIO()
    image.save(output, 'PNG')
    output.seek(0)
    response = send_file(output, mimetype='image/png')
    response.headers['Cache-Control'] = 'no-store'
    return response


def match_tiles(target, colors, variety, seed):
    """Seeded noise + reuse cost broaden participation without forcing bad matches."""
    rng = np.random.default_rng(seed)
    if variety == 1:
        # Equal quotas, random remainder recipients, then random tile positions.
        repeats, remainder = divmod(len(target), len(colors))
        choices = np.concatenate((np.tile(np.arange(len(colors), dtype=np.int32), repeats),
                                  rng.permutation(len(colors))[:remainder].astype(np.int32)))
        rng.shuffle(choices)
        return choices, np.bincount(choices, minlength=len(colors))
    counts = np.zeros(len(colors), dtype=np.int64)
    choices = np.empty(len(target), dtype=np.int32)
    for i, pixel in enumerate(target):
        distances = np.mean((colors - pixel) ** 2, axis=1) / (255 ** 2)
        scores = distances + variety * (rng.random(len(colors)) * 0.16 + counts / max(1, len(target) / len(colors)) * 0.09)
        choice = int(np.argmin(scores))
        choices[i] = choice
        counts[choice] += 1
    return choices, counts

@app.post('/api/mosaic')
def mosaic():
    data = request.json
    columns, variety = int(data.get('columns', 60)), float(data.get('variety', 0.35))
    if not 12 <= columns <= 160 or not 0 <= variety <= 1:
        raise ValueError('Invalid mosaic configuration.')
    with db() as conn:
        rows = [dict(r) for r in conn.execute('SELECT * FROM photos WHERE selected=1 AND active=1 ORDER BY path')]
        target = conn.execute("SELECT value FROM settings WHERE key='target'").fetchone()
        settings = dict(conn.execute('SELECT key,value FROM settings').fetchall())
        region = settings.get('mosaicRegion', 'foreground' if settings.get('foreground') == '1' else 'all')
    if not rows or not target:
        raise ValueError('Add a portrait and select at least one memory photo first.')
    colors = []
    for row in rows:
        if not Path(row['path']).is_file():
            raise ValueError('A photo was removed. Scan the folder again to update the library.')
        with Image.open(thumbnail(row)) as tile:
            colors.append(np.asarray(tile.resize((1, 1), Image.Resampling.BOX))[0, 0])
    mask_url = None
    if region != 'all':
        portrait, mask_url = foreground_portrait(target[0])
        if region == 'background':
            alpha = portrait.getchannel('A').point(lambda value: 255 - value)
            portrait = open_photo({'path': target[0], 'rotation': 0}, False).convert('RGBA').resize(portrait.size)
            portrait.putalpha(alpha)
    else:
        portrait = open_photo({'path': target[0], 'rotation': 0}, False)
    height = max(1, round(columns * portrait.height / portrait.width))
    if columns * height > 40000:
        raise ValueError('This portrait is too tall. Please use a less narrow portrait or reduce resolution.')
    sampled = np.asarray(portrait.resize((columns, height), Image.Resampling.BOX)).reshape(-1, len(portrait.getbands()))
    pixels = sampled[:, :3].astype(float)
    active = sampled[:, 3] > 0 if mask_url else np.ones(len(pixels), dtype=bool)
    if not np.any(active):
        raise ValueError('No tiles were found in the selected region. Choose another region or portrait.')
    active_choices, counts = match_tiles(pixels[active], np.asarray(colors, dtype=float), variety, int(data.get('seed', 42)))
    choices = np.full(len(pixels), -1, dtype=np.int32)
    choices[active] = active_choices
    return jsonify(mosaicRegion=region, columns=columns, rows=height, ids=[r['id'] for r in rows], revisions=[r['revision'] for r in rows], tiles=choices.tolist(), colors=pixels.astype(int).tolist(), counts=counts.tolist(), maskUrl=mask_url, backgroundUrl=mask_url.replace('/api/masks/', '/api/backgrounds/') if mask_url else None, activeTiles=int(active.sum()))

@app.post('/api/exports')
def save_export():
    payload = request.get_data()
    try:
        with Image.open(io.BytesIO(payload)) as image:
            if image.format != 'PNG' or image.width * image.height > 80_000_000:
                raise ValueError('Export must be a PNG under 80 megapixels.')
            image.verify()
    except (OSError, UnidentifiedImageError):
        raise ValueError('Invalid PNG export.')
    folder = DATA / 'exports'
    folder.mkdir(exist_ok=True)
    name = 'memory-mosaic-' + uuid.uuid4().hex[:12] + '.png'
    destination = folder / name
    destination.write_bytes(payload)
    return jsonify(url='/api/exports/' + name, path=str(destination.resolve()))


@app.get('/api/exports/<name>')
def download_export(name):
    return send_from_directory(DATA / 'exports', name, as_attachment=True)


@app.get('/')
@app.get('/<path:path>')
def frontend(path='index.html'):
    return send_from_directory(ROOT / 'dist', path)

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=8814, debug=False, threaded=True)
