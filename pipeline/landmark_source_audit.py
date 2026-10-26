"""Recover attributable landmark identity/plan evidence without nearest-building guesses.

This produces a review report. It never imports or changes game data. Source IDs,
versions, names and geometries stay in the snapshot; candidate alternatives and
refusals remain explicit so a broad regex cannot silently pick the wrong site.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import ssl
import sys
import gzip
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'pipeline'))
from landmark_targets import TARGETS

BASE = {
    'charminar': r'^charminar$', 'charkaman': r'gulzar houz|char kaman',
    'mecca': r'm(e|a)(c|k)(c|k)a(h)? masjid', 'chowmahalla': r'chowmahalla',
    'falaknuma': r'falaknuma palace', 'golconda': r'golconda fort|golkonda fort',
    'balahisar': r'bala ?hiss?ar', 'fateh': r'fateh darwaza',
    'qsmosque': r'great mosque.*qutb|qutb.*great mosque', 'taramati': r'taramati baradari',
    'paigah': r'paigah tomb', 'buddha': r'buddha statue', 'secretariat': r'secretariat',
    'ambedkar': r'ambedkar.*statue|statue.*ambedkar', 'martyrs': r'telangana martyrs|amar jyothi',
    'birla': r'birla mandir', 'assembly': r'legislative assembly|telangana assembly|telanagana public assembly',
    'highcourt': r'high court|highcourt', 'osmania': r'osmania general hospital',
    'salarjung': r'salar ?jung museum', 'ouarts': r'arts college', 'cybertowers': r'cyber towers',
    'cablebridge': r'durgam cheruvu.*bridge|cable.*bridge', 'thub': r't.hub',
    'stadium': r'balayogi.*stadium|gachibowli.*stadium', 'clocktower': r'^(secunderabad )?clock tower$',
    'tomb_of_muhammad_quli_qutb_shah': r'muhammad quli.*tomb|tomb.*muhammad quli',
    'tomb_of_sultan_muhammad_qutb_shah': r'sultan muhammad.*tomb|tomb.*sultan muhammad',
    'tomb_of_hayat_bakshi_begum': r'hayat.*tomb|tomb.*hayat',
    'tomb_of_abdullah_qutb_shah': r'abdullah.*tomb|tomb.*abdullah',
    'tomb_of_ibrahim_quli_qutb_shah': r'ibrahim quli.*tomb|tomb.*ibrahim quli',
    'tomb_of_sultan_quli_qutb_shah': r'sultan quli.*tomb|tomb.*sultan quli',
}
PATTERNS = {**{row[0]: row[2] for row in TARGETS}, **BASE}
# Aliases are explicit identities, never a request to accept the nearest object.
PATTERNS.update({'st_george': r"saint george.s church", 'sarath_city': r'sara(th|t) city capital mall',
    'city_center': r'^city cent(er|re)( mall)?$', 'badshahi_ashurkhana': r'badshaa?hi ashoo?r ?khana',
    'ou_library': r'^university library$', 'dlf': r'^dlf( cybercity)?$',
    'kbr': r'kasu brahmananda reddy national park|^kbr park$', 'parade': r'gen krishna rao parade ground'})
RETAIN_IDS = {'n10829445473', 'n10829445474'}  # Unnamed mapped NALSAR gate pair, not guessed entrances.
LAT0, LON0 = 17.4063, 78.4966
KX = math.cos(math.radians(LAT0)) * 6380050.094 * math.pi / 180
KZ = 6341141.9 * math.pi / 180


def project(lat, lon):
    return ((lon - LON0) * KX, -(lat - LAT0) * KZ)


def geometry(element):
    if element['type'] == 'way':
        return [[p['lat'], p['lon']] for p in element.get('geometry', []) if 'lat' in p]
    rings = [m.get('geometry', []) for m in element.get('members', []) if m.get('role') in ('outer', '')]
    closed = [r for r in rings if len(r) >= 4 and r[0] == r[-1]]
    return [[p['lat'], p['lon']] for p in max(closed, key=len, default=[]) if 'lat' in p]


def position(element):
    if 'lat' in element:
        return element['lat'], element['lon']
    ring = geometry(element)
    if ring:
        # Polygon centroid, not a biased mean that changes with vertex density.
        pts = [project(*p) for p in ring]
        terms = [pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts))]
        a = sum(terms)
        if abs(a) > .01:
            x = sum((pts[i][0] + pts[(i + 1) % len(pts)][0]) * terms[i] for i in range(len(pts))) / (3 * a)
            z = sum((pts[i][1] + pts[(i + 1) % len(pts)][1]) * terms[i] for i in range(len(pts))) / (3 * a)
            return LAT0 - z / KZ, LON0 + x / KX
    c = element.get('center')
    return (c['lat'], c['lon']) if c else None


def oriented_box(ring):
    if len(ring) < 4 or ring[0] != ring[-1]:
        return None
    pts = [project(*p) for p in ring[:-1]]
    best = None
    for i, p in enumerate(pts):
        q = pts[(i + 1) % len(pts)]
        length = math.dist(p, q)
        if length < .5:
            continue
        ux, uz = (q[0] - p[0]) / length, (q[1] - p[1]) / length
        us = [x * ux + z * uz for x, z in pts]
        vs = [-x * uz + z * ux for x, z in pts]
        w, d = max(us) - min(us), max(vs) - min(vs)
        if best is None or w * d < best[0]:
            nx, nz = (-uz, ux) if w >= d else (ux, uz)
            best = w * d, max(w, d), min(w, d), math.degrees(math.atan2(nx, -nz)) % 360
    return dict(w=round(best[1], 2), d=round(best[2], 2), rot=round(best[3], 2)) if best else None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--fetch', action='store_true')
    parser.add_argument('--shipped', action='store_true', help='recover retained OSM feature IDs from every shipped city pack')
    parser.add_argument('--ids', help='comma-separated bounded source subset')
    parser.add_argument('--endpoint', help='explicit verified-TLS Overpass endpoint')
    parser.add_argument('--api', action='store_true', help='fetch bounded official OSM map API cells with metadata/geometry')
    parser.add_argument('--snapshot', default=str(ROOT / 'pipeline/evidence/landmark-osm-source-2026-10-26.json'))
    parser.add_argument('--report', default=str(ROOT / 'pipeline/build/landmark-source-review-2026-10-26.json'))
    args = parser.parse_args()
    entries = json.loads((ROOT / 'docs/landmark-audit.json').read_text())['entries']
    if args.ids:
        wanted=set(args.ids.split(',')); entries=[e for e in entries if e['id'] in wanted]
    snapshot_path = Path(args.snapshot).resolve()
    if args.api:
        context=ssl.create_default_context(); cache=ROOT/'pipeline/build/landmark-api-cells'; cache.mkdir(exist_ok=True)
        centres={(round(e['anchor']['lat'],3),round(e['anchor']['lon'],3)) for e in entries}
        # Add source-supported locations that the inherited resolver moved away from.
        centres.update({(17.604,78.547),(17.376,78.317),(17.367,78.459)})
        def fetch_cell(centre):
            lat,lon=centre; bbox=f'{lon-.0035:.5f},{lat-.0035:.5f},{lon+.0035:.5f},{lat+.0035:.5f}'
            url='https://api.openstreetmap.org/api/0.6/map?bbox='+bbox
            path=cache/(f'{lat:.3f}_{lon:.3f}.osm')
            if not path.exists():
                request=Request(url,headers={'User-Agent':'Roadster-landmark-evidence/1.0'})
                with urlopen(request,timeout=45,context=context) as response: raw=response.read()
                parsed=ET.fromstring(raw)
                if parsed.tag!='osm': raise ValueError('Expected OSM map XML')
                path.write_bytes(raw);time.sleep(.3)
            raw=path.read_bytes();parsed=ET.fromstring(raw)
            return url,raw,parsed
        unique={};requests=[];errors=[]
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures=[(centre,pool.submit(fetch_cell,centre)) for centre in sorted(centres)]
            for n,(centre,future) in enumerate(futures):
                try: url,raw,xml=future.result()
                except Exception as error:
                    errors.append(dict(centre=centre,error=str(error)));print('cell failed',centre,str(error),flush=True);continue
                nodes={e.attrib['id']:e for e in xml.findall('node')};ways={e.attrib['id']:e for e in xml.findall('way')}
                def way_geometry(way):
                    return [dict(lat=float(nodes[ref.attrib['ref']].attrib['lat']),lon=float(nodes[ref.attrib['ref']].attrib['lon'])) for ref in way.findall('nd') if ref.attrib['ref'] in nodes]
                for element in xml:
                    if element.tag not in ('node','way','relation'):continue
                    tags={t.attrib['k']:t.attrib['v'] for t in element.findall('tag')}
                    if not any(k in tags for k in ('name','name:en','official_name')) and element.tag[0]+element.attrib['id'] not in RETAIN_IDS:continue
                    item=dict(type=element.tag,id=int(element.attrib['id']),tags=tags,timestamp=element.attrib.get('timestamp'),version=int(element.attrib.get('version','0')))
                    if element.tag=='node':item.update(lat=float(element.attrib['lat']),lon=float(element.attrib['lon']))
                    elif element.tag=='way':item['geometry']=way_geometry(element)
                    else:
                        item['members']=[dict(type='way',role=m.attrib.get('role',''),ref=int(m.attrib['ref']),geometry=way_geometry(ways[m.attrib['ref']])) for m in element.findall('member') if m.attrib.get('type')=='way' and m.attrib['ref'] in ways]
                    unique[f"{element.tag[0]}{item['id']}"]=item
                requests.append(dict(url=url,sha256=hashlib.sha256(raw).hexdigest(),elements=len(xml)))
                print(f'cell{n+1}/{len(futures)} named={len(unique)}',flush=True)
        snapshot_path.parent.mkdir(parents=True,exist_ok=True)
        snapshot_path.write_text(json.dumps(dict(elements=list(unique.values()),retrievedAt=datetime.now(timezone.utc).isoformat(),endpoint='https://api.openstreetmap.org/api/0.6/map',attribution='OpenStreetMap contributors, ODbL1.0; source identity and plan geometry. Not facade/photo verification.',requests=requests,failedCells=errors),ensure_ascii=False,indent=2)+'\n')
    if args.shipped:
        core = json.loads(gzip.decompress((ROOT / 'game/public/city/core.pack.wasm').read_bytes()))
        unique = {}
        for pack in core['packs']:
            data = json.loads(gzip.decompress((ROOT / 'game/public/city' / pack['file']).read_bytes()))
            for tile in data['tiles'].values():
                for feature in tile.get('osm', []):
                    tags = feature.get('t', {})
                    if not tags.get('name'):
                        continue
                    fid = feature['id']
                    if not re.fullmatch('[nwr][0-9]+', fid):
                        continue
                    element = dict(type={'n':'node', 'w':'way', 'r':'relation'}[fid[0]], id=int(fid[1:]), tags=tags, sourceKind=feature['k'])
                    rings = feature.get('r', [])
                    if rings:
                        points = max(rings, key=len)
                        geometry_points = [dict(lat=LAT0 - z / KZ, lon=LON0 + x / KX) for x,z in points]
                        if element['type'] == 'way':
                            element['geometry'] = geometry_points
                        else:
                            element['members'] = [dict(role='outer', geometry=geometry_points)]
                    elif feature.get('p'):
                        x,z=feature['p']; element.update(lat=LAT0-z/KZ, lon=LON0+x/KX)
                    elif feature.get('line'):
                        element['geometry']=[dict(lat=LAT0-z/KZ,lon=LON0+x/KX) for x,z in feature['line']]
                    unique[fid] = element
        snapshot_path.parent.mkdir(parents=True, exist_ok=True)
        snapshot_path.write_text(json.dumps(dict(elements=list(unique.values()), attribution='OpenStreetMap contributors, ODbL1.0; retained shipped feature IDs and quantized geometry. Capture dates/versions were not retained.', origin='game/public/city source osm features', capturedVersionUnknown=True), ensure_ascii=False, indent=2) + '\n')
    if args.fetch:
        expression = '|'.join('(' + PATTERNS[e['id']] + ')' for e in entries if e['id'] in PATTERNS)
        query = '[out:json][timeout:120];nwr["name"~' + json.dumps(expression) + ',i](17.20,78.20,17.62,78.70);out meta center geom;'
        context = ssl.create_default_context()
        last = None
        for endpoint in ([args.endpoint] if args.endpoint else ['https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter']):
            try:
                request = Request(endpoint, data=urlencode({'data': query}).encode(), headers={'User-Agent': 'Roadster-landmark-evidence/1.0'})
                with urlopen(request, timeout=150, context=context) as response:
                    source = json.load(response)
                if 'elements' not in source or source.get('remark'):
                    raise ValueError(source.get('remark', 'Missing elements'))
                source['retrievedAt'] = datetime.now(timezone.utc).isoformat()
                source['endpoint'] = endpoint
                source['querySha256'] = hashlib.sha256(query.encode()).hexdigest()
                source['attribution'] = 'OpenStreetMap contributors, ODbL 1.0; identity/plan evidence, not photo verification.'
                snapshot_path.parent.mkdir(parents=True, exist_ok=True)
                snapshot_path.write_text(json.dumps(source, ensure_ascii=False, indent=2) + '\n')
                break
            except Exception as error:
                last = error
                print(f'{endpoint}: {error}', flush=True)
        else:
            raise last
    source = json.loads(snapshot_path.read_text())
    rows = []
    for entry in entries:
        pattern = PATTERNS.get(entry['id'])
        rx = re.compile(pattern, re.I) if pattern else None
        a = project(entry['anchor']['lat'], entry['anchor']['lon'])
        candidates = []
        for element in source['elements']:
            tags = element.get('tags', {})
            names = [tags[k] for k in ('name', 'name:en', 'official_name', 'alt_name', 'short_name') if k in tags]
            if not rx or not any(rx.search(n) for n in names):
                continue
            pos = position(element)
            if not pos:
                continue
            distance = math.dist(a, project(*pos))
            if distance > 3000:
                continue
            url = f"https://www.openstreetmap.org/{element['type']}/{element['id']}"
            candidates.append(dict(id=f"{element['type'][0]}{element['id']}", url=url, names=names, lat=pos[0], lon=pos[1], distanceFromInheritedM=round(distance, 1), tags=tags, box=oriented_box(geometry(element)), timestamp=element.get('timestamp'), version=element.get('version')))
        candidates.sort(key=lambda c: c['distanceFromInheritedM'])
        rows.append(dict(id=entry['id'], name=entry['name'], inherited=entry['anchor'], pattern=pattern, candidates=candidates, decision='review_required' if candidates else 'no_unambiguous_named_source_in_snapshot'))
    report = dict(schema=1, source=str(snapshot_path.relative_to(ROOT)), sourceSha256=hashlib.sha256(snapshot_path.read_bytes()).hexdigest(), elementCount=len(source['elements']), coverage=sum(bool(r['candidates']) for r in rows), total=len(rows), entries=rows)
    Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(dict(elements=report['elementCount'], candidatesFor=report['coverage'], total=report['total'], snapshot=args.snapshot, report=args.report)))


if __name__ == '__main__':
    main()
