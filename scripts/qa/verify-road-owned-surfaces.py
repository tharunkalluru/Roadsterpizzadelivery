"""Exact-function own-ribbon controls, including a remote-loop negative."""
import argparse
import ast
import collections
import hashlib
import itertools
import json
import math
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
parser.add_argument('--report', type=Path)
args = parser.parse_args()
path = args.repo / 'scripts/solve-road-profiles.py'
source = path.read_bytes()
namespace = {'math': math, 'collections': collections, 'itertools': itertools}
names = {'cross', 'clip', 'bary', 'coeff', 'owned_surface_intersections'}
for node in ast.parse(source).body:
    if isinstance(node, ast.FunctionDef) and node.name in names:
        exec(compile(ast.Module(body=[node], type_ignores=[]), str(path), 'exec'), namespace)


def records(points, left, right, distances):
    edge = {'pts': points, 'from': 'start-source-node', 'to': 'different-end-source-node'}
    ribbon = {'L': left, 'R': right}
    quads = [[right[i], right[i+1], left[i+1], left[i]] for i in range(len(points)-1)]
    return list(namespace['owned_surface_intersections']('owned-road', edge, quads, ribbon, distances, 1e-6))


straight = records([[0, 0], [10, 0]], [[0, 1], [10, 1]], [[0, -1], [10, -1]], [0, 10])
assert not straight, 'A convex strip has no positive-area own overlap.'
bowtie = records([[0, 0], [1, 0]], [[0, 1], [1, -1]], [[0, -1], [1, 1]], [0, 1])
assert bowtie and all(item['local'] for item in bowtie)
assert any(item['segments'] == [0, 0] for item in bowtie), 'Same-quad folds must be observed.'
coarse = records([[0, 0], [100, 0], [100.5, 0]],
                 [[0, 1], [100, 1], [101.5, -1]], [[0, -1], [100, -1], [99.5, 1]], [0, 100, 100.5])
assert any(item['segments'] == [0, 1] and item['local'] for item in coarse), 'Locality follows actual affine progress, not complete coarse-quad lengths.'
points = [[0, 0], [10, 0], [100, 100], [0, 0], [10, 0]]
left = [[0, 1], [10, 1], [100, 101], [0, 1], [10, 1]]
right = [[0, -1], [10, -1], [100, 99], [0, -1], [10, -1]]
remote = records(points, left, right, [0, 10, 144.536, 285.958, 295.958])
crossings = [item for item in remote if item['segments'] == [0, 3]]
assert crossings and all(not item['local'] for item in crossings), 'Distant source loops cannot acquire a coplanarity exemption.'
result = {'tests': 5, 'success': True, 'solverSHA256': hashlib.sha256(source).hexdigest(),
          'scope': 'Exact offline self-surface functions: convex, bowtie, coarse local source progress, remote loop. No vehicle or release approval.'}
if args.report:
    with args.report.open('x') as output:
        json.dump(result, output, indent=2)
        output.write('\n')
print(json.dumps(result))
