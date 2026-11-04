#!/usr/bin/env python3
"""Prepare inactive source-connected recovery components, never runtime authority.

The trusted local solve-context pickle and every research input are supplied
explicitly and pinned by SHA256. This producer does not run a fit, promote an
owner, change a source point, or apply any generated height domain.
"""
import argparse
import collections
import gzip
import hashlib
import heapq
import importlib.util
import json
import math
from pathlib import Path
import pickle
import sys


def digest(path):
 h=hashlib.sha256()
 with Path(path).open('rb')as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()

def canon(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()

def parse_args():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--repo',type=Path,default=Path(__file__).resolve().parents[2])
 for name in ['context','failed','review','research','baseline-proposal','source-union']:
  parser.add_argument('--'+name,type=Path,required=True)
  parser.add_argument('--'+name.replace('-proposal','')+'-sha256',required=True)
 parser.add_argument('--solver-sha256',required=True)
 parser.add_argument('--geographiclib',type=Path,required=True,help='Existing GeographicLib wheel or import directory; no installation is performed.')
 parser.add_argument('--output',type=Path,required=True)
 return parser.parse_args()

def control_domains(proposal):
 """Exact selected membership and bounds, independent of window partitioning."""
 result={}
 for component in proposal['components']:
  for window in component['finiteRecoveryWindows']:
   for control in window['controls']:
    key=(component['node'],control['road'],control['index'])
    if key in result:raise ValueError('Duplicate per-seed selected control')
    result[key]=control['requestedNegativeOnlyModeledBounds']
 return result

def contiguous_runs(indices):
 """Partition actual indices only; never fill an unselected gap."""
 if any(isinstance(k,bool)or not isinstance(k,int)or k<0 for k in indices):
  raise ValueError('Control indices must be nonnegative integers')
 if len(indices)!=len(set(indices)):raise ValueError('Duplicate selected index')
 runs=[]
 for k in sorted(indices):
  if not runs or k!=runs[-1][-1]+1:runs.append([])
  runs[-1].append(k)
 return runs

def split_window(window):
 controls={c['index']:c for c in window['controls']}
 if len(controls)!=len(window['controls'])or set(controls)!=set(window['controlIndices']):
  raise ValueError('Window indices do not exactly match its controls')
 runs=contiguous_runs(window['controlIndices']);result=[]
 for number,indices in enumerate(runs):
  fractions=[controls[k]['source']['officialSourceFraction']for k in indices]
  if not all(math.isfinite(x)and 0<=x<=1 for x in fractions):
   raise ValueError('Invalid source fraction in a finite run')
  result.append({**window,'controlIndices':indices,'controls':[controls[k]for k in indices],
   'sourceFractionInterval':[min(fractions),max(fractions)],
   'contiguousRunOrdinal':number,'contiguousRunCountOnSeedRoad':len(runs),
   'unselectedGapsFilled':False})
 return result

def immutable_anchor_controls(proposal):
 result={}
 for component in proposal['components']:
  for c in component['genuineAndPolicyBoundaryControls']:
   reasons=set(c['genuineImmutableReasons'])&{'actual-canonical-bound','actual-52-owner-minimum'}
   if reasons:result[(c['road'],c['index'])]=(c['point'],c['actualMatrixBound'],sorted(reasons))
 return result

def boundary_classes(control):
 """An observed budget frontier is not a newly fixed height constraint."""
 genuine=set(control.get('genuineImmutableReasons',[]));classes=[]
 if genuine&{'actual-canonical-bound','actual-52-owner-minimum'}:classes.append('immutable-modeled-clearance-anchor')
 if genuine-{'actual-canonical-bound','actual-52-owner-minimum'}:classes.append('source-or-explicit-fixed-boundary')
 if control.get('separateExistingPolicyReasons'):classes.append('separate-existing-policy')
 if control.get('unresolvedSourceReasons'):classes.append('unresolved-source')
 if not classes:classes.append('provisional-finite-budget-frontier')
 return classes

def normalize_proposal(proposal):
 """Normalize observations only after complete overlapping-seed closure.

Keep every genuine/source/policy boundary. Remove a provisional budget
observation only when its physical control is selected by any seed in the
same merged group. Per-seed domains remain separate; nothing is unioned.
"""
 components={c['node']:c for c in proposal['components']}
 membership={};group_controls=[]
 for number,group in enumerate(proposal['jointComponentGroups']):
  selected=set()
  for node in group['seedNodes']:
   if node not in components or node in membership:raise ValueError('Invalid or repeated merged-group seed')
   membership[node]=number
   selected.update((c['road'],c['index'])for w in components[node]['finiteRecoveryWindows']for c in w['controls'])
  group_controls.append(selected)
 if set(membership)!=set(components):raise ValueError('Merged groups omit a seed')
 before_domains=control_domains(proposal);observations=0;dedup_budget=0;removed=[];retained=[];retained_budget=[];splits=[];before_windows=0
 for node,component in components.items():
  dedup={}
  for c in component['genuineAndPolicyBoundaryControls']:
   key=(c['road'],c['index']);classes=boundary_classes(c)
   is_budget=c['reason']=='proposed-existing-modeled-boundary-after-finite-recovery-budget'
   if is_budget:observations+=1
   if key not in dedup:
    dedup[key]={**c,'boundaryClasses':classes,'observationCount':0,'observedReasons':[],
     'provisionalBudgetObservation':is_budget,'heightAuthorityGranted':False,'endpointPermissionGranted':False}
   item=dedup[key];item['observationCount']+=1
   item['observedReasons']=sorted(set(item['observedReasons']+[c['reason']]))
   item['boundaryClasses']=sorted(set(item['boundaryClasses']+classes))
   item['provisionalBudgetObservation']|=is_budget
   item['directBlockingRows']=sorted(set(item.get('directBlockingRows',[])+c.get('directBlockingRows',[])))
  normalized=[]
  for key,item in sorted(dedup.items()):
   budget_only=item['boundaryClasses']==['provisional-finite-budget-frontier']
   if item['provisionalBudgetObservation']:dedup_budget+=1
   if key in group_controls[membership[node]]:
    if not budget_only:raise ValueError('Selected control collides with a source, policy, or immutable boundary')
    removed.append({'seedNode':node,'road':key[0],'index':key[1],
     'reason':'selected-by-a-seed-in-the-same-merged-group','observationCount':item['observationCount']})
    continue
   item['fixedHeightConstraintInferredFromBudget']=False
   item['requiresSeparateReviewBeforeUseAsFixedBoundary']=budget_only
   if item['provisionalBudgetObservation']:retained_budget.append((node,*key))
   if budget_only:retained.append((node,*key))
   normalized.append(item)
  component['genuineAndPolicyBoundaryControls']=normalized
  new_windows=[]
  for window in component['finiteRecoveryWindows']:
   before_windows+=1;runs=split_window(window)
   if len(runs)>1:splits.append({'seedNode':node,'road':window['road'],'oldControlIndices':window['controlIndices'],'contiguousRuns':[r['controlIndices']for r in runs]})
   new_windows.extend(runs)
  component['finiteRecoveryWindows']=new_windows
 assert before_domains==control_domains(proposal)
 proposal['frontierNormalization']={'afterCompleteMergedGroupClosure':True,
  'deduplicationKey':['seedNode','road','index'],'rawBudgetObservationCount':observations,
  'distinctBudgetObservationKeys':dedup_budget,'selectedWithinMergedGroupRemoved':removed,
  'selectedWithinMergedGroupRemovedCount':len(removed),'retainedProvisionalFrontierKeys':len(retained),
  'retainedProvisionalPhysicalControls':len({(r,k)for _,r,k in retained}),
  'retainedBudgetObservationKeys':len(retained_budget),
  'retainedBudgetObservationPhysicalControls':len({(r,k)for _,r,k in retained_budget}),
  'retainedBudgetObservationsWithIndependentFixedOrBlockedAuthority':len(retained_budget)-len(retained),
  'budgetObservationsAreFixedHeightConstraints':False,'originalWindowCount':before_windows,
  'contiguousRunCount':sum(len(p['finiteRecoveryWindows'])for p in components.values()),
  'splitWindows':splits,'unselectedGapControlsAdded':0,'selectedMembershipOrBoundsChanged':False}
 proposal['method']['frontierNormalization']='Budget observations are deduplicated and removed after complete merged-group closure when selected by any seed in that group; remaining observations are provisional and impose no fixed height.'
 proposal['method']['contiguousRuns']='Every finiteRecoveryWindow is an exact contiguous run of selected controls; no unselected gap is included.'
 proposal['summary']['provisionalFrontierControls']=len(retained)
 proposal['summary']['finiteContiguousRecoveryRuns']=proposal['frontierNormalization']['contiguousRunCount']

def annotate_output(d,ROOT):
 m=json.load(open(d['inputs']['model']['path']));j=json.load(open(d['inputs']['joint']['path']));ref=json.load(open(d['inputs']['reference']['path']));geo=json.load(open(d['inputs']['geo']['path']))
 roads={r['id']:r for r in m['roads']+j['tileRoads']+j['contextRoads']};rows={r['id'][:12]:r for r in ref['rows']}
 path=ROOT/'docs/qa/evidence/reported-roads/tile-boundary-source-audit-20261103/retained-exporter'
 exporters={name:{'path':str(path/name),'sha256':digest(path/name)}for name in ['build_edges.py','make_core.py','manifest.json']}
 assert exporters['build_edges.py']['sha256']=='07a8201024efabf2973939d054776f111acf16dcd87184085871f6cef0a94933'
 assert exporters['make_core.py']['sha256']=='89d0cb0d31535705ac16e83fdb0187237988580facb8472e70d3921eb1a5b415'
 assert exporters['manifest.json']['sha256']=='f9015953dacab37090bb65d92a5dc2b210bd18a84e0871d63bf85bfd971b73ef'
 spec=importlib.util.spec_from_file_location('complete',ROOT/'scripts/qa/prepare-complete-source-node-domains.py');complete=importlib.util.module_from_spec(spec);spec.loader.exec_module(complete)
 spec=importlib.util.spec_from_file_location('signed',ROOT/'scripts/qa/prepare-signed-facility-domains.py');signed=importlib.util.module_from_spec(spec);spec.loader.exec_module(signed)
 cache={}
 def endpoint(road,k):
  r=roads[road];row=rows.get(road[:12]);n=r['from']if k==0 else r['to'];out={'road':road,'index':k,'node':n,'point':r['pts'][k]}
  if not row:out.update(blockingReasons=['missing-full-source-record']);return out
  if row['id']not in cache:cache[row['id']]=signed.source_line(row,geo['origin'])
  line,metres=cache[row['id']];p=signed.project_fraction(r['pts'][k],line,metres);full=complete.connector(row,n);why=[]
  if full is None:why.append('missing-or-ambiguous-full-connector')
  if p['sourceProjectionResidualM']>.1:why.append('projection-residual-over-10cm')
  if p['ambiguousSourceBranch']:why.append('ambiguous-full-source-branch')
  distance=abs(p['officialSourceFraction']-full['at'])*metres[-1]if full else None
  if distance is not None and distance>.15:why.append('source-endpoint-to-official-connector-offset-over-15cm')
  out.update(sourceSegmentID=row['id'],sourceGeometryWKB_SHA256=hashlib.sha256(bytes.fromhex(row['geometryWKB'])).hexdigest(),fullConnector=full,sourceProjection=p,fullSourceGeodeticLengthM=metres[-1],endpointToOfficialConnectorMetres=distance,blockingReasons=why)
  return out
 def provenance(c):
  reasons=c.get('genuineImmutableReasons',[]);road=roads[c['road']]
  if 'actual-canonical-bound'in reasons or 'actual-52-owner-minimum'in reasons:
   kind='modeled-clearance-anchor-fixed-for-this-candidate'
  elif road.get('elevationSource')=='surveyed':kind='explicit-surveyed-source-classification'
  elif road.get('elevationSource')=='explicit':kind='explicit-declared-model-profile-no-measurement-inferred'
  elif c.get('rawElevationIsNull'):kind='raw-null-height-unknown-current-Y-is-a-modeled-game-value'
  else:kind='game-exported-metric-array-exact-export-branch-unproved'
  c['heightProvenance']={'class':kind,'surveyedMetricAltitudeInferredFromRawArray':False,
   'nullIsNotSurveyedZero':True,'sourceRelativeLevelIsTopologyNotMetricHeight':True,
   'canonicalAndFloorFixedForThisCandidateNotClaimedSurveyed':True,
   'retainedExporterSnapshotReexecuted':False,'specificExportBranchProved':False}
  c['fixedForThisCandidateReasons']=reasons
 for p in d['components']:
  for w in p['finiteRecoveryWindows']:
   for c in w['controls']:provenance(c)
  for c in p['requiredDirectBlockingFootprint']+p['genuineAndPolicyBoundaryControls']:provenance(c)
  for gap in p['sourceProofAndPreparationGaps']:
   if 'index'in gap and gap['road']in roads and gap['index']in [0,len(roads[gap['road']]['pts'])-1]:gap['actualEndpointProof']=endpoint(gap['road'],gap['index'])
 # A shortest source-topology path is evidence to review, never a polygon or
 # clearance exemption. Endpoint and interval rules are checked independently.
 connectors={};by_uuid=collections.defaultdict(set)
 for ident,r in roads.items():
  row=rows.get(ident[:12]);full=[]
  for n in [r['from'],r['to']]:
   c=complete.connector(row,n)if n else None
   if c:full.append(c['connector_id']);by_uuid[c['connector_id']].add(ident)
  connectors[ident]=set(full)
 def shortest(a,b):
  q=collections.deque([a]);parent={a:None};depth={a:0}
  while q:
   r=q.popleft()
   if r==b:
    result=[]
    while parent[r]is not None:
     previous,u=parent[r];result.append({'fromRoad':previous,'toRoad':r,'fullConnectorUUID':u});r=previous
    return list(reversed(result))
   if depth[r]>=6:continue
   for u in sorted(connectors[r]):
    for other in sorted(by_uuid[u]):
     if other not in parent:parent[other]=(r,u);depth[other]=depth[r]+1;q.append(other)
  return None
 for proof in d['blockingPairSourceProofs']:
  proof['fullSourceConnectorIdentityAndExistingCellInventoryOnly']=True
  proof['cellConnectivityMethod']='Segment-index adjacency over retained literal coupling cells; geometric clipped-polygon connectivity must be replayed before any geometry edit or exemption.'
  proof['newPolygonExemptionGranted']=False
  if proof['status'].startswith('direct'):
   proof['status']='direct-full-source-node-verified-existing-literal-cell-inventory'
  else:
   a,b=proof['roads'];walk=shortest(a,b);proof['shortestRetainedSourceTopologyPathCandidate']=walk
   endpoint_proofs=[]
   for edge in walk or []:
    for ident in [edge['fromRoad'],edge['toRoad']]:
     r=roads[ident];k=0 if complete.connector(rows.get(ident[:12]),r['from'])and complete.connector(rows.get(ident[:12]),r['from'])['connector_id']==edge['fullConnectorUUID']else len(r['pts'])-1
     endpoint_proofs.append(endpoint(ident,k))
   proof['pathEndpointGeometryProofs']=endpoint_proofs
   proof['allPathEndpointProofsComplete']=bool(walk)and all(not p['blockingReasons']for p in endpoint_proofs)
   proof['finitePolygonAndIndependentClearanceProofStillRequired']=True
 # Merge only overlapping proposed control footprints. No whole-network or
 # mixed-sign window is created, and fixed node datums remain individually named.
 parent={p['node']:p['node']for p in d['components']};at=collections.defaultdict(list)
 def root(n):
  while parent[n]!=n:parent[n]=parent[parent[n]];n=parent[n]
  return n
 for p in d['components']:
  for w in p['finiteRecoveryWindows']:
   for c in w['controls']:at[(c['road'],c['index'])].append((p['node'],c['requestedNegativeOnlyModeledBounds']))
 for values in at.values():
  for n,_ in values[1:]:parent[root(n)]=root(values[0][0])
 groups=collections.defaultdict(list)
 for n in parent:groups[root(n)].append(n)
 d['jointComponentGroups']=[{'seedNodes':sorted(nodes),'status':'inactive-requires-joint-physical-fit',
  'unionRoads':sorted({r for(r,k),values in at.items()if any(n in nodes for n,_ in values)}),
  'controlCount':sum(any(n in nodes for n,_ in values)for values in at.values()),
  'perSeedControlEnvelopesRemainSeparateUntilReviewedIntersection':True,
  'noSequentialBoundUnionOrWholeRoadExemption':True}for nodes in groups.values()]
 immutable={}
 for p in d['components']:
  for c in p['genuineAndPolicyBoundaryControls']:
   if c['genuineImmutableReasons']:immutable[(c['road'],c['index'])]=c
 d['heightProvenanceEvidence']={'retainedExporterFiles':exporters,'metricMethod':'Retained build_edges has game repo profile and relative-level*6.8m estimate branches. make_core omits repo provenance. Exact current array branch remains unproved; a non-null game-exported array alone is not surveyed height.',
  'onlyExplicitMeasuredOrDeclaredFixedSourceValuesHaveTheirActualSeparateAuthority':True,
  'canonicalAndFloorValuesPreservedAsModeledClearanceAnchors':True,'rawNullNeverTreatedAsSurveyedGround':True,
  'rawArraysKeptByteExactInOriginalInputs':True,'noProductionExporterRerun':True}
 d['summary'].update(jointComponentGroups=len(groups),distinctCanonicalModeledAnchorControls=sum('actual-canonical-bound'in c['genuineImmutableReasons']for c in immutable.values()),distinctFloorModeledAnchorControls=sum('actual-52-owner-minimum'in c['genuineImmutableReasons']for c in immutable.values()),sourceTopologyPathsFoundForNonadjacentPairs=sum(bool(p.get('shortestRetainedSourceTopologyPathCandidate'))for p in d['blockingPairSourceProofs']if not p['status'].startswith('direct')),actualPhysicalFitPerformed=False)
 d['preparationRequirements']['all105DirectPairsNeedLiteralPolygonReplayBeforeGeometryChange']=True
 d['annotationGenerator']={'path':str(Path(__file__).resolve()),'sha256':digest(__file__)}

def main():
 cli=parse_args()
 ROOT=cli.repo.resolve();CONTEXT=cli.context;FAILED=cli.failed;REVIEW=cli.review;MAIN=cli.research;OUTPUT=cli.output
 assert not OUTPUT.exists()
 sys.path.insert(0,str(cli.geographiclib))
 for path,expected in [(MAIN,cli.research_sha256),(FAILED,cli.failed_sha256),(REVIEW,cli.review_sha256),(CONTEXT,cli.context_sha256),(cli.baseline_proposal,cli.baseline_sha256),(cli.source_union,cli.source_union_sha256)]:
  if digest(path)!=expected:raise ValueError(f'Pinned input changed: {path}')
 held={}
 def read(name,path,binary=False):
  path=Path(path);data=path.read_bytes();held[name]={'path':str(path),'sha256':hashlib.sha256(data).hexdigest()};return data if binary else json.loads(data)
 read('generator',__file__,True)
 main=read('main',MAIN);failed=read('failed',FAILED);review=read('review',REVIEW)
 assert digest(CONTEXT)==main['inputs']['context']['sha256'];held['context']=main['inputs']['context']
 with CONTEXT.open('rb')as f:context=pickle.load(f)
 state=context['state'];args=state['args'];O=state['O'];canonical=set(state['canonicalRailControls'])
 assert context['solverSHA256']==digest(ROOT/'scripts/solve-road-profiles.py')==cli.solver_sha256
 held['solver']={'path':str(ROOT/'scripts/solve-road-profiles.py'),'sha256':context['solverSHA256']}
 world,joint,reference,geo,mapped,policy,apron,footprints=[read(name,main['inputs'][name]['path'])for name in ['model','joint','reference','geo','mapped','policy','apron','footprints']]
 assert all(held[name]['sha256']==main['inputs'][name]['sha256']for name in ['model','joint','reference','geo','mapped','policy','apron','footprints'])
 current={r['id']:r for r in world['roads']+joint['tileRoads']+joint['contextRoads']};core_ids={r['id']for r in world['roads']}
 detail_ids={r['id']for r in joint['tileRoads']};fixed_context={r['id']for r in joint['contextRoads']}
 rows={r['id'][:12]:r for r in reference['rows']};fps={r['id']:r for r in footprints['roads']+joint['footprints']+joint['contextFootprints']}
 bynode=collections.defaultdict(list)
 for road in current.values():
  for end in ['from','to']:
   if road[end]:bynode[road[end]].append((road['id'],0 if end=='from'else len(road['pts'])-1))
 core=json.loads(gzip.decompress(read('rawCore',args.core,True)));assert held['rawCore']['sha256']==context['inputs']['core']
 raw={r['id']:r for r in core['roads']};raw_meta={};owner_nodes=collections.defaultdict(set);pack_rows={};variants=set()
 fields=['id','pts','elev','from','to','w','lanes','oneway']
 for pack in core['packs']:
  relative='public/city/'+pack['file'];data=read('pack:'+relative,ROOT/relative,True);assert held['pack:'+relative]['sha256']==joint['sourcePackSHA256'][relative]
  for tile in json.loads(gzip.decompress(data))['tiles'].values():
   for road in tile['roads']:
    if road['id']in core_ids or road.get('ctx'):continue
    ident=road['id'];physical={k:road.get(k)for k in fields};h=canon(physical)
    if ident in pack_rows and pack_rows[ident]!=h:variants.add(ident)
    pack_rows[ident]=h
    for n in [road['from'],road['to']]:owner_nodes[n].add(ident)
    raw_meta[ident]={'rawPhysicalSHA256':h,'elevationIsNull':road.get('elev')is None,'elevationSource':road.get('elevationSource'),'pack':relative}
    if ident in current:raw[ident]=physical
 print(json.dumps({'phase':'all304packs-scanned','owners':len(pack_rows),'variants':len(variants)}),flush=True)
 spec=importlib.util.spec_from_file_location('signed',ROOT/'scripts/qa/prepare-signed-facility-domains.py');signed=importlib.util.module_from_spec(spec);spec.loader.exec_module(signed)
 spec2=importlib.util.spec_from_file_location('complete',ROOT/'scripts/qa/prepare-complete-source-node-domains.py');complete=importlib.util.module_from_spec(spec2);spec2.loader.exec_module(complete)
 held['sourceHelper']={'path':str(ROOT/'scripts/qa/prepare-signed-facility-domains.py'),'sha256':digest(ROOT/'scripts/qa/prepare-signed-facility-domains.py')}
 held['nodeHelper']={'path':str(ROOT/'scripts/qa/prepare-complete-source-node-domains.py'),'sha256':digest(ROOT/'scripts/qa/prepare-complete-source-node-domains.py')}
 mapped_ids={r['id']for r in mapped['roads']};floor={(r['road'],r['index'])for r in main['frozenContextEvidence']['floorOwnerMinimumControls']}
 no_rise={r['id']for r in apron.get('loweringOnlyRoads',[])}
 node_policy=collections.defaultdict(set)
 for r in policy['nodes']:
  for arm in r['arms']:
   arc=state['arcs'][arm['id']]
   for k,s in enumerate(arc):
    if (s if arm['end']=='from'else arc[-1]-s)<=r['recoveryMeters']+1e-9:node_policy[arm['id']].add(k)
 comfort_roads=set(state['generatedFacilityPolicies'])
 lines={};source={}
 def evidence(ident):
  if ident in source:return source[ident]
  row=rows.get(ident[:12]);road=current[ident]
  if row is None:source[ident]=None;return None
  if row['id']not in lines:lines[row['id']]=signed.source_line(row,geo['origin'])
  line,metres=lines[row['id']];project=[signed.project_fraction(p,line,metres)for p in road['pts']]
  for k,item in enumerate(project):
   fractions=[v['officialSourceFraction']for v in project[max(0,k-1):k+2]];lo,hi=min(fractions),max(fractions)
   item.update(activeLevelRules=signed.rules_over_interval(row['level_rules'],lo,hi),activeRoadFlags=signed.rules_over_interval(row['road_flags'],lo,hi),incidentFractionInterval=[lo,hi])
  source[ident]=(row,project,metres[-1]);return source[ident]
 def endpoint_proof(ident,k):
  ev=evidence(ident)
  if ev is None:return None
  road=current[ident];n=road['from']if k==0 else road['to'];full=complete.connector(ev[0],n);item=ev[1][k]
  if not full or item['sourceProjectionResidualM']>.1 or item['ambiguousSourceBranch']or abs(item['officialSourceFraction']-full['at'])*ev[2]>.15:return None
  return{'node':n,'fullConnector':full,'point':road['pts'][k],'sourceEndpoint':item,'sourceSegmentID':ev[0]['id'],'sourceGeometryWKB_SHA256':hashlib.sha256(bytes.fromhex(ev[0]['geometryWKB'])).hexdigest()}
 def classify(ident,k):
  road=current[ident];yy=road['elev']or[0.]*len(road['pts']);item={'road':ident,'index':k,'point':road['pts'][k],'currentModeledHeight':yy[k],'actualMatrixBound':list(state['bounds'][O[ident]+k])if ident in O else None,'rawElevationIsNull':raw.get(ident,{}).get('elev')is None,'rawElevationNullIsNotSurveyedZero':True,'inputRoadSHA256':canon(road),'inputRibbonSHA256':canon(fps[ident])if ident in fps else None,'rawPhysicalSHA256':canon(raw[ident])if ident in raw else None}
  genuine=[];policy_blocks=[];unknown=[];ev=evidence(ident)
  if ident in O and O[ident]+k in canonical:genuine.append('actual-canonical-bound')
  if (ident,k)in floor:genuine.append('actual-52-owner-minimum')
  if ident in mapped_ids or road.get('elevationSource')in ['surveyed','explicit']:genuine.append('mapped-surveyed-or-explicit-source-profile')
  if road.get('expressway'):genuine.append('separate-expressway-authority')
  if k in node_policy[ident]:policy_blocks.append('existing301-node-policy-control')
  if ident in comfort_roads:policy_blocks.append('existing-Anand-comfort-policy-preserved')
  if ev is None:unknown.append('missing-retained-source-record')
  else:
   src=ev[1][k];item.update(sourceSegmentID=ev[0]['id'],sourceGeometryWKB_SHA256=hashlib.sha256(bytes.fromhex(ev[0]['geometryWKB'])).hexdigest(),source=src)
   if src['sourceProjectionResidualM']>.1 or src['ambiguousSourceBranch']:unknown.append('ambiguous-or-nonlocal-full-WKB-projection')
   genuine+=signed.source_exclusions(src['activeLevelRules'],src['activeRoadFlags'])
  if ident not in raw:unknown.append('missing-original-packed-provenance')
  item.update(genuineImmutableReasons=sorted(set(genuine)),separateExistingPolicyReasons=policy_blocks,unresolvedSourceReasons=unknown,
   fixedContextOnlyByCurrentPolicy=ident in fixed_context,absentFromCurrentVariableSet=ident not in O,
   currentBoundFixedOnlyByPolicy=ident in O and state['bounds'][O[ident]+k][0]==state['bounds'][O[ident]+k][1]and not genuine and not policy_blocks,
   rawProfilePresentButNotClaimedSurveyed=ident in raw and raw[ident].get('elev')is not None and road.get('elevationSource')not in ['surveyed','explicit'],
   noRiseUpperBound=yy[k]if ident in no_rise else None)
  return item
 conflicts=[];seed_by_node=collections.defaultdict(lambda:collections.defaultdict(list));pair_nodes=collections.defaultdict(set)
 for result in failed['results']:
  for number,row in enumerate(result['directConflictsWithOutsideExistingBounds']):
   key=len(conflicts);tag=row['constraint'];conflicts.append({'id':key,'node':result['node'],'constraint':tag,'minimum':row['minimumWithAllOriginalOutsideBounds'],'bound':row['bound']})
   if tag['category']=='finite-apron-coelevation':pair_nodes[tuple(tag['roads'])].add(result['node'])
   for c in row['controls']:
    if abs(c['coefficient'])>1e-10:seed_by_node[result['node']][(c['road'],c['control'])].append(key)
 # Direct full-source connector proof; three non-adjacent pairs remain explicit
 # path/finite-polygon review gaps rather than receiving arbitrary permission.
 pair_proofs={}
 cells=collections.defaultdict(dict)
 for index,(_,_,_,tag)in enumerate(state['coupling_expressions']):
  pair=tuple(tag['roads'])
  if pair in pair_nodes:cells[pair].setdefault(tuple(tag['segments']),[]).append(index)
 for pair in sorted(pair_nodes):
  left,right=pair;shared={current[left]['from'],current[left]['to']}&{current[right]['from'],current[right]['to']};proofs=[]
  for n in sorted(shared):
   a=endpoint_proof(left,0 if current[left]['from']==n else len(current[left]['pts'])-1);b=endpoint_proof(right,0 if current[right]['from']==n else len(current[right]['pts'])-1)
   if a and b and a['fullConnector']['connector_id']==b['fullConnector']['connector_id']:
    seed=(0 if current[left]['from']==n else len(current[left]['pts'])-2,0 if current[right]['from']==n else len(current[right]['pts'])-2)
    connected=set();q=collections.deque([seed]if seed in cells[pair]else[])
    while q:
     cell=q.popleft()
     if cell in connected:continue
     connected.add(cell)
     q.extend((cell[0]+da,cell[1]+db)for da in [-1,0,1]for db in [-1,0,1]if(da or db)and(cell[0]+da,cell[1]+db)in cells[pair]and(cell[0]+da,cell[1]+db)not in connected)
    proofs.append({'node':n,'leftEndpoint':a,'rightEndpoint':b,'literalSeedCell':list(seed),'sourceNodeConnectedCells':[list(c)for c in sorted(connected)]})
  pair_proofs[pair]={'roads':list(pair),'fullUUIDEndpointProofs':proofs,'status':'direct-source-node-and-literal-component-proved'if any(p['sourceNodeConnectedCells']for p in proofs)else'requires-separate-source-path-and-finite-polygon-proof','allExistingCouplingCellIndices':[list(c)for c in sorted(cells[pair])],'allExistingCouplingExpressionIndices':sorted(i for ids in cells[pair].values()for i in ids)}
 print(json.dumps({'phase':'pair-source-proof','pairs':len(pair_proofs),'directProved':sum(p['status'].startswith('direct')for p in pair_proofs.values())}),flush=True)
 proposals=[];all_indices=collections.defaultdict(set);activated_nodes=set();all_controls={};missing_sources=set()
 review_nodes={r['node']:r for r in review['nodes']}
 for number,(node,seeds)in enumerate(sorted(seed_by_node.items()),1):
  datum=review_nodes[node]['sharedRequestedModeledDatumIntersection'][0];budget=max(1.5*abs(datum)/args.tile_max_grade,math.sqrt(6*abs(datum)/args.grade_change_per_metre))
  allowed_pairs={pair for pair,nodes in pair_nodes.items()if node in nodes and pair_proofs[pair]['status'].startswith('direct')}
  supported_roads={r for pair in allowed_pairs for r in pair}|{a['road']for a in review_nodes[node]['completeIncidentArms']}
  queue=[];best={};selected={};boundaries=[];incidence=[];gaps=[]
  for (road,k),why in seeds.items():heapq.heappush(queue,(-budget,road,k,'direct-blocking-row-support',why))
  while queue:
   negative,road,k,reason,why=heapq.heappop(queue);remaining=-negative
   if best.get((road,k),-1.)>=remaining-1e-9:continue
   best[(road,k)]=remaining;entry=classify(road,k);ev=evidence(road)
   if ev is None:missing_sources.add(road[:12])
   if entry['genuineImmutableReasons']or entry['separateExistingPolicyReasons']or entry['unresolvedSourceReasons']:
    boundaries.append({**entry,'reason':'genuine-or-separate-policy-or-unresolved-boundary','directBlockingRows':why});continue
   # An independent road can never enter merely because it overlaps in 2D.
   if road not in supported_roads:
    gaps.append({'road':road,'index':k,'reason':'source-connected-component-membership-not-proved'});continue
   yy=current[road]['elev']or[0.]*len(current[road]['pts']);low=min(datum,yy[k]);high=min(0.,yy[k])if road in no_rise else max(0.,yy[k])
   if high>1e-9:gaps.append({'road':road,'index':k,'reason':'positive-profile-requires-separate-sign-domain'});continue
   selected[(road,k)]={**entry,'requestedNegativeOnlyModeledBounds':[low,high],'whyIncluded':reason,'directBlockingRows':why,'remainingSourceRecoveryBudget':remaining,'modeledDatumNotSurveyed':True}
   all_controls[(road,k)]=entry;all_indices[road].add(k)
   for other in [k-1,k+1]:
    if not 0<=other<len(current[road]['pts']):continue
    distance=abs(ev[1][other]['officialSourceFraction']-ev[1][k]['officialSourceFraction'])*ev[2]
    if distance<=1e-9:distance=math.dist(current[road]['pts'][other],current[road]['pts'][k])
    if distance>remaining:
     boundaries.append({**classify(road,other),'reason':'proposed-existing-modeled-boundary-after-finite-recovery-budget','notASurveyedGroundDatum':True});continue
    heapq.heappush(queue,(-(remaining-distance),road,other,'finite-grade-and-curvature-recovery-neighbor',why))
   if k in [0,len(current[road]['pts'])-1]:
    proof=endpoint_proof(road,k)
    if not proof:gaps.append({'road':road,'index':k,'reason':'activated-endpoint-full-source-connector-unresolved'});continue
    n=proof['node'];activated_nodes.add(n);arms=[]
    for arm,at in bynode[n]:
     other=endpoint_proof(arm,at);valid=other is not None and other['fullConnector']['connector_id']==proof['fullConnector']['connector_id']
     arms.append({'road':arm,'index':at,'fullSourceEndpoint':other,'sameFullUUID':valid})
     if valid:
      supported_roads.add(arm);heapq.heappush(queue,(-remaining,arm,at,'complete-physical-source-node-all-arm-closure',why))
     else:gaps.append({'road':arm,'index':at,'reason':'all-arm-source-UUID-closure-unproved'})
    incidence.append({'node':n,'fullConnectorUUID':proof['fullConnector']['connector_id'],'allCurrentWorldAndJointArms':arms,'actualPackedDetailedOwners':sorted(owner_nodes[n]),'missingPreparedOwnerRoads':sorted(owner_nodes[n]-current.keys())})
  windows=[]
  perroad=collections.defaultdict(list)
  for (road,k),item in selected.items():perroad[road].append(item)
  for road,items in sorted(perroad.items()):
   indexes=sorted(item['index']for item in items);ev=evidence(road)
   windows.append({'road':road,'controlIndices':indexes,'sourceFractionInterval':[min(ev[1][k]['officialSourceFraction']for k in indexes),max(ev[1][k]['officialSourceFraction']for k in indexes)],'inputRoadSHA256':canon(current[road]),'inputRibbonSHA256':canon(fps[road])if road in fps else None,'sourceSegmentID':ev[0]['id'],'sourceGeometryWKB_SHA256':hashlib.sha256(bytes.fromhex(ev[0]['geometryWKB'])).hexdigest(),'controls':items})
  proposals.append({'node':node,'fixedRequestedModeledDatum':datum,'existingRealUnderpassComponentProof':review_nodes[node]['boundUnderpassComponentProofs'],'finiteSourceRecoveryBudget':budget,'requiredDirectBlockingFootprint':[{**classify(road,k),'blockingRowIDs':why}for(road,k),why in sorted(seeds.items())],'finiteRecoveryWindows':windows,'genuineAndPolicyBoundaryControls':boundaries,'activatedNodeAllArmClosure':incidence,'sourceProofAndPreparationGaps':gaps,'status':'inactive-component-proposal-requires-fresh-preparation-and-physical-fit','endpointPermissionGranted':False,'minimumCardinalityRepairClaimed':False})
  print(json.dumps({'phase':'component-proposal','number':number,'node':node,'roads':len(windows),'controls':len(selected),'boundaries':len(boundaries),'gaps':len(gaps)}),flush=True)
 # Every old row remains an obligation. Fixed context constants require actual
 # expression rebuilding after promotion; no copied RHS can release them.
 old_rows={'headroom':[],'coupling':[]}
 for category,expressions in [('headroom',state['head_expressions']),('coupling',state['coupling_expressions'])]:
  for index,expression in enumerate(expressions):
   tag=expression[-1]
   if any(road in all_indices and any(k in all_indices[road]for k in [segment,segment+1])for road,segment in zip(tag['roads'],tag['segments'])):
    old_rows[category].append({'index':index,'expressionSHA256':canon(expression),'tag':tag,'fixedContextConstantsRequireRebuild':any(r not in O and r in all_indices for r in tag['roads'])})
 needed_roads=set(all_indices);missing_owners=sorted({r for p in proposals for n in p['activatedNodeAllArmClosure']for r in n['missingPreparedOwnerRoads']})
 genuine_counts=collections.Counter(reason for item in all_controls.values()for reason in item['genuineImmutableReasons'])
 boundary_counts=collections.Counter(reason for p in proposals for item in p['genuineAndPolicyBoundaryControls']for reason in item['genuineImmutableReasons'])
 for value in held.values():assert digest(value['path'])==value['sha256']
 assert digest(CONTEXT)==main['inputs']['context']['sha256']
 output={'schema':'inactive-negative-source-component-reconstruction-proposal-v2','researchOnly':True,'activePolicy':False,'releaseApproved':False,'heightAuthorityGranted':False,'endpointPermissionGranted':False,'scope':__doc__,'inputs':held,'method':{'blockingFootprint':'Exact nonzero support of every retained direct conflicting row; alternatives are recorded, not all mathematically required controls.','recoveryClosure':'Source-distance-bounded least all-arm closure under the stated modeled-datum grade/curvature budget. A source-connected complete physical-node branch may enter; an independent projected overlap may not.','nullElevation':'Unknown/null source height is not surveyed zero. New negative-to-current-ground parameter domains are modeled component proposals tied to the retained actual underpass proof.','globalMinimumRepairClaimed':False,'oldClearanceRowsRetired':0,'physicalFitPerformed':False},'blockingRows':conflicts,'blockingPairSourceProofs':list(pair_proofs.values()),'components':proposals,'oldClearanceObligations':old_rows,'preparationRequirements':{'newCoreVariableRoads':sorted(r for r in needed_roads if r in core_ids and r not in O),'promoteFixedDetailedContextRoads':sorted(needed_roads&fixed_context),'newDetailedOwnerRoadsAbsentPreparedJoint':missing_owners,'missingRetainedSourcePrefixes':sorted(missing_sources|{r[:12]for r in missing_owners if r[:12]not in rows}),'roadsMissingCurrentFootprints':sorted(r for r in needed_roads if r not in fps),'rerunAll304PackedOwnerIncidenceAtActivatedNodes':True,'rebuildFullSourceFractionsLiteralFootprintsAndOldHeadroomCouplingsAfterPromotion':True,'completeContextAndAffectedClosureRequired':True,'all301AndAnandComfortAndNoRisePoliciesRemainSeparate':True,'requiresIndependentSourceGeometryReviewBeforeAnyConsumer':True},'summary':{'seedNodes':len(proposals),'blockingRows':len(conflicts),'blockingRoadPairs':len(pair_proofs),'directFullSourceLiteralPairs':sum(p['status'].startswith('direct')for p in pair_proofs.values()),'pairsRequiringSeparatePathPolygonProof':sum(not p['status'].startswith('direct')for p in pair_proofs.values()),'unionProposedRoads':len(needed_roads),'unionProposedControls':len(all_controls),'activatedSourceNodes':len(activated_nodes),'genuineImmutableBoundaryReasons':dict(boundary_counts),'newCoreVariableRoads':sum(r in core_ids and r not in O for r in needed_roads),'fixedContextRoadsNeedingPromotion':len(needed_roads&fixed_context),'missingPreparedDetailedOwners':len(missing_owners),'missingSourcePrefixes':len(missing_sources),'oldHeadroomRowsRetained':len(old_rows['headroom']),'oldCouplingRowsRetained':len(old_rows['coupling']),'actualCanonicalOrFloorControlsReleased':0,'old301DecisionsChanged':0,'fitOrEndpointApproval':False}}
 annotate_output(output,ROOT)
 baseline=read('baselineProposal',cli.baseline_proposal)
 union=read('auxiliarySourceUnion',cli.source_union)
 old_rows={r['id']:r for r in reference['rows']};new_rows={r['id']:r for r in union['rows']}
 assert len(new_rows)==len(union['rows']) and all(new_rows.get(k)==v for k,v in old_rows.items())
 output['auxiliarySourcePreparationEvidence']={'path':str(cli.source_union),'sha256':digest(cli.source_union),'rows':len(new_rows),'oldReferenceRowsUnchanged':len(old_rows),'addedSourceIDs':sorted(new_rows.keys()-old_rows.keys()),'boundCurrentContextReferenceReplaced':False,'freshProducerBindingRequiredBeforeAnyConsumer':True}
 normalize_proposal(output)
 assert control_domains(output)==control_domains(baseline),'Selected physical control set or per-seed domains changed'
 assert canon(output['oldClearanceObligations'])==canon(baseline['oldClearanceObligations']),'Old clearance obligations changed'
 before_anchors=immutable_anchor_controls(baseline);after_anchors=immutable_anchor_controls(output)
 assert before_anchors==after_anchors,'Canonical/floor modeled anchor values changed'
 output['normalizationVerification']={'baseline':held['baselineProposal'],'exactPerSeedControlDomainsUnchanged':True,'oldClearanceObligationsUnchanged':True,'modeledAnchorControlsUnchanged':True,'currentSolverAndPolicyInputsUnchanged':True,'notAPhysicalFit':True}
 for value in held.values():assert digest(value['path'])==value['sha256']
 with OUTPUT.open('x')as f:json.dump(output,f,indent=2,allow_nan=False);f.write('\n')
 print(json.dumps({'output':str(OUTPUT),'sha256':digest(OUTPUT),'summary':output['summary'],'normalization':output['frontierNormalization']}),flush=True)

if __name__=='__main__':main()
