#!/usr/bin/env python3
"""Fetch the Overture Maps corridor snapshot (release 2026-09-23.1) into data/raw/overture/<release>/.

Anonymous S3 read, bbox pushdown on the overall line bbox, then an exact filter against the alignment buffered by
600 m (union of per-line corridors).  Writes <theme>-<type>-<line>.parquet and fetch-manifest.json (bbox, row counts,
bytes, sha256, timestamp).  Re-run with: game/.venv-data/bin/python scripts/overture/fetch.py [--lines blue,red,green]
"""
import argparse, hashlib, json, sys, time
from datetime import datetime, timezone
import numpy as np
import pyarrow as pa, pyarrow.compute as pc, pyarrow.dataset as ds, pyarrow.parquet as pq
import shapely
from common import *

# columns to keep (contact fields of places such as phones/emails/websites/socials are deliberately NOT fetched)
LAYERS = [
    ('transportation', 'segment', None),
    ('transportation', 'connector', None),
    ('buildings', 'building', None),
    ('places', 'place', ['id', 'names', 'basic_category', 'taxonomy', 'confidence', 'addresses', 'sources', 'operating_status', 'brand', 'bbox', 'geometry', 'version']),
    ('base', 'land_use', None),
    ('base', 'water', None),
]


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for ch in iter(lambda: f.read(1 << 20), b''):
            h.update(ch)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--lines', default='red,blue,green')
    ap.add_argument('--layers', default='')
    args = ap.parse_args()
    want = args.lines.split(',')
    only = set(args.layers.split(',')) if args.layers else None
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    fs = s3_fs()
    aligns = line_alignments()
    mpath = RAW_DIR / 'fetch-manifest.json'
    manifest = json.load(open(mpath)) if mpath.exists() else {}
    manifest.setdefault('release', RELEASE)
    manifest['buffer_m'] = BUFFER_M
    manifest['source'] = 'overturemaps-us-west-2/release/%s/theme=<theme>/type=<type>/ (anonymous S3, us-west-2)' % RELEASE
    manifest['licences'] = {'places': 'CDLA-Permissive-2.0', 'buildings': 'CDLA-Permissive-2.0', 'base': 'CDLA-Permissive-2.0', 'transportation': 'ODbL-1.0 (derived from OpenStreetMap)'}
    manifest['command'] = 'game/.venv-data/bin/python game/scripts/overture/fetch.py'
    manifest.setdefault('files', {})
    manifest.setdefault('lines', {})
    for lid in want:
        poly = corridor_polygon(aligns[lid])
        shapely.prepare(poly)
        minx, miny, maxx, maxy = poly.bounds
        bb = dict(xmin=minx / KLON, xmax=maxx / KLON, ymin=miny / KLAT, ymax=maxy / KLAT)
        manifest['lines'][lid] = {'bbox_lonlat': {k: round(v, 6) for k, v in bb.items()}, 'buffer_m': BUFFER_M, 'alignment_polylines': len(aligns[lid])}
        for theme, typ, cols in LAYERS:
            key = f'{theme}-{typ}-{lid}'
            if only and f'{theme}-{typ}' not in only:
                continue
            t0 = time.time()
            d = ds.dataset(f'overturemaps-us-west-2/release/{RELEASE}/theme={theme}/type={typ}/', filesystem=fs, format='parquet')
            F = lambda n: pc.field('bbox', n)
            filt = (F('xmin') <= bb['xmax']) & (F('xmax') >= bb['xmin']) & (F('ymin') <= bb['ymax']) & (F('ymax') >= bb['ymin'])
            tbl = d.to_table(columns=cols, filter=filt)
            n0 = tbl.num_rows
            # exact filter: bbox intersects corridor polygon (metres)
            if n0:
                bx = tbl.column('bbox').combine_chunks()
                xmn = bx.field('xmin').to_numpy(zero_copy_only=False); xmx = bx.field('xmax').to_numpy(zero_copy_only=False)
                ymn = bx.field('ymin').to_numpy(zero_copy_only=False); ymx = bx.field('ymax').to_numpy(zero_copy_only=False)
                boxes = shapely.box(xmn * KLON, ymn * KLAT, xmx * KLON, ymx * KLAT)
                keep = shapely.intersects(boxes, poly)
                tbl = tbl.filter(pa.array(keep))
            out = RAW_DIR / f'{key}.parquet'
            pq.write_table(tbl, out, compression='zstd', compression_level=9)
            manifest['files'][key] = {
                'file': out.name, 'theme': theme, 'type': typ, 'line': lid, 'rows_in_line_bbox': n0, 'rows': tbl.num_rows,
                'bytes': out.stat().st_size, 'sha256': sha256(out), 'release': RELEASE,
                'fetched_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            }
            print(f'{key}: {n0} -> {tbl.num_rows} rows, {out.stat().st_size/1e6:.1f} MB, {time.time()-t0:.0f}s', flush=True)
            json.dump(manifest, open(mpath, 'w'), indent=2, sort_keys=True)
    manifest['total_bytes'] = sum(f['bytes'] for f in manifest['files'].values())
    json.dump(manifest, open(mpath, 'w'), indent=2, sort_keys=True)
    print('total MB', manifest['total_bytes'] / 1e6)


if __name__ == '__main__':
    main()
