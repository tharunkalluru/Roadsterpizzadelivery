"""Generate explicit named footprint bindings, never nearest-building matches."""
import json
import math
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
source_path = ROOT / 'pipeline/evidence/landmark-osm-source-2026-10-26.json'
snapshot = json.loads(source_path.read_text())
elements = {int(e['id']): e for e in snapshot['elements']}
evidence_path = ROOT / 'pipeline/evidence/destination-hero-source-2026-10-26.json'
previous = json.loads(evidence_path.read_text()) if evidence_path.exists() else {}
for element in previous.get('elements', []):
    elements.setdefault(int(element['id']), element)
xml_path = ROOT / 'pipeline/build/landmark-api-cells/17.458_78.364.osm'
if xml_path.exists():
    xml = ET.parse(xml_path).getroot()
    nodes = {int(n.attrib['id']): (float(n.attrib['lat']), float(n.attrib['lon'])) for n in xml.findall('node')}
    way = next(w for w in xml.findall('way') if w.attrib['id'] == '574673965')
    amb_node = next(n for n in xml.findall('node') if n.attrib['id'] == '6771713703')
    elements[6771713703] = dict(type='node', id=6771713703, version=int(amb_node.attrib['version']), timestamp=amb_node.attrib['timestamp'],
                     lat=float(amb_node.attrib['lat']), lon=float(amb_node.attrib['lon']), tags={t.attrib['k']: t.attrib['v'] for t in amb_node.findall('tag')})
    elements[574673965] = dict(type='way', id=574673965, version=int(way.attrib['version']), timestamp=way.attrib['timestamp'],
                             tags={t.attrib['k']: t.attrib['v'] for t in way.findall('tag')},
                             geometry=[dict(lat=nodes[int(n.attrib['ref'])][0], lon=nodes[int(n.attrib['ref'])][1]) for n in way.findall('nd')])
# The tracked original elements are sufficient on a fresh clone without the
# ignored API cache. No network lookup or nearest-building binding is needed.
amb_point = elements[6771713703]
legacy = json.loads(re.search(r'export const LM_DATA: LmData\[\] = (\[.*\]);', (ROOT / 'game/src/world/landmarks_data.ts').read_text(), re.S).group(1))
heights = {r['key']: r['h'] for r in legacy}
plans, evidence = {}, []
for key, oid, official in [
    ('inorbit', 68871414, 'https://www.inorbit.in/inorbit-mall-cyberabad'),
    ('forum', 311388388, 'https://hyderabad.nexusmalls.com/'),
    ('lulu', 880054935, 'https://www.hyderabad.lulumall.in/about-us/'),
    ('asian_amb', 574673965, 'https://sarathcitycapitalmall.com/amb-cinemas/'),
    ('uppal_stadium', 839364278, 'https://hycricket.org/stadium.html'),
]:
    element = elements[oid]
    points = [(g['lon'], g['lat']) for g in element['geometry']]
    if points[0] == points[-1]:
        points = points[:-1]
    lat, lon = sum(p[1] for p in points) / len(points), sum(p[0] for p in points) / len(points)
    kx = math.cos(math.radians(lat)) * 6380050.094 * math.pi / 180
    kz = 6341141.9 * math.pi / 180
    ring = [(round((p[0] - lon) * kx, 4), round(-(p[1] - lat) * kz, 4)) for p in points]
    plans[key] = dict(name=element['tags'].get('name:en') or element['tags']['name'], anchor=dict(lat=lat, lon=lon), ring=ring,
                      height=heights.get(key) or (26 if key == 'asian_amb' else 22), source=f'https://www.openstreetmap.org/way/{oid}',
                      sourceId='w' + str(oid), version=element.get('version'), timestamp=element.get('timestamp'), official=official,
                      heightBasis='Inherited illustrative height; a map outline does not establish measured facade height.')
    evidence.append(element)
(ROOT / 'game/src/world/destination-hero-data.ts').write_text('// Explicit named OSM bindings; original vertices retained. Facade details and heights are stylised.\nexport const DESTINATION_HERO_PLANS = ' + json.dumps(plans, separators=(',', ':')) + ' as const;\n')
retained = {key: previous[key] for key in ['officialReferences', 'citywideQueryAttempts'] if key in previous}
evidence_path.write_text(json.dumps(dict(retrievedAt=snapshot['retrievedAt'], attribution='© OpenStreetMap contributors; ODbL 1.0', elements=evidence + [amb_point], plans=plans,
    sharedSiteAliases={'sarath_city': {'canonicalId': 'asian_amb', 'sourceId': 'w574673965', 'effect': 'Both map identities retained at the source anchor; canonical Asian/Sarath model alone emits the physical mall and exact clearing. No duplicate inherited cube or rectangular clearing.'}},
    limits='Named map outlines establish footprints/identity. Heights, seating counts and facade details remain illustrative. Asian binding is the named mall way plus contained AMB node n6771713703, independently confirmed by the official tenant directory.', **retained), indent=2) + '\n')
print('Generated exact hero source plans:', ', '.join(plans))
