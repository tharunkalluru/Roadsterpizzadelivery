"""Read-only source/finite-rail classification; never changes negative profiles."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import shapely
from shapely.geometry import LineString, Polygon
from shapely.ops import unary_union
from shapely.strtree import STRtree

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--output', type=Path, required=True)
a = p.parse_args()
assert not a.output.exists()
repo = Path(__file__).resolve().parents[2]
held = {}

def load(path, expected=None):
    path = Path(path)
    b = path.read_bytes()
    digest = hashlib.sha256(b).hexdigest()
    assert expected is None or digest == expected, 'Input changed ' + str(path)
    held[str(path)] = digest
    return json.loads(b)

folder = Path('/tmp/roadster-road-freezes/source-9413-af5-pjr-capacity-v1')
model = load(folder/'model-be04dc1797d38d0112ad8bec9b7a405e5e766aed69f4420ec8200dd4850a72a7.json', 'be04dc1797d38d0112ad8bec9b7a405e5e766aed69f4420ec8200dd4850a72a7')
fp = load(folder/'footprints-5697db58a197b3037e10c77e48cdb64dd16890b0cd5ad15a09ad1d119a95176a.json', '5697db58a197b3037e10c77e48cdb64dd16890b0cd5ad15a09ad1d119a95176a')
joint = load(folder/'jointInputBaseline21-e866b9f8bf2217bd25c7a3d45f28cef541e5fc60dbd7deb353cacaea55ed4b5f.json', 'e866b9f8bf2217bd25c7a3d45f28cef541e5fc60dbd7deb353cacaea55ed4b5f')
source = load(joint['inputs']['sourceGeometry']['path'], joint['sourceDataSHA256'])
necessary = load('/tmp/anandbagh-own-fold-necessary-subset-v2.json')
groups = load('/tmp/source-9413-joint-v5-conflict-groups.json')
held[str(Path(__file__))] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
footprints = {x['id']: x for x in fp['roads']}
roads = {x['id']: x for x in model['roads']}
patches = {x['id']: x for x in source['roads']}
profiles = model['profiles']
lines = [LineString(r['pts']) for r in profiles]
tree = STRtree(lines)

def project(point, patch):
    candidates = []
    for i, (u, v) in enumerate(zip(patch['pts'], patch['pts'][1:])):
        dx, dz = v[0]-u[0], v[1]-u[1]
        t = max(0., min(1., ((point[0]-u[0])*dx+(point[1]-u[1])*dz)/(dx*dx+dz*dz or 1.)))
        distance = math.hypot(point[0]-u[0]-t*dx, point[1]-u[1]-t*dz)
        arc = patch['correctedArc'][i] + t*(patch['correctedArc'][i+1]-patch['correctedArc'][i])
        fraction = patch['sourceFractions'][i] + t*(patch['sourceFractions'][i+1]-patch['sourceFractions'][i])
        candidates.append((distance, arc, fraction))
    best = min(candidates)
    assert best[0] < .075
    assert not any(abs(d-best[0]) < .001 and abs(s-best[1]) > 5 for d, s, f in candidates), 'Ambiguous source branch'
    return best

records = []
for ident in ['28b00d08-4ff_1', '01ceee91-29b_0']:
    road, patch, footprint = roads[ident], patches[ident], footprints[ident]
    primary = next(r for r in necessary['records'] if r['road'] == ident)
    proof = joint['sourceEvidence'][ident.split('_')[0]]
    load(proof['path'], proof['sha256'])
    row = proof['row']
    assert row['id'] == patch['sourceSegmentID'] == primary['sourceSegmentID']
    rail_hits = []
    for i in range(len(road['pts'])-1):
        q = [footprint['R'][i], footprint['R'][i+1], footprint['L'][i+1], footprint['L'][i]]
        triangles = [Polygon([q[0], q[1], q[2]]), Polygon([q[0], q[2], q[3]])]
        literal = unary_union([t for t in triangles if t.area > 1e-10])
        hits = [int(k) for k in tree.query(literal.buffer(4.2)) if literal.distance(lines[int(k)]) <= 4.2]
        rail_hits.append(hits)
    aa = [0.]
    for x, y in zip(road['pts'], road['pts'][1:]):
        aa.append(aa[-1]+math.dist(x, y))
    controls = []
    discrepancies = []
    for i, (point, height) in enumerate(zip(road['pts'], road['elev'])):
        residual, source_arc, fraction = project(point, patch)
        active = [r for r in row['level_rules'] or [] if r['value'] < 0 and (not r['between'] or r['between'][0]-1e-10 <= fraction <= r['between'][1]+1e-10)]
        hits = sorted({k for segment in [i-1, i] if 0 <= segment < len(rail_hits) for k in rail_hits[segment]})
        endpoint = i in [0, len(road['pts'])-1]
        floor = height <= -6.5+1e-8
        immutable = endpoint or bool(hits) or floor
        in_recovery = any(lo-primary['recoveryMetres'] <= aa[i] <= hi+primary['recoveryMetres'] for lo, hi in primary['foldRanges'])
        classification = ('endpoint' if endpoint else 'canonical-rail-finite-corridor' if hits else 'existing-negative-floor' if floor else 'tagged-known-underpass-generated-approach' if active else 'generated-exterior-recovery')
        supplied = next((c for c in primary['controls'] if c['index'] == i), None)
        if supplied:
            assert abs(supplied['officialSourceFraction']-fraction) < 1e-8
            if bool(supplied['canonicalRailFootprint']) != bool(hits):
                discrepancies.append({'control': i, 'independentFiniteRailIDs': [profiles[k]['id'] for k in hits], 'primaryFiniteRail': supplied['canonicalRailFootprint']})
        controls.append({'index': i, 'point': point, 'modelArc': aa[i], 'sourceCorrectedArc': source_arc, 'officialSourceFraction': fraction, 'sourceProjectionResidualM': residual,
                         'inputHeight': height, 'classification': classification, 'officialNegativeIntervalActive': bool(active), 'canonicalFiniteRailIDs': [profiles[k]['id'] for k in hits],
                         'immutableFacilityControl': immutable, 'inExistingFoldRecovery': in_recovery, 'potentialBoundedGeneratedApproach': in_recovery and not immutable,
                         'primarySubsetEligible': supplied['subsetEligible'] if supplied else None})
    direct = next(g for g in groups['groups'] if g['roads'] == [ident, ident])
    counts = {}
    for c in controls:
        counts[c['classification']] = counts.get(c['classification'], 0)+1
    assert not discrepancies, 'Independent finite rail classification differs'
    records.append({'road': ident, 'sourceSegmentID': row['id'], 'sourceArtifact': {'path': proof['path'], 'sha256': proof['sha256']}, 'sourceLevelRules': row['level_rules'], 'sourceRoadFlags': row['road_flags'],
                    'rawSourceProfile': primary['rawSourceProfile'], 'currentProfileIsSurveyed': False, 'controlCounts': counts, 'controls': controls, 'independentRailDiscrepancies': discrepancies,
                    'necessarySubsetFeasible': primary['subsetSuccess'], 'necessarySubsetDirectRows': primary['directRows'], 'worstFullLPWitness': direct['largestActualWitness'],
                    'decision': 'No15cm release is approved: a generated approach may be eligible for a separately held bounded repair, but the tested necessary subset is infeasible. Keep endpoints, actual rail corridor and existing negative floor unchanged.'})

for path, expected in held.items():
    assert hashlib.sha256(Path(path).read_bytes()).hexdigest() == expected
report = {'version': 1, 'scope': 'Independent Shapely distance of literal frozen pavement triangles to canonical staged rail profiles, plus approved corrected-source fraction control classification. No LP/model/source/underpass/manifest mutation.',
          'releaseApproved': False, 'pass': True, 'shapelyVersion': shapely.__version__, 'records': records, 'beforeAfterUnchangedInputs': held,
          'policy': 'Source is_tunnel/-1 verifies the existing facility, not measured metric approach heights. This report grants no new freedom to canonical negative floor/rail/endpoints and does not enlarge the15cm budget or waive grade/headroom/own-fold gates.'}
with a.output.open('x') as f:
    json.dump(report, f, indent=2)
    f.write('\n')
print(json.dumps({'output': str(a.output), 'sha256': hashlib.sha256(a.output.read_bytes()).hexdigest(), 'counts': {r['road']: r['controlCounts'] for r in records}, 'subsetFeasible': {r['road']: r['necessarySubsetFeasible'] for r in records}}))
