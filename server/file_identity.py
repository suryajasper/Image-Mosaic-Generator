"""Stable file identity and content fingerprints."""

import hashlib


def signature(path):
    stat = path.stat()
    return f"{stat.st_mtime_ns}:{stat.st_size}"


def identity(path):
    stat = path.stat()
    return hashlib.sha256(f"{stat.st_dev}:{stat.st_ino}".encode()).hexdigest()[:24]


def file_digest(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
