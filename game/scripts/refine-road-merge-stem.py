#!/usr/bin/env python3
"""Offline source-bound common-heading merge stem; never runs in the game."""
import argparse, copy, hashlib, json, math
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--manifest', type=Path, required=True)
parser.add_argument('--binding', type=Path, default=Path('docs/qa/evidence/reported-roads/pv-tail-common-stem-binding-9413.json'))
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--proof', type=Path, required=True)
args = parser.parse_args()
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
manifest = json.loads(args.manifest.read_text())
binding = json.loads(args.binding.read_text())
reference = manifest['preconditioning']
assert sha(reference['path']) == reference['sha256'], 'Changed immutable pre-stage'
model = json.loads(Path(reference['path']).read_text())
assert model['sourceRoadGeometryGeneration'] == binding['sourceRoadGeometryGeneration']
assert manifest['sourceData']['sha256'] == binding['sourceDataSHA256']
assert manifest['sourceCoreSHA256'] == binding['sourceCoreSHA256']
assert sha(binding['sourceAuthority']['path']) == binding['sourceAuthority']['sha256']
roads = {e['id']: e for e in model['roads']}
outgoing = roads[binding['outgoing']]
assert outgoing == binding['expectedOutgoing'] and outgoing['from'] == binding['node']
node = outgoing['pts'][0]
direction = [outgoing['pts'][1][k] - node[k] for k in range(2)]
length = math.hypot(*direction)
assert length > 0
direction = [v / length for v in direction]
stem, fade = binding['stemLength'], binding['fadeEnd']
assert 0 < stem < fade <= 30 and binding['maximumDisplacement'] <= 5
changes = []
for entry in binding['roads']:
    road = roads[entry['id']]
    assert road == entry['expected'] and road['to'] == binding['node'], 'Stale merge input'
    assert road['pts'][-1] == node and not road.get('expressway') and not road.get('workZone')
    before = copy.deepcopy(road)
    arc = [0.]
    for a, b in zip(road['pts'], road['pts'][1:]):
        arc.append(arc[-1] + math.dist(a, b))
    points, controls = [], []
    for index, (point, along) in enumerate(zip(road['pts'], arc)):
        distance = arc[-1] - along
        u = max(0., min(1., (fade - distance) / (fade - stem)))
        weight = u * u * (3 - 2 * u)
        target = [node[k] - direction[k] * distance for k in range(2)]
        moved = [point[k] + weight * (target[k] - point[k]) for k in range(2)]
        if index in (0, len(arc) - 1):
            moved = point.copy()
        delta = math.dist(point, moved)
        assert delta <= binding['maximumDisplacement']
        points.append(moved)
        controls.append({'index': index, 'sourceArc': along, 'remaining': distance, 'displacement': delta})
    road.update(pts=points, sourceArc=before.get('sourceArc', arc), sourceXY=before.get('sourceXY', before['pts']),
                scenerySource=before.get('scenerySource') or {'pts': before['pts'], 'elev': before['elev'], 'width': max(before['w'], before.get('sceneryWidth', 0), before.get('joinedPavement', {}).get('sourceWidth', 0))})
    assert road['pts'][0] == before['pts'][0] and road['pts'][-1] == before['pts'][-1]
    assert road['elev'] == before['elev']
    for key in ['geometryEdits', 'movedRoads']:
        if road['id'] not in model[key]:
            model[key].append(road['id'])
    changes.append({'id': road['id'], 'maximumSourceDisplacement': max(c['displacement'] for c in controls), 'controls': controls})
model['mergeStemCorrection'] = {'bindingSHA256': sha(args.binding), 'sourceManifestSHA256': sha(args.manifest), 'node': binding['node'], 'roads': [e['id'] for e in binding['roads']], 'stemLength': stem, 'fadeEnd': fade, 'acceptancePending': True}
raw = json.dumps(model, separators=(',', ':'))
args.output.write_text(raw)
proof = {'scope': binding['scope'], 'sourceManifest': str(args.manifest), 'sourceManifestSHA256': sha(args.manifest), 'inputPreconditioningSHA256': reference['sha256'], 'bindingSHA256': sha(args.binding), 'producerSHA256': sha(__file__), 'outputSHA256': sha(args.output), 'unchangedHeightAndWidth': True, 'unchangedEndpointsAndNodeFields': True, 'outgoingTangent': direction, 'changes': changes}
args.proof.write_text(json.dumps(proof, indent=2) + '\n')
print(json.dumps({'output': str(args.output), 'sha256': sha(args.output), 'maximumAdditionalDisplacement': max(c['maximumSourceDisplacement'] for c in changes)}))
