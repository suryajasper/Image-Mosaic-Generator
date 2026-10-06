"""Optional local MobileSAM selection. Only explicit setup accesses the network."""
import hashlib
import importlib.util
import threading
import time
import ssl
from pathlib import Path
from urllib.request import urlopen
import numpy as np
from PIL import Image

CHECKPOINT = 'mobile_sam.pt'
CHECKSUM = '6dbb90523a35330fedd7f1d3dfc66f995213d81b29a5ca8108dbcdd4e37d6c2f'
URL = 'https://raw.githubusercontent.com/ChaoningZhang/MobileSAM/f706ad9c4eb7f219c00d9050e46328518ffb65d2/weights/mobile_sam.pt'
_lock = threading.Lock()
_predictor = None
_image_key = None


def available():
    return all(importlib.util.find_spec(module) is not None for module in ('torch', 'torchvision', 'timm', 'mobile_sam'))


def ready(directory):
    return available() and (Path(directory) / CHECKPOINT).is_file()


def prepare(directory):
    if not available():
        raise ValueError('Install requirements-selection.txt in the local Python environment first.')
    directory = Path(directory)
    directory.mkdir(exist_ok=True, parents=True)
    destination = directory / CHECKPOINT
    if destination.exists() and hashlib.sha256(destination.read_bytes()).hexdigest() == CHECKSUM:
        return
    temporary = destination.with_suffix('.download')
    try:
        import certifi
        with urlopen(URL, timeout=60, context=ssl.create_default_context(cafile=certifi.where())) as source, temporary.open('wb') as output:
            while chunk := source.read(1024 * 1024):
                output.write(chunk)
        if hashlib.sha256(temporary.read_bytes()).hexdigest() != CHECKSUM:
            raise ValueError('The selection model checksum did not match. Please retry setup.')
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


def predict(image, key, points, box, directory):
    if not ready(directory):
        raise ValueError('Prepare the local smart-selection model first, or use the manual brush.')
    if not _lock.acquire(blocking=False):
        raise ValueError('Another smart selection is running. Please try again shortly.')
    global _predictor, _image_key
    try:
        import torch
        from mobile_sam import SamPredictor, sam_model_registry
        if _predictor is None:
            if hashlib.sha256((Path(directory) / CHECKPOINT).read_bytes()).hexdigest() != CHECKSUM:
                raise ValueError('The smart-selection model is damaged. Run model setup again.')
            torch.set_num_threads(4)
            _predictor = SamPredictor(sam_model_registry['vit_t'](checkpoint=str(Path(directory) / CHECKPOINT)).eval())
        start = time.perf_counter()
        if key != _image_key:
            _predictor.set_image(np.asarray(image.convert('RGB')))
            _image_key = key
        prepared = time.perf_counter()
        coords = np.asarray([[p['x'] * image.width, p['y'] * image.height] for p in points], dtype=np.float32) if points else None
        labels = np.asarray([p['include'] for p in points], dtype=np.int32) if points else None
        bounds = np.asarray([box[0] * image.width, box[1] * image.height, box[2] * image.width, box[3] * image.height], dtype=np.float32) if box else None
        masks, scores, _ = _predictor.predict(point_coords=coords, point_labels=labels, box=bounds, multimask_output=True)
        order = np.argsort(scores)[::-1]
        return [Image.fromarray(masks[i].astype('uint8') * 255, 'L') for i in order], {'prepareSeconds': prepared - start, 'promptSeconds': time.perf_counter() - prepared}
    finally:
        _lock.release()
