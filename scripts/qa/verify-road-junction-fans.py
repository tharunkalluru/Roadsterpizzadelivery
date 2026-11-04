"""Independent controls for the exact offline junction-fan functions.

With the four actual export arguments this also replays every authorized
owned-triangle witness. These checks do not approve vehicle or city geometry.
"""
import argparse
import ast
import hashlib
import json
import math
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
for name in ['model', 'footprints', 'tile-transports', 'fixed-tile-constraints', 'conflict-report', 'junction-ledger', 'report']:
    parser.add_argument('--' + name, type=Path)
args = parser.parse_args()
source = args.repo / 'scripts/solve-road-profiles.py'
policy = args.repo / 'docs/qa/evidence/reported-roads/source-9413-authorized-junction-fans.json'
tree = ast.parse(source.read_text())
env = {'math': math}
functions = {'cross', 'clip', 'point_polygon_contact', 'polygons_contact',
             'clip_triangle_progress', 'source_node_fan', 'local_junction_fragment', 'arc'}
for node in tree.body:
    if isinstance(node, ast.FunctionDef) and node.name in functions:
        exec(compile(ast.Module(body=[node], type_ignores=[]), str(source), 'exec'), env)

tests = 0
# Replay the actual classifier's priority: an explicit finite owned proof must
# be considered before inactive/recovery preservation can retain an old gap.
pair_loop = next(node for node in tree.body if isinstance(node, ast.For)
                 and isinstance(node.target, ast.Tuple)
                 and [item.id for item in node.target.elts] == ['a', 'b'])
point_loop = next(node for node in pair_loop.body if isinstance(node, ast.For))
fan_lookup = next(index for index, node in enumerate(point_loop.body)
                  if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name)
                  and target.id == 'local_patch' for target in node.targets))
recovery_guards = [index for index, node in enumerate(point_loop.body)
                   if isinstance(node, ast.If) and 'prepare_component_closure' in ast.unparse(node.test)]
assert recovery_guards and fan_lookup < min(recovery_guards)
tests += 1
cropped = env['clip_triangle_progress']([(0., 0., 0.), (1., 0., 1.), (1., 1., 1.)], 0., .25)
assert cropped and all(point[0] <= .25 + 1e-12 for point in cropped)
tests += 1
fixture_file = args.repo / 'tests/fixtures/solver-finite-source-components-independent.json'
fixtures = json.loads(fixture_file.read_text())['fixtures']
fixture = next(value for value in fixtures.values()
               if len(value['roads']) == 2 and value['roads'][0]['pts'][0] == value['roads'][1]['pts'][0])
roads = {road['id']: road for road in fixture['roads']}
quads = {item['id']: item['quads'] for item in fixture['footprints']}
arcs = {key: env['arc'](road) for key, road in roads.items()}
entries = [(key, 0) for key in roads]
center = fixture['roads'][0]['pts'][0]
fragments, connected = env['source_node_fan']('origin', entries, roads, quads, arcs, center, 3., 4.)
assert connected and all(any(item['road'] == key and env['point_polygon_contact'](center, item['polygon'])
                             for item in fragments) for key in roads)
assert all(not env['point_polygon_contact']((18., 0.), item['polygon']) for item in fragments)
tests += 2
proof = {'roads': list(roads), 'id': 'synthetic-origin'}
env['localJunctionMeshes'] = [(proof, fragments)]
first, second = list(roads)
assert env['local_junction_fragment'](first, 0, second, 0, center) is proof
assert env['local_junction_fragment'](first, 0, 'unrelated-sheet', 0, center) is None
tests += 2

inputs = {'solver': source, 'policy': policy, 'fixture': fixture_file}
actual = [args.model, args.footprints, args.tile_transports, args.fixed_tile_constraints]
assert not any(actual) or all(actual), 'Supply all four bound actual exports.'
if all(actual):
    inputs.update(model=args.model, footprints=args.footprints,
                  tile_transports=args.tile_transports, fixed_tile_constraints=args.fixed_tile_constraints)
    model, footprints, tiles, fixed = [json.loads(path.read_text()) for path in actual]
    authority = json.loads(policy.read_text())
    assert footprints['sourceModelSHA256'] == hashlib.sha256(args.model.read_bytes()).hexdigest()
    assert footprints['sourceModelSHA256'] == tiles['sourceModelSHA256']
    assert model['sourceRoadGeometryGeneration'] == authority['authorization']['sourceRoadGeometryGeneration']
    roads = {road['id']: road for road in model['roads'] + tiles['tileRoads'] + fixed['roads']}
    ribbon = {item['id']: item for item in footprints['roads'] + tiles['footprints'] + fixed['footprints']}
    quads = {key: [[item['R'][i], item['R'][i+1], item['L'][i+1], item['L'][i]]
                  for i in range(len(item['L'])-1)] for key, item in ribbon.items()}
    arcs = {key: env['arc'](road) for key, road in roads.items()}
    meshes = []
    for expected in authority['proofs']:
        node = expected['node']
        entries = [(key, 0 if road['from'] == node else -1) for key, road in roads.items()
                   if node in [road['from'], road['to']]]
        assert {key for key, _ in entries} == set(expected['incidentRoads'])
        assert all(math.dist(roads[key]['pts'][end], expected['center']) < 1e-7 for key, end in entries)
        pieces, valid = env['source_node_fan'](node, entries, roads, quads, arcs, expected['center'],
                                             expected['radius'], expected['maximumModelArcFromNode'])
        assert valid
        meshes.append(({'roads': expected['incidentRoads'], 'id': node}, pieces))
        tests += 1
    env['localJunctionMeshes'] = meshes
    for witness in authority['coveredHeadRows']:
        a, b = witness['roads']
        # Any owning segment is sufficient here; the full solver also checks
        # the exact segment indices before creating each inequality.
        owned = [(proof, pieces) for proof, pieces in meshes if a in proof['roads'] and b in proof['roads']]
        assert any(all(any(item['road'] == road and env['point_polygon_contact'](witness['point'], item['polygon'])
                           for item in pieces) for road in [a, b]) for proof, pieces in owned)
        tests += 1

assert bool(args.conflict_report) == bool(args.junction_ledger)
if args.conflict_report:
    inputs.update(conflictReport=args.conflict_report, junctionLedger=args.junction_ledger)
    ledger = json.loads(args.junction_ledger.read_text())
    env['localJunctionMeshes'] = [(proof, proof['polygons'])
                                for proof in ledger['localJunctionProofs'] if proof['literalConnected']]
    rows = json.loads(args.conflict_report.read_text())['directConflicts']
    assert rows
    for row in rows:
        witness = row['constraint']
        a, b = witness['roads']
        i, j = witness['segments']
        assert env['local_junction_fragment'](a, i, b, j, witness['point']) is not None
        tests += 1

result = {'success': True, 'tests': tests,
          'scope': 'Exact offline fan functions; affine progress, remote re-crossing and unrelated-sheet negatives. Actual witnesses when supplied; no vehicle or release approval.',
          'inputs': {key: hashlib.sha256(path.read_bytes()).hexdigest() for key, path in inputs.items()}}
if args.report:
    with args.report.open('x') as output:
        json.dump(result, output, indent=2)
        output.write('\n')
print(json.dumps(result))
