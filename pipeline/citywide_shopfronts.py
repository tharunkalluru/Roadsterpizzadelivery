"""Bounded, resumable source-backed naming across every shipped city tile.

An imported cell means its OSM businesses were reconciled, not that its streets,
shop order, or current storefronts were visually verified. No imagery is invented.
"""
import argparse
from collections import Counter
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import tempfile
import time
from urllib.error import HTTPError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from ocr_state import BUILD, PACKS
from shopfront_batch import LAT0, LON0, apply_reports, read_pack, reconcile

DEFAULT_ENDPOINT = 'https://overpass-api.de/api/interpreter'
DEFAULT_STATE = BUILD / 'citywide-shopfronts'
AMENITIES = 'restaurant|cafe|fast_food|food_court|ice_cream|pharmacy|bank|bureau_de_change|fuel|car_wash|cinema|clinic|dentist|veterinary'


def timestamp(now):
    return datetime.fromtimestamp(now, timezone.utc).isoformat().replace('+00:00', 'Z')


def atomic_json(path, data):
    """A crash leaves either the previous complete JSON or the next complete JSON."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = None
    try:
        with tempfile.NamedTemporaryFile('w', dir=path.parent, prefix=path.name + '.', suffix='.tmp',
                                         encoding='utf-8', delete=False) as stream:
            tmp = Path(stream.name)
            json.dump(data, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(tmp, path)
    finally:
        if tmp and tmp.exists():
            tmp.unlink()


@contextmanager
def run_lock(state_dir):
    state_dir.mkdir(parents=True, exist_ok=True)
    with (state_dir / 'runner.lock').open('a') as stream:
        try:
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('Another citywide shopfront run is active; leave it to finish') from None
        try:
            yield
        finally:
            fcntl.flock(stream.fileno(), fcntl.LOCK_UN)


def make_plan(core):
    """Use only shipped tiles, clipped to the declared playable world bounds."""
    origin, bounds, size = core['origin'], core['bounds'], core['tile']
    if not math.isfinite(size) or size <= 0:
        raise ValueError('Invalid core tile size')
    # The existing importer uses this fixed world frame; never silently misplace names.
    if not math.isclose(origin['lat'], LAT0, abs_tol=1e-9) or not math.isclose(origin['lon'], LON0, abs_tol=1e-9):
        raise ValueError('Core origin differs from the shopfront importer; update its projection before importing')
    kx = math.cos(math.radians(origin['lat'])) * 6380050.094 * math.pi / 180
    kz = 6341141.900 * math.pi / 180
    tiles = {tuple(tile) for pack in core['packs'] for tile in pack['tiles']}
    cells = []
    for i, j in sorted(tiles, key=lambda p: ((p[0] + .5) ** 2 + (p[1] + .5) ** 2, p[1], p[0])):
        if not isinstance(i, int) or not isinstance(j, int):
            raise ValueError('Core tiles must have integer grid coordinates')
        west, east = max(i * size, bounds['minX']), min((i + 1) * size, bounds['maxX'])
        north, south = max(j * size, bounds['minZ']), min((j + 1) * size, bounds['maxZ'])
        if west >= east or north >= south:
            continue
        bbox = [origin['lat'] - south / kz, origin['lon'] + west / kx,
                origin['lat'] - north / kz, origin['lon'] + east / kx]
        cells.append(dict(id=f'tile_{i}_{j}', tile=[i, j], bbox=bbox))
    if not cells:
        raise ValueError('Core contains no playable tiles')
    definition = dict(origin=origin, bounds=bounds, tileSize=size, cells=cells)
    signature = hashlib.sha256(json.dumps(definition, sort_keys=True).encode()).hexdigest()
    return dict(signature=signature, **definition)


def load_state(state_dir, plan):
    path = state_dir / 'status.json'
    if not path.exists():
        return dict(schemaVersion=1, planSignature=plan['signature'], cursor=0, cells={}, nextRequestAt=0)
    state = json.loads(path.read_text())
    if state.get('schemaVersion') != 1 or state.get('planSignature') != plan['signature']:
        raise ValueError('City bounds/tile layout changed; use a new --state-dir to preserve the previous audit')
    if not 0 <= state['cursor'] < len(plan['cells']):
        raise ValueError('Invalid saved queue cursor')
    valid_ids = {c['id'] for c in plan['cells']}
    if set(state['cells']) - valid_ids:
        raise ValueError('Saved queue contains unknown tiles')
    return state


def next_cell(plan, state, now, exclude=()):
    interrupted = [c for c in plan['cells'] if c['id'] not in exclude
                   and state['cells'].get(c['id'], {}).get('status') in ('processing', 'fetched')]
    if interrupted:
        return interrupted[0]
    # Due failures get another bounded attempt without losing fresh-cell progress.
    due = [c for c in plan['cells'] if c['id'] not in exclude
           and state['cells'].get(c['id'], {}).get('status') == 'retry'
           and state['cells'][c['id']].get('retryAt', 0) <= now]
    if due:
        return min(due, key=lambda c: (state['cells'][c['id']].get('retryAt', 0), c['id']))
    for offset in range(len(plan['cells'])):
        cell = plan['cells'][(state['cursor'] + offset) % len(plan['cells'])]
        record = state['cells'].get(cell['id'], {})
        if cell['id'] in exclude or record.get('status') in ('processed', 'retry'):
            continue
        return cell
    return None


def summarize(plan, state, now):
    records = state['cells'].values()
    counts = Counter(r.get('status', 'pending') for r in records)
    outcomes, applied = Counter(), Counter()
    for record in records:
        if record.get('status') == 'processed':
            outcomes.update(record.get('summary', {}))
            applied.update(record.get('applied', {}))
    upcoming = next_cell(plan, state, now)
    return dict(totalPlayableCells=len(plan['cells']), fetchedCells=sum('fetchedAt' in r for r in records),
                processedCells=counts['processed'], retryCells=counts['retry'],
                remainingCells=len(plan['cells']) - counts['processed'], cursor=state['cursor'],
                nextCell=upcoming, requestCooldownUntil=timestamp(state['nextRequestAt']) if state.get('nextRequestAt', 0) > now else None,
                sourceRecordOutcomesAcrossCells=dict(outcomes), recordedApplyResults=dict(applied),
                streetVerifiedCells=0,
                completeness='OSM processing coverage only. Exact facade, current operation and shop order remain unverified; records may repeat across tile boundaries.')


def overpass_query(bbox):
    b = ','.join(f'{x:.8f}' for x in bbox)
    selectors = []
    for name in ('name', 'name:en'):
        for business in ('["shop"]', '["office"]', '["craft"]', f'["amenity"~"^({AMENITIES})$"]'):
            selectors.append(f'nwr["{name}"]{business}({b});')
    return '[out:json][timeout:45];\n(\n' + '\n'.join(selectors) + '\n);\nout meta geom;\n'


def fetch_evidence(cell, endpoint, now):
    if urlparse(endpoint).scheme != 'https':
        raise ValueError('Overpass endpoint must use HTTPS')
    query = overpass_query(cell['bbox'])
    request = Request(endpoint, data=urlencode({'data': query}).encode(),
                      headers={'User-Agent': 'Roadster-Shopfront-Evidence/1.0 (bounded city tile research)',
                               'Content-Type': 'application/x-www-form-urlencoded'})
    with urlopen(request, timeout=60) as response:
        raw = response.read(25 * 1024 * 1024 + 1)
    if len(raw) > 25 * 1024 * 1024:
        raise ValueError('Overpass response exceeds 25 MiB; do not accept partial evidence')
    payload = json.loads(raw)
    if payload.get('remark') or not isinstance(payload.get('elements'), list):
        raise ValueError('Overpass returned incomplete/error data; cell is not complete')
    return dict(schemaVersion=1, source='OpenStreetMap', sourceUrl=endpoint,
                retrievedAt=timestamp(now), bounds=cell['bbox'], cellId=cell['id'], query=query,
                sourceDataTimestamp=payload.get('osm3s', {}).get('timestamp_osm_base'),
                elements=payload['elements'])


def validate_evidence(evidence, cell):
    if (evidence.get('schemaVersion') != 1 or evidence.get('source') != 'OpenStreetMap'
            or evidence.get('cellId') != cell['id'] or evidence.get('bounds') != cell['bbox']
            or not evidence.get('retrievedAt') or not evidence.get('sourceUrl')
            or not isinstance(evidence.get('elements'), list)):
        raise ValueError('Cached evidence does not match this cell and source schema')


def run_batch(core_path, state_dir=DEFAULT_STATE, max_cells=2, endpoint=DEFAULT_ENDPOINT,
              interval=15, dry_run=False, fetcher=fetch_evidence, reconciler=reconcile,
              applier=apply_reports, clock=time.time, sleeper=time.sleep):
    if not 1 <= max_cells <= 10:
        raise ValueError('--max-cells must be between 1 and 10')
    if not 10 <= interval <= 60:
        raise ValueError('--interval must be between 10 and 60 seconds')
    core_path, state_dir = Path(core_path), Path(state_dir)
    packs = core_path.parent / 'packs'
    plan = make_plan(read_pack(core_path))
    if dry_run:
        state = load_state(state_dir, plan)
        return dict(dryRun=True, **summarize(plan, state, clock()))
    with run_lock(state_dir):
        state = load_state(state_dir, plan)
        atomic_json(state_dir / 'status.json', state)
        attempted = set()
        for _ in range(max_cells):
            cell = next_cell(plan, state, clock(), attempted)
            if cell is None:
                break
            cell_id = cell['id']
            evidence_path = state_dir / 'evidence' / f'{cell_id}.json'
            report_path = state_dir / 'reports' / f'{cell_id}.json'
            # No blocking sleep over a minute: leave long server cooldowns to the next scheduled run.
            if not evidence_path.exists() and state.get('nextRequestAt', 0) > clock():
                delay = state['nextRequestAt'] - clock()
                if delay > interval:
                    break
                sleeper(delay)
            attempted.add(cell_id)
            record = state['cells'].setdefault(cell_id, {})
            record['attempts'] = record.get('attempts', 0) + 1
            record['startedAt'] = timestamp(clock())
            record['status'] = 'processing'
            state['cursor'] = (plan['cells'].index(cell) + 1) % len(plan['cells'])
            atomic_json(state_dir / 'status.json', state)
            phase = 'fetch'
            try:
                if evidence_path.exists():
                    evidence = json.loads(evidence_path.read_text())
                else:
                    # Persist a minimum gap before network IO, including interrupted requests.
                    state['nextRequestAt'] = clock() + interval
                    atomic_json(state_dir / 'status.json', state)
                    evidence = fetcher(cell, endpoint, clock())
                    validate_evidence(evidence, cell)
                    atomic_json(evidence_path, evidence)
                    state['nextRequestAt'] = clock() + interval
                validate_evidence(evidence, cell)
                record.update(fetchedAt=evidence['retrievedAt'], sourceRecords=len(evidence['elements']), status='fetched')
                atomic_json(state_dir / 'status.json', state)
                phase = 'reconcile'
                if report_path.exists():
                    report = json.loads(report_path.read_text())
                    digest = hashlib.sha256(json.dumps(evidence, sort_keys=True).encode()).hexdigest()
                    if report.get('evidenceSha256') != digest:
                        raise ValueError('Cached report does not match evidence; preserve files for review')
                else:
                    report = reconciler(evidence, packs=packs)
                    atomic_json(report_path, report)
                phase = 'apply'
                applied = applier([report], packs=packs)
                record.update(status='processed', processedAt=timestamp(clock()), summary=report['summary'], applied=applied)
                record.pop('error', None)
                record.pop('retryAt', None)
                record.pop('failures', None)
            except Exception as error:
                failures = record.get('failures', 0) + 1
                delay = min(6 * 3600, 60 * 2 ** min(failures - 1, 9))
                if isinstance(error, HTTPError):
                    try:
                        delay = max(delay, min(24 * 3600, int(error.headers.get('Retry-After', 0))))
                    except (TypeError, ValueError):
                        pass
                record.update(status='retry', failures=failures, retryAt=clock() + delay,
                              error=dict(phase=phase, type=type(error).__name__, message=str(error)[:500], at=timestamp(clock())))
                if phase == 'fetch':
                    state['nextRequestAt'] = max(state.get('nextRequestAt', 0), clock() + delay)
                atomic_json(state_dir / 'status.json', state)
                break
            atomic_json(state_dir / 'status.json', state)
        return dict(attemptedCells=len(attempted), **summarize(plan, state, clock()))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    for command in ('status', 'run'):
        p = commands.add_parser(command)
        p.add_argument('--core', type=Path, default=PACKS.parent / 'core.pack.wasm')
        p.add_argument('--state-dir', type=Path, default=DEFAULT_STATE)
        if command == 'run':
            p.add_argument('--max-cells', type=int, default=2)
            p.add_argument('--interval', type=float, default=15, help='minimum seconds between public API requests (10–60)')
            p.add_argument('--endpoint', default=DEFAULT_ENDPOINT)
            p.add_argument('--dry-run', action='store_true', help='show queue without network requests or file changes')
    args = parser.parse_args()
    try:
        if args.command == 'status':
            plan = make_plan(read_pack(args.core))
            result = summarize(plan, load_state(args.state_dir, plan), time.time())
        else:
            result = run_batch(args.core, args.state_dir, args.max_cells, args.endpoint, args.interval, args.dry_run)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if args.command == 'run' and not args.dry_run and result['retryCells']:
            raise SystemExit(1)
    except (OSError, ValueError, RuntimeError) as error:
        parser.exit(2, f'{error}\n')


if __name__ == '__main__':
    main()
