#!/usr/bin/env python3
"""Apply exact offline source-bound width/lane metadata, never road XYZ."""
import argparse, copy, hashlib, json, math
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--manifest', type=Path, required=True)
parser.add_argument('--binding', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--proof', type=Path, required=True)
args = parser.parse_args()
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
manifest = json.loads(args.manifest.read_text())
binding = json.loads(args.binding.read_text())
assert binding['version'] == 1 and binding['kind'] == 'source-bound-modeled-pavement-capacity-revision'
for key in ['sourceRoadGeometryGeneration', 'sourceCoreSHA256']:
    assert manifest[key] == binding[key]
assert manifest['sourceData']['sha256'] == binding['sourceDataSHA256']
assert manifest['model']['sha256'] == binding['sourceModelSHA256']
for authority in binding['authorities']:
    assert sha(authority['path']) == authority['sha256'], 'Stale source authority'
reference = manifest['preconditioning']
assert sha(reference['path']) == reference['sha256'], 'Changed immutable pre-stage'
model = json.loads(Path(reference['path']).read_text())
roads = {e['id']: e for e in model['roads']}
assert len(roads) == len(model['roads'])
allowed = {'w', 'lanes', 'joinedPavement', 'sourceLaneIntervals', 'laneEvidence', 'scenerySource'}
changes = []
for entry in binding['roads']:
    road = roads[entry['id']]
    assert road == entry['expected'], 'Stale source-bound capacity input'
    before = copy.deepcopy(road)
    patch = entry['targetMetadata']
    assert set(patch) <= allowed and 0 < patch['w'] <= 30
    assert isinstance(patch['lanes'], int) and 1 <= patch['lanes'] <= 6
    assert patch['w'] + 1e-9 >= patch['lanes'] * 3.2
    assert patch['scenerySource']['pts'] == before['pts'] and patch['scenerySource']['elev'] == before['elev']
    assert patch['scenerySource']['width'] >= max(before['w'], before.get('joinedPavement', {}).get('sourceWidth', 0))
    length = sum(math.dist(a, b) for a, b in zip(road['pts'], road['pts'][1:]))
    for span in patch.get('sourceLaneIntervals', []):
        assert 0 <= span['from'] < span['to'] <= length + 1e-7
        assert span['lanes'] <= patch['lanes'] and span['sourceURL'].startswith('https://api.openstreetmap.org/api/0.6/way/')
    profile = patch.get('joinedPavement')
    if profile:
        assert profile['sourceWidth'] == before['joinedPavement']['sourceWidth']
        assert 0 < profile['taper'] <= 30 and profile['originalWidth'] >= patch['w']
        assert all(0 <= a <= b <= length + 1e-7 for a, b in profile['intervals'])
    road.update(patch)
    assert road['pts'] == before['pts'] and road['elev'] == before['elev']
    if road['id'] not in model['geometryEdits']:
        model['geometryEdits'].append(road['id'])
    changes.append({'id': road['id'], 'widthBefore': before['w'], 'widthAfter': road['w'], 'lanesBefore': before['lanes'], 'lanesAfter': road['lanes'], 'unchangedXYZAndEndpoints': True})
model['capacityProfileCorrection'] = {'bindingSHA256': sha(args.binding), 'sourceManifestSHA256': sha(args.manifest), 'roads': [r['id'] for r in binding['roads']], 'acceptancePending': True}
with args.output.open('x') as file:
    file.write(json.dumps(model, separators=(',', ':')))
proof = {'scope': binding['scope'], 'inputPreconditioningSHA256': reference['sha256'], 'sourceManifestSHA256': sha(args.manifest), 'bindingSHA256': sha(args.binding), 'producerSHA256': sha(__file__), 'outputSHA256': sha(args.output), 'unchangedNodeFieldsAndCanonicalTransport': True, 'changes': changes}
with args.proof.open('x') as file:
    file.write(json.dumps(proof, indent=2) + '\n')
print(json.dumps({'output': str(args.output), 'sha256': sha(args.output), 'changedRoads': len(changes)}))
