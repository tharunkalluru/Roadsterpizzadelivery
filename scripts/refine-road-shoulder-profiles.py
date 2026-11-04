#!/usr/bin/env python3
"""Apply exact source-bound offline shoulder profiles; never edit source packs."""
import argparse, bisect, copy, hashlib, json, math
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
for name in ['manifest', 'binding', 'output', 'proof']:
    p.add_argument('--' + name, type=Path, required=True)
a = p.parse_args()
assert not a.output.exists() and not a.proof.exists(), 'Choose fresh outputs'
sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
m, binding = json.loads(a.manifest.read_text()), json.loads(a.binding.read_text())
assert binding['sourceManifestSHA256'] == sha(a.manifest)
for key in ['preconditioning', 'model', 'sourceData']:
    assert sha(m[key]['path']) == m[key]['sha256'], 'Stale source input'
assert binding['sourceModelSHA256'] == m['model']['sha256']
pre = json.load(open(m['preconditioning']['path']))
world = json.load(open(m['model']['path']))
assert pre['sourceRoadGeometryGeneration'] == binding['sourceRoadGeometryGeneration']
old = {e['id']: e for e in world['roads']}
source = {r['id'][:12]: r for r in binding['retainedSource']['rows']}
assert all(not r['width_rules'] and not r['level_rules'] and not r['road_flags'] for r in source.values())
for response in binding['exactOSM']['rows']:
    tags = response['response']['elements'][0]['tags']
    assert not any(k in tags for k in ['width', 'lanes', 'lanes:forward', 'lanes:backward', 'bridge', 'layer', 'tunnel'])
targets, proof = {}, []
for row in binding['roads']:
    ident = row['id']
    assert old[ident] == row['expected'], 'Source/model road changed'
    e = copy.deepcopy(old[ident])
    assert ident[:12] in source and e['lanes'] == row['modeledLanes'] == 2 and e['oneway']
    assert e['elev'] is None and not e.get('expressway') and not e.get('laneEvidence')
    points, arc = e['pts'], [0.]
    for b, c in zip(points, points[1:]):
        arc.append(arc[-1] + math.dist(b, c))
    samples = [0.]
    for b, c in zip(arc, arc[1:]):
        count = max(1, math.ceil((c - b) / row['maximumControlSpacing']))
        samples.extend(b + (c - b) * k / count for k in range(1, count + 1))
    dense = []
    for s in samples:
        j = max(1, min(len(arc) - 1, bisect.bisect_left(arc, s)))
        u = (s - arc[j - 1]) / (arc[j] - arc[j - 1])
        dense.append([points[j - 1][k] + (points[j][k] - points[j - 1][k]) * u for k in [0, 1]])
    e.update(pts=dense, sourceXY=copy.deepcopy(dense), sourceArc=samples,
             w=row['width'], joinedPavement=row['profile'], sceneryWidth=max(9.4, e.get('sceneryWidth', 0)),
             scenerySource={'pts': points, 'elev': e['elev'], 'width': 9.4})
    targets[ident] = e
    proof.append({'id': ident, 'sourceControls': len(points), 'modelControls': len(dense),
                  'centerlinePathUnchanged': True, 'heightUnchanged': True, 'profile': row['profile']})
assert len(targets) == 2
pre['roads'] = [targets.get(e['id'], e) for e in pre['roads']]
for ident in targets:
    if ident not in pre['geometryEdits']:
        pre['geometryEdits'].append(ident)
pre['minimalShoulderCorrection'] = {'bindingSHA256': sha(a.binding), 'previousManifestSHA256': sha(a.manifest),
                                    'roads': list(targets), 'physicalAcceptance': False}
a.output.write_text(json.dumps(pre, separators=(',', ':')))
result = {'sourceManifestSHA256': sha(a.manifest), 'bindingSHA256': sha(a.binding),
          'outputSHA256': sha(a.output), 'roads': proof,
          'scope': 'Exactly two offline width/sampling records. All other preconditioning roads/nodes/rail are unchanged; no runtime installation or global physical acceptance.'}
a.proof.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
