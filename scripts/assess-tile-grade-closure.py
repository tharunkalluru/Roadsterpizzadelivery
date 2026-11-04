#!/usr/bin/env python3
"""Offline full detailed-road graph grade-envelope assessment.

Necessary endpoint feasibility only: finite apron surfaces, protected facilities,
C1 triangle grades and actual complete-vehicle gates remain separate. This does
not install profiles or expand the runtime core road inventory.
"""
import argparse
import collections,gzip,hashlib,heapq,json,math,time
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repo',type=Path,default=Path(__file__).resolve().parents[1])
parser.add_argument('--model',type=Path,required=True)
parser.add_argument('--source-geometry',type=Path,required=True)
parser.add_argument('--classification',type=Path,default=Path('docs/qa/evidence/reported-roads/tile-boundary-source-audit-20261103/classification.json'))
parser.add_argument('--tile-transports',type=Path)
parser.add_argument('--physical-surface-receipt',type=Path)
parser.add_argument('--pending-node-targets',type=Path)
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--grades',type=float,nargs='+',default=[.065,.1])
args=parser.parse_args();B=args.repo;T=time.monotonic()
classification_path=args.classification if args.classification.is_absolute()else B/args.classification
source=json.loads(args.source_geometry.read_text());repairs={r['id']:r for r in source['roads']}
core_path=B/'public/city/core.pack.wasm';core=json.load(gzip.open(core_path));core_ids={r['id']for r in core['roads']}
model_path=args.model;model=json.loads(model_path.read_text())
assert model.get('sourceRoadGeometryGeneration')==source['generationID'],'mixed source model/generation'
assert hashlib.sha256(core_path.read_bytes()).hexdigest()==source['sourceCorePackSHA256'],'raw core/source mismatch'
physical_receipt=json.loads(args.physical_surface_receipt.read_text())if args.physical_surface_receipt else None
if physical_receipt:
 assert physical_receipt['ordinaryModelSHA256']==hashlib.sha256(model_path.read_bytes()).hexdigest(),'physical diagnostic/model mismatch'
 assert physical_receipt['sourceRoadGeometryGeneration']==source['generationID'],'physical diagnostic/source mismatch'
physical_nodes={r['node']:r for r in physical_receipt['results']}if physical_receipt else{}
inventory=json.loads(classification_path.read_text());cases=inventory['rows'];caseBy={(r['id'],r['end']):r for r in cases};wanted={r['id']for r in cases}
tile_model={}
if args.tile_transports:
 supplement=json.loads(args.tile_transports.read_text())
 assert supplement['sourceModelSHA256']==hashlib.sha256(model_path.read_bytes()).hexdigest(),'tile supplement/model mismatch'
 tile_model={r['id']:r for r in supplement['tileRoads']}
core_node_rows=collections.defaultdict(list)
for road in model['roads']:
 for key,k in[(road['from'],0),(road['to'],-1)]:
  core_node_rows[key].append({'id':road['id'],'end':'from'if k==0 else'to','point':road['pts'][k],'height':(road['elev']or[0.]*len(road['pts']))[k]})
source_node_rows=collections.defaultdict(list)
DRIVE=set('motorway motorway_link trunk primary secondary tertiary trunk_link primary_link secondary_link tertiary_link unclassified residential living_street service unknown'.split())
node_ids=[];index={};adj=[];baseline=[];baseline_spread=[]
def node(s):
 if s not in index:index[s]=len(node_ids);node_ids.append(s);adj.append([]);baseline.append([])
 return index[s]
def arclength(pp):return sum(math.dist(a,b)for a,b in zip(pp,pp[1:]))
def explicit_core_endpoint_owner(road,core_rows):
 """Retain exact-node input incidence independently of graph feasibility.

 These are actual core heights and prepared owner baselines, never pending
 targets or snapped coordinates. Selection grants no height/facility authority.
 """
 endpoints=[]
 for end,k in [('from',0),('to',-1)]:
  node_id=road.get(end)
  if not node_id:continue
  core_ends=core_rows.get(node_id,[])
  owner_height=(road.get('elev')or[0.]*len(road['pts']))[k]
  gap=max((abs(row['height']-owner_height)for row in core_ends),default=0.)
  if gap>.008:endpoints.append({'node':node_id,'end':end,'ownerPoint':road['pts'][k],'ownerHeight':owner_height,'coreEndpoints':core_ends,'maximumHeightGap':gap})
 return {'id':road['id'],'cls':road['cls'],'endpoints':endpoints}if endpoints else None
edges=[];edge_by_id={};owners={};wanted_roads={};packhash={};explicit_owner_rows={}
for pack in core['packs']:
 path=B/'public/city'/pack['file'];bb=path.read_bytes();packhash[pack['file']]=hashlib.sha256(bb).hexdigest();data=json.loads(gzip.decompress(bb))
 for tile,zone in data['tiles'].items():
  for raw in zone['roads']:
   if raw.get('ctx')or raw['id']in core_ids or raw['cls']not in DRIVE:continue
   road_id=raw['id']
   e=raw
   if road_id in repairs:e={**raw,'pts':repairs[road_id]['pts'],'elev':repairs[road_id]['elev']}
   if road_id in tile_model:e=tile_model[road_id]
   # Graph-infeasible nodes deliberately keep their baseline in the preview;
   # one missing graph endpoint also prevents an edge. Neither may hide an
   # actual owner incident to a changed core datum from the INPUT inventory.
   explicit=explicit_core_endpoint_owner(e,core_node_rows)
   if explicit:
    prior=explicit_owner_rows.get(road_id)
    assert prior is None or prior==explicit,'Conflicting explicit core-endpoint owner: '+road_id
    explicit_owner_rows[road_id]=explicit
   if road_id in edge_by_id:owners[road_id].append((pack['file'],tile));continue
   for key,k in[(e['from'],0),(e['to'],-1)]:
    if key in source['nodes']:source_node_rows[key].append({'id':road_id,'end':'from'if k==0 else'to','height':(e['elev']or[0.]*len(e['pts']))[k],'source':road_id not in tile_model})
   if not e.get('from')or not e.get('to'):continue
   a=node(e['from']);b=node(e['to']);length=arclength(e['pts']);yy=e.get('elev')or[0.]*len(e['pts']);baseline[a].append(yy[0]);baseline[b].append(yy[-1]);k=len(edges);edge_by_id[road_id]=k;edges.append((a,b,length,yy[0],yy[-1],road_id,e['cls'],e['w'],max(map(abs,yy))));owners[road_id]=[(pack['file'],tile)];adj[a].append((b,length,k));adj[b].append((a,length,k))
   if road_id in wanted:wanted_roads[road_id]=e
explicit_owners=[explicit_owner_rows[key]for key in sorted(explicit_owner_rows)]
print(json.dumps({'phase':'graph','roads':len(edges),'nodes':len(node_ids),'packs':len(packhash),'explicitCoreEndpointOwners':len(explicit_owners),'seconds':time.monotonic()-T}),flush=True)
anchors=collections.defaultdict(list)
for e in model['roads']:
 if e['cls']not in DRIVE:continue
 for s,k in[(e['from'],0),(e['to'],-1)]:
  if s in index:anchors[index[s]].append((e['elev']or[0.]*len(e['pts']))[k])
# Explicitly known final solver targets are reported separately; no data is installed.
planned_targets=json.loads(args.pending_node_targets.read_text())if args.pending_node_targets else{}
for s,y in planned_targets.items():
 if s in index and index[s]in anchors:anchors[index[s]]=[y]*len(anchors[index[s]])
base=[min(v,key=abs)if v else 0. for v in baseline]
ambiguous_base={i for i,v in enumerate(baseline)if v and max(v)-min(v)>.02};anchor_ambiguous={i for i,v in anchors.items()if max(v)-min(v)>.02}
def dijkstra(G,sign):
 dist=[math.inf]*len(node_ids);origin=[-1]*len(node_ids);heap=[]
 for v,ys in anchors.items():
  h=min(ys)if sign==1 else-max(ys);dist[v]=h;origin[v]=v;heap.append((h,v))
 heapq.heapify(heap)
 while heap:
  value,v=heapq.heappop(heap)
  if value!=dist[v]:continue
  for w,d,k in adj[v]:
   next_value=value+G*d
   if next_value+1e-10<dist[w]:dist[w]=next_value;origin[w]=origin[v];heapq.heappush(heap,(next_value,w))
 return dist,origin
results=[]
for G in args.grades:
 U,Uorigin=dijkstra(G,1);negL,Lorigin=dijkstra(G,-1);L=[-v for v in negL];bad={i for i in range(len(node_ids))if L[i]>U[i]+1e-6};y=[max(L[i],min(U[i],base[i]))if i not in bad else base[i]for i in range(len(node_ids))]
 conflict_anchors={i for i in anchors if i in bad};changed=[];affected_nodes=set();raw_positive=[]
 for k,(a,b,d,ya,yb,road_id,cls,width,peak)in enumerate(edges):
  if abs(y[a]-ya)>.02 or abs(y[b]-yb)>.02:
   changed.append(k);affected_nodes.update([a,b])
   if peak>1.2:raw_positive.append(road_id)
 outrows=[]
 for r in cases:
  k=edge_by_id[r['id']];a,b,length,ya,yb,road_id,cls,width,peak=edges[k];v=a if r['end']=='from'else b;target=anchors.get(v,[r['currentCoreLevels'][0]['y']]);unique=max(target)-min(target)<=.02;H=sum(target)/len(target);gap=abs(H-(ya if r['end']=='from'else yb));p=math.sqrt(gap*.00625);required=2*math.sqrt(gap/.00625)if p<=G else gap/G+G/.00625
  category='protected-real-underpass'if min(target)<-.02 else'positive-source-bridge-connection'if r['sourceCategory'].startswith('declared_positive')else'unannotated-modelled-approach'
  witness=None
  if v in bad:
   origin=Lorigin[v]if L[v]>H+1e-6 else Uorigin[v];source_h=max(anchors[origin])if L[v]>H+1e-6 else min(anchors[origin]);bound=L[v]if L[v]>H+1e-6 else U[v];distance=abs(source_h-bound)/G
   witness={'otherCoreNode':node_ids[origin],'otherHeight':source_h,'targetHeight':H,'shortestTileDistance':distance,'necessaryGrade':abs(source_h-H)/distance if distance>1e-8 else None,'requiredHeightDifference':abs(source_h-H)}
  outrows.append({'id':road_id,'end':r['end'],'node':r['node'],'category':category,'coreHeight':H,'tileHeight':ya if r['end']=='from'else yb,'heightGap':gap,'ownRoadLength':length,'ownEdgeEfficientC1RunAtGrade':required,'ownEdgeCanRecoverToSourceBeforeFarEnd':required<=length,'local150mRecoveryPossible':required<=min(150.,length),'graphAnchorCompatible':v not in bad,'coreLevelAmbiguous':not unique,'fullGraphConflict':witness,'modelHeightAbove1p2':H>1.2,'rawTilePositiveProfile':peak>1.2})
 summary={'grade':G,'anchorNodes':len(anchors),'inconsistentCoreLevelNodes':len(anchor_ambiguous),'conflictingCoreAnchors':len(conflict_anchors),'conflictRegionNodes':len(bad),'changedTileRoadsPreview':len(changed),'changedRawPositiveProfileRoads':len(raw_positive),'affectedTileNodes':len(affected_nodes),'affectedAmbiguousTileBaselineNodes':len(affected_nodes&ambiguous_base),'mismatchEndpointsGraphCompatible':sum(r['graphAnchorCompatible']for r in outrows),'mismatchEndpointsNeedCoreAnchorReconciliation':sum(not r['graphAnchorCompatible']for r in outrows),'ownEdgeC1RecoveryFeasibleEndpoints':sum(r['ownEdgeCanRecoverToSourceBeforeFarEnd']for r in outrows),'ownEdgeLocal150mFeasibleEndpoints':sum(r['local150mRecoveryPossible']for r in outrows),'categories':{c:{'endpoints':sum(r['category']==c for r in outrows),'graphCompatible':sum(r['category']==c and r['graphAnchorCompatible']for r in outrows),'ownEdgeLocal150m':sum(r['category']==c and r['local150mRecoveryPossible']for r in outrows)}for c in sorted({r['category']for r in outrows})},'compatibleUnannotatedLowApproachesAtMost1p2':sum(r['category']=='unannotated-modelled-approach'and r['graphAnchorCompatible']and r['coreHeight']<=1.2for r in outrows),'compatibleUnannotatedRaisedApproachesAbove1p2':sum(r['category']=='unannotated-modelled-approach'and r['graphAnchorCompatible']and r['coreHeight']>1.2for r in outrows)}
 source_rows=[]
 for source_node,proof in sorted(source['nodes'].items()):
  core_levels=core_node_rows.get(source_node,[]);tile_levels=source_node_rows.get(source_node,[])
  core_heights=[planned_targets.get(source_node,r['height'])for r in core_levels];tile_heights=[r['height']for r in tile_levels]
  receipt=physical_nodes.get(source_node)
  source_rows.append({'node':source_node,'connectorID':proof['connectorID'],'correctedSourceXY':proof['after'],'coreLevels':core_levels,'tileLevels':tile_levels,'coreHeightSpread':max(core_heights)-min(core_heights)if core_heights else None,'maximumCoreTileHeightGap':max((abs(a-b)for a in core_heights for b in tile_heights),default=None),'belongsToOriginal300':any(r['node']==source_node for r in cases),'graphAnchorCompatible':index[source_node]not in bad if source_node in index else None,'actualSurfaceDiagnostic':{'classification':receipt['classification'],'actualSupportGap':receipt['actualSupportGap'],'unresolved':receipt['classification']!='actual-emitted-support-seam'}if receipt else None})
 summary['sourceCorrectedNodeCount']=len(source_rows);summary['sourceCorrectedNodesWithTileHeightGapAbove1cm']=sum((r['maximumCoreTileHeightGap']or 0)>.01 for r in source_rows)
 summary['explicitCoreEndpointOwners']=len(explicit_owners)
 print(json.dumps(summary),flush=True);results.append({'summary':summary,'rows':outrows,'changedRoads':[edges[k][5]for k in changed],'rawPositiveRoadsRequiringAuthority':raw_positive,'sourceCorrectedNodes':source_rows})
out={'scope':'READONLY grade-envelope feasibility assessment, not a geometry/vehicle/obstacle approval. Uses the exact explicitly bound source-corrected ordinary core heights and optional pending node targets, with detailed source-corrected graph lengths. Rerun against final solved core before producing any changed tile overlay. No road/profile/activation changed.','inputs':{'model':str(model_path),'modelSHA256':hashlib.sha256(model_path.read_bytes()).hexdigest(),'sourceGeometryGeneration':source['generationID'],'sourceGeometrySHA256':hashlib.sha256(args.source_geometry.read_bytes()).hexdigest(),'coreSHA256':hashlib.sha256((B/'public/city/core.pack.wasm').read_bytes()).hexdigest(),'classificationSHA256':hashlib.sha256(classification_path.read_bytes()).hexdigest(),'approvedPendingNodeTargets':planned_targets},'method':{'fullTileOnlyDrivableGraph':True,'allCoreAnchorsNotJust300':True,'upperEnvelope':'min_anchor(H+G*shortestDistance)','lowerEnvelope':'max_anchor(H-G*shortestDistance)','softPreference':'Retain source node profile within feasible envelopes; no forced zero at a short edge far endpoint.','C1PitchBoundForOwnEdgeScreen':.00625,'efficientC1Run':'triangular2sqrt(H/K) ifsqrt(HK)<=G, otherwiseH/G+G/K','qualification':'Graph feasibility is a necessary endpoint-grade test. C1/true triangle grade, all source access/widths, protected bridge/rail, historical headroom, owner/context copies and complete vehicle/obstacle checks remain mandatory.'},'graph':{'packs':len(packhash),'roads':len(edges),'nodes':len(node_ids),'ambiguousRawTileNodeLevels':len(ambiguous_base)},'results':results,'sourcePackSHA256':packhash}
out['explicitCoreEndpointOwners']=explicit_owners
out['method']['explicitCoreEndpointOwnerSelection']={'heightMismatchThresholdM':.008,'exactSourceNodeIDsOnly':True,'includesGraphInfeasibleAndMissingGraphEndpointOwners':True,'usesActualCoreHeightsInsteadOfPendingTargets':True,'coordinatesSnapped':False,'inputSelectionOnly':True,'heightOrFeasibilityApproval':False}
if physical_receipt:
 out['physicalSurfaceReceipt']={'file':str(args.physical_surface_receipt),'sha256':hashlib.sha256(args.physical_surface_receipt.read_bytes()).hexdigest(),'summary':physical_receipt['summary'],'releaseApproved':False,'unresolved':[{'node':r['node'],'classification':r['classification'],'missingRoads':r['missingRoads'],'ambiguousRoads':r['ambiguousRoads']}for r in physical_receipt['results']if r['classification']!='actual-emitted-support-seam']}
p=args.output;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(out,separators=(',',':'))+'\n');print(json.dumps({'output':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'seconds':time.monotonic()-T}),flush=True)
