"""Compare exact solver historical sampling with the independent WGS84 receipt.

This is a reference-frame audit, not a substitute for city/vehicle acceptance.
The negative control deliberately reinstates inherited-fraction interpolation.
"""
import argparse
import ast
import collections
import gzip
import hashlib
import json
import math
from pathlib import Path
import numpy as np

p = argparse.ArgumentParser(description=__doc__)
for name in ['model', 'historical-model', 'source-data', 'reference', 'tile-transports', 'fixed-tile-constraints', 'report']:
    p.add_argument('--' + name, type=Path, required=True)
p.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
a = p.parse_args()
paths = {name: getattr(a, name.replace('-', '_')) for name in ['model', 'historical-model', 'source-data', 'reference', 'tile-transports', 'fixed-tile-constraints']}
paths['solver'] = a.repo / 'scripts/solve-road-profiles.py'
paths['core'] = a.repo / 'public/city/core.pack.wasm'
inputs = {name: path.read_bytes() for name, path in paths.items()}
sha = lambda value: hashlib.sha256(value).hexdigest()
model = json.loads(inputs['model'])
old = json.loads(inputs['historical-model'])
data = json.loads(inputs['source-data'])
reference = json.loads(inputs['reference'])
assert reference['sourceDataSHA256'] == sha(inputs['source-data'])
assert reference['generationID'] == data['generationID'] == model['sourceRoadGeometryGeneration']
assert reference['sourceCorePackSHA256'] == sha(inputs['core'])
assert reference['policy']['legacyPointFractionsUsed'] is False
assert reference['policy']['legacyHeightsUsed'] is False

env = dict(np=np, math=math, collections=collections)
for node in ast.parse(inputs['solver']).body:
    if isinstance(node, ast.FunctionDef):
        exec(compile(ast.Module(body=[node], type_ignores=[]), str(paths['solver']), 'exec'), env)
roads = {r['id']: r for r in model['roads']}
all_old = {r['id']: r for r in old['roads']}
legacy = {r['id']: r for r in json.loads(gzip.decompress(inputs['core']))['roads']}
tile, fixed = json.loads(inputs['tile-transports']), json.loads(inputs['fixed-tile-constraints'])
roads.update({r['id']: r for r in tile['tileRoads']})
roads.update({r['id']: r for r in fixed['roads']})
legacy.update({r['id']: {**roads[r['id']], **r['expected']} for r in tile['transports']})
legacy.update({r['id']: r for r in fixed['roads']})
repairs = {r['id']: r for r in data['roads']}
available_legacy = set(legacy)
for ident, repair in repairs.items():
    legacy[ident] = {**legacy.get(ident, {}), **repair['expected']}
all_old.update({ident: legacy[ident] for ident in {r['id'] for r in tile['tileRoads']} | {r['id'] for r in fixed['roads']}})
raw_arc = {ident: env['arc'](road) for ident, road in legacy.items()}
arcs = {ident: env['arc'](road) for ident, road in roads.items()}
distances = {}
for ident, repair in repairs.items():
    if ident not in roads: continue
    distances[ident] = env['projected_coordinates'](roads[ident].get('sourceXY', roads[ident]['pts']), repair['pts'], repair['correctedArc'])[0]
env.update(roads=roads, arcs=arcs, sourceDistanceAtControls=distances,
           sourceRepairs=repairs, allSourceLegacy={i: r for i, r in legacy.items() if i in available_legacy}, allOld=all_old,
           legacyRawArcs=raw_arc, historicalPreparedArcs={}, historicalReferenceUnresolved={})
records = {r['id']: r for r in reference['roads']}
groups = collections.defaultdict(list)
for record in records.values(): groups[record['sourceSegmentID']].append(record)
env.update(geographicRecords=records, geographicFamilies=groups)
sources = {s['id']: s for s in data['sources']}
rows, unresolved_independent = [], []

for ident, repair in repairs.items():
    record = records[ident]
    source = sources[record['sourceSegmentID']]
    sample = np.unique(np.r_[np.linspace(0., repair['correctedArc'][-1], 1001), repair['correctedArc']])
    official = np.interp(sample, record['correctedArc'], record['correctedOfficialMetres'])
    corrected_legacy = np.interp(sample, repair['correctedArc'], repair['sourceArc'])
    wrong = np.interp(official / source['geodeticLengthM'], repair['legacyPointFractions'], raw_arc[ident])
    own = (official >= record['legacyOfficialMetres'][0]) & (official <= record['legacyOfficialMetres'][-1])
    expected_legacy = np.interp(official, record['legacyOfficialMetres'], record['legacyArc'])
    row = {'id': ident, 'sourceSegmentID': record['sourceSegmentID'], 'samples': len(sample), 'currentModelPresent': ident in roads,
           'legacyExtensionBeforeM': max(0., -float(min(corrected_legacy))),
           'legacyExtensionAfterM': max(0., float(max(corrected_legacy)) - raw_arc[ident][-1]),
           'maxInheritedFractionLegacyErrorM': float(max(abs(wrong[own] - expected_legacy[own]), default=0.)),
           'maxExplicitLegacyReferenceErrorM': float(max(abs(corrected_legacy[own] - expected_legacy[own]), default=0.)),
           'maxHistoricalHeightDifferenceM': 0., 'maxInheritedHeightErrorM': 0., 'resolvedSamples': 0, 'unresolvedSamples': 0}
    prior = all_old.get(ident, legacy[ident])
    old_arc = env['arc'](prior)
    own_good = np.interp(expected_legacy / raw_arc[ident][-1] * old_arc[-1], old_arc, prior['elev'] or [0.] * len(old_arc))
    own_bad = np.interp(wrong / raw_arc[ident][-1] * old_arc[-1], old_arc, prior['elev'] or [0.] * len(old_arc))
    row['maxInheritedHeightErrorM'] = float(max(abs(own_good[own] - own_bad[own]), default=0.))
    for corrected, at_official in zip(sample, official):
        if ident not in roads: continue
        # Compare at the actual current modeled distance, preserving the source/control map.
        model_s = float(np.interp(corrected, distances[ident], arcs[ident]))
        actual = env['oldAtArc'](ident, model_s)
        candidates = [r for r in groups[record['sourceSegmentID']] if r['legacyOfficialMetres'][0] - 1e-9 <= at_official <= r['legacyOfficialMetres'][-1] + 1e-9]
        if not candidates:
            unresolved_independent.append({'road': ident, 'correctedArc': float(corrected), 'officialMetres': float(at_official)})
            continue
        owned = next((r for r in candidates if r['id'] == ident), candidates[0])
        sibling, expected_local = owned['id'], float(np.interp(at_official, owned['legacyOfficialMetres'], owned['legacyArc']))
        prior = all_old.get(sibling, legacy[sibling])
        aa = env['arc'](prior)
        expected = float(np.interp(expected_local / raw_arc[sibling][-1] * aa[-1], aa, prior['elev'] or [0.] * len(aa)))
        if actual is None:
            row['unresolvedSamples'] += 1
        else:
            row['resolvedSamples'] += 1
            difference = abs(actual - expected)
            if difference > row['maxHistoricalHeightDifferenceM']:
                row['maxHistoricalHeightDifferenceM'] = difference
                row['worstHistoricalComparison'] = {'requestedCorrectedArc': float(corrected), 'actualSourceArc': env['srcS'](ident, model_s),
                                                   'modelArc': model_s, 'officialMetres': float(at_official),
                                                   'geographicSibling': sibling, 'geographicLocalLegacyArc': expected_local,
                                                   'actualHeight': actual, 'geographicHeight': expected}
    rows.append(row)

report = {'scope': __doc__, 'inputs': {key: {'path': str(paths[key].resolve()), 'sha256': sha(value)} for key, value in inputs.items()},
          'roads': rows, 'solverUnresolved': list(env['historicalReferenceUnresolved'].values()),
          'independentCoverageUnresolved': unresolved_independent,
          'summary': {'roads': len(rows), 'currentModelRoads': sum(r['currentModelPresent'] for r in rows), 'roadsWithExtensions': sum(r['legacyExtensionBeforeM'] + r['legacyExtensionAfterM'] > 1e-9 for r in rows),
                      'maximumInheritedFractionLegacyErrorM': max(r['maxInheritedFractionLegacyErrorM'] for r in rows),
                      'maximumExplicitLegacyReferenceErrorM': max(r['maxExplicitLegacyReferenceErrorM'] for r in rows),
                      'maximumInheritedHeightErrorM': max(r['maxInheritedHeightErrorM'] for r in rows),
                      'maximumSolverVsGeographicHeightDifferenceM': max(r['maxHistoricalHeightDifferenceM'] for r in rows),
                      'solverUnresolvedSamples': sum(r['unresolvedSamples'] for r in rows),
                      'independentUnresolvedSamples': len(unresolved_independent)}}
report['sourceUnchanged'] = all(path.read_bytes() == inputs[key] for key, path in paths.items())
assert report['summary']['maximumInheritedFractionLegacyErrorM'] > 1., 'negative control did not exercise the old bug'
assert report['sourceUnchanged'], 'audit input changed during execution'
with a.report.open('x') as output: json.dump(report, output, indent=2); output.write('\n')
print(json.dumps(report['summary']))
