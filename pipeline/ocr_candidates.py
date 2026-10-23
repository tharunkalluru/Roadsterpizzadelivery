"""Read-only mapped-name candidates for OCR; never certifies a facade or shop order.

The shipped packs are enough to recover name vocabulary and approximate facades
when the original multi-GB placement build is absent. Projection is the exact
inverse of export_city.py, using the core manifest's origin and its ellipsoid radii.
"""
import gzip
import json
import math
from pathlib import Path
from ocr_state import BUILD, PACKS

NR, MR = 6380050.094, 6341141.900


def read_origin(packs=PACKS):
    path = Path(packs).parent / 'core.pack.wasm'
    origin = json.loads(gzip.decompress(path.read_bytes()))['origin']
    return float(origin['lat']), float(origin['lon'])


def scale(origin):
    return math.cos(math.radians(origin[0])) * NR * math.pi / 180, MR * math.pi / 180


def to_ll(x, z, origin):
    kx, kz = scale(origin)
    return origin[0] - z / kz, origin[1] + x / kx


def to_xz(lat, lon, origin):
    kx, kz = scale(origin)
    return (lon - origin[1]) * kx, -(lat - origin[0]) * kz


def mapped_candidates(build=BUILD, packs=PACKS):
    """Yield legacy-compatible candidate records without writing placements.json.

    Original placement records retain their IDs, flags and provenance. Pack-derived
    records expose their existing verification separately and remain explicitly
    inferred candidates even when an older export has photo counters.
    """
    path = Path(build) / 'placements.json'
    if path.exists():
        yield from json.loads(path.read_text())
        return
    paths = sorted(Path(packs).glob('*.pack.wasm'))
    if not paths:
        raise RuntimeError('No placements.json or shipped board packs for OCR matching')
    origin = read_origin(packs)
    seen = set()
    for path in paths:
        data = json.loads(gzip.decompress(path.read_bytes()))
        for tile_key, tile in data['tiles'].items():
            for board in tile.get('boards', []):
                uid = board['id']
                if uid in seen:
                    continue
                seen.add(uid)
                a, b = to_ll(*board['a'], origin), to_ll(*board['b'], origin)
                t = float(board['t'])
                yield dict(uid=uid, name=board.get('full') or board['text'], board=board['text'],
                           status='placed', flags=[], facade_ll=[a, b], facade=dict(t=t),
                           lat=a[0] + (b[0] - a[0]) * t, lon=a[1] + (b[1] - a[1]) * t,
                           building=board.get('building'), slot=board.get('slot'),
                           place_conf=board.get('conf'), group=board.get('group'), tier=board.get('tier'),
                           verification='mapped_board_candidate_inferred_facade',
                           existingVerification=board.get('verification'),
                           candidateSource='shipped_board', pack=path.name, tile=tile_key,
                           sources=board.get('sources', []))
