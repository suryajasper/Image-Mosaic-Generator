"""Local piece treatments. Preset builders return alpha maps for portrait overlays.

New presets can register a validator and builder without changing tile matching.
Reach is a fraction of the portrait's shorter side, independent of tile resolution.
"""
import math
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt


def validate_soft_halo(effect):
    if set(effect) - {'preset', 'sourceId', 'reach', 'strength', 'reverse', 'shape'}:
        raise ValueError('Unknown halo setting.')
    if not isinstance(effect.get('sourceId'), str):
        raise ValueError('Choose a source piece for the halo.')
    for field, low, high in (('reach', .02, 1), ('strength', 0, .85)):
        value = effect.get(field)
        if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
            raise ValueError(f'Invalid halo {field}.')
    if type(effect.get('reverse')) is not bool or effect.get('shape') not in ('silhouette', 'ellipse'):
        raise ValueError('Invalid halo direction or shape.')


def soft_halo(effect, source):
    inside = np.asarray(source) >= 128
    if not inside.any():
        raise ValueError('The halo source piece has an empty selection. Paint or select its subject first.')
    height, width = inside.shape
    reach = effect['reach'] * min(width, height)
    if effect['shape'] == 'silhouette':
        distance = distance_transform_edt(~inside)
    else:
        ys, xs = np.nonzero(inside)
        cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
        rx, ry = max(1, (xs.max() - xs.min() + 1) / 2), max(1, (ys.max() - ys.min() + 1) / 2)
        y, x = np.ogrid[:height, :width]
        radius = np.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2)
        distance = np.maximum(0, radius - 1) * min(rx, ry)
    progress = np.clip(distance / reach, 0, 1)
    smooth = progress * progress * (3 - 2 * progress)
    weight = smooth if effect['reverse'] else 1 - smooth
    return Image.fromarray(np.round(weight * effect['strength'] * 255).astype(np.uint8), 'L')


# Rendering consumes overlay alpha maps; future treatments can expose other channels.
PRESETS = {'soft-halo': (validate_soft_halo, soft_halo)}


def validate(effect, source_ids):
    if effect is None:
        return
    if not isinstance(effect, dict) or effect.get('preset') not in PRESETS:
        raise ValueError('Unknown piece treatment.')
    PRESETS[effect['preset']][0](effect)
    if effect['sourceId'] not in source_ids:
        raise ValueError('The halo source must be a piece in this portrait.')


def build(effect, source):
    return PRESETS[effect['preset']][1](effect, source)
