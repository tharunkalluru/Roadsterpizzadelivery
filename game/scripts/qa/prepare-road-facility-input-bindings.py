#!/usr/bin/env python3
"""Prepare conservative obstacle coverage and one exact three-owner rebind.

This writes offline INPUT artifacts only. Coverage is never mutable-height
eligibility, and unchanged scoped arrays cannot approve a facility or release.
"""
import argparse
import ast
import copy
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, indent=2, allow_nan=False) + '\n').encode()


def record_sha(value):
    return sha(json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode())


def length(road):
    return sum(math.dist(a, b) for a, b in zip(road['pts'], road['pts'][1:]))


def scoped_core_comparisons(promotion, parent, current, parent_fp, current_fp):
    """Reject any changed full profile or ribbon in the declared local scope."""
    nodes, profiles = [], {}
    for entry in promotion['necessaryDomain']['nodes']:
        node = entry['node']
        old = {(r['id'], end): r for r in parent.values()
               for end in ['from', 'to'] if r.get(end) == node}
        new = {(r['id'], end): r for r in current.values()
               for end in ['from', 'to'] if r.get(end) == node}
        declared = {(a['id'], 'from' if a['end'] == 0 else 'to')
                    for a in entry['arms'] if a['role'] == 'core'}
        assert old.keys() == new.keys() == declared, 'Changed scoped core incidence: ' + node
        arms = []
        for ident, end in sorted(old):
            before, after = old[(ident, end)], new[(ident, end)]
            assert before == after, 'Changed scoped full core profile: ' + ident
            assert parent_fp[ident] == current_fp[ident], 'Changed scoped core footprint: ' + ident
            index = 0 if end == 'from' else -1
            y = (before.get('elev') or [0.] * len(before['pts']))[index]
            declared_arm = next(a for a in entry['arms'] if a['id'] == ident and a['role'] == 'core')
            assert declared_arm['inputY'] == y, 'Changed necessary-domain core datum: ' + ident
            arms.append({'id': ident, 'end': end, 'point': before['pts'][index], 'height': y})
            profiles[ident] = {'id': ident, 'parentProfileSHA256': record_sha(before),
                               'currentProfileSHA256': record_sha(after),
                               'parentFootprintSHA256': record_sha(parent_fp[ident]),
                               'currentFootprintSHA256': record_sha(current_fp[ident]),
                               'fullProfileAndFootprintExactlyEqual': True}
        nodes.append({'node': node, 'actualCoreArms': arms,
                      'priorAllArmSourceProofPresent': entry['allArmSourceProofPresent']})
    return nodes, [profiles[key] for key in sorted(profiles)]


def preserve_context_ranges(prior, parent, current, parent_fp, current_fp):
    """Only unchanged planar controls and literal ribbons inherit old windows."""
    rows, comparisons = {}, []
    for ident, row in prior['roads'].items():
        assert ident in parent and ident in current, 'Missing prior context core road: ' + ident
        assert parent[ident]['pts'] == current[ident]['pts'], 'Changed prior context arclength lineage: ' + ident
        assert parent_fp[ident] == current_fp[ident], 'Changed prior context literal footprint: ' + ident
        total = length(current[ident])
        assert row['ranges'] and all(len(r) == 2 and all(math.isfinite(s) for s in r)
                                    and 0 <= r[0] <= r[1] <= total + 1e-8 for r in row['ranges'])
        rows[ident] = copy.deepcopy(row)
        comparisons.append({'id': ident, 'pointsExactlyEqual': True, 'footprintsExactlyEqual': True,
                            'rangesPreservedExactly': True,
                            'heightProfileChangedWithoutPlanarAuthority':
                            parent[ident].get('elev') != current[ident].get('elev')})
    return rows, comparisons


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    for name in ['model', 'footprints', 'parent-model', 'parent-footprints', 'prior-core-coverage',
                 'assessment', 'tile-transports', 'incidence', 'positive-domain-probes',
                 'owner-promotions', 'source-geometry', 'raw-core', 'mapped-levels',
                 'output-core-coverage', 'output-owner-promotions', 'output-proof']:
        p.add_argument('--' + name, type=Path, required=True)
    a = p.parse_args()
    outputs = [a.output_core_coverage, a.output_owner_promotions, a.output_proof]
    assert len({path.resolve() for path in outputs}) == 3
    assert not any(path.exists() for path in outputs), 'Preserve existing evidence; use new outputs'
    inputs = {}

    def read(key, path, binary=False):
        path = path.resolve()
        data = path.read_bytes()
        inputs[key] = {'path': str(path), 'sha256': sha(data)}
        return data if binary else json.loads(data)

    current = read('model', a.model)
    parent = read('parentModel', a.parent_model)
    current_footprints = read('footprints', a.footprints)
    parent_footprints = read('parentFootprints', a.parent_footprints)
    prior = read('priorCoverage', a.prior_core_coverage)
    assessment = read('assessment', a.assessment)
    supplement = read('tileTransports', a.tile_transports)
    incidence = read('incidence', a.incidence)
    positive = read('positiveDomainProbes', a.positive_domain_probes)
    promotion = read('parentOwnerPromotions', a.owner_promotions)
    source = read('sourceGeometry', a.source_geometry)
    raw_core = read('rawCore', a.raw_core, True)
    mapped = read('mappedLevels', a.mapped_levels)
    generator = read('generator', Path(__file__), True)
    solver_path = a.repo / 'scripts/solve-road-profiles.py'
    solver = read('solver', solver_path, True).decode()
    ref = lambda key: inputs[key]
    assert promotion['version'] == 1 and promotion['kind'] == 'source-bound-joint-owner-promotion'
    assert len(promotion['roads']) == len({r['id'] for r in promotion['roads']}) == 3
    assert promotion['sourceModelSHA256'] == ref('parentModel')['sha256']
    assert prior['sourceModelSHA256'] == ref('parentModel')['sha256']
    assert prior['sourceFootprints']['sha256'] == ref('parentFootprints')['sha256']
    assert parent_footprints['sourceModelSHA256'] == ref('parentModel')['sha256']
    assert current_footprints['sourceModelSHA256'] == ref('model')['sha256']
    assert promotion['sourceCoreSHA256'] == source['sourceCorePackSHA256'] == sha(raw_core)
    assert promotion['sourceDataSHA256'] == ref('sourceGeometry')['sha256']
    assert current['sourceGeometryReference']['sha256'] == parent['sourceGeometryReference']['sha256'] == ref('sourceGeometry')['sha256']
    assert current['sourceRoadGeometryGeneration'] == parent['sourceRoadGeometryGeneration'] == promotion['sourceRoadGeometryGeneration'] == source['generationID']
    assert current['profiles'] == parent['profiles'], 'Canonical railway profiles changed'
    assert assessment['inputs']['modelSHA256'] == supplement['sourceModelSHA256'] == ref('model')['sha256']
    assert assessment['inputs']['sourceGeometrySHA256'] == supplement['sourceDataSHA256'] == ref('sourceGeometry')['sha256']
    assert positive['inputs']['model']['sha256'] == ref('parentModel')['sha256']
    assert positive['inputs']['footprints']['sha256'] == ref('parentFootprints')['sha256']
    assert positive['inputs']['source-data']['sha256'] == ref('sourceGeometry')['sha256']
    assert incidence['inputs']['model']['sha256'] == ref('parentModel')['sha256']
    assert incidence['inputs']['sourceGeometry']['sha256'] == ref('sourceGeometry')['sha256']

    parent_joint_path = Path(promotion['parentJoint']['path'])
    if not parent_joint_path.is_absolute():
        parent_joint_path = a.owner_promotions.parent / parent_joint_path
    joint = read('promotionParentJoint', parent_joint_path)
    assert ref('promotionParentJoint')['sha256'] == promotion['parentJoint']['sha256']
    assert joint['sourceModelSHA256'] == ref('parentModel')['sha256']
    assert joint['sourceDataSHA256'] == ref('sourceGeometry')['sha256']
    for pack, expected in promotion['sourcePackSHA256'].items():
        assert joint['sourcePackSHA256'][pack] == expected
        read('sourcePack:' + pack, a.repo / pack, True)
        assert inputs['sourcePack:' + pack]['sha256'] == expected, 'Changed raw pack: ' + pack

    # Existing hashes were produced by JSON.stringify, so verify with that
    # exact serialization rather than substituting a Python number formatter.
    js = "import{readFileSync}from'node:fs';import{createHash}from'node:crypto';const p=JSON.parse(readFileSync(process.argv[1]));console.log(JSON.stringify(Object.fromEntries(p.roads.map(r=>[r.id,createHash('sha256').update(JSON.stringify(r.expectedFootprint)).digest('hex')]))));"
    literal_hashes = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', js, str(a.owner_promotions.resolve())]))
    owner_checks = []
    for row in promotion['roads']:
        ident = row['id']
        assert row['preserveCoarseControls'] and row['physicalWidth'] == row['expectedPreparedRoad']['w']
        assert row['expectedPreparedRoad'] == next(r for r in joint['contextRoads'] if r['id'] == ident)
        assert row['expectedFootprint'] == next(r for r in joint['contextFootprints'] if r['id'] == ident)
        assert row['footprintSHA256'] == literal_hashes[ident]
        assert row['copies'] == joint['contextCopies'][ident]
        assert row['sourceProof'] == joint['sourceEvidence'][ident.split('_')[0]]
        for copy_row in row['copies']:
            actual_input = dict(copy_row['sourceInput'])
            if copy_row['context'] and copy_row['laneMetadataOmitted']:
                actual_input['lanes'] = row['expected']['lanes']
            assert actual_input == row['expected'], 'Changed owner/context source copy: ' + ident
        owner_checks.append({'id': ident, 'width': row['physicalWidth'],
                             'coarseControls': len(row['expectedPreparedRoad']['pts']),
                             'preparedRoadFootprintCopiesAndSourceProofExactlyEqual': True,
                             'preserveCoarseControls': True})

    old_roads = {r['id']: r for r in parent['roads']}
    roads = {r['id']: r for r in current['roads']}
    old_fp = {r['id']: r for r in parent_footprints['roads']}
    fp = {r['id']: r for r in current_footprints['roads']}
    assert old_roads.keys() == roads.keys() == old_fp.keys() == fp.keys()
    nodes, scoped_profiles = scoped_core_comparisons(promotion, old_roads, roads, old_fp, fp)
    context, lineage = preserve_context_ranges(prior, old_roads, roads, old_fp, fp)

    result = next(r for r in assessment['results'] if r['summary']['grade'] == .065)
    selected = (set(result['changedRoads']) | {r['id'] for r in result['rows']}
                | {r['id'] for n in result.get('sourceCorrectedNodes', []) for r in n.get('tileLevels', [])}
                | {r['id'] for r in assessment['explicitCoreEndpointOwners']}
                | {r['id'] for r in supplement['tileRoads']} | {r['id'] for r in promotion['roads']})
    incident_ids = {r['id'] for r in incidence['roads']}
    assert set(prior['sourceSelectedRoadIDs']) <= selected and incident_ids <= selected
    assert len(prior['roads']) == 1633 and len(prior['sourceSelectedRoadIDs']) == 490
    assert len(selected) == 675 and len(incident_ids) == 109
    assert not selected & roads.keys(), 'Selected detailed ID aliases the core'
    negative = {r['id'] for r in current['roads'] if min(r.get('elev') or [0.]) < -.001}
    assert len(negative) == 250
    positive_ids = {ident for row in positive['results'] for ident in set(row['roads']) | set(row['domains'])}
    assert len(positive['results']) == 296 and positive_ids <= roads.keys()
    assert '664bfec3-f38_0' in positive_ids, 'Formerly frozen Shilpa profile must retain obstacle visibility'
    underpasses = set(current['underpassChanges']) | set(current['report']['underpassRoadIds'])
    function = next(n for n in ast.parse(solver).body if isinstance(n, ast.FunctionDef) and n.name == 'complete_core_context_sets')
    actual = next(n.value for n in function.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'actual' for t in n.targets))
    universe = eval(compile(ast.Expression(actual), str(solver_path), 'eval'),
                    {'core_roads': current['roads'], 'mapped_ids': {r['id'] for r in mapped['roads']}, 'underpass_ids': underpasses})
    full_ids = negative | positive_ids | universe
    additions, expanded = [], []
    for ident in sorted(full_ids):
        total = length(roads[ident])
        if ident in context:
            if not any(lo <= 1e-8 and hi >= total - 1e-8 for lo, hi in context[ident]['ranges']):
                # Preserve every old interval literally, then add conservative
                # full-path visibility without turning either into Y authority.
                context[ident]['ranges'].append([0., total])
                context[ident]['additionalFullExtentIsPhysicalContextOnly'] = True
                expanded.append(ident)
        else:
            context[ident] = {'ranges': [[0., total]], 'reason': 'Conservative complete physical obstacle extent only; no Y eligibility or height authority.'}
            additions.append(ident)
    assert universe <= context.keys() <= roads.keys()
    assert all(context[ident]['ranges'][:len(row['ranges'])] == row['ranges'] for ident, row in prior['roads'].items())
    rebase = {'version': 1, 'parentModel': ref('parentModel'), 'currentModel': ref('model'),
              'parentPromotion': ref('parentOwnerPromotions'), 'parentJoint': ref('promotionParentJoint'),
              'sourceGeometry': ref('sourceGeometry'), 'rawCore': ref('rawCore'),
              'parentFootprints': ref('parentFootprints'), 'currentFootprints': ref('footprints'),
              'necessaryDomainNodes': nodes, 'scopedCoreProfiles': scoped_profiles,
              'ownerChecks': owner_checks, 'canonicalRailProfilesExactlyEqual': True,
              'allPriorProofRecordsRetainedExactly': True, 'onlyPriorFieldChanged': 'sourceModelSHA256',
              'scope': 'Exact unchanged local geometry/copy proof permits this global input binding only. Incomplete source markers and every height/facility/release gate remain unchanged.',
              'researchOnly': True, 'releaseApproved': False}
    rebased = {**copy.deepcopy(promotion), 'sourceModelSHA256': ref('model')['sha256'],
               'scopedModelBindingRebase': rebase, 'researchOnly': True, 'releaseApproved': False}
    assert all(rebased[key] == value for key, value in promotion.items() if key != 'sourceModelSHA256')
    promotion_bytes = encoded(rebased)
    coverage = {'version': 1, 'researchOnly': True, 'releaseApproved': False,
                'scope': 'INACTIVE conservative physical-context INPUT only; no primary variable, Y permission, profile assignment or release approval.',
                'sourceModelSHA256': ref('model')['sha256'], 'sourceSelectedRoadIDs': sorted(selected),
                'sourceFootprints': ref('footprints'), 'sourcePriorCoverage': ref('priorCoverage'),
                'sourceAssessment': ref('assessment'), 'sourceIncidence': ref('incidence'),
                'sourcePositiveDomainProbes': ref('positiveDomainProbes'),
                'sourceOwnerPromotions': {'path': str(a.output_owner_promotions.resolve()), 'sha256': sha(promotion_bytes)},
                'requiredForeignWitnessRoadIDs': prior['requiredForeignWitnessRoadIDs'],
                'roads': dict(sorted(context.items())), 'completePotentiallyGrowableCoreIDs': sorted(universe),
                'fullNegativeCoreRoadIDs': sorted(negative), 'fullPositiveProbeCoreRoadIDs': sorted(positive_ids),
                'completeUniverseRule': {'solver': ref('solver'), 'expression': ast.unparse(actual),
                                         'expressionSHA256': sha(ast.unparse(actual).encode())},
                'summary': {'priorContextRoads': len(prior['roads']), 'priorRangesPreservedExactly': len(lineage),
                            'newContextRoads': len(additions), 'contextRoads': len(context), 'selectedOwners': len(selected),
                            'priorContextRoadsWithAppendedFullExtent': len(expanded),
                            'negativeCoreRoads': len(negative), 'positiveProbeCases': len(positive['results']),
                            'positiveProbeCoreRoads': len(positive_ids), 'potentiallyGrowableCoreRoads': len(universe),
                            'obstacleCoverageDoesNotGrantHeightAuthority': True}}
    coverage_bytes = encoded(coverage)
    proof = {'version': 1, 'researchOnly': True, 'releaseApproved': False,
             'scope': 'Read-only input binding comparisons only; no joint constructed or height authority introduced.',
             'command': [sys.executable, str(Path(__file__).resolve()), *sys.argv[1:]],
             'inputs': inputs, 'generatorSHA256': sha(generator), 'contextLineage': lineage,
             'newContextRoadIDs': additions, 'expandedPriorContextRoadIDs': expanded,
             'promotionScope': rebase, 'summary': coverage['summary'],
             'checks': {'allOld490Selected': True, 'allNew109IncidentOwnersSelected': True,
                        'canonicalRailProfilesUnchanged': True, 'rawPacksUnchanged': len(promotion['sourcePackSHA256']),
                        'scopedNodesUnchanged': len(nodes), 'scopedCoreIncidencesUnchanged': sum(len(n['actualCoreArms']) for n in nodes),
                        'scopedFullCoreProfilesAndFootprintsUnchanged': len(scoped_profiles),
                        'allThreePriorPromotionRecordsUnchanged': True},
             'outputs': {'coverage': {'path': str(a.output_core_coverage.resolve()), 'sha256': sha(coverage_bytes)},
                         'ownerPromotions': {'path': str(a.output_owner_promotions.resolve()), 'sha256': sha(promotion_bytes)}}}
    for item in inputs.values():
        assert sha(Path(item['path']).read_bytes()) == item['sha256'], 'Input changed during preparation: ' + item['path']
    for path, data in [(a.output_owner_promotions, promotion_bytes), (a.output_core_coverage, coverage_bytes), (a.output_proof, encoded(proof))]:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open('xb') as f:
            f.write(data)
    print(json.dumps({'coverage': proof['outputs']['coverage'], 'ownerPromotions': proof['outputs']['ownerPromotions'],
                      'proof': {'path': str(a.output_proof.resolve()), 'sha256': sha(a.output_proof.read_bytes())},
                      'summary': proof['summary'], 'checks': proof['checks']}))


if __name__ == '__main__':
    main()
