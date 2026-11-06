"""Read-only destination inventory from shipped board/footprint identities.

No pack writes, nearest-building assignment, fabricated business names or source
board reordering. The optional bounded public Overpass request is serialized.
"""
import argparse
import collections
import datetime as dt
import fcntl
import gzip
import hashlib
import json
import math
from pathlib import Path
import re
import ssl
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CITY = ROOT / 'game/public/city'
EVIDENCE = ROOT / 'pipeline/evidence/destination-inventory-2026-10-26.json'
OSM = ROOT / 'pipeline/evidence/destination-osm-source-2026-10-26.json'
RUNTIME = ROOT / 'game/src/world/destination-data.ts'
DAY = '2026-10-26'


def _candidate_kind(name, group=''):
    n = name.lower()
    # Explicit non-institution listing identities found during inventory review;
    # do not broadly reject real colleges whose longer names mention consulting.
    if re.search(r'^(?:university connect overseas\b|new college book cent(?:re|er)\b|college consult(?:ant)?s?$|facebook marketing university$)', n):
        return None
    if re.search(r'lecture theat|operating theat|anatomy theat|home theat|cinema camera|mall(?:ikarjuna|ampet|apur|areddy)|engineering (?:works|and electrical|solutions|services)|electrical (?:works|rewind)|engineering ltd', n):
        return None
    if re.search(r'\b(?:university|universities)\b', n):
        return 'university'
    if re.search(r'\b(?:college|colleges|polytechnic)\b|\binstitute of (?:technology|science|engineering|management)\b', n):
        return 'college'
    if re.search(r'\b(?:mall|malls)\b', n):
        return 'mall'
    if re.search(r'\b(?:cinema|cinemas|multiplex|theatre|theater)\b', n) or (group == 'cinema' and re.search(r'\b(?:35|70)\s*(?:mm)?\b', n)):
        return 'cinema'
    if re.search(r'\b(?:it park|tech park|business park|knowledge city|mindspace|cyber towers|cybercity|cyber pearl|cyber gateway)\b', n):
        return 'office'
    if re.search(r'\b(?:infosys|microsoft|amazon|wipro|google|tata consultancy|deloitte|cognizant|accenture|capgemini|tech mahindra)\b', n) and not re.search(r'courier|hub|delivery|collection|shop|mobile|internet|training|tuition|repair', n):
        return 'office'
    return None


def non_destination_reason(name, kind):
    """Reject clear amenities that merely borrow a campus/company/address name.

    This does not infer a replacement institution or move any source board.
    Mall/cinema inventories are outside this bounded academic/office correction.
    """
    if kind not in ('university', 'college', 'office'):
        return None
    n = name.lower()
    if re.match(r'^(?:super\s+)?(?:oyo|townhouse)\b', n):
        return 'hotel-address-is-not-an-institution-or-office'
    if re.match(r'^(?:state bank of india|icici bank)\b', n) and (re.search(r'\bbranch\b', n) or kind == 'office'):
        return 'bank-branch-referencing-institution-or-office-address'
    if re.search(r'\b(?:early education|nursery|campus school|rose school)\b', n) and not re.search(r'\bcollege\b|\bschool (?:of|for)\b', n):
        return 'school-or-nursery-is-not-a-university-or-company-office'
    if re.match(r'^fellow bags\b', n) or re.search(r'\bold boys association\b|\boffice room\b', n) or (kind == 'office' and re.search(r'\bx road\b', n)):
        return 'retail-internal-room-or-street-reference-not-destination'
    rules = [
        ('financial-amenity-not-institution-or-office', r'\b(?:atm|atms)\b'),
        ('food-amenity-not-institution-or-office', r'\b(?:canteen|cafeteria|cafetaria|cafe|restaurant|bistro|juice (?:stall|shop|lounge|point))\b|^chai point\b'),
        ('police-or-transit-amenity-not-institution-or-office', r'\bpolice station\b|\bbus(?:\s+(?:stop|station|shelter)|\s*$)|\bmetro(?:\s+(?:station|stn|rail))?\s*$'),
        ('internal-service-amenity-not-office-or-institution', r'\b(?:toilets?|rest[ -]*rooms?|washrooms?|lift|elevator|breakout area|sofa area|pool room)\b'),
        ('campus-recreation-amenity', r'\b(?:gym|yoga room|amphitheatre|amphitheater|faculty club|sports complex|landscape garden|alumni association|filling station)\b|\bcollege area\s*$|\bmodel united nations\b'),
    ]
    for reason, pattern in rules:
        if re.search(pattern, n):
            return reason
    if re.search(r'\b(?:masjid|mosque|church|temple)\b', n) and not (re.search(r'\b(?:college|university)(?:\s+for\s+(?:girls|women|boys|men))?\s*$', n) or 'temple of learning' in n):
        return 'worship-amenity-referencing-campus-or-address'
    if re.search(r'\bhostel\b', n) and not (re.search(r'\bcollege and hostel\b', n) or re.search(r'\bcollege\b.*\([^)]*\bhostel\b', n)):
        return 'residential-amenity-not-institution'
    # Academic diagnostic departments remain institutions; a commercial clinic
    # whose address mentions a university/college does not become one.
    academic_health = re.search(r'\b(?:college|institute|department|faculty|school)\s+(?:of|for)\b|\bpharmacy college\b', n)
    if re.search(r'\b(?:diagnostics?|clinic|pharmacy)\b', n) and not academic_health:
        return 'health-service-referencing-campus-or-address'
    if kind in ('college', 'university') and re.search(r'\b(?:high school|primary school|public school)\b', n) and not re.search(r'\bcolleges?\b', n):
        return 'school-address-is-not-a-university-or-college'
    if kind == 'office' and re.search(r'\bcs program\b', n):
        return 'training-program-is-not-a-company-office'
    return None


def classify(name, group=''):
    kind = _candidate_kind(name, group)
    return None if non_destination_reason(name, kind) else kind


def fetch(core, endpoint):
    if OSM.exists():
        return
    kx = math.cos(math.radians(core['origin']['lat'])) * 6380050.094 * math.pi / 180
    kz = 6341141.9 * math.pi / 180
    b = core['bounds']
    bbox = (core['origin']['lat'] - b['maxZ'] / kz, core['origin']['lon'] + b['minX'] / kx,
            core['origin']['lat'] - b['minZ'] / kz, core['origin']['lon'] + b['maxX'] / kx)
    box = ','.join(f'{v:.7f}' for v in bbox)
    query = f'''[out:json][timeout:90];(nwr["amenity"~"^(university|college|research_institute|cinema)$"]({box});nwr["shop"="mall"]({box});nwr["office"]["name"]({box});nwr["landuse"="commercial"]["name"]({box}););out meta geom;'''
    lock_path = ROOT / 'pipeline/build/destination-query.lock'
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            import certifi
            context = ssl.create_default_context(cafile=certifi.where())
        except ImportError:
            context = ssl.create_default_context()
        req = urllib.request.Request(endpoint, data=urllib.parse.urlencode({'data': query}).encode(), headers={'User-Agent': 'RoadsterSourceInventory/1.0 (bounded research; OSM attribution retained)'})
        with urllib.request.urlopen(req, context=context, timeout=105) as response:
            content = response.read()
        data = json.loads(content)
        if data.get('remark'):
            raise RuntimeError(data['remark'])
        for item in data.get('elements', []):
            item.pop('user', None)
            item.pop('uid', None)
        data.update(sourceUrl=endpoint, query=query, bounds=list(bbox), retrievedAt=dt.datetime.now(dt.timezone.utc).isoformat(), responseSha256=hashlib.sha256(content).hexdigest(), attribution='© OpenStreetMap contributors; ODbL 1.0')
        OSM.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
        print(f'Fetched {len(data.get("elements", []))} citywide source elements with verified TLS.')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--fetch', action='store_true')
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--endpoint', default='https://overpass-api.de/api/interpreter')
    args = parser.parse_args()
    core = json.loads(gzip.decompress((CITY / 'core.pack.wasm').read_bytes()))
    if args.fetch:
        fetch(core, args.endpoint)
    candidates, rejected, runtime, markers, seen = [], [], [], [], set()
    for pack in core['packs']:
        packed = json.loads(gzip.decompress((CITY / pack['file']).read_bytes()))
        for tile, zone in packed['tiles'].items():
            buildings = {b['id']: b for b in zone['buildings']}
            grouped = collections.defaultdict(list)
            for board in zone['boards']:
                name = (board.get('full') or board.get('text') or '').strip()
                kind = _candidate_kind(name, board.get('group', ''))
                exclusion = non_destination_reason(name, kind)
                if kind:
                    grouped[(board.get('building'), name.casefold(), kind, exclusion)].append(board)
            for (building_id, _, kind, exclusion), boards in grouped.items():
                board = max(boards, key=lambda b: b.get('conf', 0))
                name = (board.get('full') or board.get('text')).strip()
                building = buildings.get(building_id)
                identity = f'{tile}:{building_id}:{kind}:{name.casefold()}'
                if identity in seen:
                    continue
                seen.add(identity)
                conf = max(b.get('conf', 0) for b in boards)
                row = dict(id='dst_' + hashlib.sha256(identity.encode()).hexdigest()[:16], name=name, kind=kind, tile=[int(v) for v in tile.split('_')], buildingId=building_id,
                           boardIds=sorted({b['id'] for b in boards}), confidence=conf,
                           sourcePack=pack['file'], sourceUrls=sorted({s.get('sourceUrl') for b in boards for s in b.get('sources', []) if isinstance(s, dict) and s.get('sourceUrl')}),
                           uncertainty='Shipped source identity/building association and inferred facade; current occupancy, entrance and architecture are not photo verified.')
                if exclusion:
                    row.update(status='review-excluded-nondestination', recognition='review-amenity-or-address-reference', exclusionReason=exclusion)
                    rejected.append(row)
                    continue
                if not building or len(building.get('ring', [])) < 3:
                    row['status'] = 'review-no-footprint'
                    rejected.append(row)
                    continue
                ring = building['ring']
                cx = sum(p[0] for p in ring) / len(ring)
                cz = sum(p[1] for p in ring) / len(ring)
                # Existing exact ID/footprint association only; no nearest lookup.
                row.update(anchor=[round(cx, 3), round(cz, 3)], sourceHeight=building['h'], status='shipped-footprint-bound')
                candidates.append(row)
                markers.append(dict(id=row['id'], name=name, kind=kind, tile=row['tile'], buildingId=building_id, boardId=board['id'], a=board['a'], b=board['b'], confidence=conf))
                # A first-floor listing in a shared small retail building is not
                # evidence of a whole campus/mall; retain it in the inventory.
                area = abs(sum(p[0] * ring[(i + 1) % len(ring)][1] - ring[(i + 1) % len(ring)][0] * p[1] for i, p in enumerate(ring))) / 2
                shared_upper_floor = kind in ('university', 'college') and board.get('slot', {}).get('floor', 0) > 0 and any(other.get('building') == building_id and other.get('group') not in ('education',) and (other.get('full') or other.get('text')) != name for other in zone['boards'])
                eligible = conf >= .55 and area >= (500 if kind in ('mall', 'office') else 150) and not shared_upper_floor
                if not eligible:
                    row['recognition'] = 'review-small-or-low-confidence-building'
                    continue
                row['recognition'] = 'bounded-typology-decoration'
                a, b = board['a'], board['b']
                runtime.append(dict(id=row['id'], name=name, kind=kind, tile=row['tile'], buildingId=building_id, boardId=board['id'], a=a, b=b, confidence=conf))
    summary = dict(sourceBackedInventory=len(candidates), withoutFootprint=sum(r['status'] == 'review-no-footprint' for r in rejected), excludedAmenityOrAddressRecords=sum(r['status'] == 'review-excluded-nondestination' for r in rejected), byKind=dict(collections.Counter(r['kind'] for r in candidates)), decoratedBuildingRecords=len(runtime), decoratedByKind=dict(collections.Counter(r['kind'] for r in runtime)), existingBoardAssociation='preserved; not independent street verification')
    summary.update(distinctEligibleBuildingIds=len({r['buildingId'] for r in runtime}), mapOnlyReviewRecords=len(candidates)-len(runtime))
    report = dict(schema=1, createdOn=DAY, scope='All matching shipped named board identities across the complete playable pack inventory; strict lexical exclusions prevent repair shops/lecture theatres being promoted.', summary=summary, attribution=core.get('attribution', []), entries=candidates, reviewQueue=rejected)
    print(json.dumps(summary, ensure_ascii=False))
    if args.write:
        EVIDENCE.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        RUNTIME.write_text('// Generated by pipeline/destination_inventory.py; source associations are inferred, not photo-verified.\nimport type { DestinationIdentity } from "./destination-identity";\nexport const DESTINATION_IDENTITIES: DestinationIdentity[] = ' + json.dumps(runtime, ensure_ascii=False, separators=(',', ':')) + ';\nexport const DESTINATION_MAP_IDENTITIES: DestinationIdentity[] = ' + json.dumps(markers, ensure_ascii=False, separators=(',', ':')) + ';\n')


if __name__ == '__main__':
    main()
