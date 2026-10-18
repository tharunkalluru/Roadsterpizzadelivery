#!/usr/bin/env python3
"""Convert the frozen Overture parquet snapshot into compact NDJSON for the Node importer.

Reads  data/raw/overture/<release>/<theme>-<type>-<line>.parquet  (all lines, de-duplicated by GERS id, sorted by id)
Writes data/interim/overture/<release>/{segments,connectors,buildings,places,landuse,water}.ndjson  (+ preprocess-manifest.json)

Geometry is decoded from WKB to [lon, lat] (7 decimals ~ 1 cm).  No network access.  Deterministic.
"""
import json, hashlib, sys
import pyarrow.parquet as pq
import shapely
from common import *

NDP = 7


def rnd(c):
    return [[round(float(x), NDP), round(float(y), NDP)] for x, y in c]


def read_all(theme, typ):
    rows = {}
    for lid, _ in LINES:
        f = RAW_DIR / f'{theme}-{typ}-{lid}.parquet'
        if not f.exists():
            continue
        for r in pq.read_table(f).to_pylist():
            rows.setdefault(r['id'], r)
    return [rows[k] for k in sorted(rows)]


def common_names(names):
    if not names:
        return None, None
    prim = names.get('primary')
    te = None
    com = names.get('common')
    if com:
        d = dict(com) if not isinstance(com, dict) else com
        te = d.get('te')
    return prim, te


def when_of(w):
    if not w:
        return None
    o = {}
    for k in ('heading', 'mode', 'using', 'recognized'):
        if w.get(k):
            o[k] = w[k]
    if w.get('during'):
        o['during'] = True
    if w.get('vehicle'):
        o['vehicle'] = True
    return o


LIC = {}


def lic_note(key, rows):
    c = {}
    for r in rows:
        for x in (r.get('sources') or []):
            k = f"{x.get('dataset')}|{x.get('license')}"
            c[k] = c.get(k, 0) + 1
    LIC[key] = {k: c[k] for k in sorted(c)}


def seg_row(r):
    prim, te = common_names(r['names'])
    g = shapely.from_wkb(r['geometry'])
    if g.geom_type != 'LineString':
        return None
    o = {
        'id': r['id'], 'subtype': r['subtype'], 'cls': r['class'], 'subclass': r['subclass'],
        'conn': [[c['connector_id'], round(c['at'], 6)] for c in (r['connectors'] or [])],
        'coords': rnd(g.coords),
    }
    if prim:
        o['name'] = prim
    if te:
        o['nameTe'] = te
    if r['subclass_rules']:
        o['subclassRules'] = [{'v': x['value'], 'b': x['between']} for x in r['subclass_rules']]
    if r['road_flags']:
        o['flags'] = [{'v': x['values'], 'b': x['between']} for x in r['road_flags']]
    if r['level_rules']:
        o['levels'] = [{'v': x['value'], 'b': x['between']} for x in r['level_rules']]
    if r['width_rules']:
        o['widths'] = [{'v': x['value'], 'b': x['between']} for x in r['width_rules']]
    if r['access_restrictions']:
        o['access'] = [{'t': x['access_type'], 'w': when_of(x['when']), 'b': x['between']} for x in r['access_restrictions']]
    if r['prohibited_transitions']:
        o['pt'] = [{'seq': [[s['connector_id'], s['segment_id']] for s in x['sequence']], 'fh': x['final_heading'], 'w': when_of(x['when']), 'b': x['between']} for x in r['prohibited_transitions']]
    if r['routes']:
        o['routes'] = [{'name': x['name'], 'net': x['network'], 'ref': x['ref']} for x in r['routes']]
    s0 = (r['sources'] or [{}])[0]
    o['src'] = [s0.get('dataset'), s0.get('record_id')]
    return o


def main():
    INTERIM_DIR.mkdir(parents=True, exist_ok=True)
    man = {'release': RELEASE, 'files': {}}

    def out(name, rows):
        p = INTERIM_DIR / name
        with open(p, 'w') as f:
            for o in rows:
                f.write(json.dumps(o, ensure_ascii=False, separators=(',', ':')) + '\n')
        man['files'][name] = {'rows': len(rows), 'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
        print(name, len(rows), p.stat().st_size, flush=True)

    # --- segments (roads, footways ...; rail is skipped: metro alignments come from the OSM kit)
    segs = []
    rows_ = read_all('transportation', 'segment')
    lic_note('transportation/segment', rows_)
    for r in rows_:
        if r['subtype'] != 'road':
            continue
        o = seg_row(r)
        if o:
            segs.append(o)
    out('segments.ndjson', segs)

    conns = []
    rows_ = read_all('transportation', 'connector')
    lic_note('transportation/connector', rows_)
    for r in rows_:
        g = shapely.from_wkb(r['geometry'])
        conns.append({'id': r['id'], 'p': [round(g.x, NDP), round(g.y, NDP)]})
    out('connectors.ndjson', conns)

    bl = []
    rows_ = read_all('buildings', 'building')
    lic_note('buildings/building', rows_)
    for r in rows_:
        if r['is_underground']:
            continue
        g = shapely.from_wkb(r['geometry'])
        polys = [g] if g.geom_type == 'Polygon' else (list(g.geoms) if g.geom_type == 'MultiPolygon' else [])
        if not polys:
            continue
        prim, te = common_names(r['names'])
        o = {'id': r['id'], 'polys': [[rnd(p.exterior.coords)] + [rnd(h.coords) for h in p.interiors] for p in polys]}
        for k, v in (('h', r['height']), ('nf', r['num_floors']), ('minh', r['min_height']), ('sub', r['subtype']), ('cls', r['class'])):
            if v is not None:
                o[k] = v
        if prim:
            o['name'] = prim
        s0 = (r['sources'] or [{}])[0]
        o['src'] = [s0.get('dataset'), s0.get('record_id')]
        bl.append(o)
    out('buildings.ndjson', bl)

    pl = []
    rows_ = read_all('places', 'place')
    lic_note('places/place', rows_)
    for r in rows_:
        g = shapely.from_wkb(r['geometry'])
        prim, te = common_names(r['names'])
        tx = r['taxonomy'] or {}
        o = {'id': r['id'], 'p': [round(g.x, NDP), round(g.y, NDP)], 'conf': round(r['confidence'], 4) if r['confidence'] is not None else None,
             'cat': r['basic_category'], 'tax': tx.get('hierarchy') or ([tx['primary']] if tx.get('primary') else None),
             'src': sorted({s['dataset'] for s in (r['sources'] or []) if s.get('dataset')}),
             'lic': sorted({s['license'] for s in (r['sources'] or []) if s.get('license')})}
        if prim:
            o['name'] = prim
        if te:
            o['nameTe'] = te
        if r['operating_status']:
            o['st'] = r['operating_status']
        b = r['brand']
        if b and b.get('names') and b['names'].get('primary'):
            o['brand'] = b['names']['primary']
        a = (r['addresses'] or [None])[0]
        if a and a.get('freeform'):
            o['addr'] = a['freeform']
        pl.append(o)
    out('places.ndjson', pl)

    for typ, name in (('land_use', 'landuse.ndjson'), ('water', 'water.ndjson')):
        rows = []
        rows_ = read_all('base', typ)
        lic_note('base/' + typ, rows_)
        for r in rows_:
            g = shapely.from_wkb(r['geometry'])
            polys = [g] if g.geom_type == 'Polygon' else (list(g.geoms) if g.geom_type == 'MultiPolygon' else [])
            if not polys:
                continue
            prim, _ = common_names(r['names'])
            o = {'id': r['id'], 'subtype': r['subtype'], 'cls': r['class'], 'polys': [[rnd(p.exterior.coords)] + [rnd(h.coords) for h in p.interiors] for p in polys]}
            if prim:
                o['name'] = prim
            rows.append(o)
        out(name, rows)
    json.dump(man, open(INTERIM_DIR / 'preprocess-manifest.json', 'w'), indent=2, sort_keys=True)
    # committed with the raw snapshot: which datasets/licences the frozen rows actually carry (source[] entries, de-duplicated rows)
    json.dump({'release': RELEASE, 'note': 'count of source[] entries per "dataset|license" over the de-duplicated rows of the frozen snapshot', 'themes': LIC}, open(RAW_DIR / 'source-licences.json', 'w'), indent=2, sort_keys=True)


if __name__ == '__main__':
    main()
