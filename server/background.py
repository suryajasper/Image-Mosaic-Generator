"""Local-only segmentation. Model setup downloads weights; inference never downloads."""
import os
import threading
from pathlib import Path
from PIL import Image

MODEL = 'u2net_human_seg'
_session = None
_lock = threading.Lock()


def available():
    import importlib.util
    return importlib.util.find_spec('rembg') is not None


def ready(directory):
    return (Path(directory) / (MODEL + '.onnx')).is_file()


def prepare(directory):
    if not available():
        raise ValueError('Install the optional background-removal dependencies: .venv/bin/python -m pip install -r requirements-background.txt')
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    os.environ['U2NET_HOME'] = str(directory.resolve())
    from rembg.sessions.u2net_human_seg import U2netHumanSegSession
    with _lock:
        # Verify the official checksum while downloading, without loading weights.
        U2netHumanSegSession.download_models()


def remove_background(image, directory):
    if not ready(directory):
        raise ValueError('Prepare the local background-removal model first.')
    if not available():
        raise ValueError('Install the optional background-removal dependencies first.')
    # Build the inference session directly from local weights. No download code is
    # called on the inference path, even when the network is unavailable.
    global _session
    with _lock:
        if _session is None:
            import onnxruntime as ort
            from rembg.sessions.u2net_human_seg import U2netHumanSegSession
            session = U2netHumanSegSession.__new__(U2netHumanSegSession)
            session.model_name = MODEL
            options = ort.SessionOptions()
            options.intra_op_num_threads = 2
            options.inter_op_num_threads = 1
            session.inner_session = ort.InferenceSession(str(Path(directory) / (MODEL + '.onnx')), sess_options=options, providers=['CPUExecutionProvider'])
            _session = session
        from rembg import remove
        return remove(image, session=_session).convert('RGBA')
