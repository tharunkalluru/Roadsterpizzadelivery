#!/usr/bin/env python3
"""Run bounded experiments against an OWN trusted local solver context.

Pickle input must be produced locally by this repository, never downloaded.
Output is diagnostic only and cannot install road profiles or approve release.
"""
import argparse
import ast
import collections
import hashlib
import itertools
import json
import math
from pathlib import Path
import pickle
import time
import numpy as np
from scipy.optimize import linprog
from scipy.sparse import coo_matrix

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--context', type=Path, required=True)
p.add_argument('--profile-probe', type=Path)
p.add_argument('--successful-probe-cases-only', action='store_true', help='Record failed isolated cases and apply only successful cases to this diagnostic')
p.add_argument('--source-proved-domains', action='store_true', help='Diagnostic only: use complete source-proved parameter domains even when their isolated fit is infeasible; never use its solved heights')
p.add_argument('--source-command', type=Path, help='Original bound command to restore immutable constant endpoints in an older local context')
p.add_argument('--finite-conflict-report', type=Path, help='Diagnostic only: bound additional positive approach domains from this same context\'s proved finite-pavement conflicts')
p.add_argument('--ground-carriageway-source', type=Path, help='Complete original source reference for actual parallel, unstructured, common-route ribbons')
p.add_argument('--grade', type=float, default=.1)
p.add_argument('--output', type=Path, required=True)
a = p.parse_args()
experiment_source = Path(__file__).read_bytes()
assert 0 < a.grade <= .1 and not a.output.exists()
assert not (a.successful_probe_cases_only and a.source_proved_domains)
context_bytes = a.context.read_bytes()
context = pickle.loads(context_bytes)
sha = lambda data: hashlib.sha256(data).hexdigest()
assert context['version'] == 1 and context['releaseApproved'] is False
assert sha(context['solverSource']) == context['solverSHA256']
env = dict(np=np, math=math, itertools=itertools, collections=collections, time=time,
           json=json, linprog=linprog, coo_matrix=coo_matrix)
for function in ast.parse(context['solverSource']).body:
    if isinstance(function, ast.FunctionDef):
        exec(compile(ast.Module(body=[function], type_ignores=[]), '<pinned local solver>', 'exec'), env)
env.update(context['state'])
required_constants = {road for _,first,second in env['jointNodeCouplings'] for road,_ in [first,second] if road not in env['roads']}
required_constants |= {road for _,_,tag in env['head_expressions'] for road in tag['roads'] if road not in env['roads']}
required_constants |= {road for _,_,_,tag in env['coupling_expressions'] for road in tag['roads'] if road not in env['roads']}
restored_constants = []
source_bytes = {}
if required_constants:
    assert a.source_command, 'Older context needs its original immutable constant endpoints'
    command = json.loads(a.source_command.read_bytes())['argv']
    records = {}
    for key in ['model', 'tile_transports', 'joint_tile_input', 'fixed_tile_constraints']:
        flag = '--' + key.replace('_', '-')
        path = Path(command[command.index(flag)+1])
        raw = path.read_bytes()
        assert sha(raw) == context['inputs'][key], 'Original constant source changed: ' + key
        source_bytes[path] = raw
        records[key] = json.loads(raw)
    current = {r['id']: r for r in records['model']['roads']}
    current.update({r['id']: r for r in records['tile_transports']['tileRoads']})
    current.update({r['id']: r for r in records['joint_tile_input']['contextRoads'] + records['joint_tile_input']['tileRoads']})
    current.update({r['id']: r for r in records['fixed_tile_constraints']['roads']})
    assert all(current[ident] == road for ident,road in env['roads'].items()), 'Cached variable geometry differs from the original tuple'
    assert required_constants <= current.keys()
    env['roads'].update({ident: current[ident] for ident in required_constants})
    restored_constants = sorted(required_constants)
canonical_before = {k: tuple(env['bounds'][k]) for k in env['canonicalRailControls']}
changed, protected = [], []
omitted_cases = []
probe_digest = None
if a.profile_probe:
    probe_bytes = a.profile_probe.read_bytes()
    probe_digest = sha(probe_bytes)
    probe = json.loads(probe_bytes)
    assert probe['releaseApproved'] is False
    for key in ['model', 'footprints']:
        assert probe['inputs'][key]['sha256'] == context['inputs'][key]
    if a.source_proved_domains:
        cases = probe['results']
        assert all(r.get('classification') != 'unresolved-input-or-physical-guard' for r in cases)
        assert all(r.get('finiteJoinSamples', 0) > 0 and (r.get('sharedSourceEndpointEqualityExact') is True or r.get('sharedSourceEndpointsFixedExactly') is True) for r in cases)
        assert all(r.get('sameSurfaceTolerance') == .008 and r.get('maximumTriangleGrade') == .0995 for r in cases)
        assert all(r.get('gradeChangePerMetre') == .00625 for r in cases)
        # Isolated infeasibility is retained as evidence. Source classification
        # establishes the parameter domain, never the validity of solved Y.
        omitted_cases = []
    elif a.successful_probe_cases_only:
        cases = [r for r in probe['results'] if r['success']]
        omitted_cases = [{k:r.get(k)for k in ['roads','classification','message']} for r in probe['results'] if not r['success']]
        assert cases, 'No isolated case passed'
    else:
        assert all(result['success'] for result in probe['results'])
        cases = probe['results']
    if 'canonical-controls' in probe['inputs']:
        record = probe['inputs']['canonical-controls']
        raw = Path(record['path']).read_bytes()
        assert sha(raw) == record['sha256']
        assert json.loads(raw)['contextSHA256'] == sha(context_bytes), 'Canonical values belong to another context'
    no_rise = set(context['noRiseRoads'])
    proposals = {}
    for result in cases:
        ceiling = result['existingHeightCeiling']
        existing = [max(env['roads'][road]['elev'] or [0.]) for road in result['roads']]
        existing += [h[0] for col,h in canonical_before.items() if any(env['O'][road] <= col < env['O'][road]+len(env['roads'][road]['pts']) for road in result['roads'])]
        assert ceiling == max(existing)
        for road, (lo, hi) in result['domains'].items():
            assert road in env['O'] and road not in env['tileIds']
            edge = env['roads'][road]
            assert edge.get('elevationSource') not in ['surveyed', 'explicit']
            assert road not in env['underpassIds'] and min(edge['elev'] or [0.]) >= 0
            for k, distance in enumerate(env['arcs'][road]):
                column = env['O'][road] + k
                if not lo <= distance <= hi or k in [0, len(edge['pts'])-1]:
                    continue
                if column in canonical_before:
                    protected.append({'road': road, 'control': k})
                    continue
                target = (0., min(ceiling, edge['elev'][k]) if road in no_rise else ceiling)
                if column in proposals:
                    target = (min(target[0],proposals[column]['bounds'][0]),max(target[1],proposals[column]['bounds'][1]))
                proposals[column] = {'road':road,'control':k,'bounds':target}
    for column,proposal in proposals.items():
        prior = tuple(env['bounds'][column]);target=proposal['bounds']
        env['bounds'][column] = target
        if prior != target:
            changed.append({'road':proposal['road'],'control':proposal['control'],'from':prior,'to':target})
    assert a.profile_probe.read_bytes() == probe_bytes
assert canonical_before == {k: tuple(env['bounds'][k]) for k in canonical_before}
ground_carriageway_rows=[]
classification_source_digest=None
classification_function_digest=None
classification_source_path=None
classification_source_bytes=None
if a.ground_carriageway_source:
    raw=a.ground_carriageway_source.read_bytes()
    assert sha(raw)==context['inputs']['additional_source_reference']
    source=json.loads(raw)
    assert source['complete'] and not source['missingPrefixes']
    records={r['id'][:12]:r for r in source['rows']}
    classification_source_path=Path(__file__).parent.parent/'solve-road-profiles.py'
    classification_source_bytes=classification_source_path.read_bytes()
    current_source=classification_source_bytes.decode()
    function=next(n for n in ast.parse(current_source).body if isinstance(n,ast.FunctionDef) and n.name=='source_ground_carriageway_proof')
    classification_source_digest=sha(classification_source_bytes)
    classification_function_digest=sha(ast.dump(function,include_attributes=False).encode())
    proof_scope={}
    exec(compile(ast.Module(body=[function],type_ignores=[]),'<current source ground-route proof>','exec'),proof_scope)
    keep=[]
    for row,bound,tag in env['head_expressions']:
        first,second=[env['roads'][r]for r in tag['roads']]
        i,j=tag['segments']
        da=np.subtract(first['pts'][i+1],first['pts'][i]);db=np.subtract(second['pts'][j+1],second['pts'][j])
        dot=abs(float(np.dot(da,db))/(np.linalg.norm(da)*np.linalg.norm(db)or 1))
        proof=proof_scope['source_ground_carriageway_proof'](first,second,records.get(first['id'][:12]),records.get(second['id'][:12]),dot)
        if not proof:
            keep.append((row,bound,tag));continue
        constant=bound+tag['required']
        new_tag={**tag,'category':'finite-apron-coelevation','offset':0.,'tolerance':.008,'sourceProof':proof}
        env['coupling_expressions'].append((row,constant+.008,-constant+.008,new_tag))
        ground_carriageway_rows.append({'priorConstraint':tag,'sourceProof':proof})
    env['head_expressions']=keep
    assert a.ground_carriageway_source.read_bytes()==raw
finite_domains = []
finite_report_digest = None
if a.finite_conflict_report:
    raw = a.finite_conflict_report.read_bytes()
    previous = json.loads(raw)
    assert previous['schema'] == 'road-conditioning-experiment-v1' and previous['releaseApproved'] is False
    assert previous['contextSHA256'] == sha(context_bytes) and previous['solverSHA256'] == context['solverSHA256']
    finite_report_digest = sha(raw)
    wanted = {tuple(sorted(r['constraint']['roads'])) for r in previous['result']['directConflicts'] if r['constraint']['category'] == 'finite-apron-coelevation'}
    domains = collections.defaultdict(list)
    no_rise = set(context['noRiseRoads'])
    for row, positive, negative, tag in env['coupling_expressions']:
        pair = tuple(sorted(tag['roads']))
        if pair not in wanted or tag['offset'] != 0 or tag['tolerance'] != .008:
            continue
        assert tag['category'] == 'finite-apron-coelevation'
        edges = [env['roads'][road] for road in tag['roads']]
        if any(min(e['elev'] or [0.]) < -.001 or e.get('elevationSource') in ['surveyed','explicit'] for e in edges):
            continue
        ceiling = max([max(e['elev'] or [0.]) for e in edges] + [canonical_before[c][0] for c,_ in row if c in canonical_before])
        if ceiling <= 0:
            continue
        recovery = math.ceil(max(80., 1.5*ceiling/.075, math.sqrt(6*ceiling/.00625)))
        for road,segment in zip(tag['roads'], tag['segments']):
            if road not in env['O'] or road in env['underpassIds'] or road in env['tileIds'] - env['jointTileIds']:
                continue
            aa=env['arcs'][road]
            domains[road].append((max(0.,aa[segment]-recovery), min(aa[-1],aa[segment+1]+recovery), ceiling, pair))
    for road,spans in domains.items():
        e=env['roads'][road]
        for k,distance in enumerate(env['arcs'][road]):
            col=env['O'][road]+k
            if k in [0,len(e['pts'])-1] or col in canonical_before:
                continue
            local=[s for s in spans if s[0] <= distance <= s[1]]
            if not local:
                continue
            ceiling=max(s[2] for s in local)
            prior=tuple(env['bounds'][col]);target=(min(prior[0],0.),max(prior[1],ceiling))
            if road in no_rise:
                target=(target[0],min(target[1],e['elev'][k]))
            env['bounds'][col]=target
            if prior != target:
                finite_domains.append({'road':road,'control':k,'from':prior,'to':target,'sourceProvedPairs':sorted(set(s[3] for s in local))})
    assert canonical_before == {k: tuple(env['bounds'][k]) for k in canonical_before}
    assert a.finite_conflict_report.read_bytes() == raw
result = env['solve'](a.grade)
# Deliberately use a separate diagnostic schema. Do not make this look like a
# production solution that could be passed to generate-road-profile-corrections.
out = {'schema': 'road-conditioning-experiment-v1', 'releaseApproved': False,
       'scope': __doc__, 'contextSHA256': sha(context_bytes), 'solverSHA256': context['solverSHA256'],
       'profileProbeSHA256': probe_digest, 'changedControls': changed, 'retainedCanonicalControls': protected,
       'sourceProvedDomainsOnly': a.source_proved_domains,
       'isolatedInfeasibleCasesRetained': [{k:r.get(k) for k in ['roads','message']} for r in cases if not r['success']] if a.source_proved_domains else [],
       'omittedIsolatedCases': omitted_cases,
       'restoredBoundConstantEndpoints': restored_constants,
       'finiteConflictReportSHA256': finite_report_digest, 'additionalFiniteDomainControls': finite_domains,
       'groundCarriagewayReclassifications': ground_carriageway_rows,
       'experimentSourceSHA256':sha(experiment_source),'groundClassificationSourceSHA256':classification_source_digest,
       'groundClassificationFunctionASTSHA256':classification_function_digest,
       'result': result}
assert a.context.read_bytes() == context_bytes
assert Path(__file__).read_bytes()==experiment_source
if classification_source_path:assert classification_source_path.read_bytes()==classification_source_bytes
assert all(path.read_bytes() == raw for path,raw in source_bytes.items())
with a.output.open('x') as f:
    json.dump(out, f, separators=(',', ':'))
    f.write('\n')
print(json.dumps({'output': str(a.output), 'sha256': sha(a.output.read_bytes()),
                  'success': result['success'], 'directConflicts': len(result['directConflicts']),
                  'changedControls': len(changed), 'releaseApproved': False}))
