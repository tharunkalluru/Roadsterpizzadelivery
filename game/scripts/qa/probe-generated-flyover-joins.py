#!/usr/bin/env python3
"""Isolated metric-conditioning experiment on actual source-proved ramp joins.

This never modifies runtime data. Feasibility here omits the rest of the city
and cannot approve independent crossing clearance, driving or a release.
"""
import argparse
import ast
import collections
import hashlib
import itertools
import json
import math
from pathlib import Path
import struct
import time
import traceback
import numpy as np
from geographiclib.geodesic import Geodesic
from scipy.optimize import linprog
from scipy.sparse import coo_matrix

p = argparse.ArgumentParser(description=__doc__)
for name in ['repo', 'model', 'footprints', 'source-data', 'source-reference', 'output']:
    p.add_argument('--' + name, type=Path, required=True)
p.add_argument('--release-local-estimated-endpoints', action='store_true', help='Experimental only: release nonshared estimated endpoints inside the local recovery domain; not complete all-arm authority')
p.add_argument('--node-policy', type=Path, help='Restrict the experiment to the existing source-bound generated-node envelopes')
p.add_argument('--pairs', type=Path, help='Data-only list of additional exact shared-source pairs to investigate')
p.add_argument('--use-existing-shared-node-policy', action='store_true', help='Use the existing node envelopes at shared endpoints, with exact endpoint equality')
p.add_argument('--canonical-controls', type=Path, help='Exact source-bound canonical controls, including inherited positive bridge values')
p.add_argument('--joint', type=Path, help='Exact bound detailed owner/context tuple; fixed contexts remain fixed')
p.add_argument('--max-grade', type=float, default=.075, help='Preferred/fallback centreline limit, never above the existing 10 percent global bound')
a = p.parse_args()
assert 0 < a.max_grade <= .1
paths = {key: getattr(a, key.replace('-', '_')) for key in ['model', 'footprints', 'source-data', 'source-reference']}
paths['solver'] = a.repo / 'scripts/solve-road-profiles.py'
paths['mapped-levels'] = a.repo / 'src/world/bridge-level-data.json'
held = {key: path.read_bytes() for key, path in paths.items()}
if a.node_policy:
    paths['node-policy'] = a.node_policy
    held['node-policy'] = a.node_policy.read_bytes()
if a.pairs:
    paths['cases'] = a.pairs
    held['cases'] = a.pairs.read_bytes()
if a.canonical_controls:
    paths['canonical-controls'] = a.canonical_controls
    held['canonical-controls'] = a.canonical_controls.read_bytes()
if a.joint:
    paths['joint'] = a.joint
    held['joint'] = a.joint.read_bytes()
sha = lambda data: hashlib.sha256(data).hexdigest()
model, fp, source, reference = [json.loads(held[key]) for key in ['model', 'footprints', 'source-data', 'source-reference']]
node_policy = json.loads(held['node-policy']) if a.node_policy else None
if node_policy:
    assert node_policy['sourceModelSHA256'] == sha(held['model'])
node_bounds = {r['node']: r['nodeHeightBounds'] for r in node_policy['nodes']} if node_policy else {}
canonical_reference = json.loads(held['canonical-controls']) if a.canonical_controls else None
if canonical_reference:
    assert canonical_reference['sourceModelSHA256'] == sha(held['model']) and canonical_reference['sourceFootprintsSHA256'] == sha(held['footprints'])
assert fp['sourceModelSHA256'] == sha(held['model']) and reference['complete']
mapped = json.loads(held['mapped-levels'])
assert 'not a surveyed altitude' in mapped['uncertainty']
by = {r['id']: r for r in model['roads']}
footprints = {r['id']: r for r in fp['roads']}
fixed_context = set()
selected_detailed = set()
if a.joint:
    joint = json.loads(held['joint'])
    selected_detailed = set(joint['requestedRoadIDs'])
    fixed_context = {r['id'] for r in joint['contextRoads']}
    for road in joint['contextRoads'] + joint['tileRoads']:
        if road['id'] in by:
            assert by[road['id']] == road, 'Joint road disagrees with core'
        by[road['id']] = road
    for record in joint['contextFootprints'] + joint['footprints']:
        if record['id'] in footprints:
            assert footprints[record['id']] == record
        footprints[record['id']] = record
source_rows = {r['id'][:12]: r for r in reference['rows']}
source_geometry_rows = {r['id'][:12]: r for r in source['sources']}
functions = [n for n in ast.parse(held['solver']).body if isinstance(n, ast.FunctionDef)]
origin = source['origin']
kx = math.cos(math.radians(origin['lat'])) * origin['NR'] * math.pi / 180
kz = origin['MR'] * math.pi / 180
pairs = [('1d72e933-8ce_0', '664bfec3-f38_0'), ('5b3d932d-c2d_0', 'ac6bc470-258_0'), ('ba9832c2-2ca_0', 'c898d540-669_0')]
if a.pairs:
    pairs = [tuple(row) for row in json.loads(held['cases'])['pairs']]
    assert pairs and len(pairs) == len(set(pairs)) and all(len(pair) == 2 and len(set(pair)) == 2 for pair in pairs)
assert not a.use_existing_shared_node_policy or a.node_policy
results = []
for pair in pairs:
    try:
        env = dict(np=np, math=math, itertools=itertools, collections=collections, json=json, time=time)
        for function in functions:
            exec(compile(ast.Module(body=[function], type_ignores=[]), str(paths['solver']), 'exec'), env)
        roads = {ident: by[ident] for ident in pair}
        for road in roads.values():
            assert road.get('elevationSource') not in ['surveyed', 'explicit'] and min(road['elev'] or [0.]) >= 0
            if road.get('expressway'):
                assert 'not a survey' in road['expressway']['uncertainty']
        arcs = {ident: env['arc'](r) for ident, r in roads.items()}
        quads = {ident: [[footprints[ident]['L'][k], footprints[ident]['R'][k], footprints[ident]['R'][k+1], footprints[ident]['L'][k+1]] for k in range(len(r['pts'])-1)] for ident, r in roads.items()}
        grid = {}
        for ident, qs in quads.items():
            local = collections.defaultdict(set)
            for j, q in enumerate(qs):
                for x in range(math.floor(min(p[0] for p in q)/40), math.floor(max(p[0] for p in q)/40)+1):
                    for z in range(math.floor(min(p[1] for p in q)/40), math.floor(max(p[1] for p in q)/40)+1):
                        local[x,z].add(j)
            grid[ident] = local
        fractions = {}
        local_layers = {}
        for ident, r in roads.items():
            prefix = ident.split('_')[0]
            if prefix in source_rows:
                row = source_rows[prefix]
                data = bytes.fromhex(row['geometryWKB']); endian = '<' if data[0] == 1 else '>'
                assert struct.unpack_from(endian+'I', data, 1)[0] == 2
                points = [struct.unpack_from(endian+'dd', data, 9+16*k) for k in range(struct.unpack_from(endian+'I', data, 5)[0])]
                local_layers[prefix] = row['level_rules'] or []
            else:
                row = source_geometry_rows[prefix]
                points = row['geometryLonLat']
                local_layers[prefix] = row['levelRules'] or []
            cumulative = [0.]
            for b, c in zip(points, points[1:]):
                cumulative.append(cumulative[-1]+Geodesic.WGS84.Inverse(b[1], b[0], c[1], c[0])['s12'])
            xy = [[(lon-origin['lon'])*kx, -(lat-origin['lat'])*kz] for lon, lat in points]
            fractions[ident], error = env['projected_coordinates'](r.get('sourceXY', r['pts']), xy, [x/cumulative[-1] for x in cumulative])
            assert error < .2
        env.update(roads=roads, arcs=arcs, qs=quads, qgrid=grid, overlapMemo={}, fragmentPolygons={}, cellPolygons=collections.defaultdict(list),
                   cellContactCache={}, cellConnectivityCache={}, ambiguousOverlapCells=set(),
                   args=argparse.Namespace(minimum_polygon_area=1e-6, additional_source_reference=True), sourceMetadataMissing=set(),
                   layers=local_layers,
                   sourceOffsets={}, sourceTotals={}, sourceDistanceAtControls={}, officialFractionAtControls=fractions, exactSourceFractions={})
        samples = env['overlap'](*pair)
        joined = env['source_node_components'](*pair, samples)
        selected = []
        for i,u,j,v,point in samples:
            first = arcs[pair[0]][i]*(1-u) + arcs[pair[0]][i+1]*u
            second = arcs[pair[1]][j]*(1-v) + arcs[pair[1]][j+1]*v
            if (i,j) in joined and env['level'](pair[0], first) == env['level'](pair[1], second):
                selected.append((i,u,j,v,point))
        assert selected and not env['ambiguousOverlapCells']
        offsets = {pair[0]: 0, pair[1]: len(roads[pair[0]]['pts'])}
        base = np.array([y for ident in pair for y in (roads[ident]['elev'] or [0.]*len(roads[ident]['pts']))])
        count = len(base)
        retained_canonical = [h for ident in pair for h in canonical_reference['controls'].get(ident,{}).values()] if canonical_reference else []
        ceiling = max([*base, *retained_canonical])
        recovery = math.ceil(max(80., 1.5*ceiling/.075, math.sqrt(6*ceiling/.00625)))
        spans = {ident: [] for ident in pair}
        for i,u,j,v,point in selected:
            for ident,k in [(pair[0],i),(pair[1],j)]:
                spans[ident].append([arcs[ident][k], arcs[ident][k+1]])
        domains = {ident: [max(0., min(x[0] for x in spans[ident])-recovery), min(arcs[ident][-1], max(x[1] for x in spans[ident])+recovery)] for ident in pair}
        bounds = [(h,h) for h in base]
        canonical = []
        shared_nodes = {roads[pair[0]]['from'], roads[pair[0]]['to']} & {roads[pair[1]]['from'], roads[pair[1]]['to']}
        released_endpoints = []
        for ident, r in roads.items():
            for k, distance in enumerate(arcs[ident]):
                endpoint = k in [0,len(r['pts'])-1]
                node = r['from'] if k == 0 else r['to'] if k == len(r['pts'])-1 else None
                eligible = ident not in fixed_context and (not endpoint or a.release_local_estimated_endpoints and (node not in shared_nodes or a.use_existing_shared_node_policy))
                if endpoint and a.node_policy and node not in node_bounds:
                    eligible = False
                if eligible and domains[ident][0] <= distance <= domains[ident][1]:
                    bounds[offsets[ident]+k] = tuple(node_bounds[node]) if endpoint and a.node_policy else (0., ceiling)
                    if endpoint:
                        released_endpoints.append({'road': ident, 'control': k, 'node': node, 'inputHeight': base[offsets[ident]+k]})
            near_rails = [rail for rail in model['profiles'] if env['near'](r, rail)]
            for k, q in enumerate(quads[ident]):
                box = [min(p[0]for p in q)-4.2,max(p[0]for p in q)+4.2,min(p[1]for p in q)-4.2,max(p[1]for p in q)+4.2]
                if any(env['railway_quad_distance'](b,c,q) <= 4.2 for rail in near_rails for b,c in zip(rail['pts'],rail['pts'][1:])
                       if min(b[0],c[0])<=box[1] and max(b[0],c[0])>=box[0] and min(b[1],c[1])<=box[3] and max(b[1],c[1])>=box[2]):
                    for index in [k,k+1]:
                        height = canonical_reference['controls'].get(ident,{}).get(str(index)) if canonical_reference else base[offsets[ident]+index]
                        assert height is not None, 'Canonical geometry disagrees with the bound control reference'
                        column = offsets[ident]+index; bounds[column]=(height,height);canonical.append(column)
        if canonical_reference:
            expected_canonical = {offsets[ident]+int(k) for ident in pair for k in canonical_reference['controls'].get(ident,{})}
            assert set(canonical) == expected_canonical, 'Canonical control inventory changed'
        released_endpoints = [r for r in released_endpoints if bounds[offsets[r['road']]+r['control']][0] != bounds[offsets[r['road']]+r['control']][1]]
        rows, cols, values, rhs = [], [], [], []
        def add(items, value):
            index = len(rhs); rhs.append(value)
            for col, coefficient in items:
                rows.append(index); cols.append(col); values.append(coefficient)
        for ident,r in roads.items():
            offset=offsets[ident]; aa=arcs[ident]; f=footprints[ident]
            for k in range(len(aa)-1):
                if bounds[offset+k][0] == bounds[offset+k][1] and bounds[offset+k+1][0] == bounds[offset+k+1][1]:
                    continue
                run = min(env['cross_section_run'](f['R'][k],f['R'][k+1],f['L'][k+1]),env['cross_section_run'](f['L'][k+1],f['R'][k],f['L'][k]))
                limit = min(a.max_grade*(aa[k+1]-aa[k]), .0995*run)
                add([(offset+k+1,1.),(offset+k,-1.)],limit);add([(offset+k+1,-1.),(offset+k,1.)],limit)
            for k in range(1,len(aa)-1):
                if all(bounds[offset+n][0] == bounds[offset+n][1] for n in [k-1,k,k+1]):continue
                b,c=aa[k]-aa[k-1],aa[k+1]-aa[k]
                row=[(offset+k-1,1/b),(offset+k,-1/b-1/c),(offset+k+1,1/c)];limit=.00625*(b+c)/2
                add(row,limit);add([(col,-v)for col,v in row],limit)
        for i,u,j,v,point in selected:
            row=[(offsets[pair[0]]+i,1-u),(offsets[pair[0]]+i+1,u),(offsets[pair[1]]+j,-1+v),(offsets[pair[1]]+j+1,-v)]
            add(row,.008);add([(col,-v)for col,v in row],.008)
        for node in shared_nodes - {None}:
            first = offsets[pair[0]] + (0 if roads[pair[0]]['from'] == node else len(roads[pair[0]]['pts'])-1)
            second = offsets[pair[1]] + (0 if roads[pair[1]]['from'] == node else len(roads[pair[1]]['pts'])-1)
            add([(first,1.),(second,-1.)],0.);add([(first,-1.),(second,1.)],0.)
        for k,h in enumerate(base):
            add([(k,1.),(count+k,-1.)],h);add([(k,-1.),(count+k,-1.)],-h)
        matrix=coo_matrix((values,(rows,cols)),shape=(len(rhs),2*count)).tocsr()
        result=linprog(np.r_[np.zeros(count),np.ones(count)],A_ub=matrix,b_ub=rhs,bounds=bounds+[(0,None)]*count,method='highs',options={'time_limit':30.})
        report={'roads':list(pair),'success':bool(result.success),'message':result.message,'controls':count,'finiteJoinSamples':len(selected),'existingHeightCeiling':ceiling,'recoveryMeters':recovery,'domains':domains,'canonicalControls':sorted(set(canonical)),
                'sharedSourceEndpointsFixedExactly':not a.use_existing_shared_node_policy,'sharedSourceEndpointEqualityExact':True,'releasedEstimatedEndpoints':released_endpoints,'maximumGrade':a.max_grade,'maximumTriangleGrade':.0995,'gradeChangePerMetre':.00625,'sameSurfaceTolerance':.008}
        if result.success:
            y=result.x[:count]
            assert max(matrix@result.x-np.array(rhs)) < 1e-7
            assert all(y[col] == bounds[col][0] for col in canonical)
            report.update(maximumAdjustment=float(max(abs(y-base))),solvedHeights={ident:y[offsets[ident]:offsets[ident]+len(roads[ident]['pts'])].tolist() for ident in pair})
        results.append(report)
        print(json.dumps({'phase':'isolated-join-result','roads':list(pair),'success':report['success'],'casesDone':len(results),'casesTotal':len(pairs)}),flush=True)
    except (AssertionError, KeyError) as error:
        frame = traceback.extract_tb(error.__traceback__)[-1]
        report = {'roads': list(pair), 'success': False, 'classification': 'unresolved-input-or-physical-guard', 'message': type(error).__name__ + ' : ' + str(error), 'guard': {'file':frame.filename,'line':frame.lineno,'expression':frame.line}}
        results.append(report)
        print(json.dumps({'phase':'isolated-join-guard', 'roads':list(pair), 'message':report['message'], 'casesDone':len(results), 'casesTotal':len(pairs)}),flush=True)

assert all(path.read_bytes() == held[key] for key,path in paths.items())
out={'scope':__doc__,'releaseApproved':False,'inputs':{key:{'path':str(paths[key]),'sha256':sha(data)}for key,data in held.items()},'generatorSHA256':sha(Path(__file__).read_bytes()),'results':results}
with a.output.open('x') as f:
    json.dump(out,f,indent=2);f.write('\n')
print(json.dumps({'cases':len(results),'successful':sum(r['success']for r in results),'guardFailures':sum(r.get('classification')=='unresolved-input-or-physical-guard'for r in results),'output':str(a.output),'sha256':sha(a.output.read_bytes())}))
