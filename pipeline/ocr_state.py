"""Shared, dependency-free state for resumable OCR workers."""
import fcntl
import glob
import gzip
import hashlib
import json
import math
import os
from collections import Counter
from contextlib import contextmanager
from pathlib import Path

HERE = Path(__file__).resolve().parent
BUILD = Path(os.environ.get('PIPELINE_BUILD', HERE / 'build'))
PACKS = Path(os.environ.get('CITY_PACKS', HERE.parent / 'game/public/city/packs'))


def shard_for(image_id, count):
    if count < 1:
        raise ValueError('shard count must be positive')
    return int(hashlib.sha256(str(image_id).encode()).hexdigest()[:16], 16) % count


def output_path(zone, shard=0, shards=1):
    if not 0 <= shard < shards:
        raise ValueError('shard index must be in [0, shards)')
    stem = 'ocr_rapid' if zone == 'hero' else 'ocr_rapid_city'
    suffix = f'.shard-{shard:03d}-of-{shards:03d}' if shards > 1 else ''
    return BUILD / f'{stem}{suffix}.jsonl'


def read_jsonl(path, repair_tail=False):
    """Only an interrupted final line may be discarded; interior damage is an error."""
    path = Path(path)
    if not path.exists():
        return []
    raw = path.read_bytes()
    lines = raw.splitlines(keepends=True)
    records, offset = [], 0
    for i, line in enumerate(lines):
        try:
            records.append(json.loads(line))
        except (ValueError, UnicodeError):
            if i != len(lines) - 1 or line.endswith(b'\n'):
                raise ValueError(f'Invalid JSON record in {path.name}, line {i + 1}')
            if repair_tail:
                with path.open('r+b') as out:
                    out.truncate(offset)
            break
        offset += len(line)
    # A valid last record without a newline must not concatenate with the next append.
    if repair_tail and raw and lines and not raw.endswith(b'\n') and offset == len(raw):
        with path.open('ab') as out:
            out.write(b'\n')
    return records


def record_paths(build=BUILD):
    paths = []
    for pattern in ('ocr_raw.jsonl', 'ocr_raw_v2.jsonl', 'ocr_rapid*.jsonl'):
        paths.extend(glob.glob(str(Path(build) / pattern)))
    return sorted(set(paths))


@contextmanager
def worker_lock(path):
    """Separate shards may run in parallel; the same shard cannot run twice."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(str(path) + '.lock', 'a') as lock:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError(f'OCR worker already owns {Path(path).name}') from None
        try:
            yield
        finally:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def heading(image):
    # Zero degrees is a valid north-facing heading, not a missing value.
    value = image.get('computed_compass_angle')
    return value if value is not None else image.get('compass_angle')


def placement_density(hero=False):
    """Reuse shipped boards when the multi-GB original build inputs are unavailable.

    This only prioritizes photo sampling. It does not upgrade inferred placements
    to observed facades or supply names to the OCR engine.
    """
    path = BUILD / ('placements_hero.json' if hero else 'placements.json')
    density = Counter()
    if path.exists():
        for p in json.loads(path.read_text()):
            if p.get('status') == 'placed' and not p.get('flags'):
                density[(round(p['lat'] / 0.00036), round(p['lon'] / 0.00038))] += 1
        return density
    kx = math.cos(math.radians(17.4063)) * 6380050.094 * math.pi / 180
    kz = 6341141.900 * math.pi / 180
    for pack in sorted(PACKS.glob('*.pack.wasm')):
        data = json.loads(gzip.decompress(pack.read_bytes()))
        for tile in data['tiles'].values():
            for b in tile['boards']:
                x, z = [b['a'][i] + (b['b'][i] - b['a'][i]) * b['t'] for i in range(2)]
                lat, lon = 17.4063 - z / kz, 78.4966 + x / kx
                density[(round(lat / 0.00036), round(lon / 0.00038))] += 1
    if not density:
        raise RuntimeError('No placements or shipped board packs found to prioritize street photos')
    return density
