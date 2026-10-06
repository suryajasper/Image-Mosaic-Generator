"""Cache the portrait silhouette and untouched original background."""

from pathlib import Path
import hashlib
from PIL import Image
import background
from storage import CACHE, DATA, lock
from file_identity import signature
from photo_service import open_photo


def foreground_portrait(path):
    path = Path(path)
    key = hashlib.sha256(
        (str(path) + signature(path) + background.MODEL + "-v1").encode()
    ).hexdigest()
    cutout = CACHE / (key + "-foreground.png")
    with lock:
        if (
            not cutout.exists()
            or not (CACHE / (key + "-mask.png")).exists()
            or not (CACHE / (key + "-original.png")).exists()
        ):
            image = open_photo({"path": str(path), "rotation": 0}, False)
            image.save(CACHE / (key + "-original.png"), "PNG")
            image.thumbnail((2400, 2400))
            result = background.remove_background(image, DATA / "models")
            result.save(cutout, "PNG")
            mask = Image.new("RGBA", result.size, (0, 0, 0, 255))
            mask.putalpha(result.getchannel("A"))
            mask.save(CACHE / (key + "-mask.png"), "PNG")
    with Image.open(cutout) as image:
        return image.copy(), "/api/masks/" + key + ".png"
