"""Quota-preserving photo arrangements, independent of portrait matching."""

import numpy as np


def color_features(rgb):
    """Brightness plus two opponent-color axes; photos retain their original colors."""
    rgb = np.asarray(rgb, dtype=float) / 255
    luminance = rgb @ np.array([0.2126, 0.7152, 0.0722])
    return np.column_stack((luminance, rgb[:, 0] - rgb[:, 1], rgb[:, 2] - rgb[:, 1]))


def balanced_gradient(target, colors, strength, seed, brightness_only=False):
    rng = np.random.default_rng(seed)
    repeats, remainder = divmod(len(target), len(colors))
    choices = np.concatenate(
        (
            np.tile(np.arange(len(colors), dtype=np.int32), repeats),
            rng.permutation(len(colors))[:remainder].astype(np.int32),
        )
    )
    rng.shuffle(choices)
    counts = np.bincount(choices, minlength=len(colors))
    # Only this fraction of slots is organized; all remaining slots stay random.
    slots = rng.permutation(len(target))[: round(strength * len(target))]
    if len(slots) < 2:
        return choices, counts
    desired, available = color_features(target), color_features(colors)
    ordered_slots = slots[np.argsort(desired[slots, 0], kind="stable")]
    pool = choices[slots]
    choices[ordered_slots] = pool[np.argsort(available[pool, 0], kind="stable")]
    if not brightness_only:
        weights = np.array([1.0, 0.18, 0.18])
        # Disjoint pairs make each round parallel and preserve every photo's quota.
        for _ in range(96):
            pairs = rng.permutation(slots)[: len(slots) // 2 * 2].reshape(-1, 2)
            a, b = pairs[:, 0], pairs[:, 1]
            ca, cb = available[choices[a]], available[choices[b]]
            before = ((desired[a] - ca) ** 2 + (desired[b] - cb) ** 2) @ weights
            after = ((desired[a] - cb) ** 2 + (desired[b] - ca) ** 2) @ weights
            improve = after < before - 1e-12
            a, b = a[improve], b[improve]
            choices[a], choices[b] = choices[b].copy(), choices[a].copy()
    return choices, counts
