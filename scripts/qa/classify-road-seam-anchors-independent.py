"""Read-only structural classification of current positive tile/core seams.

Outputs modeling/feasibility options, never surveyed elevations or runtime
repairs. An unannotated source connector does not establish ground height zero.
Every proposed lowering still needs an authorized coherent policy, exact source
windows, all-overlap solving and independent emitted/full-vehicle acceptance.
"""
import argparse
import ast
import collections
import hashlib
import heapq
import json
import math
from pathlib import Path
import numpy as np

p = argparse.ArgumentParser(description=__doc__)
for name in ['inventory', 'model', 'footprints', 'source-data', 'report']:
    p.add_argument('--' + name, type=Path, required=True)
p.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
a = p.parse_args()
relative = {'source-classification': 'docs/qa/evidence/reported-roads/tile-boundary-source-audit-20261103/classification.json',
            'retained-source': 'docs/qa/evidence/reported-roads/tile-boundary-source-audit-20261103/retained-source-2026-10-21.json',
            'actual-surfaces': 'docs/qa/evidence/reported-roads/source-node-actual-surfaces-diagnostic-9413-v2.json',
            'mapped-levels': 'src/world/bridge-level-data.json', 'solver': 'scripts/solve-road-profiles.py'}
paths = {key: a.repo / value for key, value in relative.items()}
paths.update({name: getattr(a, name.replace('-', '_')) for name in ['inventory', 'model', 'footprints', 'source-data']})
raw = {key: path.read_bytes() for key, path in paths.items()}
data = {key: json.loads(value) for key, value in raw.items() if key != 'solver'}
sha = lambda value: hashlib.sha256(value).hexdigest()
inv, model, source = data['inventory'], data['model'], data['source-data']
assert sha(raw['inventory']) == 'f51343eac0d49a151079a3e6664c5be4c36efb8d1ef3ac6998b58201887b0f50'
assert source['generationID'] == model['sourceRoadGeometryGeneration']
assert data['footprints']['sourceModelSHA256'] == sha(raw['model'])
roads = {r['id']: r for r in model['roads']}
frames = {r['id']: r for r in data['footprints']['roads']}
source_rows = {r['id'][:12]: r for r in data['retained-source']['rows']}
source_repairs = {r['id']: r for r in source['roads']}
classification = {(r['id'], r['node']): r for r in data['source-classification']['rows']}
actual = {r['node']: r for r in data['actual-surfaces']['results']}
mapped = {r['id'] for r in data['mapped-levels']['roads']}
underpasses = set(model['underpassChanges']) | set(model['report']['underpassRoadIds'])

env = {'np': np, 'math': math}
for node in ast.parse(raw['solver']).body:
    if isinstance(node, ast.FunctionDef) and node.name in ['cross', 'bary', 'point_segment_distance', 'railway_quad_distance', 'arc']:
        exec(compile(ast.Module(body=[node], type_ignores=[]), str(paths['solver']), 'exec'), env)
rail_segments = [(x, y) for line in model['profiles'] for x, y in zip(line['pts'], line['pts'][1:])]
rail_grid = collections.defaultdict(list)
for index, (x, y) in enumerate(rail_segments):
    for gx in range(math.floor((min(x[0], y[0]) - 4.2) / 40), math.floor((max(x[0], y[0]) + 4.2) / 40) + 1):
        for gz in range(math.floor((min(x[1], y[1]) - 4.2) / 40), math.floor((max(x[1], y[1]) + 4.2) / 40) + 1):
            rail_grid[gx, gz].append(index)


def first_rail_control(ident, reverse):
    frame, road = frames[ident], roads[ident]
    arc = env['arc'](road)
    quads = [[frame['R'][i], frame['R'][i + 1], frame['L'][i + 1], frame['L'][i]] for i in range(len(arc) - 1)]
    hits = []
    for i, quad in enumerate(quads):
        candidates = set()
        for gx in range(math.floor(min(v[0] for v in quad) / 40), math.floor(max(v[0] for v in quad) / 40) + 1):
            for gz in range(math.floor(min(v[1] for v in quad) / 40), math.floor(max(v[1] for v in quad) / 40) + 1):
                candidates.update(rail_grid.get((gx, gz), []))
        if any(env['railway_quad_distance'](*rail_segments[index], quad) <= 4.2 for index in candidates):
            hits.append(arc[-1] - arc[i + 1] if reverse else arc[i])
    return min(hits) if hits else None


def source_window(road, node, source_row):
    """Estimate only the local annotation boundary; never install this window."""
    if source_row is None: return None
    reverse = road['to'] == node
    repair = source_repairs.get(road['id'])
    if repair:
        start, end = [repair['sourceFractions'][-1], repair['sourceFractions'][0]] if reverse else [repair['sourceFractions'][0], repair['sourceFractions'][-1]]
    else:
        first = [c['at'] for c in source_row['connectors'] if c['connector_id'][:12] == node]
        far_node = road['from'] if reverse else road['to']
        last = [c['at'] for c in source_row['connectors'] if c['connector_id'][:12] == far_node]
        if len(first) != 1 or len(last) != 1: return None
        start, end = first[0], last[0]
    spans = [r.get('between') or [0., 1.] for r in source_row.get('level_rules') or [] if r['value'] != 0]
    spans += [r.get('between') or [0., 1.] for r in source_row.get('road_flags') or [] if set(r['values']) & {'is_bridge', 'is_tunnel'}]
    limit = 1.
    for lo, hi in spans:
        if lo - 1e-9 <= start <= hi + 1e-9: limit = 0.; break
        near = lo if end > start else hi
        u = (near - start) / (end - start) if end != start else 0.
        if 0. <= u <= 1.: limit = min(limit, u)
    return env['arc'](road)[-1] * limit


positive_rows = [r for r in inv['rows'] if any(v['y'] > 1.2 for v in r['currentCoreLevels'])]
by_node = collections.defaultdict(list)
for row in positive_rows: by_node[row['node']].append(row)
out = []
for node, endpoints in sorted(by_node.items()):
    core = {v['id']: v for row in endpoints for v in row['currentCoreLevels']}
    proofs = [classification.get((row['id'], node)) for row in endpoints]
    annotations = [s for proof in proofs if proof for s in [proof['tileSource'], *proof['coreSources']]]
    positive = any(any(v > 0 for v in s['levelValuesAtConnector']) or 'is_bridge' in s['flagsAtConnector'] for s in annotations)
    negative = any(any(v < 0 for v in s['levelValuesAtConnector']) or 'is_tunnel' in s['flagsAtConnector'] for s in annotations)
    reasons = []
    if any(proof is None or not proof['sourceConnectionVerified'] for proof in proofs): reasons.append('missing-original-full-connector-proof')
    if positive: reasons.append('positive-or-bridge-annotation-at-connector')
    if negative: reasons.append('negative-or-tunnel-annotation-at-connector')
    if max(v['y'] for v in core.values()) - min(v['y'] for v in core.values()) > .02: reasons.append('ambiguous-core-arm-height-datums')
    arms = []
    target = min(row['currentEndpointY'] for row in endpoints)
    for ident, value in sorted(core.items()):
        road = roads[ident]
        protected = []
        if ident in mapped: protected.append('mapped-level-authority')
        if ident in underpasses: protected.append('verified-underpass-policy')
        if road.get('expressway'): protected.append('expressway')
        if min(road['elev'] or [0]) < -.001: protected.append('negative-facility-profile')
        rail = first_rail_control(ident, road['to'] == node)
        if rail is not None and rail <= 1e-9: protected.append('canonical-rail-endpoint-control')
        source_row = source_rows.get(ident.rsplit('_', 1)[0])
        if source_row is None: protected.append('missing-retained-full-source-row')
        available = source_window(road, node, source_row)
        if available is None: protected.append('unresolved-local-source-window')
        delta = max(0., value['y'] - target)
        # Necessary/optimistic constraints only: no existing slope budget or
        # perpendicular triangle run is credited as free capacity here.
        grade_bound = delta / .0995
        smooth_bound = max(1.5 * delta / .0995, math.sqrt(6 * delta / .00625))
        usable = min(v for v in [available, rail] if v is not None) if available is not None else None
        arms.append({'road': ident, 'class': road['cls'], 'name': road.get('name'), 'height': value['y'], 'targetModeledHeightOption': target,
                     'necessaryAbsoluteGradeRunM': grade_bound, 'optimisticZeroSlopeSmoothStepRunM': smooth_bound,
                     'estimatedUnannotatedSourceWindowM': available, 'firstCanonicalRailFrozenControlM': rail,
                     'usableLocalWindowEstimateM': usable, 'localSmoothWindowFitsEstimate': usable is not None and usable >= smooth_bound,
                     'protectedReasons': protected})
    if any(arm['protectedReasons'] for arm in arms): reasons.append('protected-or-unresolved-incident-arm')
    category = 'retain-source/facility-authority; explicit-junction-model-required' if reasons else 'coherent-unprotected-approach-lowering-feasibility-option'
    physical = actual.get(node)
    out.append({'node': node, 'tileEndpointRows': len(endpoints), 'tileRoads': sorted({r['id'] for r in endpoints}),
                'classification': category, 'reasons': reasons, 'sourceConnectorCategories': sorted({p['sourceCategory'] for p in proofs if p}),
                'modeledTargetOptionOnly': target, 'targetIsSurveyedHeight': False,
                'actualSurfaceV2': None if physical is None else {'classification': physical['classification'], 'actualSupportGap': physical['actualSupportGap'],
                                                                'missingRoads': physical['missingRoads'], 'ambiguousRoads': physical['ambiguousRoads']},
                'arms': arms, 'allLocalSmoothWindowsFitEstimate': all(arm['localSmoothWindowFitsEstimate'] for arm in arms)})

report = {'scope': __doc__, 'inputs': {key: {'path': str(paths[key].resolve()), 'sha256': sha(value)} for key, value in raw.items()},
          'policy': {'noRuntimeChanges': True, 'zeroIsNotSurveyedGround': True, 'noProtectedOrNegativeLowering': True,
                     'windowDistancesAreEstimates': True, 'requiresExactAllArmSourceClosureAndLP': True,
                     'trueTriangleSlopeLimit': .1, 'coElevationAndActualBodyCapM': .01, 'float32AllowanceM': .001},
          'summary': {'positiveEndpointRows': len(positive_rows), 'positiveNodes': len(out), 'positiveTileRoads': len({r['id'] for r in positive_rows}),
                      'classification': dict(collections.Counter(r['classification'] for r in out)),
                      'reasonNodes': dict(collections.Counter(reason for r in out for reason in r['reasons'])),
                      'candidateNodesAllLocalWindowsFitEstimate': sum(not r['reasons'] and r['allLocalSmoothWindowsFitEstimate'] for r in out)}, 'nodes': out}
# Expand short approaches through every incident source arm. A path alone is
# insufficient: a lowered intermediate shared node must agree on ALL arms.
ends = collections.defaultdict(list)
for road in roads.values():
    for node in {road['from'], road['to']} - {None}: ends[node].append(road['id'])
rail_cache = {(arm['road'], roads[arm['road']]['to'] == node['node']): arm['firstCanonicalRailFrozenControlM'] for node in out for arm in node['arms']}
for node in out:
    if node['reasons']: continue
    radius = max(arm['optimisticZeroSlopeSmoothStepRunM'] for arm in node['arms'])
    queue, visited, windows, blockers = [(0., node['node'])], {}, {}, []
    while queue:
        distance, here = heapq.heappop(queue)
        if distance >= radius or distance >= visited.get(here, math.inf): continue
        visited[here] = distance
        for ident in ends[here]:
            road = roads[ident]
            reverse = road['to'] == here
            aa = env['arc'](road)
            available = source_window(road, here, source_rows.get(ident.rsplit('_', 1)[0]))
            rail_key = ident, reverse
            if rail_key not in rail_cache: rail_cache[rail_key] = first_rail_control(ident, reverse)
            rail = rail_cache[rail_key]
            needed = min(aa[-1], radius - distance)
            authority = ident in mapped or ident in underpasses or road.get('expressway') or min(road['elev'] or [0]) < -.001
            allowed = min(v for v in [available, rail] if v is not None) if available is not None else None
            if authority or allowed is None or needed > allowed + 1e-7:
                blockers.append({'atNode': here, 'road': ident, 'distanceFromAnchor': distance,
                                 'requiredRunHereM': needed, 'availableLocalWindowEstimateM': allowed,
                                 'protectedFacility': bool(authority), 'unresolvedSource': available is None})
                continue
            lo, hi = [aa[-1] - needed, aa[-1]] if reverse else [0., needed]
            windows.setdefault(ident, []).append([lo, hi])
            if distance + aa[-1] < radius:
                far = road['from'] if reverse else road['to']
                full_connectors = []
                for incident in ends[far]:
                    record = source_rows.get(incident.rsplit('_', 1)[0])
                    ids = [] if record is None else [c['connector_id'] for c in record['connectors'] if c['connector_id'][:12] == far]
                    if len(ids) == 1: full_connectors.append(ids[0])
                if len(full_connectors) != len(ends[far]) or len(set(full_connectors)) != 1:
                    blockers.append({'atNode': far, 'road': ident, 'reason': 'Every intermediate incident arm requires matching full source connector proof'})
                else: heapq.heappush(queue, (distance + aa[-1], far))
    for ident, ranges in list(windows.items()):
        merged = []
        for lo, hi in sorted(ranges):
            if merged and lo <= merged[-1][1] + 1e-7: merged[-1][1] = max(merged[-1][1], hi)
            else: merged.append([lo, hi])
        windows[ident] = merged
    node['optimisticAllArmClosure'] = {'radiusM': radius, 'roadModelArcWindows': windows, 'intermediateNodes': sorted(set(visited) - {node['node']}),
                                       'blockers': blockers, 'completeUnderStructuralEstimates': not blockers,
                                       'requiresJointLPAndTriangleBudgetValidation': True}
report['summary']['candidateNodesWithCompleteEstimatedAllArmClosure'] = sum(not node['reasons'] and node['optimisticAllArmClosure']['completeUnderStructuralEstimates'] for node in out)
report['sourceUnchanged'] = all(path.read_bytes() == raw[key] for key, path in paths.items())
assert report['sourceUnchanged'], 'audit inputs changed during execution'
with a.report.open('x') as output: json.dump(report, output, indent=2); output.write('\n')
print(json.dumps(report['summary']))
