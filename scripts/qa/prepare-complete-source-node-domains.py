#!/usr/bin/env python3
"""Prepare inactive, sign-separated all-arm node-domain research evidence.

This never changes a policy, endpoint, context, matrix or height. In particular,
a zero detailed arm's existing [0,0] envelope is never replaced by its separately
reported requested negative facility extension. A reviewed consumer and fresh
global feasibility/acceptance are required before any domain can be applied.
"""
import argparse
import collections
import gzip
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import pickle
import sys
import uuid


def sha(data):
    return hashlib.sha256(data).hexdigest()


def file_sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def canonical_sha(value):
    return sha(json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode())


def expression_sha(rows):
    h = hashlib.sha256()
    for row in rows:
        h.update(json.dumps(row, sort_keys=True, separators=(',', ':'), allow_nan=False).encode())
        h.update(b'\n')
    return h.hexdigest()


def intersect_envelopes(envelopes):
    if not envelopes or any(len(v)!=2 or not all(math.isfinite(x) for x in v) or v[0]>v[1] for v in envelopes):
        return None
    low, high = max(v[0] for v in envelopes), min(v[1] for v in envelopes)
    return [low, high] if low <= high else None


def connector(row, node):
    """A truncated alias never substitutes for a unique actual full UUID."""
    if not row:
        return None
    try:
        if str(uuid.UUID(row['id'])) != row['id']:
            return None
    except (ValueError, TypeError, AttributeError):
        return None
    matches = [c for c in row.get('connectors',[]) if isinstance(c.get('connector_id'),str) and c['connector_id'][:12] == node]
    if len(matches) != 1:
        return None
    found = matches[0]
    try:
        valid = str(uuid.UUID(found['connector_id'])) == found['connector_id']
    except (ValueError, TypeError, AttributeError):
        valid = False
    if not valid:
        return None
    fraction = found.get('at')
    if not isinstance(fraction,(int,float)) or not math.isfinite(fraction) or not 0.<=fraction<=1.:
        return None
    return found


def floor_indices(heights):
    low = min(heights)
    return {k for k, height in enumerate(heights) if abs(height - low) <= 1e-9}


def window_collision(left, right):
    """A mutable control cannot also be another window's hard anchor."""
    collisions = ((set(left['controlIndices']) & set(right['allWindowIndices'])) |
                  (set(right['controlIndices']) & set(left['allWindowIndices'])))
    if left['fixedAnchorIndex']==right['fixedAnchorIndex']:
        a,b = left.get('fixedAnchorActualBound'),right.get('fixedAnchorActualBound')
        if a is None or b is None or len(a)!=2 or len(b)!=2 or a[0]!=a[1] or b[0]!=b[1] or a!=b:
            collisions.add(left['fixedAnchorIndex'])
    return sorted(collisions)


def local_run(heights, start, sign, control_blocks, segment_blocks):
    """Stop at the first fixed/zero anchor; never cross a structure or sign."""
    if sign not in [-1,1] or len(heights)<2 or start not in [0,len(heights)-1] or not all(math.isfinite(h) for h in heights):
        return None,['invalid-finite-local-run-input']
    if sign*heights[start]<-1e-9:
        return None,['opposite-sign-node-endpoint']
    step = 1 if start == 0 else -1
    order = list(range(start, len(heights) if step == 1 else -1, step))
    if control_blocks.get(start):
        return None, sorted(set(control_blocks[start]))
    selected = [start]
    anchor_reasons = []
    for index in order[1:]:
        previous = selected[-1]
        segment = min(previous, index)
        if segment_blocks.get(segment):
            anchor_reasons = ['before-protected-source-segment'] + segment_blocks[segment]
            break
        if sign * heights[index] < -1e-9:
            anchor_reasons = ['before-opposite-sign-control']
            break
        selected.append(index)
        if control_blocks.get(index):
            anchor_reasons = control_blocks[index]
            break
        if abs(heights[index]) <= 1e-9:
            anchor_reasons = ['existing-zero-control-anchor']
            break
    if len(selected) < 2:
        return None, sorted(set(anchor_reasons or ['no-positive-length-local-run']))
    anchor = selected[-1]
    if not anchor_reasons:
        anchor_reasons = ['opposite-endpoint-fixed-anchor']
    local = [heights[k] for k in selected]
    return {'controlIndices': selected[:-1], 'fixedAnchorIndex': anchor,
            'fixedAnchorReasons': sorted(set(anchor_reasons)),
            'allWindowIndices': selected, 'existingLocalHeightEnvelope': [min(local), max(local)]}, []


def graded_zero_request(points, footprint, source_metres, start, low, control_blocks, segment_blocks,
                        grade, triangle_grade, curvature):
    """Finite affine cubic-to-zero array; bounds are parameters, never solved Y."""
    if len(points)<2 or len(source_metres)!=len(points) or start not in [0,len(points)-1] or not all(math.isfinite(v) for v in source_metres) or not all(math.isfinite(v) and v>0 for v in [grade,triangle_grade,curvature]) or not math.isfinite(low) or low>=0:
        return None
    if any(len(point)!=2 or not all(math.isfinite(v)for v in point)for point in points) or any(len(footprint.get(side,[]))!=len(points)or any(len(point)!=2 or not all(math.isfinite(v)for v in point)for point in footprint.get(side,[]))for side in ['L','R']):
        return None
    step = 1 if start == 0 else -1
    order = list(range(start, len(points) if step == 1 else -1, step))
    if control_blocks.get(start):
        return None
    need = max(1.5 * abs(low) / grade, math.sqrt(6. * abs(low) / curvature))
    selected = [start]
    for index in order[1:]:
        previous = selected[-1]
        if segment_blocks.get(min(previous, index)):
            break
        selected.append(index)
        distance = abs(source_metres[index] - source_metres[start])
        if control_blocks.get(index) or distance >= need:
            break
    if len(selected) < 2:
        return None
    length = abs(source_metres[selected[-1]] - source_metres[start])
    if length <= 1e-9:
        return None
    source_away = [abs(source_metres[k]-source_metres[start]) for k in selected]
    if any(right<left-1e-9 for left,right in zip(source_away,source_away[1:])) or any(v>length+1e-9 for v in source_away):
        return None
    weights = [1. - (3. * t * t - 2. * t * t * t)
               for t in [abs(source_metres[k] - source_metres[start]) / length for k in selected]]
    cap = abs(low)
    # Exact discrete centreline, literal-ribbon triangle and global curvature caps.
    def perpendicular(p, a, b):
        den = math.dist(a, b)
        return abs((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])) / den if den else 0.
    model_distances = [0.]
    for a, b in zip(selected, selected[1:]):
        model_distances.append(model_distances[-1] + math.dist(points[a], points[b]))
    for j, (a, b) in enumerate(zip(selected, selected[1:])):
        dw = abs(weights[j+1] - weights[j])
        if dw <= 1e-14:
            continue
        distance = math.dist(points[a], points[b])
        k = min(a, b)
        run = min(perpendicular(footprint['R'][k], footprint['R'][k+1], footprint['L'][k+1]),
                  perpendicular(footprint['L'][k+1], footprint['R'][k], footprint['L'][k]))
        cap = min(cap, grade * distance / dw, triangle_grade * run / dw)
    for j in range(1, len(selected)-1):
        a, b = model_distances[j]-model_distances[j-1], model_distances[j+1]-model_distances[j]
        if min(a, b) <= 1e-9:
            return None
        change = abs((weights[j+1]-weights[j])/b-(weights[j]-weights[j-1])/a)
        if change > 1e-14:
            cap = min(cap, curvature * (a+b) / 2. / change)
    anchor = selected[-1]
    after = anchor+step
    if 0<=after<len(points):
        left = math.dist(points[selected[-2]],points[anchor]); right = math.dist(points[anchor],points[after])
        if min(left,right)<=1e-9:
            return None
        change = abs(weights[-2])/left
        if change>1e-14:
            cap = min(cap,curvature*(left+right)/2./change)
    if cap <= 1e-9:
        return None
    return {'requestedHeightBounds': [-cap, 0.], 'allWindowIndices': selected,
            'controlIndices': selected[:-1], 'fixedAnchorIndex': selected[-1],
            'fixedAnchorHeight': 0., 'requiredSourceRecoveryMetresForFullComponentDepth': need,
            'actualSourceRecoveryMetres': length, 'affineControls': [
                {'index': k, 'nodeHeightCoefficient': w, 'fixedConstant': 0.}
                for k, w in zip(selected, weights)],
            'parameterOnly': True, 'originalArmEnvelope': [0., 0.],
            'newNegativePermissionGranted': False}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--repo', type=Path, required=True)
    p.add_argument('--context', type=Path, required=True)
    p.add_argument('--context-sha256', required=True)
    p.add_argument('--positive', type=Path, required=True)
    p.add_argument('--negative', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--geographiclib-wheel', type=Path, required=True)
    a = p.parse_args()
    assert not a.output.exists(), 'Retain earlier research evidence'
    sys.path.insert(0, str(a.geographiclib_wheel))
    import geographiclib
    assert geographiclib.__version__ == '2.1'
    held = {}
    def read(name, path, binary=False):
        path = Path(path)
        data = path.read_bytes()
        held[name] = {'path': str(path), 'sha256': sha(data)}
        return data if binary else json.loads(data)
    read('generator', Path(__file__), True)
    assert file_sha(a.context) == a.context_sha256
    held['context'] = {'path': str(a.context), 'sha256': a.context_sha256}
    with a.context.open('rb') as stream:
        context = pickle.load(stream)
    print(json.dumps({'phase':'bound-context-loaded','sha256':a.context_sha256}),flush=True)
    state = context['state']; args = state['args']
    solver = read('solver', a.repo/'scripts/solve-road-profiles.py', True)
    assert context['solverSHA256'] == sha(solver) == sha(context['solverSource'])
    assert context['releaseApproved'] is False
    signed_path = a.repo/'scripts/qa/prepare-signed-facility-domains.py'
    read('sourceHelper', signed_path, True)
    spec = importlib.util.spec_from_file_location('bound_signed_source_helpers', signed_path)
    signed = importlib.util.module_from_spec(spec); spec.loader.exec_module(signed)
    positive, negative = read('positive', a.positive), read('negative', a.negative)
    model, joint, reference, geo, policy, apron, mapped, positive_policy, comfort = [read(name, path) for name, path in [
        ('model', args.model), ('joint', args.joint_tile_input), ('reference', args.additional_source_reference),
        ('geo', args.source_geometry), ('policy', args.generated_node_datum_policy), ('apron', args.apron_policy),
        ('mapped', args.mapped_levels), ('positivePolicy', args.positive_facility_policy),
        ('comfortPolicy', args.generated_facility_policy)]]
    crossing = read('crossing', negative['inputs']['crossing-audit']['path'])
    assert held['crossing']['sha256'] == negative['inputs']['crossing-audit']['sha256']
    assert all(context['inputs'][key] == held[name]['sha256'] for key, name in [
        ('model','model'),('joint_tile_input','joint'),('additional_source_reference','reference'),
        ('source_geometry','geo'),('generated_node_datum_policy','policy'),('apron_policy','apron'),
        ('mapped_levels','mapped'),('positive_facility_policy','positivePolicy'),('generated_facility_policy','comfortPolicy')])
    assert positive['inputs']['newReference']['sha256'] == held['reference']['sha256']
    assert negative['inputs']['source-reference']['sha256'] == held['reference']['sha256']
    assert positive['inputs']['solver']['sha256'] == negative['inputs']['solver']['sha256'] == sha(solver)
    assert reference['complete'] and not reference['missingPrefixes']
    rows = {r['id'][:12]: r for r in reference['rows']}
    assert len(rows) == len(reference['rows'])
    context_roads = state['roads']; offsets = state['O']; canonical = state['canonicalRailControls']
    bounds_digest = canonical_sha(state['bounds'])
    heads_digest = expression_sha(state['head_expressions']); couplings_digest = expression_sha(state['coupling_expressions'])
    print(json.dumps({'phase':'frozen-expression-hashes-complete','headroom':len(state['head_expressions']),'couplings':len(state['coupling_expressions'])}),flush=True)
    model_roads = {r['id']: r for r in model['roads']}
    selected = {r['id'] for r in joint['tileRoads']}; fixed_context = {r['id'] for r in joint['contextRoads']}
    actual = {**model_roads, **{r['id']: r for r in joint['contextRoads']+joint['tileRoads']}}
    annotation_only_differences = []
    for ident in set(actual)&set(context_roads):
        if actual[ident] != context_roads[ident]:
            fields = {key for key in set(actual[ident])|set(context_roads[ident]) if actual[ident].get(key)!=context_roads[ident].get(key)}
            assert fields <= {'sourceXY','sourceArc'}, 'Context changes an actual road field: '+ident
            annotation_only_differences.append({'road':ident,'fields':sorted(fields),
              'actualRoadSHA256':canonical_sha(actual[ident]),'contextRoadSHA256':canonical_sha(context_roads[ident]),
              'physicalRoadFieldsExactlyEqual':True})
    assert set(context_roads)<=set(actual)
    roads = actual
    footprints_doc = read('footprints', args.footprints)
    assert held['footprints']['sha256']==context['inputs']['footprints']
    assert footprints_doc['sourceModelSHA256']==held['model']['sha256']
    footprints = {r['id']: r for r in footprints_doc['roads']+joint['contextFootprints']+joint['footprints']}
    assert all(footprints[ident]==footprint for ident,footprint in state['footprints'].items()), 'Literal context footprint changed'
    positive_nodes = {n for result in positive['results'] for n in result['sourceProof']['fullConnectors']}
    negative_nodes = {r['node'] for r in negative['nodes'] if not r['blockingReasons']}
    assert len(positive_nodes) == 143 and len(negative_nodes) == 99 and not positive_nodes & negative_nodes
    nodes = positive_nodes | negative_nodes
    core = json.loads(gzip.decompress(read('rawCore', args.core, True)))
    assert held['rawCore']['sha256']==context['inputs']['core']==joint['sourceCoreSHA256']==geo['sourceCorePackSHA256']
    assert joint['sourceModelSHA256']==held['model']['sha256']
    assert joint['sourceDataSHA256']==held['geo']['sha256']
    raw = {r['id']: r for r in core['roads']}; core_ids = set(raw)
    owners = {}; copies = collections.Counter(); variants = set()
    fields = ['id','pts','elev','from','to','w','lanes','oneway']
    for pack in core['packs']:
        relative = 'public/city/'+pack['file']
        packed = read('pack:'+relative, a.repo/relative, True)
        assert sha(packed) == joint['sourcePackSHA256'][relative]
        for tile in json.loads(gzip.decompress(packed))['tiles'].values():
            for road in tile['roads']:
                if road['id'] in core_ids or road.get('ctx') or not nodes & {road['from'],road['to']}:
                    continue
                ident = road['id']; physical = {key:road.get(key) for key in fields}
                if ident in owners and owners[ident] != physical:
                    variants.add(ident)
                owners[ident] = physical; copies[ident] += 1
    raw.update(owners)
    print(json.dumps({'phase':'all-packed-owners-scanned','packs':len(core['packs']),'detailedOwners':len(owners),'variants':len(variants)}),flush=True)
    floor_owners = set(model['report']['underpassRoadIds']) | set(model['underpassChanges'])
    assert len(floor_owners) == 52 and len(canonical) == 1553
    protected = {r['id'] for r in mapped['roads']}
    explicit_nodes = {r['node'] for r in policy['nodes']}
    prior_exclusions = {r['node']:r for r in policy['excluded']}
    explicit_nodes |= {r['node'] for r in apron['estimatedNodeLowering']}
    explicit_nodes |= {n for r in apron.get('generatedNodeComponents',[]) for n in r['nodes']}
    explicit_nodes |= {r['node'] for r in positive_policy['nodes']}
    explicit_roads = {r['id'] for r in positive_policy['roads']}
    for key in ['localHeightExceptions','numericInteriorCorrections']:
        explicit_roads |= {r['id'] for r in apron.get(key,[])}
    for key in ['generatedNodeComponents','profileLoweringComponents']:
        for r in apron.get(key,[]): explicit_roads.update(r.get('sourceRoads',r.get('roads',[])))
    explicit_roads |= set(state['generatedFacilityPolicies'])
    no_rise = set(context['noRiseRoads'])
    prior_node_recovery = collections.defaultdict(set)
    for component in policy['nodes']:
        for arm in component['arms']:
            ident = arm['id']; arc = state['arcs'][ident]
            for k,distance in enumerate(arc):
                away = distance if arm['end']=='from' else arc[-1]-distance
                if away<=component['recoveryMeters']+1e-9:
                    prior_node_recovery[ident].add(k)
    floor_inventory = []
    for ident in sorted(floor_owners):
        yy = roads[ident]['elev'] or [0.]*len(roads[ident]['pts'])
        for k in sorted(floor_indices(yy)):
            bound = state['bounds'][offsets[ident]+k] if ident in offsets else (yy[k],yy[k])
            assert tuple(bound) == (yy[k],yy[k])
            floor_inventory.append({'road':ident,'index':k,'height':yy[k],'actualBound':list(bound)})
    assert len(floor_inventory) == 509
    canonical_inventory = []
    for ident, start in offsets.items():
        for k, height in enumerate(roads[ident]['elev'] or [0.]*len(roads[ident]['pts'])):
            if start+k in canonical:
                bound = state['bounds'][start+k]; assert bound[0] == bound[1]
                canonical_inventory.append({'road':ident,'index':k,'baseInputHeight':height,'actualBound':list(bound)})
    cache = {}; lines = {}
    def evidence(ident):
        if ident in cache: return cache[ident]
        road = roads[ident]; row = rows.get(ident[:12])
        if row is None: return None
        if row['id'] not in lines: lines[row['id']] = signed.source_line(row, geo['origin'])
        line, metres = lines[row['id']]
        source = [signed.project_fraction(point,line,metres) for point in road['pts']]
        segment_reasons = {}
        for k,(left,right) in enumerate(zip(source,source[1:])):
            low,high = sorted([left['officialSourceFraction'],right['officialSourceFraction']])
            why = signed.source_exclusions(signed.rules_over_interval(row['level_rules'],low,high),signed.rules_over_interval(row['road_flags'],low,high))
            if any(r['sourceProjectionResidualM']>.1 or r['ambiguousSourceBranch'] for r in [left,right]): why.append('unresolved-source-segment-projection')
            if why: segment_reasons[k] = sorted(set(why))
        point_blocks = {}
        yy = road['elev'] or [0.]*len(road['pts'])
        for k,item in enumerate(source):
            fraction = item['officialSourceFraction']; why = []
            item['activeLevelRules'] = signed.active(row['level_rules'],fraction)
            item['activeRoadFlags'] = signed.active(row['road_flags'],fraction)
            why += signed.source_exclusions(item['activeLevelRules'],item['activeRoadFlags'])
            if item['sourceProjectionResidualM']>.1 or item['ambiguousSourceBranch']: why.append('unresolved-source-control-projection')
            if ident in offsets and offsets[ident]+k in canonical: why.append('actual-canonical-matrix-control')
            if ident in floor_owners and k in floor_indices(yy): why.append('actual-52-owner-minimum-control')
            if k in prior_node_recovery[ident]: why.append('existing-301-node-recovery-policy')
            if k in [0,len(yy)-1]: why.append('opposite-endpoint-fixed-anchor')
            if why: point_blocks[k] = sorted(set(why))
        cache[ident] = (row,source,metres[-1],point_blocks,segment_reasons)
        return cache[ident]
    # Prove existing negative components by source UUID edges to an actual
    # declared floor owner with an independently retained source crossing.
    proved_owner_crossings = collections.defaultdict(list)
    for r in crossing['crossings']:
        if r['road'] in floor_owners and r['classification'] in ['research-confirmed-road-below-source-rail-bridge-needs-model-review','retained-existing-below-rail-facility'] and r['originalSourceCrossings'] and r['nearestOriginalCrossingDifferenceM']<=.15 and rows[r['road'][:12]]['id']==r['sourceRoadID']:
            proved_owner_crossings[r['road']].append(r)
    negative_roads = {ident for ident,r in actual.items() if min(r['elev'] or [0.])<-.001}
    negative_incidence = collections.defaultdict(list)
    for ident in sorted(negative_roads):
        r = roads[ident]
        for end,k in [('from',0),('to',len(r['pts'])-1)]:
            node = r[end]; ev = evidence(ident)
            if not node or ev is None: continue
            row,source,length,_,_ = ev; full = connector(row,node)
            if full and source[k]['sourceProjectionResidualM']<=.1 and not source[k]['ambiguousSourceBranch'] and abs(source[k]['officialSourceFraction']-full['at'])*length<=.15:
                negative_incidence[(node,full['connector_id'])].append(ident)
    graph = collections.defaultdict(list)
    for (node,full),idents in negative_incidence.items():
        for left in idents:
            for right in idents:
                if left != right: graph[left].append((right,node,full))
    parent = {}; queue = collections.deque()
    for owner in sorted(proved_owner_crossings): parent[owner] = None; queue.append(owner)
    while queue:
        ident = queue.popleft()
        for other,node,full in sorted(graph[ident]):
            if other not in parent: parent[other] = (ident,node,full); queue.append(other)
    def facility_proof(ident):
        if ident not in parent: return None
        path = []; cursor = ident
        while parent[cursor] is not None:
            other,node,full = parent[cursor]
            path.append({'road':cursor,'nextRoad':other,'node':node,'fullConnector':full,
                         'roadSHA256':canonical_sha(roads[cursor]),'sourceSegmentID':rows[cursor[:12]]['id']})
            cursor = other
        return {'floorOwner':cursor,'sourceCrossings':proved_owner_crossings[cursor],
                'negativeSourceConnectorPath':path,'crossingReceiptSHA256':held['crossing']['sha256'],
                'separateEndpointAuthorityStillRequired':True}
    results = []
    for node in sorted(nodes):
        sign = 1 if node in positive_nodes else -1
        arms = []; reasons = []
        if node in explicit_nodes: reasons.append('existing-explicit-node-authority-retained')
        available = [r for r in actual.values() if node in [r['from'],r['to']]]
        actual_owners = {ident for ident,r in owners.items() if node in [r['from'],r['to']]}
        detail = {r['id'] for r in available if r['id'] not in model_roads}
        if actual_owners != detail: reasons.append('complete-packed-owner-incidence-mismatch')
        if actual_owners & variants: reasons.append('variant-packed-owner')
        full_ids = set()
        for road in available:
            ident = road['id']; yy = road['elev'] or [0.]*len(road['pts']); at = 0 if road['from']==node else len(yy)-1
            why = []
            if road['from']==road['to']: why.append('self-loop-incidence-requires-separate-review')
            if ident not in offsets or ident in fixed_context: why.append('fixed-context-or-arm-absent-from-actual-variables')
            if ident not in raw or raw[ident].get('elev') is not None: why.append('original-raw-elevation-present-or-missing')
            if ident in protected or road.get('elevationSource') in ['surveyed','explicit'] or road.get('expressway'): why.append('mapped-surveyed-explicit-or-expressway')
            if ident in explicit_roads: why.append('separate-explicit-recovery-or-comfort-policy')
            if ident in no_rise: why.append('explicit-no-rise-road')
            ev = evidence(ident); window = None; endpoint = None; full = None
            if ev is None: why.append('missing-full-source-row')
            else:
                row,source,length,control_blocks,segment_blocks = ev; full = connector(row,node)
                endpoint = source[at]
                if full is None: why.append('missing-or-ambiguous-full-source-connector')
                else:
                    full_ids.add(full['connector_id'])
                    if abs(endpoint['officialSourceFraction']-full['at'])*length>.15: why.append('actual-endpoint-not-at-full-source-connector')
                    why += signed.source_exclusions(signed.active(row['level_rules'],full['at']),signed.active(row['road_flags'],full['at']))
                blocks = {k:list(v) for k,v in control_blocks.items()}
                blocks[at] = [r for r in blocks.get(at,[]) if r!='opposite-endpoint-fixed-anchor']
                if sign*yy[at]<-1e-9: why.append('opposite-sign-node-endpoint')
                window, run_reasons = local_run(yy,at,sign,blocks,segment_blocks)
                why += run_reasons
                if window:
                    indexes = window['allWindowIndices']; anchor = window['fixedAnchorIndex']
                    fractions = [source[k]['officialSourceFraction'] for k in indexes]
                    deltas = [b-a for a,b in zip(fractions,fractions[1:])]
                    if any(d>1e-7 for d in deltas) and any(d<-1e-7 for d in deltas): why.append('nonmonotone-full-source-local-run')
                    fixed_bound = state['bounds'][offsets[ident]+anchor] if ident in offsets else [yy[anchor],yy[anchor]]
                    if fixed_bound[0]!=fixed_bound[1]:
                        why.append('local-run-anchor-is-not-an-actual-fixed-control')
                    if 'existing-301-node-recovery-policy' in window['fixedAnchorReasons']:
                        why.append('local-run-meets-existing-explicit-node-recovery-policy')
                    if not window['existingLocalHeightEnvelope'][0]-1e-9<=fixed_bound[0]<=window['existingLocalHeightEnvelope'][1]+1e-9: why.append('actual-anchor-outside-original-local-envelope')
                    arc = state['arcs'].get(ident)
                    if arc is None: arc = signed.arc(road['pts'])
                    window.update(modelArcWindow=sorted([arc[at],arc[anchor]]),
                                  actualSourceFractionInterval=[min(fractions),max(fractions)],
                                  sourceDistancesFromActualNode=[abs(f-source[at]['officialSourceFraction'])*length for f in fractions],
                                  fixedAnchorPoint=road['pts'][anchor], fixedAnchorActualBound=list(fixed_bound),
                                  existingLocalInputHeights=[yy[k] for k in indexes],
                                  sourceControls=[{'index':k,**source[k]} for k in indexes],
                                  sourceSegmentIntervals=[{'segment':min(left,right),
                                    'fractionInterval':sorted([source[left]['officialSourceFraction'],source[right]['officialSourceFraction']]),
                                    'activeLevelRules':signed.rules_over_interval(row['level_rules'],*sorted([source[left]['officialSourceFraction'],source[right]['officialSourceFraction']])),
                                    'activeRoadFlags':signed.rules_over_interval(row['road_flags'],*sorted([source[left]['officialSourceFraction'],source[right]['officialSourceFraction']]))}
                                    for left,right in zip(indexes,indexes[1:])])
            arm = {'id':ident,'end':'from' if at==0 else 'to','index':at,'point':road['pts'][at],
                   'inputHeight':yy[at],'inputRoadSHA256':canonical_sha(road),'inputHeightArraySHA256':canonical_sha(yy),
                   'inputRibbonSHA256':canonical_sha(footprints[ident]) if ident in footprints else None,
                   'rawRoadSHA256':canonical_sha(raw[ident]) if ident in raw else None,
                   'rawElevationIsNull':ident in raw and raw[ident].get('elev') is None,
                   'rawCore':ident in core_ids,'selectedDetailedOwner':ident in selected,'fixedContext':ident in fixed_context,
                   'sourceSegmentID':ev[0]['id'] if ev else None,'sourceRowSHA256':canonical_sha(ev[0]) if ev else None,
                   'sourceGeometryWKB_SHA256':sha(bytes.fromhex(ev[0]['geometryWKB'])) if ev else None,
                   'sourceLevelRules':ev[0]['level_rules'] if ev else None,'sourceRoadFlags':ev[0]['road_flags'] if ev else None,
                   'fullConnector':full,'sourceEndpoint':endpoint,'finiteLocalWindow':window,
                   'existingLocalEnvelope':window['existingLocalHeightEnvelope'] if window else None,
                   'blockingReasons':sorted(set(why))}
            if ident not in footprints: arm['blockingReasons'].append('missing-literal-ribbon')
            raw_ground_reasons = []
            raw_height = raw.get(ident,{}).get('elev')
            if raw_height is None:
                raw_ground_reasons.append('raw-null-does-not-prove-unsurveyed-zero')
            elif not raw_height or not all(math.isfinite(v) and abs(v)<=1e-9 for v in raw_height):
                raw_ground_reasons.append('raw-elevation-is-not-an-explicit-zero-array')
            if raw.get(ident,{}).get('elevationSource') not in ['unsurveyed-zero','generated-zero']:
                raw_ground_reasons.append('raw-source-does-not-explicitly-identify-unsurveyed-zero-datum')
            if window and ev:
                anchor=window['fixedAnchorIndex']; source_anchor=ev[1][anchor]
                if window['fixedAnchorActualBound']!=[0.,0.]:
                    raw_ground_reasons.append('finite-window-does-not-reach-an-actual-fixed-zero-anchor')
                if not any(r['value']==0 for r in source_anchor['activeLevelRules']):
                    raw_ground_reasons.append('anchor-has-no-explicit-source-ground-level-rule')
                if any(r in window['fixedAnchorReasons'] for r in ['actual-52-owner-minimum-control','actual-canonical-matrix-control','existing-301-node-recovery-policy']):
                    raw_ground_reasons.append('finite-window-ends-at-a-separate-protected-anchor')
            else:
                raw_ground_reasons.append('finite-source-proved-window-unavailable')
            arm['rawGroundDiagnosticAlternative']={'active':False,'endpointPermissionGranted':False,
              'strictCurrentWindowEnvelopeRetained':arm['existingLocalEnvelope'],
              'originalRawElevationIsNull':raw_height is None,
              'explicitUnsurveyedZeroDatumProved':not any('raw-' in r for r in raw_ground_reasons),
              'candidateEnvelope':([min(0.,window['existingLocalHeightEnvelope'][0]),max(0.,window['existingLocalHeightEnvelope'][1])] if not raw_ground_reasons else None),
              'blockingReasons':sorted(set(raw_ground_reasons+arm['blockingReasons']))}
            arms.append(arm); reasons += arm['blockingReasons']
        if len(full_ids)!=1 or any(arm['fullConnector'] is None for arm in arms): reasons.append('all-arms-do-not-share-one-full-UUID')
        envelopes = [arm['existingLocalEnvelope'] for arm in arms if arm['existingLocalEnvelope'] is not None]
        existing = intersect_envelopes(envelopes) if len(envelopes)==len(arms) else None
        if existing is None: reasons.append('empty-or-unavailable-all-arm-local-envelope-intersection')
        elif existing[1]-existing[0]<=1e-9: reasons.append('all-arm-existing-envelope-has-no-free-height-interval')
        requested = None
        if sign<0:
            negative_arms = [arm for arm in arms if min(roads[arm['id']]['elev'] or [0.])<-.001]
            proofs = [facility_proof(arm['id']) for arm in negative_arms]
            negative_envelopes = [arm['existingLocalEnvelope'] for arm in negative_arms]
            zero_arms = [arm for arm in arms if max(map(abs,roads[arm['id']]['elev'] or [0.]))<=1e-9]
            target = intersect_envelopes(negative_envelopes) if negative_envelopes and all(v is not None for v in negative_envelopes) else None
            if zero_arms and target is not None and target[0]<-1e-9 and all(proofs) and not any(arm['blockingReasons'] for arm in arms) and node not in explicit_nodes:
                requested_arms = []; requested_bounds = [target]
                for arm in zero_arms:
                    ident = arm['id']; ev = evidence(ident); yy = roads[ident]['elev'] or [0.]*len(roads[ident]['pts'])
                    blocks = {k:list(v) for k,v in ev[3].items()}; blocks[arm['index']] = [r for r in blocks.get(arm['index'],[]) if r!='opposite-endpoint-fixed-anchor']
                    extension = graded_zero_request(roads[ident]['pts'],footprints[ident],[v['officialSourceFraction']*ev[2] for v in ev[1]],arm['index'],target[0],blocks,ev[4],
                                                   min(args.max_grade,args.tile_max_grade) if ident in selected else args.max_grade,args.physical_max_grade,args.grade_change_per_metre)
                    if extension and ident in offsets:
                        anchor = extension['fixedAnchorIndex']
                        if tuple(state['bounds'][offsets[ident]+anchor])!=(0.,0.):
                            extension = None
                    if extension and 'existing-301-node-recovery-policy' in blocks.get(extension['fixedAnchorIndex'],[]):
                        extension = None
                    if extension:
                        indexes=extension['allWindowIndices']; row=ev[0]; source=ev[1]
                        extension.update(road=ident,sourceSegmentID=ev[0]['id'],sourceGeometryWKB_SHA256=arm['sourceGeometryWKB_SHA256'],
                                         fixedAnchorPoint=roads[ident]['pts'][extension['fixedAnchorIndex']],inputRibbonSHA256=arm['inputRibbonSHA256'],
                                         fixedAnchorActualBound=list(state['bounds'][offsets[ident]+extension['fixedAnchorIndex']]),
                                         fixedAnchorReasons=blocks.get(extension['fixedAnchorIndex'],['selected-existing-fixed-zero-control']),
                                         sourceControls=[{'index':k,**source[k]}for k in indexes],
                                         sourceSegmentIntervals=[{'segment':min(left,right),
                                           'fractionInterval':sorted([source[left]['officialSourceFraction'],source[right]['officialSourceFraction']]),
                                           'activeLevelRules':signed.rules_over_interval(row['level_rules'],*sorted([source[left]['officialSourceFraction'],source[right]['officialSourceFraction']])),
                                           'activeRoadFlags':signed.rules_over_interval(row['road_flags'],*sorted([source[left]['officialSourceFraction'],source[right]['officialSourceFraction']]))}
                                           for left,right in zip(indexes,indexes[1:])])
                        requested_arms.append(extension); requested_bounds.append(extension['requestedHeightBounds'])
                proposed = intersect_envelopes(requested_bounds) if len(requested_arms)==len(zero_arms) else None
                requested = {'status':'blocked-pending-explicit-facility-component-and-endpoint-review',
                             'originalAllArmEnvelopeIntersection':existing,'requestedNegativeOnlyBounds':proposed,
                             'boundNegativeComponentProofs':proofs,'zeroArmGradedRecoveryArrays':requested_arms,
                             'allZeroArmsHaveFiniteGradedRecovery':len(requested_arms)==len(zero_arms),
                             'existingArmEnvelopesRetained':True,'endpointPermissionGranted':False}
                reasons.append('new-negative-zero-arm-permission-requires-separate-explicit-review')
            elif zero_arms:
                if not all(proofs): reasons.append('no-bound-source-proved-negative-component-for-zero-arm-request')
                if target is None or target[0]>=-1e-9: reasons.append('no-finite-existing-negative-arm-envelope-for-separate-request')
        results.append({'node':node,'signClass':'positive-only' if sign>0 else 'negative-only',
                        'arms':arms,'actualPackedDetailedOwners':sorted(actual_owners),'all304PacksChecked':True,
                        'allArmIncidenceComplete':actual_owners==detail and not actual_owners&variants,
                        'fullConnectorUUIDs':sorted(full_ids),'existingAllArmHeightBoundIntersection':existing,
                        'status':'blocked' if reasons else 'finite-inactive-candidate',
                        'blockingReasons':sorted(set(reasons)),'separateRequestedFacilityExtension':requested,
                        'prior53ExclusionRetainedForReview':prior_exclusions.get(node),
                        'rawGroundDiagnosticAlternative':{'active':False,'endpointPermissionGranted':False,
                          'candidateBoundIntersection':intersect_envelopes([arm['rawGroundDiagnosticAlternative']['candidateEnvelope']for arm in arms]) if all(arm['rawGroundDiagnosticAlternative']['candidateEnvelope']is not None for arm in arms)else None,
                          'blockingReasons':sorted({r for arm in arms for r in arm['rawGroundDiagnosticAlternative']['blockingReasons']})},
                        'endpointPermissionGranted':False,'old301PolicyDecisionChanged':False})
        if len(results)%50==0:
            print(json.dumps({'phase':'node-research-progress','nodes':len(results),'sourceRoadsProjected':len(cache)}),flush=True)
    # Multiple selected endpoints on one road are never sequentially widened.
    by_road = collections.defaultdict(list)
    for entry in results:
        for arm in entry['arms']:
            if arm['finiteLocalWindow']:
                by_road[arm['id']].append((entry,arm['finiteLocalWindow'],'strict-current-envelope'))
        requested=entry['separateRequestedFacilityExtension']
        if requested:
            for extension in requested['zeroArmGradedRecoveryArrays']:
                by_road[extension['road']].append((entry,extension,'separate-requested-negative-extension'))
    overlaps = []
    for ident,entries in by_road.items():
        for j,(left,la,left_kind) in enumerate(entries):
            for right,ra,right_kind in entries[j+1:]:
                common = window_collision(la,ra)
                if left['node'] != right['node'] and common:
                    overlaps.append({'road':ident,'nodes':[left['node'],right['node']],'windowKinds':[left_kind,right_kind],
                      'mutableOrFixedAnchorCollisionIndices':common})
                    for entry in [left,right]:
                        entry['status']='blocked'; entry['blockingReasons']=sorted(set(entry['blockingReasons']+['opposite-node-windows-overlap-requires-joint-review']))
    assert bounds_digest==canonical_sha(state['bounds'])
    assert heads_digest==expression_sha(state['head_expressions']) and couplings_digest==expression_sha(state['coupling_expressions'])
    for record in held.values(): assert file_sha(record['path'])==record['sha256'], 'Input changed during candidate preparation'
    output={'schema':'complete-source-node-finite-domain-research-v1','researchOnly':True,'releaseApproved':False,
            'activePolicy':False,'heightAuthorityGranted':False,'endpointPermissionGranted':False,'scope':__doc__,
            'inputs':held,'generatorSHA256':file_sha(Path(__file__)),
            'frozenContextEvidence':{'boundsSHA256':bounds_digest,'headroomExpressions':len(state['head_expressions']),
              'headroomExpressionsSHA256':heads_digest,'couplingExpressions':len(state['coupling_expressions']),
              'couplingExpressionsSHA256':couplings_digest,'actualAssembledMatrixParityProved':False,
              'canonicalControls':canonical_inventory,'floorOwnerMinimumControls':floor_inventory,
              'contextOmittedSourceAnnotationsOnly':annotation_only_differences,
              'fullCurrentWorldRoadsOutsideActiveContext':len(set(actual)-set(context_roads)),
              'existing301PolicyNodesSHA256':canonical_sha(policy['nodes']),'existing53ExclusionsSHA256':canonical_sha(policy['excluded'])},
            'hardRequirements':{'allExisting301DecisionsUnchanged':True,'all1553CanonicalControlsExact':True,
              'all52Owner509MinimumControlsExact':True,'allSourceSurfaceAndRawExplicitContextsRemainFixed':True,
              'allHeldHeadroomCouplingExpressionsUnchanged':True,'noMixedPositiveNegativeWindow':True,
              'noPermissionFromIncidenceAlone':True,'requiresIndependentReviewAndExplicitConsumer':True,
              'requiresFreshGlobalFeasibilityAndActualAcceptance':True},
            'windowOverlapBlocks':overlaps,'nodes':results,
            'summary':{'selectedNodes':len(results),'positiveNodes':len(positive_nodes),'negativeNodes':len(negative_nodes),
              'actualArms':sum(len(r['arms'])for r in results),'packs':len(core['packs']),
              'finiteInactiveCandidateNodes':sum(r['status']=='finite-inactive-candidate'for r in results),
              'blockedNodes':sum(r['status']=='blocked'for r in results),
              'candidateBySign':dict(collections.Counter(r['signClass']for r in results if r['status']=='finite-inactive-candidate')),
              'blockedNodeReasons':dict(collections.Counter(v for r in results for v in r['blockingReasons'])),
              'separateRequestedNegativeExtensions':sum(r['separateRequestedFacilityExtension']is not None for r in results),
              'requestedNegativeExtensionsWithNonemptyDomain':sum(r['separateRequestedFacilityExtension']is not None and r['separateRequestedFacilityExtension']['requestedNegativeOnlyBounds']is not None for r in results),
              'rawGroundDiagnosticAlternativesWithNonemptyDomain':sum(r['rawGroundDiagnosticAlternative']['candidateBoundIntersection']is not None for r in results),
              'packedOwnerVariants':sorted(variants),'old301DecisionsChanged':0,'endpointPermissionsGranted':0}}
    with a.output.open('x')as stream: json.dump(output,stream,separators=(',',':'),allow_nan=False);stream.write('\n')
    print(json.dumps({'output':str(a.output),'sha256':file_sha(a.output),'summary':output['summary']}),flush=True)


if __name__=='__main__':
    main()
