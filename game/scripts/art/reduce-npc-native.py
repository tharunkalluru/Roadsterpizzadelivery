"""CPU edge-collapse reduction of one native, fully joined CC0 human mesh.

Requires numpy + fast-simplification 0.2.0. Run derive-npc-human.mjs first.
The official replay API preserves shared topology across all six morphs and
returns the old/new correspondence used to transfer source skin influences.
"""
import json
from pathlib import Path
import numpy as np
import fast_simplification as fs

ROOT = Path(__file__).resolve().parents[2]
raw = json.loads(Path('/tmp/roadster-npc-native-v4.json').read_text())
positions = {k: np.asarray(v, dtype=np.float64).reshape((-1, 3)) for k, v in raw['positions'].items()}
triangles = np.asarray(raw['indices'], dtype=np.int32).reshape((-1, 3))
source_ids = np.asarray(raw['skinIndex'], dtype=np.int32).reshape((-1, 4))
source_weights = np.asarray(raw['skinWeight'], dtype=np.float64).reshape((-1, 4))

def topology(faces):
    edges = np.sort(np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]]), axis=1)
    _, counts = np.unique(edges, axis=0, return_counts=True)
    return {'boundaryEdges': int(np.sum(counts == 1)), 'nonManifoldEdges': int(np.sum(counts > 2))}

def reduce(target):
    points, faces, collapses = fs.simplify(positions['male-young'], triangles, target_count=target,
        agg=5.0, preserve_border=True, return_collapses=True)
    variants, mapping, reference_faces = {}, None, None
    for name, original in positions.items():
        reduced, replay_faces, correspondence = fs.replay_simplification(original, triangles, collapses)
        if reference_faces is None:
            reference_faces, mapping = replay_faces, correspondence
        else:
            assert np.array_equal(reference_faces, replay_faces), 'morph topology must remain identical'
        variants[name] = np.round(reduced, 7).reshape(-1).tolist()
    influence = np.zeros((len(variants['male-young']) // 3, 17), dtype=np.float64)
    contributors = np.zeros(len(influence), dtype=np.float64)
    for old_index, new_index in enumerate(mapping):
        if new_index < 0:
            continue
        contributors[new_index] += 1
        for bone, weight in zip(source_ids[old_index], source_weights[old_index]):
            influence[new_index, bone] += weight
    order = np.argsort(-influence, axis=1)[:, :4]
    values = np.take_along_axis(influence, order, axis=1)
    values /= np.maximum(values.sum(axis=1, keepdims=True), 1e-12)
    assert np.all(np.abs(values.sum(axis=1) - 1) < 1e-6)
    result = {'vertexCount': len(influence), 'triangleCount': len(reference_faces), 'indices': reference_faces.reshape(-1).tolist(),
        'positions': variants, 'skinIndex': order.reshape(-1).tolist(), 'skinWeight': np.round(values, 7).reshape(-1).tolist(),
        'topology': topology(reference_faces)}
    # Edge collapse must not create open limb/torso edges. Anatomical source
    # openings (eyes/mouth) are retained, rather than spreading new body holes.
    assert result['topology']['boundaryEdges'] <= topology(triangles)['boundaryEdges'], result['topology']
    assert result['topology']['nonManifoldEdges'] == 0, result['topology']
    return result

out = {k: v for k, v in raw.items() if k not in ['positions', 'indices', 'skinIndex', 'skinWeight']}
out['derivation'] = 'Native joined head/neck/body; quadratic edge collapses with preserve_border and identical collapse replay for each morph; source skeletal influences transferred by correspondence.'
out['sourceTopology'] = topology(triangles)
out['human'] = reduce(4700)
out['humanLow'] = reduce(2300)
target = ROOT / 'src/world/npc-human-v4.json'
target.write_text(json.dumps(out, separators=(',', ':')) + '\n')
print(json.dumps({'detailed': {k: out['human'][k] for k in ['vertexCount', 'triangleCount', 'topology']},
    'reduced': {k: out['humanLow'][k] for k in ['vertexCount', 'triangleCount', 'topology']}, 'source': out['sourceTopology'], 'bytes': target.stat().st_size}))
