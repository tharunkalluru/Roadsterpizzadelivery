"""Classify the two additional literal historical cap/own-strip seams.

Retains the independent parent groups exactly. This Root extension verifies
immutable source connectors, old endpoint geography and both emitted sheets;
it grants only an exact reference envelope, never a new height or structure.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import subprocess

p = argparse.ArgumentParser(description=__doc__)
for name in ['repo', 'historical', 'sources', 'parent', 'diagnosis', 'output']:
    p.add_argument('--' + name, type=Path, required=True)
a = p.parse_args()
assert not a.output.exists()
held = {}
sha = lambda data: hashlib.sha256(data).hexdigest()
def read(path):
    data = path.read_bytes(); held[str(path.resolve())] = sha(data)
    return json.loads(data)
h, source, parent, diagnosis = map(read, [a.historical, a.sources, a.parent, a.diagnosis])
assert h['revision'] == 'a679b72bacefb751057f0282a86571e8e6ef006d'
assert source['release'] == '2026-10-21.0' and source['complete'] and not source['missingPrefixes']
assert parent['pass'] and not parent['releaseApproved']
for path, proof in parent['sourceProof'].items():
    data = subprocess.check_output(['git', 'show', proof['revision'] + ':' + path], cwd=a.repo)
    assert sha(data) == proof['sha256'], 'Historical implementation changed'
rows = {row['id'][:12]: row for row in source['rows']}
roads = {row['id']: row for row in h['roads']}
origin = h['origin'] if 'origin' in h else None
if origin is None:
    geometry_path = next(Path(path) for path in parent['beforeAfterUnchangedInputs'] if 'sourceData-' in Path(path).name)
    origin = read(geometry_path)['origin']
sx = math.cos(math.radians(origin['lat'])) * origin['NR'] * math.pi / 180
sz = origin['MR'] * math.pi / 180
def bary(points, point):
    first, second, third = points
    bx, bz = second[0] - first[0], second[2] - first[2]
    cx, cz = third[0] - first[0], third[2] - first[2]
    det = bx * cz - bz * cx
    if abs(det) < 1e-10: return None
    u = ((point[0] - first[0]) * cz - (point[1] - first[2]) * cx) / det
    v = (bx * (point[1] - first[2]) - bz * (point[0] - first[0])) / det
    return [1-u-v, u, v] if min(1-u-v, u, v) >= -1e-5 else None
def active(rules, fraction):
    return [rule for rule in rules or [] if not rule.get('between') or rule['between'][0] - 1e-12 <= fraction <= rule['between'][1] + 1e-12]
groups = []
for rid, node in [('f28550d2-002_0', 'e02d749d-eef'), ('dbe8d194-2cd_0', '41b2d894-9af')]:
    witnesses = [w for w in diagnosis['historicalReferenceUnresolved'] if w['road'] == rid]
    assert witnesses
    incidents = [road for road in h['roads'] if node in [road['from'], road['to']]]
    proofs = []
    for road in incidents:
        row = rows[road['id'].rsplit('_', 1)[0]]
        connectors = [c for c in row['connectors'] if c['connector_id'][:12] == node]
        assert len(connectors) == 1
        connector = connectors[0]; fraction = connector['at']; assert fraction in [0., 1.]
        wkb = bytes.fromhex(row['geometryWKB']); endian = '<' if wkb[0] == 1 else '>'
        assert struct.unpack_from(endian+'I', wkb, 1)[0] == 2
        count = struct.unpack_from(endian+'I', wkb, 5)[0]
        lon, lat = struct.unpack_from(endian+'dd', wkb, 9 + 16 * (0 if fraction == 0 else count - 1))
        official = [(lon-origin['lon']) * sx, -(lat-origin['lat']) * sz]
        index = 0 if road['from'] == node else len(road['pts']) - 1
        point = road['pts'][index]; residual = math.dist(official, point)
        levels, flags = active(row['level_rules'], fraction), active(row['road_flags'], fraction)
        assert residual <= .075 and not levels and not flags, 'Not a proved local ground connector'
        proofs.append({'roadID': road['id'], 'sourceSegmentID': row['id'], 'connectorID': connector['connector_id'], 'connectorAt': fraction,
                       'oldPoint': point, 'oldEndpointY': (road['elev'] or [0.] * len(road['pts']))[index],
                       'officialLonLat': [lon, lat], 'officialXZ': official, 'sourceProjectionResidualM': residual,
                       'activeLevelRules': levels, 'activeRoadFlags': flags,
                       'sourceArtifact': {'path': str(a.sources.resolve()), 'sha256': held[str(a.sources.resolve())]}})
    assert len(proofs) >= 2 and len({proof['connectorID'] for proof in proofs}) == 1
    mean = sum(proof['oldEndpointY'] for proof in proofs) / len(proofs)
    assert max(p['oldEndpointY'] for p in proofs) - min(p['oldEndpointY'] for p in proofs) <= .25
    bindings = []; has_cap = has_strip = False
    for triangle in h['triangles']:
        if triangle['road'] != rid or not any(bary(triangle['points'], w['point']) is not None for w in witnesses): continue
        for surface in triangle.get('actualSurfaceBindings', [triangle['actualSurface']]):
            quad = surface['structuralQuad']; values = [p[1] for p in quad]
            assert max(values) - min(values) < 1e-12
            cap = bool(triangle.get('cap'))
            assert abs(values[0] - (mean if cap else 0.)) < 1e-12
            if cap:
                has_cap = True
                assert math.dist([quad[0][0], quad[0][2]], roads[rid]['pts'][-1]) < 1e-8
            else: has_strip = True
            bindings.append({'road': rid, 'tile': triangle['tile'], 'literalPoints': triangle['points'],
                             'paintLift': surface['paintLift'], 'structuralQuad': quad, 'triangulatedPatch': cap,
                             'legacySourceBranches': [{'arc': triangle['arc'], 'centre': triangle['centre']}]})
    assert has_cap and has_strip
    groups.append({'node': node, 'fullConnectorID': proofs[0]['connectorID'], 'representativeRoadID': rid,
                   'classification': 'source-proved-local-at-grade-own-cap/strip-support-seam',
                   'witnesses': len(witnesses), 'incidentSourceProofs': proofs,
                   'actualOldCapStructuralY': mean, 'actualOldOwnStripY': 0., 'literalSurfaceBindings': bindings,
                   'independentClearanceStillRequired': True, 'repairApplied': False,
                   'scope': 'Root source/literal-geometry extension. Not a new independent physics or gameplay review.'})
report = dict(parent)
report['groups'] = parent['groups'] + groups
report['scope'] = 'Independent parent groups retained exactly, plus two Root-verified exact historical own-cap/strip seams. No new height, geometry or release approval.'
report['beforeAfterUnchangedInputs'] = dict(parent['beforeAfterUnchangedInputs'], **held)
report['rootExtension'] = {'generatorSHA256': sha(Path(__file__).read_bytes()), 'groups': len(groups), 'parentGroupsPreservedExactly': True,
                           'literalReferenceEnvelopeOnly': True, 'releaseApproved': False}
for path, digest in held.items(): assert sha(Path(path).read_bytes()) == digest
with a.output.open('x') as f:
    json.dump(report, f, indent=2); f.write('\n')
print(json.dumps({'output': str(a.output), 'sha256': sha(a.output.read_bytes()), 'addedGroups': len(groups), 'addedWitnesses': sum(g['witnesses'] for g in groups)}))
