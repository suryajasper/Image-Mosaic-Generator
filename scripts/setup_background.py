"""Download official model weights once; never reads or sends photographs."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
from server import DATA
from background import prepare
prepare(DATA / 'models')
print('Local background removal is ready. Future processing works offline.')
