"""Seeded color matching and balanced random photo allocation."""

import numpy as np


def match_tiles(target, colors, variety, seed):
    """Seeded noise + reuse cost broaden participation without forcing bad matches."""
    rng = np.random.default_rng(seed)
    if variety == 1:
        # Equal quotas, random remainder recipients, then random tile positions.
        repeats, remainder = divmod(len(target), len(colors))
        choices = np.concatenate(
            (
                np.tile(np.arange(len(colors), dtype=np.int32), repeats),
                rng.permutation(len(colors))[:remainder].astype(np.int32),
            )
        )
        rng.shuffle(choices)
        return choices, np.bincount(choices, minlength=len(colors))
    counts = np.zeros(len(colors), dtype=np.int64)
    choices = np.empty(len(target), dtype=np.int32)
    for i, pixel in enumerate(target):
        distances = np.mean((colors - pixel) ** 2, axis=1) / (255**2)
        scores = distances + variety * (
            rng.random(len(colors)) * 0.16
            + counts / max(1, len(target) / len(colors)) * 0.09
        )
        choice = int(np.argmin(scores))
        choices[i] = choice
        counts[choice] += 1
    return choices, counts
