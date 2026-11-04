#!/usr/bin/env python3
"""Build-time, source-bound zero-bank road-height feasibility solver.

This consumes exact exported runtime ribbons. It never changes XY, widths, lane
capacity, canonical railway geometry, or the immutable source pack. Its result
still requires the independent Float32 mesh/full-vehicle acceptance gates.
Install only the pinned build-time requirements; no Python runs in the game.
"""
import argparse
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repo',type=Path,default=Path(__file__).resolve().parents[1])
for name in ['model','footprints','historical-model','historical-footprints','tile-transports','output']:
    parser.add_argument('--'+name,type=Path,required=True)
for name,default in {
 'core':'public/city/core.pack.wasm',
 'source-evidence':'docs/qa/evidence/reported-roads/joined-approach-width-source-2026-10-21.json',
 'known-cases':'docs/qa/evidence/main-expansion/reported-road-final-independent-known30.json',
 'regressions':'docs/qa/evidence/main-expansion/reported-road-final-independent-finite.json',
 'mapped-levels':'src/world/bridge-level-data.json',
 'source-family-binding':'docs/qa/evidence/reported-roads/langar-de9-source-bridge-binding.json',
 'historical-lowering-profiles':'docs/qa/evidence/reported-roads/historical-lowering-profiles-a679b72.json',
 'source-family-evidence':'docs/qa/evidence/reported-roads/pv-source-family-layer-binding.json',
 'apron-source-evidence':'docs/qa/evidence/reported-roads/remaining-apron-source-classification.json',
 'geographic-reference':'docs/qa/evidence/reported-roads/geodetic-historical-reference-9413-20261103.json',
 'source-node-fans':'docs/qa/evidence/reported-roads/source-9413-authorized-junction-fans.json',
 'historical-cap-seam-proof':'docs/qa/evidence/reported-roads/historical-cap-seam-source-classification-independent-9413-20261103.json',
 'connected-facility-proof':'docs/qa/evidence/reported-roads/source-node-actual-surfaces-diagnostic-9413-v2.json',
 'generated-facility-policy':'docs/qa/evidence/reported-roads/anandbagh-generated-approach-policy-9413.json',
 'positive-facility-policy':'docs/qa/evidence/reported-roads/source-connected-positive-facilities-9413.json',
}.items():
    parser.add_argument('--'+name,type=Path,default=Path(default))
parser.add_argument('--ledger',type=Path)
parser.add_argument('--source-geometry',type=Path)
parser.add_argument('--component-windows',type=Path)
parser.add_argument('--joint-tile-input',type=Path,help='Exact selected detailed-road owners, contexts, source connectors and runtime footprints for the joint offline solve')
parser.add_argument('--historical-tile-model',type=Path,help='Strict historical actual City triangles, caps and complete selected detailed-road footprints')
parser.add_argument('--joint-component-policy',type=Path,help='Source-bound PJR generated approach windows and local source-level controls')
parser.add_argument('--additional-source-reference',type=Path,help='Complete immutable-release source completion for diagnosed road conflicts; existing retained bindings must agree')
parser.add_argument('--complete-core-context',type=Path,help='Bound conservative universe of every potentially growable core profile; these roads remain fixed until actual physical scope reaches them')
parser.add_argument('--generated-node-datum-policy',type=Path,help='Explicit complete-incidence policy for inconsistent unsurveyed source-connector datums; no canonical/protected control is released')
parser.add_argument('--generated-facility-rebase-proof',type=Path,help='Explicit replayable unchanged-input proof for only the original two local comfort policies')
parser.add_argument('--prepare-component-closure',action='store_true',help='Classify literal physical couplings once and compute their bounded least fixed point before matrix assembly')
parser.add_argument('--overlap-cache',type=Path,help='Optional trusted local build cache; never a runtime or source-authority input')
parser.add_argument('--diagnostic-solve-context',type=Path,help='Write a trusted local numeric experiment context; never a runtime or source-authority artifact')
parser.add_argument('--diagnostic-context-only',action='store_true',help='Stop after writing the diagnostic context, without fitting or producing road profiles')
parser.add_argument('--fixed-tile-constraints',type=Path,default=Path('docs/qa/evidence/reported-roads/node-9978-fixed-tile-constraints.json'))
parser.add_argument('--source-apron-binding',type=Path,default=Path('docs/qa/evidence/reported-roads/east-93f-source-bridge-binding.json'))
parser.add_argument('--apron-policy',type=Path,default=Path('docs/qa/evidence/reported-roads/road-profile-apron-policy.json'))
parser.add_argument('--max-grade',type=float,default=.075)
parser.add_argument('--fallback-grade',type=float,default=.1)
parser.add_argument('--physical-max-grade',type=float,default=.0995)
parser.add_argument('--same-layer-tolerance',type=float,default=.008)
parser.add_argument('--grade-change-per-metre',type=float,default=.00625)
parser.add_argument('--apron-height-adjustment',type=float,default=.15)
parser.add_argument('--apron-window',type=float,default=30.)
parser.add_argument('--minimum-polygon-area',type=float,default=1e-6)
parser.add_argument('--time-limit',type=float,default=90.)
parser.add_argument('--tile-max-grade',type=float,default=.065,help='Detailed-street grade, independently bounded; never automatically raised by the core fallback')
parser.add_argument('--tile-deviation-weight',type=float,default=1000.,help='Joint objective preference for retaining original detailed-street datums before preserving estimated arterial humps')
args=parser.parse_args()
if any([args.joint_tile_input,args.historical_tile_model,args.joint_component_policy])and not all([args.joint_tile_input,args.historical_tile_model,args.joint_component_policy]):parser.error('Joint solving requires the detailed input, actual historical tile model and source-bound component policy together')
for key in ['core','source_evidence','known_cases','regressions','mapped_levels','source_family_binding','source_family_evidence','apron_source_evidence','geographic_reference','historical_lowering_profiles','apron_policy','fixed_tile_constraints','source_apron_binding','source_node_fans','historical_cap_seam_proof','connected_facility_proof','generated_facility_policy','positive_facility_policy']:
    value=getattr(args,key)
    if not value.is_absolute():setattr(args,key,args.repo/value)
if not 0<args.same_layer_tolerance<.01:parser.error('model tolerance must leave margin below the unchanged1cm physical gate')
if not 0<args.max_grade<=args.fallback_grade<=.1:parser.error('grade bounds must be positive and at most10%')
if args.grade_change_per_metre<=0:parser.error('grade change must be positive')
if not 0<args.tile_max_grade<=.1:parser.error('detailed-street grade must be positive and at most10%')
if not 1<=args.tile_deviation_weight<=1e6:parser.error('detailed-street deviation weight must be finite and bounded')
if not 0<=args.apron_height_adjustment<=.15 or not 0<=args.apron_window<=30:parser.error('estimated apron policy is bounded to15cm/30m')
import json,math,gzip,time,hashlib,itertools,os,copy,collections
import numpy as np
from scipy.optimize import linprog
from scipy.sparse import coo_matrix
B=str(args.repo);T=time.monotonic();solverSHAAtStart=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
sourceInputKeys=['model','footprints','historical_model','historical_footprints','tile_transports','core','source_evidence','known_cases','regressions','mapped_levels','source_family_binding','source_family_evidence','apron_source_evidence','geographic_reference','historical_lowering_profiles','apron_policy','fixed_tile_constraints','source_apron_binding','source_node_fans','historical_cap_seam_proof','connected_facility_proof','generated_facility_policy','positive_facility_policy']
sourceInputKeys += [key for key in['source_geometry','component_windows','joint_tile_input','historical_tile_model','joint_component_policy','additional_source_reference','complete_core_context','generated_node_datum_policy','generated_facility_rebase_proof']if getattr(args,key)]
initialInputSHA={key:hashlib.sha256(Path(getattr(args,key)).read_bytes()).hexdigest()for key in sourceInputKeys}
MODEL=str(args.model);FP=str(args.footprints)
sourceGeometry=json.load(open(args.source_geometry))if args.source_geometry else None
sourceRepairs={r['id']:r for r in sourceGeometry['roads']}if sourceGeometry else{}
geographicReference=json.load(open(args.geographic_reference))if sourceGeometry else None
geographicRecords={};geographicFamilies=collections.defaultdict(list)
if geographicReference:
 g=geographicReference
 assert g['version']==1 and g['kind']=='verified-overture-geographic-source-reference'
 assert g['generationID']==sourceGeometry['generationID']and g['sourceDataSHA256']==initialInputSHA['source_geometry']and g['sourceCorePackSHA256']==initialInputSHA['core'],'Unbound geographic historical reference'
 assert g['policy']['legacyPointFractionsUsed']is False and g['policy']['legacyHeightsUsed']is False and g['policy']['maximumProjectionErrorM']==.075 and g['policy']['distinctBranchAmbiguityM']==.15
 geographicRecords={r['id']:r for r in g['roads']};inventory=[r['id']for r in g['roads']]+[r['id']for r in g['unresolved']]
 assert len(geographicRecords)==len(g['roads'])and len(set(inventory))==len(inventory)and set(inventory)==set(sourceRepairs),'Incomplete geographic reference inventory'
 sourceRecords={r['id']:r for r in sourceGeometry['sources']}
 for record in geographicRecords.values():
  repair=sourceRepairs[record['id']];source=sourceRecords[repair['sourceSegmentID']]
  assert record['sourceSegmentID']==repair['sourceSegmentID']and record['correctedArc']==repair['correctedArc']
  for name in['legacyArc','legacyOfficialMetres','correctedArc','correctedOfficialMetres']:
   values=record[name];assert len(values)>=2 and all(math.isfinite(x)for x in values)and all(a<b for a,b in zip(values,values[1:]))
  assert len(record['legacyArc'])==len(repair['expected']['pts'])==len(record['legacyOfficialMetres'])==len(record['projectionErrors'])
  assert all(math.isfinite(x)and 0<=x<=.075 for x in record['projectionErrors'])
  expected=repair['sourceFractions'];assert len(expected)==len(record['correctedOfficialMetres'])and max(abs(f*source['geodeticLengthM']-metres)for f,metres in zip(expected,record['correctedOfficialMetres']))<1e-7
  distance=0.
  for index,p in enumerate(repair['expected']['pts']):
   if index:distance+=math.dist(repair['expected']['pts'][index-1],p)
   assert abs(record['legacyArc'][index]-distance)<1e-7
  assert max(abs(record['legacyOfficialMetres'][k]-repair['cuts']['actualBefore'][k]*source['geodeticLengthM'])for k in[0,-1])<1e-7
  geographicFamilies[record['sourceSegmentID']].append(record)
apronPolicy=json.load(open(args.apron_policy));componentWindows=json.load(open(args.component_windows))if args.component_windows else{'sourceModelSHA256':hashlib.sha256(Path(MODEL).read_bytes()).hexdigest(),'iteration':0,'roads':{}}
generatedFacilityPolicy=json.load(open(args.generated_facility_policy))
generatedFacilityRebase=None
if args.generated_facility_rebase_proof:
 import importlib.util
 verifierPath=args.repo/'scripts/qa/verify-scoped-generated-facility-rebase.py'
 verifierSpec=importlib.util.spec_from_file_location('scoped_facility_rebase_consumer',verifierPath)
 verifier=importlib.util.module_from_spec(verifierSpec);verifierSpec.loader.exec_module(verifier)
 generatedFacilityRebase=verifier.verify_proof(args.generated_facility_rebase_proof,initialInputSHA['model'],initialInputSHA['footprints'])
 assert generatedFacilityRebase['proofSHA256']==initialInputSHA['generated_facility_rebase_proof']and generatedFacilityRebase['sourcePolicySHA256']==initialInputSHA['generated_facility_policy'],'Scoped rebase/policy input mismatch'
assert generatedFacilityPolicy['version']==1 and (generatedFacilityRebase is not None or(generatedFacilityPolicy['sourceModelSHA256']==initialInputSHA['model']and generatedFacilityPolicy['sourceFootprintsSHA256']==initialInputSHA['footprints'])),'Generated facility policy/model/footprint mismatch'
assert generatedFacilityPolicy['globalGradeChangePerMetre']==args.grade_change_per_metre and generatedFacilityPolicy['maximumPermittedLocalGradeChangePerMetre']==.015
assert hashlib.sha256((args.repo/generatedFacilityPolicy['sourceClassification']).read_bytes()).hexdigest()==generatedFacilityPolicy['sourceClassificationSHA256'],'Generated approach classification changed'
generatedFacilityPolicies={r['id']:r for r in generatedFacilityPolicy['roads']}
positiveFacilityPolicy=json.load(open(args.positive_facility_policy))if args.joint_tile_input else None
positiveFacilityRoads={r['id']:r for r in positiveFacilityPolicy['roads']}if positiveFacilityPolicy else{}
positiveFacilityNodes={r['node']for r in positiveFacilityPolicy['nodes']}if positiveFacilityPolicy else set()
if positiveFacilityPolicy:
 assert positiveFacilityPolicy['sourceModelSHA256']==initialInputSHA['model']and positiveFacilityPolicy['sourceJointInputSHA256']==initialInputSHA['joint_tile_input']and positiveFacilityPolicy['sourceDataSHA256']==initialInputSHA['source_geometry'],'Positive facility source tuple mismatch'
 patch=positiveFacilityPolicy['localSourceCrosslink']
 apronPolicy.setdefault('localJunctionPatches',[]).append({'id':'source-proved-lakdikapul-atgrade-crosslink','connector':patch['connector'],'maximumConnectorLength':patch['maximumConnectorLength'],'roads':patch['roads'],'radius':patch['radius'],'requiredLocalSourceLevel':patch['requiredLocalSourceLevel'],'conditioningPolicySHA256':initialInputSHA['positive_facility_policy']})
assert componentWindows['sourceModelSHA256']==hashlib.sha256(Path(MODEL).read_bytes()).hexdigest(),'component window/model mismatch'
if componentWindows.get('fixedPointPreparation'):
 preparation=componentWindows['fixedPointPreparation']
 assert {key:digest for key,digest in preparation['inputs'].items()if key!='component_windows'}=={key:digest for key,digest in initialInputSHA.items()if key!='component_windows'},'component closure/source input mismatch'
 assert preparation['sameLayerTolerance']==args.same_layer_tolerance,'component closure/tolerance mismatch'
def merged_arc_ranges(spans):
 """Canonical bounded intervals; applying the same authority is idempotent."""
 merged=[]
 for lo,hi in sorted(spans):
  if merged and lo<=merged[-1][1]+1e-6:merged[-1][1]=max(merged[-1][1],hi)
  else:merged.append([lo,hi])
 return merged
for road,policy in positiveFacilityRoads.items():
 record=componentWindows['roads'].setdefault(road,{'ranges':[],'reason':'Explicit source-proved positive facility recovery domain'})
 record['ranges']=merged_arc_ranges(record['ranges']+policy['modelArcWindows'])
fixedConstraints=json.load(open(args.fixed_tile_constraints));fixedTileIds={r['id']for r in fixedConstraints['roads']}
stage=json.load(open(MODEL));tile=json.load(open(str(args.tile_transports)));allCurrent={r['id']:r for r in stage['roads']};allCurrent.update({r['id']:r for r in tile['tileRoads']});rails=stage['profiles'];underpassIds=set(stage['underpassChanges'])|set(stage['report']['underpassRoadIds'])
joint=json.load(open(args.joint_tile_input))if args.joint_tile_input else None
jointPolicy=json.load(open(args.joint_component_policy))if joint else None
jointTileIds=set();jointNodeRecords={};jointCoreIds=set();jointContextIds=set()
if joint:
 assert joint['sourceModelSHA256']==joint['sourceConditionedInputSHA256']==initialInputSHA['model'],'Mixed joint ordinary model'
 assert joint['sourceCoreSHA256']==initialInputSHA['core']and joint['sourceDataSHA256']==initialInputSHA['source_geometry']and joint['sourceRoadGeometryGeneration']==sourceGeometry['generationID'],'Mixed joint source generation'
 assert set(joint['requestedRoadIDs'])=={r['id']for r in joint['tileRoads']}=={r['id']for r in joint['transports']}=={r['id']for r in joint['footprints']},'Incomplete joint owner/transport/footprint inventory'
 for e in tile['tileRoads']:
  replacement=next(r for r in joint['tileRoads']if r['id']==e['id'])
  assert all(replacement.get(key)==e.get(key)for key in['pts','elev','w','lanes','from','to','sourceArc','sourceXY']),'Existing detailed transport changed:'+e['id']
  assert next(f for f in joint['footprints']if f['id']==e['id'])==next(f for f in tile['footprints']if f['id']==e['id']),'Existing detailed physical ribbon changed:'+e['id']
 # A deliberately fixed source road keeps its original exact discretization;
 # it never becomes a second resampled mutable copy of the same physical road.
 jointTileIds=set(joint['requestedRoadIDs'])-fixedTileIds
 jointContextIds={r['id']for r in joint['contextRoads']}
 fixedTileIds|=jointContextIds
 assert not(set(componentWindows['roads'])|set(componentWindows.get('primaryRoads',[])))&jointContextIds,'Fixed detailed context cannot enter mutable component eligibility'
 assert not jointContextIds&set(allCurrent),'Detailed context aliases a core/transport road'
 allCurrent.update({r['id']:r for r in joint['contextRoads']+joint['tileRoads']})
 jointNodeRecords={r['node']:r for r in joint['coreAnchorNodes']}
 assert all(r['sourceConnectionVerifiedForEveryArm']for r in jointNodeRecords.values()),'Joint shared connector authority is incomplete'
 jointCoreIds={arm['id']for record in jointNodeRecords.values()for arm in record['coreArms']}
 for pack,digest in joint['sourcePackSHA256'].items():assert hashlib.sha256((args.repo/pack).read_bytes()).hexdigest()==digest,'Detailed source pack changed:'+pack
allCurrent.update({r['id']:r for r in fixedConstraints['roads']})
tileIds={r['id']for r in tile['tileRoads']}|jointTileIds
core=json.load(gzip.open(str(args.core)));allSource={r['id']:r for r in core['roads']};allSource.update({r['id']:{**allCurrent[r['id']],**r['expected']}for r in tile['transports']});allSource.update({r['id']:r for r in fixedConstraints['roads']});coreOrigin=core['origin'];del core
if joint:
 allSource.update({r['id']:r for r in joint['contextRoads']})
 allSource.update({r['id']:{**allCurrent[r['id']],**r['expected']}for r in joint['transports']if r['id']not in fixedTileIds})
allSourceLegacy={key:value for key,value in allSource.items()}
if sourceGeometry:
 assert sourceGeometry['sourceCorePackSHA256']==hashlib.sha256(Path(args.core).read_bytes()).hexdigest(),'corrected source/rawcore mismatch'
 assert stage.get('sourceRoadGeometryGeneration')==sourceGeometry['generationID'],'mixed corrected-source generation'
 for road,repair in sourceRepairs.items():
  if road not in allSource:continue
  raw=allSource[road];expected=repair['expected'];allSourceLegacy[road]={**raw,**expected}
  actual={key:raw.get(key)for key in expected}
  already={**expected,'pts':repair['pts'],'elev':repair['elev']}
  assert actual==expected or actual==already,f'corrected source input binding:{road}'
  allSource[road]={**raw,'pts':repair['pts'],'elev':repair['elev']}
 for road in fixedTileIds:
  if road in sourceRepairs:assert allCurrent[road]['pts']==sourceRepairs[road]['pts'],f'mixed fixed-tile source geometry:{road}'
def verified_negative_owner_connections(joint_data,proof,current):
 assert proof['sourceRoadGeometryGeneration']==joint_data['sourceRoadGeometryGeneration'],'Connected facility proof/source generation mismatch'
 nodes={r['node']:r for r in joint_data['coreAnchorNodes']};out=[]
 for receipt in proof['results']:
  for seam in receipt.get('negativeSeams',[]):
   if seam['id']not in joint_data['requestedRoadIDs']:continue
   node=receipt['node'];record=nodes[node]
   assert seam['category']=='protected-real-underpass'and seam['coreHeight']<-.001 and seam['graphAnchorCompatible']and not seam['coreLevelAmbiguous']
   assert record['sourceConnectionVerifiedForEveryArm']and any(a['id']==seam['id']for a in record['tileArms']),'Unproved connected negative owner'
   canonical=[]
   for arm in record['coreArms']:
    edge=current[arm['id']];index=0 if arm['end']=='from'else len(edge['pts'])-1;h=(edge['elev']or[0.]*len(edge['pts']))[index]
    if abs(h-seam['coreHeight'])<=1e-9:canonical.append({'id':arm['id'],'control':index,'height':h})
   assert canonical,'Connected negative canonical datum changed; regenerate its actual facility proof'
   literal_overlap=any(seam['id']in f['roads']and set(f['roads'])&{a['id']for a in canonical}and f['area']>1e-6 for f in receipt.get('finiteOverlaps',[]))
   assert receipt['classification']=='actual-emitted-support-seam'or literal_overlap,'Negative owner has no actual support/facility overlap proof'
   out.append({'node':node,'owner':seam['id'],'ownerEnd':seam['end'],'height':seam['coreHeight'],'canonicalCoreArms':canonical,'fullConnectorAliases':record['fullConnectorAliases'],'distinctEndpointPositionsPreserved':True})
 return out
jointNegativeTileIds=set();jointTileHeightEnvelopes={};jointTileFacilityAuthority={};jointFacilityInheritance=[]
if joint:
 facility_proof=json.load(open(args.connected_facility_proof))
 assert initialInputSHA['connected_facility_proof']in{v['sha256']for v in joint['inputs'].values()if isinstance(v,dict)and 'sha256'in v},'Joint owner input does not bind the connected facility receipt'
 jointFacilityInheritance=verified_negative_owner_connections(joint,facility_proof,allCurrent)
 for component in joint['components']:
  core_arms=[arm['id']for node in component['nodes']for arm in jointNodeRecords[node]['coreArms']]
  heights=[y for road in core_arms for y in(allCurrent[road]['elev']or[0])]
  inherited=[r for r in jointFacilityInheritance if r['node']in component['nodes']]
  verified_negative={r['id']for receipt in inherited for r in receipt['canonicalCoreArms']}
  negative_heights=[r['height']for r in inherited]
  for node in component['nodes']:
   for arm in jointNodeRecords[node]['coreArms']:
    if arm['id']in underpassIds and arm['y']<-.001:verified_negative.add(arm['id']);negative_heights.append(arm['y'])
  low=min([0.]+negative_heights);high=max([0.]+heights)
  for road in component['tileRoadIds']:
   jointTileHeightEnvelopes[road]=(low,high)
   jointTileFacilityAuthority[road]=sorted(set(verified_negative))
   if verified_negative:jointNegativeTileIds.add(road)
old=json.load(open(str(args.historical_model)));allOld={r['id']:r for r in old['roads']};oldCross=old.get('report',{}).get('bridgeClearance',{}).get('crossings',[]);allOld.update({r['id']:{**allCurrent[r['id']],**r['expected']}for r in tile['transports']});allOld.update({r['id']:r for r in fixedConstraints['roads']});del old
allOld.update({road:allSourceLegacy[road]for road in tileIds|fixedTileIds})
historicalTile=None
if joint:
 historicalTile=json.load(open(args.historical_tile_model))
 assert historicalTile['revision']=='a679b72bacefb751057f0282a86571e8e6ef006d'and historicalTile['sourceCoreSHA256']==initialInputSHA['core'],'Historical detailed-road source authority changed'
 assert set(joint['requestedRoadIDs'])<=set(historicalTile['requestedRoadIDs']),'Historical actual detailed inventory is incomplete'
 oldTileRoads={r['id']:r for r in historicalTile['roads']}
 assert tileIds|jointContextIds<=set(oldTileRoads),'Historical detailed/context road profile is missing'
 allOld.update({i:oldTileRoads[i]for i in tileIds|jointContextIds})
raw=json.load(open(str(args.source_evidence)));rawBy={r['id'][:12]:r for r in raw['rows']};familyBinding=json.load(open(args.source_family_binding));rawBy.update({r['id'][:12]:r for r in [familyBinding['retainedSource'],familyBinding['oppositeSource']]});apronBinding=json.load(open(args.source_apron_binding));rawBy.update({r['id'][:12]:r for r in apronBinding['retainedSource']['rows']});layers={k:r['level_rules']or[]for k,r in rawBy.items()}
familyEvidence=json.load(open(args.source_family_evidence));boundFamilyPrefixes={r['id'][:12]for r in familyEvidence['queriedSources']+[familyEvidence['existingMainlineSource']]};rawBy.update({r['id'][:12]:r for r in familyEvidence['queriedSources']+[familyEvidence['existingMainlineSource']]});layers.update({k:r['level_rules']or[]for k,r in rawBy.items()})
apronSourceEvidence=json.load(open(args.apron_source_evidence));rawBy.update({r['id'][:12]:r for case in apronSourceEvidence['cases']for r in case['retainedSourceRows']});layers.update({k:r['level_rules']or[]for k,r in rawBy.items()})
if sourceGeometry:layers.update({r['id'][:12]:r['levelRules']or[]for r in sourceGeometry['sources']})
if joint:
 rawBy.update({prefix:record['row']for prefix,record in joint['sourceEvidence'].items()})
 layers.update({prefix:r.get('level_rules')or[]for prefix,r in rawBy.items()})
def merge_retained_road_source(existing,current_layers,reference):
 """Complete missing metadata, preserving all previously retained full rows."""
 assert reference['release']=='2026-10-21.0'and reference['complete']and not reference['missingPrefixes'],'Incomplete immutable source completion'
 requested=reference['requestedPrefixes'];assert len(requested)==len(set(requested))
 rows=reference['rows'];seen=set();pending={}
 for row in rows:
  full=row['id'];prefix=full[:12]
  assert len(full)==36 and prefix in requested and prefix not in seen,'Unexpected or ambiguous immutable source identifier'
  seen.add(prefix)
  if prefix in existing:
   old=existing[prefix]
   for field in['id','geometryWKB','connectors','level_rules','road_flags']:
    if field in old:assert old[field]==row[field],'Retained source changed:'+prefix+':'+field
  else:
   pending[prefix]=row
  if prefix in current_layers:assert current_layers[prefix]==(row.get('level_rules')or[]),'Retained level rules changed:'+prefix
 assert seen==set(requested),'Missing requested immutable source identifier'
 existing.update(pending)
 current_layers.update({row['id'][:12]:row.get('level_rules')or[]for row in rows})
 return sorted(pending)
additionalSourceReferenceAdded=[];additionalSourceReferenceRows=[]
if args.additional_source_reference:
 additional_source_reference=json.load(open(args.additional_source_reference))
 additionalSourceReferenceAdded=merge_retained_road_source(rawBy,layers,additional_source_reference)
 additionalSourceReferenceRows=additional_source_reference['rows']
known=json.load(open(str(args.known_cases)))['cases'];reg=json.load(open(str(args.regressions)))['regressionPairs']
lateNodePolicy=json.load(open(args.generated_node_datum_policy))if args.generated_node_datum_policy else None
lateNodeComponents=[]
if lateNodePolicy:
 assert joint and lateNodePolicy['version']==1
 assert lateNodePolicy['sourceModelSHA256']==initialInputSHA['model']and lateNodePolicy['sourceJointInputSHA256']==initialInputSHA['joint_tile_input']and lateNodePolicy['sourceReferenceSHA256']==initialInputSHA['additional_source_reference'],'Generated-node source tuple changed'
 assert lateNodePolicy['canonicalRailControlsRemainExact']and lateNodePolicy['sourceXYWidthsAndLaneCapacityRemainExact']
 for path,digest in lateNodePolicy['inputs'].items():assert hashlib.sha256(Path(path).read_bytes()).hexdigest()==digest,'Generated-node incidence input changed:'+path
 seen_nodes=set();datum_source_rows={r['id']:r for r in additionalSourceReferenceRows}
 for record in lateNodePolicy['nodes']:
  node=record['node'];assert node not in seen_nodes;seen_nodes.add(node)
  actual={r['id']for r in allCurrent.values()if node in[r['from'],r['to']]}
  assert actual=={r['id']for r in record['arms']},'Generated-node complete incidence changed:'+node
  for arm in record['arms']:
   e=allCurrent[arm['id']];yy=e['elev']or[0.]*len(e['pts']);k=0 if arm['end']=='from'else len(yy)-1
   assert e[arm['end']]==node and yy==arm['inputHeights']and e['pts'][k]==arm['point']and yy[k]==arm['inputHeight'],'Generated-node expected geometry changed:'+arm['id']
   # Older retained summaries may omit connectors. The complete immutable
   # reference supplies them without replacing any original retained row.
   row=datum_source_rows.get(arm['sourceSegmentID'],rawBy[arm['id'].split('_')[0]])
   assert row['id']==arm['sourceSegmentID']and arm['fullConnector']==record['fullConnector']and any(c['connector_id']==record['fullConnector']for c in row['connectors']),'Generated-node full physical source connector changed'
  assert record['existingLocalHeightEnvelope']==[0.,max(y for arm in record['arms']for y in arm['inputHeights'])]
  fixed_heights={arm['inputHeight']for arm in record['arms']if arm['id']in jointContextIds}
  assert all(arm['fixedSourceContext']==(arm['id']in jointContextIds)for arm in record['arms'])and len(fixed_heights)<=1
  assert record['nodeHeightBounds']==([next(iter(fixed_heights))]*2 if fixed_heights else record['existingLocalHeightEnvelope'])
  high=record['existingLocalHeightEnvelope'][1];assert record['recoveryMeters']==math.ceil(max(80.,1.5*high/.075,math.sqrt(6*high/args.grade_change_per_metre)))
  lateNodeComponents.append(record)
varIds=set(componentWindows['roads'])|{r['id']for r in tile['tileRoads']}|set(stage['geometryEdits'])|{i for c in known for i in c['roads']}|{i for c in reg for i in c['pair']}|{'23427c8c-e37_0','bdf0bad3-182_0'}
varIds.update(generatedFacilityPolicies)
varIds.update(arm['id']for record in lateNodeComponents for arm in record['arms'])
jointNonPrimaryCoreIds=set()
if joint:
 jointNonPrimaryCoreIds=jointCoreIds-varIds-{r['id']for r in jointPolicy['generatedCoreApproachWindows']}-{r['id']for r in jointPolicy['sourceControlledBridgeRoads']}
 varIds|=jointTileIds|jointCoreIds|{r['id']for r in jointPolicy['generatedCoreApproachWindows']}|{r['id']for r in jointPolicy['sourceControlledBridgeRoads']}
arcCache={};heightMaximumCache={}
def arc(e):
 cache=globals().setdefault('arcCache',{})
 key=id(e['pts'])
 if key in cache:return cache[key][1]
 a=[0.]
 for p,q in zip(e['pts'],e['pts'][1:]):a.append(a[-1]+math.dist(p,q))
 cache[key]=(e['pts'],a)
 return a
def length(e):return arc(e)[-1]
def maximum_height(e):
 values=e.get('elev')
 if not values:return 0.
 key=id(values)
 cache=globals().setdefault('heightMaximumCache',{})
 if key not in cache:cache[key]=(values,max(values))
 return cache[key][1]
def bbox(e,pad=12):return(min(p[0]for p in e['pts'])-pad,max(p[0]for p in e['pts'])+pad,min(p[1]for p in e['pts'])-pad,max(p[1]for p in e['pts'])+pad)
def near(a,b):a=bbox(a);b=bbox(b);return a[0]<=b[1]and b[0]<=a[1]and a[2]<=b[3]and b[2]<=a[3]
# Explicit node lowering is coherent on every incident source edge.
nodeTargets={}
for rule in apronPolicy['estimatedNodeLowering']:
    node=rule['node'];reference=allOld[rule['referenceRoad']]if rule.get('referenceAuthority')=='strict historical conditioned model'else allCurrent[rule['referenceRoad']];reference_heights=reference['elev']or[0.]*len(reference['pts']);expected=rule.get('referenceHeight',rule['target']);assert abs(reference_heights[rule['referenceIndex']]-expected)<1e-9 if 'referenceIndex'in rule else all(abs(y-expected)<1e-9 for y in reference_heights)
    for road in allCurrent.values():
        if node in[road['from'],road['to']]:varIds.add(road['id'])
    nodeTargets[node]=rule
variableNodeComponents=apronPolicy.get('generatedNodeComponents',[])
for component in variableNodeComponents:
 for road in allCurrent.values():
  if set(component['nodes'])&{road['from'],road['to']}:varIds.add(road['id'])
for patch in apronPolicy.get('localJunctionPatches',[]):varIds.update(patch['roads'])
varIds-=fixedTileIds
completeCoreContextIds=set();fixedPreparationCoreIds=set()
def complete_core_context_sets(coverage,core_roads,mapped_ids,underpass_ids,explicit_ids,model_sha,footprints_sha,joint_coverage_sha):
 assert coverage['version']==1 and coverage['sourceModelSHA256']==model_sha and coverage['sourceFootprints']['sha256']==footprints_sha,'Complete core context/model/footprint mismatch'
 assert joint_coverage_sha,'Joint obstacles do not cover the complete prepared core universe'
 actual={r['id']for r in core_roads if r['id']not in mapped_ids|underpass_ids and not r.get('expressway')and r.get('elevationSource')not in['surveyed','explicit']and min(r['elev']or[0])>=-.001 and max(map(abs,r['elev']or[0]))>=1e-9}
 declared=coverage['completePotentiallyGrowableCoreIDs']
 assert len(declared)==len(set(declared))and set(declared)==actual,'Complete generated-profile universe is stale or omits a potential participant'
 context=set(coverage['roads']);assert actual<=context<={r['id']for r in core_roads}
 return context,context-explicit_ids,actual
completeCoreGrowableIds=set()
if args.complete_core_context:
 coverage=json.load(open(args.complete_core_context))
 assert joint and joint['inputs']['physicalCoreCoverage']['sha256']==initialInputSHA['complete_core_context'],'Joint obstacles do not cover the complete prepared core universe'
 mapped_ids={r['id']for r in json.load(open(args.mapped_levels))['roads']}
 completeCoreContextIds,fixedPreparationCoreIds,completeCoreGrowableIds=complete_core_context_sets(coverage,stage['roads'],mapped_ids,underpassIds,varIds,initialInputSHA['model'],initialInputSHA['footprints'],initialInputSHA['complete_core_context'])
 varIds|=completeCoreContextIds
automaticFamilyContextIds=set()
for i in list(varIds):
 if not layers.get(i.split('_')[0]):continue
 for j,r in allCurrent.items():
  if j not in varIds and j not in fixedTileIds and r['name']and r['name']==allCurrent[i]['name']and layers.get(j.split('_')[0])and near(allCurrent[i],r):
   varIds.add(j);automaticFamilyContextIds.add(j)
# Initialize source-incident local closure before expensive finite assembly.
# This deterministic preparation is reproducible without a temporary window
# file. Later passes still require proved finite coupling for range growth.
if args.component_windows is None:
 initial_primary=set(varIds)-jointNonPrimaryCoreIds-automaticFamilyContextIds-fixedPreparationCoreIds;initial_nodes={node for road in initial_primary for node in[allCurrent[road]['from'],allCurrent[road]['to']]if node}
 for road,e in allCurrent.items():
  if road in initial_primary or road in fixedTileIds:continue
  spans=[];nodes=[];total=length(e)
  for node,reverse in[(e['from'],False),(e['to'],True)]:
   if node in initial_nodes:
    spans.append([max(0.,total-2),total]if reverse else[0.,min(2.,total)]);nodes.append(node)
  if spans:
   componentWindows['roads'][road]={'ranges':spans,'sourceNodes':nodes,'reason':'Exact source-physical incident endpoint of an affected road; initialized before finite assembly, height recovery remains locally bounded.'};varIds.add(road)
 componentWindows['primaryRoads']=sorted(initial_primary)
ends={}
for i,e in allSource.items():
 if i not in allCurrent:continue
 for n,k in[(e['from'],0),(e['to'],-1)]:
  if n:ends.setdefault(n,[]).append((i,k))
sourceFlatCache={}
def flat(i):
 if i not in sourceFlatCache:sourceFlatCache[i]=max(map(abs,allSource[i]['elev']or[0]))<.001 and not allSource[i].get('expressway')
 return sourceFlatCache[i]
varIds=sorted(varIds)
primaryVariableIds=set(componentWindows.get('primaryRoads',set(varIds)-set(componentWindows['roads'])))
coreContextCoverage={'complete':bool(args.complete_core_context),'sourceCoverageSHA256':initialInputSHA.get('complete_core_context'),'preparedCoreRoads':len(completeCoreContextIds),'potentiallyGrowableCoreRoads':len(completeCoreGrowableIds),'fixedUntilPhysicallyReachedCoreRoads':len(fixedPreparationCoreIds),'contextAdditionDoesNotGrantPrimaryHeightAuthority':not bool(fixedPreparationCoreIds&primaryVariableIds)}
assert coreContextCoverage['contextAdditionDoesNotGrantPrimaryHeightAuthority']
fp=json.load(open(FP));assert fp['sourceModelSHA256']==hashlib.sha256(open(MODEL,'rb').read()).hexdigest();footprints={r['id']:r for r in fp['roads']};footprints.update({r['id']:r for r in tile['footprints']});footprints.update({r['id']:r for r in fixedConstraints['footprints']});del fp
if joint:
 explicit_fixed_geometry={r['id']for r in fixedConstraints['roads']}
 footprints.update({r['id']:r for r in joint['contextFootprints']+joint['footprints']if r['id']not in explicit_fixed_geometry})
# Broad-phase includes every nearby road, so shifted ribbons cannot silently create new intersections.
citygrid={}
for i,f in footprints.items():
 pts=f['L']+f['R'];a=min(p[0]for p in pts);b=max(p[0]for p in pts);c=min(p[1]for p in pts);d=max(p[1]for p in pts)
 for x in range(math.floor(a/80),math.floor(b/80)+1):
  for z in range(math.floor(c/80),math.floor(d/80)+1):citygrid.setdefault((x,z),set()).add(i)
pairs=set()
for i in varIds:
 f=footprints[i];pts=f['L']+f['R'];a=min(p[0]for p in pts);b=max(p[0]for p in pts);c=min(p[1]for p in pts);d=max(p[1]for p in pts)
 for x in range(math.floor(a/80),math.floor(b/80)+1):
  for z in range(math.floor(c/80),math.floor(d/80)+1):
   for j in citygrid.get((x,z),[]):
    if i!=j:pairs.add(tuple(sorted([i,j])))
pairs=sorted(pairs);needed=set(varIds)|{i for p in pairs for i in p}
if joint:needed|={arm['id']for record in jointNodeRecords.values()for arm in record['coreArms']+record['tileArms']}
roads={i:allCurrent[i]for i in needed};oldRoads={i:allOld[i]for i in needed if i in allOld};arcs={i:arc(e)for i,e in roads.items()};oldarcs={i:arc(e)for i,e in oldRoads.items()}
def cross(a,b,p):return(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])
def clip(a,b):
 sign=math.copysign(1,sum(cross(b[0],b[k],b[k+1])for k in range(1,len(b)-1)))
 for i in range(len(b)):
  if not a:return[]
  out=[];p=b[i];q=b[(i+1)%len(b)]
  for j,u in enumerate(a):
   v=a[(j+1)%len(a)];du=sign*cross(p,q,u);dv=sign*cross(p,q,v)
   if du>=-1e-8:out.append(u)
   if(du>=0)!=(dv>=0):
    t=du/(du-dv);out.append((u[0]+(v[0]-u[0])*t,u[1]+(v[1]-u[1])*t))
  a=out
 return a

def width(e,s,old=False):
 p=e.get('joinedPavement')
 if not p:return max(e['w'],8.4)if maximum_height(e)>1.2 and(old or e['lanes']>1 or e.get('expressway')or any(s['lanes']>1 for s in e.get('sourceLaneIntervals',[])))else e['w']
 core_width=p.get('physicalWidth',e['w']);away=min(max(a-s,s-b,0)for a,b in p['intervals']);u=max(0,min(1,away/p['taper']));return core_width+(p['originalWidth']-core_width)*u*u*(3-2*u)
def quads(e,aa,old=False):
 if not old and e['id']in footprints:f=footprints[e['id']];L=f['L'];R=f['R']
 else:
  L=[];R=[]
  for i,p in enumerate(e['pts']):
   a=e['pts'][max(0,i-1)];b=e['pts'][min(len(e['pts'])-1,i+1)];dx=b[0]-a[0];dz=b[1]-a[1];ln=math.hypot(dx,dz)or 1;h=width(e,aa[i],old)/2;L.append((p[0]-dz/ln*h,p[1]+dx/ln*h));R.append((p[0]+dz/ln*h,p[1]-dx/ln*h))
 return[[R[i],R[i+1],L[i+1],L[i]]for i in range(len(e['pts'])-1)]
qs={i:quads(e,arcs[i])for i,e in roads.items()};oqs={i:quads(e,oldarcs[i],True)for i,e in oldRoads.items()}
if os.path.exists(str(args.historical_footprints)):
 of=json.load(open(str(args.historical_footprints)))
 for f in of['roads']:
  i=f['id']
  if i in oqs:oqs[i]=[[f['R'][n],f['R'][n+1],f['L'][n+1],f['L'][n]]for n in range(len(f['L'])-1)]
if historicalTile:
 for f in historicalTile['physicalFootprints']:
  i=f['id']
  if i in tileIds|jointContextIds and i in oqs:oqs[i]=[[f['R'][n],f['R'][n+1],f['L'][n+1],f['L'][n]]for n in range(len(f['L'])-1)]
historicalActualTriangles=collections.defaultdict(list);historicalActualGrid={}
historicalOwnSeamBindings=collections.defaultdict(list);historicalOwnSeamEnvelopes={};historicalMultiBindingReferences={}
def historical_surface_key(triangle):
 return(triangle['road'],triangle['tile'],tuple(sorted(tuple(float(v)for v in p)for p in triangle['points'])))
def historical_surface_bindings(triangle):
 bindings=triangle.get('actualSurfaceBindings')
 if bindings is not None:
  assert bindings and triangle.get('actualSurface')in bindings,'Historical duplicate Surface metadata omitted its representative binding'
  return bindings
 return[triangle.get('actualSurface',{})]
def historical_literal_reference_scope(historical,detailed_ids,context_ids,fixed_ids):
 """Use every declared core's literal emissions without granting current authority."""
 core_ids=historical.get('includedCoreRoadIDs',[]);core=set(core_ids)
 assert len(core)==len(core_ids),'Duplicate historical literal core selector'
 assert core<={r['id']for r in historical['roads']},'Historical literal core road inventory is incomplete'
 assert core<={f['id']for f in historical['physicalFootprints']},'Historical literal core footprint inventory is incomplete'
 assert core<={t['road']for t in historical['triangles']},'Historical literal core emitted coverage is incomplete'
 return set(detailed_ids)|set(context_ids)|set(fixed_ids)|core
if historicalTile:
 assert all(isinstance(s.get('paintLift'),(int,float))and math.isfinite(s['paintLift'])and s['paintLift']>=0 for t in historicalTile['triangles']for s in historical_surface_bindings(t)),'Historical actual surfaces require their literal per-surface paintLift; owner class/cap flags cannot reconstruct it'
 seam_proof=json.load(open(args.historical_cap_seam_proof))
 assert seam_proof['version']==1 and seam_proof['pass']is True and seam_proof['releaseApproved']is False
 reference_sha=historicalTile.get('sourceHistoricalTileModelSHA256',initialInputSHA['historical_tile_model'])
 references=set(seam_proof['beforeAfterUnchangedInputs'].values())
 assert reference_sha in references and initialInputSHA['source_geometry']in references,'Unbound historical own-seam source/geometry proof'
 for group in seam_proof['groups']:
  assert group['classification']=='source-proved-local-at-grade-own-cap/strip-support-seam'and group['fullConnectorID'].startswith(group['node'])
  assert len(group['incidentSourceProofs'])>=2 and all(p['connectorID']==group['fullConnectorID']and p['sourceProjectionResidualM']<=.075 and not p['activeLevelRules']and not p['activeRoadFlags']for p in group['incidentSourceProofs']),'Own seam is not a fully proved at-grade source connector'
  for binding in group['literalSurfaceBindings']:
   key=historical_surface_key({'road':binding['road'],'tile':binding['tile'],'points':binding['literalPoints']})
   historicalOwnSeamBindings[key].append({'node':group['node'],'fullConnectorID':group['fullConnectorID'],'paintLift':binding['paintLift'],'branches':binding['legacySourceBranches']})
 historicalLiteralReferenceIds=historical_literal_reference_scope(historicalTile,tileIds,jointContextIds,fixedTileIds)
 for triangle in historicalTile['triangles']:
  road=triangle['road']
  if road not in historicalLiteralReferenceIds:continue
  historicalActualTriangles[road].append(triangle)
 for road,triangles in historicalActualTriangles.items():
  grid={}
  for index,triangle in enumerate(triangles):
   points=triangle['points']
   for x in range(math.floor(min(p[0]for p in points)/40),math.floor(max(p[0]for p in points)/40)+1):
    for z in range(math.floor(min(p[2]for p in points)/40),math.floor(max(p[2]for p in points)/40)+1):grid.setdefault((x,z),[]).append(index)
  historicalActualGrid[road]=grid
qgrid={};oldGrid={}
for dest,qq in[(qgrid,qs),(oldGrid,oqs)]:
 for i,qu in qq.items():
  g={}
  for j,q in enumerate(qu):
   for x in range(math.floor(min(p[0]for p in q)/40),math.floor(max(p[0]for p in q)/40)+1):
    for z in range(math.floor(min(p[1]for p in q)/40),math.floor(max(p[1]for p in q)/40)+1):g.setdefault((x,z),[]).append(j)
  dest[i]=g
def bary(t,p):
 a,b,c=t;bx=b[0]-a[0];bz=b[1]-a[1];cx=c[0]-a[0];cz=c[1]-a[1];det=bx*cz-bz*cx
 if abs(det)<1e-10:return None
 u=((p[0]-a[0])*cz-(p[1]-a[1])*cx)/det;v=(bx*(p[1]-a[1])-bz*(p[0]-a[0]))/det
 return(1-u-v,u,v)if min(1-u-v,u,v)>=-1e-5 else None
def coeff(ii,b):return sum(w for j,w in zip(ii,b)if j in(1,2))
def historical_reference_bounds(reference):
 if isinstance(reference,dict):return reference['minimum'],reference['maximum']
 return reference[0],reference[0]
def historical_signed_gap(first,second):
 # Minimum actual old clearance, including every owned cap/strip value. An
 # overlapping local support envelope never creates an independent old layer.
 alo,ahi=historical_reference_bounds(first);blo,bhi=historical_reference_bounds(second)
 if alo>bhi:return alo-bhi
 if blo>ahi:return ahi-blo
 return 0.
def at(i,p):
 if i in historicalActualGrid:
  heights=[];surfaces=[];proved_nodes=None
  for n in historicalActualGrid[i].get((math.floor(p[0]/40),math.floor(p[1]/40)),[]):
   triangle=historicalActualTriangles[i][n];points=triangle['points'];weights=bary([(q[0],q[2])for q in points],p)
   if weights:
    for binding_index,surface in enumerate(historical_surface_bindings(triangle)):
     film=surface.get('paintLift')
     if not isinstance(film,(int,float))or not math.isfinite(film)or film<0:
      historicalReferenceUnresolved[(i,round(p[0],6),round(p[1],6))]={'road':i,'point':p,'reason':'Missing literal per-surface historical paintLift'}
      return None
     height=sum(weight*q[1]for weight,q in zip(weights,points))-film;heights.append(height)
     key=historical_surface_key(triangle);bindings=globals().get('historicalOwnSeamBindings',{}).get(key,[])
     nodes={b['node']for b in bindings if b['paintLift']==film and any(branch['arc']==triangle['arc']and branch['centre']==triangle['centre']for branch in b['branches'])}
     proved_nodes=nodes if proved_nodes is None else proved_nodes&nodes
     surfaces.append({'triangleIndex':n,'actualSurfaceBindingIndex':binding_index,'paintLift':film,'structuralHeight':height,'surfaceKey':key})
    if len(historical_surface_bindings(triangle))>1:
     globals().setdefault('historicalMultiBindingReferences',{})[(i,n)]={'road':i,'triangleIndex':n,'actualSurfaceBindings':historical_surface_bindings(triangle),'policy':'Every literal binding retained and sampled; no first-binding selection'}
  if not heights:return None
  low,high=min(heights),max(heights)
  # Only the exact, all-arm source-proved own seam may retain a nontrivial
  # support envelope. Remote sheets and unbound caps remain unresolved.
  if high-low>.01 and not proved_nodes:
   historicalReferenceUnresolved[(i,round(p[0],6),round(p[1],6))]={'road':i,'point':p,'historicalActualHeights':heights,'reason':'Historical actual detailed surfaces disagree at one finite point'}
   return None
  reference={'minimum':low,'maximum':high,'structuralValues':heights}
  if high-low>.01:
   reference.update({'sourceNodes':sorted(proved_nodes),'surfaces':surfaces})
   globals().setdefault('historicalOwnSeamEnvelopes',{})[(i,round(p[0],6),round(p[1],6))]={'road':i,'point':p,**reference,'sourceProofSHA256':globals().get('initialInputSHA',{}).get('historical_cap_seam_proof')}
  return reference
 e=oldRoads.get(i)
 if not e:return None
 for n in oldGrid[i].get((math.floor(p[0]/40),math.floor(p[1]/40)),[]):
  q=oqs[i][n]
  for inds in((0,1,2),(0,2,3)):
   b=bary([q[j]for j in inds],p)
   if b:
    u=coeff(inds,b);yy=e['elev']or[0]*len(e['pts']);return yy[n]*(1-u)+yy[n+1]*u,n,u
 return None
fragmentPolygons={};cellPolygons=collections.defaultdict(list);cellContactCache={};cellConnectivityCache={};ambiguousOverlapCells=set()
def register_fragments(fragments):
 for key,fragment in fragments.items():
  if key not in fragmentPolygons:cellPolygons[key[:4]].append(fragment['polygon'])
  fragmentPolygons[key]=fragment

# Index adjacency is only a candidate relation. Coarse source segments can
# diverge and re-cross far away while retaining diagonal cell indices.
# Literal clipped polygons must actually touch before components are joined.
def polygons_contact(a,b,epsilon=1e-6):
 if max(p[0]for p in a)<min(p[0]for p in b)-epsilon or max(p[0]for p in b)<min(p[0]for p in a)-epsilon or max(p[1]for p in a)<min(p[1]for p in b)-epsilon or max(p[1]for p in b)<min(p[1]for p in a)-epsilon:return False
 def on_segment(p,u,v):
  dx=v[0]-u[0];dz=v[1]-u[1];t=max(0.,min(1.,((p[0]-u[0])*dx+(p[1]-u[1])*dz)/(dx*dx+dz*dz or 1.)))
  return math.hypot(p[0]-u[0]-t*dx,p[1]-u[1]-t*dz)<=epsilon
 for u,v in zip(a,a[1:]+a[:1]):
  for p,q in zip(b,b[1:]+b[:1]):
   if cross(u,v,p)*cross(u,v,q)<0 and cross(p,q,u)*cross(p,q,v)<0:return True
   if on_segment(u,p,q)or on_segment(v,p,q)or on_segment(p,u,v)or on_segment(q,u,v):return True
 def inside(p,poly):
  signs=[cross(u,v,p)for u,v in zip(poly,poly[1:]+poly[:1])]
  return all(x>=0 for x in signs)or all(x<=0 for x in signs)
 return inside(a[0],b)or inside(b[0],a)
def cells_contact(first,second):
 key=tuple(sorted((first,second)))
 if key not in cellContactCache:cellContactCache[key]=cell_is_connected(first)and cell_is_connected(second)and any(polygons_contact(a,b)for a in cellPolygons.get(first,[])for b in cellPolygons.get(second,[]))
 return cellContactCache[key]
def cell_is_connected(cell):
 if cell not in cellConnectivityCache:
  polygons=cellPolygons.get(cell,[]);remaining=set(range(len(polygons)));queue=[0]if remaining else[]
  while queue:
   index=queue.pop()
   if index not in remaining:continue
   remaining.remove(index)
   queue.extend(other for other in remaining if polygons_contact(polygons[index],polygons[other]))
  cellConnectivityCache[cell]=bool(polygons)and not remaining
  if polygons and remaining:ambiguousOverlapCells.add(cell)
 return cellConnectivityCache[cell]
def point_polygon_contact(point,poly,epsilon=1e-6):
 signs=[cross(a,b,point)for a,b in zip(poly,poly[1:]+poly[:1])]
 lengths=[math.dist(a,b)for a,b in zip(poly,poly[1:]+poly[:1])]
 return all(value>=-epsilon*distance for value,distance in zip(signs,lengths))or all(value<=epsilon*distance for value,distance in zip(signs,lengths))
def crosssection_interval(a,b,poly):
 sign=math.copysign(1,sum(cross(poly[0],poly[k],poly[k+1])for k in range(1,len(poly)-1)));lo=0.;hi=1.
 for p,q in zip(poly,poly[1:]+poly[:1]):
  start=sign*cross(p,q,a);end=sign*cross(p,q,b)
  if start<0 and end<0:return None
  if(start<0)!=(end<0):
   t=start/(start-end)
   if start<0:lo=max(lo,t)
   else:hi=min(hi,t)
  if lo>hi:return None
 return lo,hi
def cells_meet_at_source_cut(first,second,previous,node):
 if not cell_is_connected(first)or not cell_is_connected(second):return False
 end=0 if roads[previous]['from']==node else len(qs[previous])-1;q=qs[previous][end]
 a,b=(q[0],q[3])if roads[previous]['from']==node else(q[1],q[2]);epsilon=1e-6/(math.dist(a,b)or 1.)
 for one in cellPolygons.get(first,[]):
  x=crosssection_interval(a,b,one)
  if x is None:continue
  for two in cellPolygons.get(second,[]):
   y=crosssection_interval(a,b,two)
   if y is not None and max(x[0],y[0])<=min(x[1],y[1])+epsilon:return True
 return False
import pickle
overlapCacheBinding={'version':1,'minimumPolygonArea':args.minimum_polygon_area,'inputs':{key:hashlib.sha256(Path(path).read_bytes()).hexdigest()for key,path in [('footprints',args.footprints),('tiles',args.tile_transports),('fixed',args.fixed_tile_constraints)]+([('joint',args.joint_tile_input)]if joint else[])}}
overlapCacheKey=hashlib.sha256(json.dumps(overlapCacheBinding,sort_keys=True).encode()).hexdigest()
overlapCachePath=args.overlap_cache or Path('/tmp/road-profile-overlaps-'+overlapCacheKey+'.pickle')
overlapMemo={}
if overlapCachePath.exists():
    cached=pickle.loads(overlapCachePath.read_bytes())
    if cached.get('binding')==overlapCacheBinding:overlapMemo=cached['pairs']
def save_overlap_cache():
    payload=pickle.dumps({'binding':overlapCacheBinding,'pairs':overlapMemo},protocol=5)
    temporary=overlapCachePath.with_suffix('.tmp');temporary.write_bytes(payload);os.replace(temporary,overlapCachePath)
    print(json.dumps({'phase':'immutable-overlap-cache','pairs':len(overlapMemo),'bytes':len(payload),'binding':overlapCacheKey}),flush=True)
def overlap(a,b):
 if(a,b)in overlapMemo:
  out,fragments=overlapMemo[(a,b)];register_fragments(fragments);return out
 out=[];fragments={}
 for i,qa in enumerate(qs[a]):
  ns=set()
  for x in range(math.floor(min(p[0]for p in qa)/40),math.floor(max(p[0]for p in qa)/40)+1):
   for z in range(math.floor(min(p[1]for p in qa)/40),math.floor(max(p[1]for p in qa)/40)+1):ns.update(qgrid[b].get((x,z),[]))
  for j in ns:
   qb=qs[b][j]
   if max(p[0]for p in qa)<min(p[0]for p in qb)or max(p[0]for p in qb)<min(p[0]for p in qa)or max(p[1]for p in qa)<min(p[1]for p in qb)or max(p[1]for p in qb)<min(p[1]for p in qa):continue
   for ai in((0,1,2),(0,2,3)):
    for bi in((0,1,2),(0,2,3)):
     poly=clip([qa[k]for k in ai],[qb[k]for k in bi]);area=abs(sum(p[0]*poly[(k+1)%len(poly)][1]-p[1]*poly[(k+1)%len(poly)][0]for k,p in enumerate(poly)))/2
     if area<args.minimum_polygon_area:continue
     key=(a,b,i,j,ai,bi);fragment={'roads':[a,b],'segments':[i,j],'triangles':[ai,bi],'polygon':poly,'area':area};fragments[key]=fragment
     cen=(sum(p[0]for p in poly)/len(poly),sum(p[1]for p in poly)/len(poly))
     for p in[*poly,cen]:
      ba=bary([qa[k]for k in ai],p);bb=bary([qb[k]for k in bi],p)
      if ba and bb:out.append((i,coeff(ai,ba),j,coeff(bi,bb),p))
 overlapMemo[(a,b)]=(out,fragments)
 register_fragments(fragments)
 return out
sourceOffsets={};sourceTotals={}
for i,e in allSource.items():sourceTotals.setdefault(i.rsplit('_',1)[0],[]).append((int(i.rsplit('_',1)[1]),i,length(e)))
for p,pieces in list(sourceTotals.items()):
 total=0
 for _,i,l in sorted(pieces):sourceOffsets[i]=total;total+=l
 sourceTotals[p]=total
legacyFamilyPieces=collections.defaultdict(list);legacyRawArcs={};historicalPreparedArcs={};historicalReferenceUnresolved={}
for road,e in allSourceLegacy.items():
 legacyFamilyPieces[road.rsplit('_',1)[0]].append(road);legacyRawArcs[road]=arc(e)
for prefix,pieces in legacyFamilyPieces.items():
 pieces.sort(key=lambda road:int(road.rsplit('_',1)[1]))
def projected_coordinates(points,line,values):
    points=np.asarray(points,dtype=float);line=np.asarray(line,dtype=float);values=np.asarray(values,dtype=float)
    start=line[:-1];direction=np.diff(line,axis=0);length_squared=np.maximum(np.sum(direction*direction,axis=1),1e-20);out=[];maximum_distance=0.
    for offset in range(0,len(points),256):
        delta=points[offset:offset+256,None,:]-start[None,:,:]
        progress=np.clip(np.sum(delta*direction[None,:,:],axis=2)/length_squared[None,:],0,1)
        distance_squared=np.sum((delta-progress[:,:,None]*direction[None,:,:])**2,axis=2)
        selected=np.argmin(distance_squared,axis=1);row=np.arange(len(selected));u=progress[row,selected]
        out.extend((values[selected]+u*(values[selected+1]-values[selected])).tolist())
        maximum_distance=max(maximum_distance,float(np.sqrt(distance_squared[row,selected]).max(initial=0)))
    return np.array(out),maximum_distance

sourceDistanceAtControls={};officialFractionAtControls={};legacyFractionsAtSource={};sourceProjectionReport=[]
if sourceGeometry:
    origin=sourceGeometry['origin'];scale_x=math.cos(math.radians(origin['lat']))*origin['NR']*math.pi/180;scale_z=origin['MR']*math.pi/180
    full_source={entry['id'][:12]:entry for entry in sourceGeometry['sources']}
    if joint:
        import struct
        from geographiclib.geodesic import Geodesic
        projection_rows={prefix:record['row']for prefix,record in joint['sourceEvidence'].items()}
        if args.additional_source_reference:projection_rows.update({row['id'][:12]:row for row in additionalSourceReferenceRows})
        for prefix,row in projection_rows.items():
            if prefix in full_source:continue
            encoded=bytes.fromhex(row['geometryWKB']);endian='<'if encoded[0]==1 else'>'
            assert struct.unpack_from(endian+'I',encoded,1)[0]==2,'Joint source must retain exact2D LineString geometry'
            count=struct.unpack_from(endian+'I',encoded,5)[0];lonlat=[list(struct.unpack_from(endian+'dd',encoded,9+16*k))for k in range(count)];metres=[0.]
            for a,b in zip(lonlat,lonlat[1:]):metres.append(metres[-1]+Geodesic.WGS84.Inverse(a[1],a[0],b[1],b[0])['s12'])
            assert metres[-1]>0
            full_source[prefix]={'id':row['id'],'geometryLonLat':lonlat,'vertexFractions':[s/metres[-1]for s in metres]}
    full_lines={prefix:[[(lon-origin['lon'])*scale_x,-(lat-origin['lat'])*scale_z]for lon,lat in entry['geometryLonLat']]for prefix,entry in full_source.items()}
    for road,e in roads.items():
        base_points=e.get('sourceXY',e['pts'])
        assert len(base_points)==len(e['pts']),f'corrected source control correspondence:{road}'
        source=allSource[road];source_arc=arc(source)
        sourceDistanceAtControls[road],base_error=projected_coordinates(base_points,source['pts'],source_arc)
        prefix=road.rsplit('_',1)[0]
        if prefix in full_source:
            entry=full_source[prefix]
            fractions,error=projected_coordinates(base_points,full_lines[prefix],entry['vertexFractions'])
            assert error<.2,f'modeled source base is not retained source geometry:{road}:{error}'
            if road in sourceRepairs:
                repair=sourceRepairs[road];fractions=np.interp(sourceDistanceAtControls[road],repair['correctedArc'],repair['sourceFractions'])
            if e.get('sourceFractions')is not None:
                assert len(e['sourceFractions'])==len(e['pts']),f'fraction/control count:{road}'
                assert max(abs(np.array(e['sourceFractions'])-fractions),default=0)<1e-5,f'official fraction mapping:{road}'
                fractions=np.array(e['sourceFractions'],dtype=float)
            officialFractionAtControls[road]=fractions
            legacy=allSourceLegacy[road]
            legacyFractionsAtSource[road]=np.array(sourceRepairs[road]['legacyPointFractions'])if road in sourceRepairs else projected_coordinates(legacy['pts'],full_lines[prefix],entry['vertexFractions'])[0]
            sourceProjectionReport.append({'id':road,'maximumSourceProjectionDistance':error,'maximumCorrectedBaseDistance':base_error,'fullSourceSegment':entry['id']})

def immutable_interp(position,distances,values):
 """Same NumPy interpolation, reusing immutable input arrays offline.

 Literal source/control lists do not change during classification. Holding the
 original list also prevents object-ID reuse from returning another vector.
 """
 cache=globals().setdefault('immutableInterpolationArrays',{})
 def array(seq):
  if isinstance(seq,np.ndarray):return seq
  key=id(seq)
  if key not in cache:cache[key]=(seq,np.asarray(seq,dtype=np.float64))
  assert cache[key][0]is seq
  return cache[key][1]
 return np.interp(position,array(distances),array(values))
def srcS(i,s):
 if i in sourceDistanceAtControls:return float(immutable_interp(s,arcs[i],sourceDistanceAtControls[i]))
 e=roads[i]
 if e.get('sourceArc')and len(e['sourceArc'])==len(e['pts']):return float(immutable_interp(s,arcs[i],e['sourceArc']))
 return s

# The additional Langar proof retains exact WKB geometry and whole-edge connectors.
# Project immutable source controls, never deformed model XY, to that fraction.
import struct
exactSourceFractions={}
encoded=bytes.fromhex(familyBinding['retainedSource']['geometryWKB'])
endian='<'if encoded[0]==1 else'>'
assert struct.unpack_from(endian+'I',encoded,1)[0]==2,'expected2D source LineString'
count=struct.unpack_from(endian+'I',encoded,5)[0]
xy=[]
latitude=math.radians(coreOrigin['lat']);eccentricity_squared=6.6943799901413165e-3;denominator=math.sqrt(1-eccentricity_squared*math.sin(latitude)**2);NR=6378137./denominator;MR=6378137.*(1-eccentricity_squared)/denominator**3
for k in range(count):
 lon,lat=struct.unpack_from(endian+'dd',encoded,9+16*k)
 xy.append([(lon-coreOrigin['lon'])*math.cos(latitude)*NR*math.pi/180,-(lat-coreOrigin['lat'])*MR*math.pi/180])
exactSourceFractions[familyBinding['packedEdge']['id']]=(xy,arc({'pts':xy}))
def exact_source_fraction(road,source_distance):
 pp,ss=exactSourceFractions[road];rr=allSource[road];aa=arc(rr)
 point=np.array([np.interp(source_distance,aa,[p[k]for p in rr['pts']])for k in[0,1]])
 best=None
 for k,(a,b)in enumerate(zip(pp,pp[1:])):
  a=np.array(a);d=np.array(b)-a;progress=float(np.clip(np.dot(point-a,d)/(np.dot(d,d)or 1),0,1));projected=a+progress*d
  item=(float(np.linalg.norm(point-projected)),(ss[k]+progress*(ss[k+1]-ss[k]))/ss[-1])
  if best is None or item[0]<best[0]:best=item
 return best[1]

sourceMetadataMissing=set()
def level(i,s):
 pref=i.rsplit('_',1)[0]
 if args.additional_source_reference and pref not in layers:sourceMetadataMissing.add(pref)
 rules=layers.get(pref,[])
 if not rules:return 0
 if all(not rule.get('between')for rule in rules):return max(rule['value']for rule in rules)
 frac=(sourceOffsets.get(i,0)+srcS(i,s))/sourceTotals.get(pref,1)
 if i in officialFractionAtControls:frac=float(immutable_interp(s,arcs[i],officialFractionAtControls[i]))
 elif i in exactSourceFractions:frac=exact_source_fraction(i,srcS(i,s))
 return max((r['value']for r in rules if not r.get('between')or r['between'][0]-1e-6<=frac<=r['between'][1]+1e-6),default=0)
def oldAtArc(i,s):
 # An accepted old crossing uses the actual old triangle first. This fallback
 # uses the independently bound full-UUID geographic reference, never inherited
 # planar fractions or a sum of available sibling lengths.
 corrected=srcS(i,s);ss=corrected;selected=i;local=ss;official=None;reason=None
 if i in sourceRepairs:
  repair=sourceRepairs[i];record=globals().get('geographicRecords',{}).get(i)
  if record is not None:
   if corrected<record['correctedArc'][0]-1e-7 or corrected>record['correctedArc'][-1]+1e-7:reason='Corrected distance outside bound geographic record'
   else:
    official=float(immutable_interp(corrected,record['correctedArc'],record['correctedOfficialMetres']))
    candidates=[]
    for candidate in geographicFamilies[record['sourceSegmentID']]:
     lo=candidate['legacyOfficialMetres'][0];hi=candidate['legacyOfficialMetres'][-1]
     if lo-1e-7<=official<=hi+1e-7:
      owner=candidate['id']
      if owner not in allSourceLegacy or owner not in allOld:reason='Bound geographic historical owner is unavailable';break
      # Aliases must also be one exact continuous historical source-node chain.
      left_prefix,left_suffix=i.rsplit('_',1);right_prefix,right_suffix=owner.rsplit('_',1)
      if left_prefix!=right_prefix:reason='Geographic owner has incompatible source ID';break
      low=min(int(left_suffix),int(right_suffix));high=max(int(left_suffix),int(right_suffix));valid=True
      for suffix in range(low,high):
       first=left_prefix+'_'+str(suffix);second=left_prefix+'_'+str(suffix+1)
       if first not in allSourceLegacy or second not in allSourceLegacy or first not in allOld or second not in allOld:valid=False;break
       aa=allSourceLegacy[first];bb=allSourceLegacy[second]
       if not aa.get('to')or aa.get('to')!=bb.get('from')or math.dist(aa['pts'][-1],bb['pts'][0])>1e-7:valid=False;break
       if first not in geographicRecords or second not in geographicRecords or geographicRecords[first]['sourceSegmentID']!=record['sourceSegmentID']or geographicRecords[second]['sourceSegmentID']!=record['sourceSegmentID']:valid=False;break
      if not valid:reason='Missing or discontinuous bound historical sibling chain';break
      distance=float(immutable_interp(max(lo,min(hi,official)),candidate['legacyOfficialMetres'],candidate['legacyArc']))
      if owner not in historicalPreparedArcs:historicalPreparedArcs[owner]=arc(allOld[owner])
      old_arc=historicalPreparedArcs[owner];prepared=distance/candidate['legacyArc'][-1]*old_arc[-1]
      height=float(immutable_interp(prepared,old_arc,allOld[owner]['elev']))if allOld[owner]['elev']else 0.
      candidates.append((owner,distance,height))
    if reason is None:
     if not candidates:reason='No exact full-UUID geographic historical owner covers corrected point'
     elif max(c[2]for c in candidates)-min(c[2]for c in candidates)>1e-7:reason='Ambiguous historical sibling endpoint heights'
     else:
      selected,local,_=next((c for c in candidates if c[0]==i),candidates[0])
  else:
   # Synthetic/non-geographic controls may use their explicit OWN sourceArc.
   # An alias without the bound geographic artifact is always unresolved.
   if globals().get('sourceGeometry')is not None or globals().get('geographicReference')is not None:reason='Real source road has unresolved bound geographic reference'
   else:
    ss=float(immutable_interp(corrected,repair['correctedArc'],repair['sourceArc']));local=ss
    if ss<0 or ss>legacyRawArcs[i][-1]:reason='Source extension requires bound geographic sibling reference'
 own_length=legacyRawArcs[i][-1]
 if -1e-9<=local<0:local=0.
 if selected in legacyRawArcs and legacyRawArcs[selected][-1]<local<=legacyRawArcs[selected][-1]+1e-9:local=legacyRawArcs[selected][-1]
 if reason or selected not in allOld or selected not in legacyRawArcs or not 0<=local<=legacyRawArcs[selected][-1]:
  key=(i,round(corrected,6));historicalReferenceUnresolved[key]={'road':i,'modelArc':s,'correctedSourceDistance':corrected,'legacyLocalReference':ss,'legacyOwnedLength':own_length,'geographicOfficialMetres':official,'reason':reason or 'Unavailable exact historical owner; no endpoint clamping'}
  return None
 e=allOld[selected]
 if selected not in historicalPreparedArcs:historicalPreparedArcs[selected]=arc(e)
 aa=historicalPreparedArcs[selected];prepared=local/legacyRawArcs[selected][-1]*aa[-1]if legacyRawArcs[selected][-1]else 0.
 return float(immutable_interp(prepared,aa,e['elev']))if e['elev']else 0.
def outward(i,rev):
 pts=roads[i]['pts'];a,b=(pts[-1],pts[-2])if rev else(pts[0],pts[1]);d=math.dist(a,b)or 1;return((b[0]-a[0])/d,(b[1]-a[1])/d)

def clip_triangle_progress(vertices,lower,upper):
 # Progress is affine on each actual road triangle. Cropping a whole quad
 # would substitute a different diagonal on a non-parallelogram section.
 for bound,sign in[(lower,1),(upper,-1)]:
  out=[]
  for a,b in zip(vertices,vertices[1:]+vertices[:1]):
   da=(a[2]-bound)*sign;db=(b[2]-bound)*sign
   if da>=-1e-12:out.append(a)
   if(da>=0)!=(db>=0):
    t=da/(da-db);out.append(tuple(a[k]+t*(b[k]-a[k])for k in range(3)))
  vertices=out
  if not vertices:break
 return[list(v[:2])for v in vertices]


def local_source_level_progress_intervals(road,index,required):
 if required is None:return[(0.,1.)]
 assert road in officialFractionAtControls,'Source-level clipping requires bound official fractions'
 f0,f1=officialFractionAtControls[road][index:index+2];cuts={0.,1.}
 if abs(f1-f0)>1e-14:
  for rule in layers.get(road.rsplit('_',1)[0],[]):
   if rule.get('between'):
    for fraction in[rule['between'][0]-1e-6,rule['between'][1]+1e-6]:
     u=(fraction-f0)/(f1-f0)
     if 0<u<1:cuts.add(float(u))
 values=sorted(cuts);aa=arcs[road]
 return[(lo,hi)for lo,hi in zip(values,values[1:])if level(road,aa[index]+(aa[index+1]-aa[index])*(lo+hi)/2)==required]

# Explicitly authorized source junctions use literal local pavement fragments,
# not a radius-only road-pair waiver. The paved union may connect a same-source
# split through its actual junction fan even when pairwise cut normals differ.
localJunctionMeshes=[];localJunctionProofs=[]
for patch in apronPolicy.get('localJunctionPatches',[]):
 assert set(patch['roads'])<=set(roads),'Incomplete source-bound local junction inventory'
 if 'node'in patch:
  node=patch['node'];first,second=patch['sourceSpine'];a,b=roads[first],roads[second]
  assert a['to']==b['from']==node and math.dist(a['pts'][-1],b['pts'][0])<1e-7
  full_ids=[sourceRepairs[i]['sourceSegmentID']if i in sourceRepairs else rawBy[i.rsplit('_',1)[0]]['id']for i in[first,second]]
  assert len(full_ids[0])==36 and full_ids[0]==full_ids[1]
  assert patch['sourceOriginNode']in{roads[first]['from'],roads[first]['to']}&{roads[patch['referenceRoad']]['from'],roads[patch['referenceRoad']]['to']}
  center=a['pts'][-1];seeds=[center];authority={'node':node,'nodes':[node,node],'path':[first,second],'sourceOriginNode':patch['sourceOriginNode'],'sourceSpine':[first,second],'fullSourceSegmentID':full_ids[0]}
 else:
  connector=roads[patch['connector']]
  assert length(connector)<=patch['maximumConnectorLength']
  assert all(level(patch['connector'],s)==0 for s in arcs[patch['connector']])
  center=[(connector['pts'][0][k]+connector['pts'][-1][k])/2 for k in[0,1]];seeds=[connector['pts'][0],connector['pts'][-1]]
  authority={'connector':patch['connector'],'nodes':[connector['from'],connector['to']],'path':[patch['connector']],'connectorLength':length(connector)}
 radius=patch['radius'];boundary=[(center[0]+radius*math.cos(k*math.tau/64),center[1]+radius*math.sin(k*math.tau/64))for k in range(64)]
 fragments=[]
 for road in patch['roads']:
  for segment,quad in enumerate(qs[road]):
   if max(p[0]for p in quad)<center[0]-radius or min(p[0]for p in quad)>center[0]+radius or max(p[1]for p in quad)<center[1]-radius or min(p[1]for p in quad)>center[1]+radius:continue
   for triangle in[(0,1,2),(0,2,3)]:
    for lo,hi in local_source_level_progress_intervals(road,segment,patch.get('requiredLocalSourceLevel')):
     polygon=clip_triangle_progress([(*quad[k],int(k in[1,2]))for k in triangle],lo,hi)
     polygon=clip(polygon,boundary)if len(polygon)>=3 else[]
     area=abs(sum(p[0]*polygon[(k+1)%len(polygon)][1]-p[1]*polygon[(k+1)%len(polygon)][0]for k,p in enumerate(polygon)))/2
     if area>=args.minimum_polygon_area:fragments.append({'road':road,'segment':segment,'triangle':triangle,'polygon':polygon,'localSourceLevel':patch.get('requiredLocalSourceLevel'),'affineProgressClip':[lo,hi]})
 remaining=set(range(len(fragments)));queue=[i for i,f in enumerate(fragments)if point_polygon_contact(seeds[0],f['polygon'])];connected=set()
 while queue:
  index=queue.pop()
  if index not in remaining:continue
  remaining.remove(index);connected.add(index)
  queue.extend(other for other in remaining if polygons_contact(fragments[index]['polygon'],fragments[other]['polygon']))
 selected=[fragments[i]for i in sorted(connected)]
 reached_roads={f['road']for f in selected};valid=all(any(point_polygon_contact(seed,f['polygon'])for f in selected)for seed in seeds)and set(patch['roads'])<=reached_roads
 proof={'id':patch['id'],'category':'explicit-source-bound-literal-local-junction','roads':patch['roads'],'radius':radius,'center':center,**authority,'sourcePolicySHA256':initialInputSHA['apron_policy'],'conditioningPolicySHA256':patch.get('conditioningPolicySHA256'),'requiredLocalSourceLevel':patch.get('requiredLocalSourceLevel'),'literalConnected':valid,'reachedRoads':sorted(reached_roads),'polygons':selected}
 localJunctionProofs.append(proof)
 if valid:localJunctionMeshes.append((proof,selected))

def local_junction_fragment(a,i,b,j,point):
 index=globals().get('localJunctionPairIndex')
 candidates=index.get(tuple(sorted((a,b))),[])if index is not None else localJunctionMeshes
 for proof,fragments in candidates:
  if a not in proof['roads']or b not in proof['roads']:continue
  if all(any(f['road']==road and f['segment']==segment and point_polygon_contact(point,f['polygon'])for f in fragments)for road,segment in[(a,i),(b,j)]):return proof
 return None


def source_node_fan(node,entries,road_data,road_quads,road_arcs,center,radius,window):
 boundary=[(center[0]+radius*math.cos(k*math.tau/64),center[1]+radius*math.sin(k*math.tau/64))for k in range(64)]
 fragments=[]
 for road,end in entries:
  aa=road_arcs[road];lo,hi=(0.,min(aa[-1],window))if end==0 else(max(0.,aa[-1]-window),aa[-1])
  for index,quad in enumerate(road_quads[road]):
   if aa[index+1]<lo or aa[index]>hi:continue
   run=aa[index+1]-aa[index]
   if run<=1e-10:continue
   lower=max(0.,(lo-aa[index])/run);upper=min(1.,(hi-aa[index])/run)
   for triangle in[(0,1,2),(0,2,3)]:
    polygon=clip_triangle_progress([(*quad[k],int(k in[1,2]))for k in triangle],lower,upper)
    polygon=clip(polygon,boundary)if len(polygon)>=3 else[]
    area=abs(sum(p[0]*polygon[(k+1)%len(polygon)][1]-p[1]*polygon[(k+1)%len(polygon)][0]for k,p in enumerate(polygon)))/2
    if area>=1e-6:fragments.append({'road':road,'segment':index,'triangle':triangle,'polygon':polygon})
 remaining=set(range(len(fragments)));queue=[i for i,f in enumerate(fragments)if point_polygon_contact(center,f['polygon'])];connected=[]
 while queue:
  index=queue.pop()
  if index not in remaining:continue
  remaining.remove(index);connected.append(index)
  queue.extend(other for other in remaining if polygons_contact(fragments[index]['polygon'],fragments[other]['polygon']))
 selected=[fragments[i]for i in connected]
 return selected,set(r for r,end in entries)<={f['road']for f in selected}

fanPolicy=json.load(open(args.source_node_fans));fanAuthority=fanPolicy['authorization']
assert fanAuthority['immutableCoreSHA256']==initialInputSHA['core']and fanAuthority['sourceRoadGeometryGeneration']==sourceGeometry['generationID'],'Unbound source-node fan authority'
for authorized in fanPolicy['proofs']:
 node=authorized['node'];entries=[(road,0 if e['from']==node else-1)for road,e in allCurrent.items()if node in[e['from'],e['to']]and(not joint or road in authorized['incidentRoads'])]
 assert {r for r,k in entries}==set(authorized['incidentRoads']),'Source-node fan incident inventory changed:'+node
 assert all(r in roads for r,k in entries),'Source-node fan lacks an actual nearby road:'+node
 center=authorized['center'];assert all(math.dist(roads[r]['pts'][k],center)<1e-7 for r,k in entries),'Source-node fan endpoint moved:'+node
 half=max(math.dist(footprints[r]['L'][k],footprints[r]['R'][k])/2 for r,k in entries);radius=half+2.;window=2*half+2.
 assert radius<=authorized['radius']+1e-7 and window<=authorized['maximumModelArcFromNode']+1e-7,'Source-node fan physical envelope increased:'+node
 selected,valid=source_node_fan(node,entries,roads,qs,arcs,center,radius,window)
 proof={'id':'source-node-fan:'+node,'category':'authorized-source-node-literal-initial-fan','node':node,'nodes':[node,node],'path':[],'roads':sorted(r for r,k in entries),'radius':radius,'maximumModelArcFromNode':window,'center':center,'sourceAuthoritySHA256':initialInputSHA['source_node_fans'],'literalConnected':valid,'polygons':selected}
 localJunctionProofs.append(proof)
 if valid:localJunctionMeshes.append((proof,selected))
if joint:
 for node,record in jointNodeRecords.items():
  expected={arm['id']for arm in record['coreArms']+record['tileArms']}
  entries=[(road,0 if e['from']==node else-1)for road,e in allCurrent.items()if node in[e['from'],e['to']]]
  assert expected=={road for road,end in entries},'Joint node does not contain every incident arm:'+node
  assert all(road in roads for road,end in entries),'Missing joint finite incident footprint:'+node
  # Keep every distinct retained endpoint. This proves a local literal fan;
  # it never snaps the historically different XZ positions together.
  anchor=next(((road,end)for road,end in entries if road not in tileIds|jointContextIds|fixedTileIds),entries[0]);center=roads[anchor[0]]['pts'][anchor[1]]
  half=max(math.dist(footprints[r]['L'][end],footprints[r]['R'][end])/2 for r,end in entries);radius=half+2.;window=2*half+2.
  selected,valid=source_node_fan(node,entries,roads,qs,arcs,center,radius,window)
  proof={'id':'joint-source-node-fan:'+node,'category':'all-arm-source-proved-joint-local-fan','node':node,'nodes':[node,node],'path':[],'roads':sorted(expected),'radius':radius,'maximumModelArcFromNode':window,'center':center,'sourceAuthoritySHA256':initialInputSHA['joint_tile_input'],'fullConnectorAliases':record['fullConnectorAliases'],'literalConnected':valid,'distinctEndpointsPreserved':True,'polygons':selected}
  localJunctionProofs.append(proof)
  if valid:localJunctionMeshes.append((proof,selected))
localJunctionPairIndex=collections.defaultdict(list)
for proof,selected in localJunctionMeshes:
 for a,b in itertools.combinations(sorted(proof['roads']),2):localJunctionPairIndex[(a,b)].append((proof,selected))
# Source-attached branch components are restricted to exact connected finite overlap fragments.
caseSeeds=[c for c in known if c['classification']=='confirmed-actual-car-body-in-rendered-slab'];seen={(c['node'],tuple(sorted(c['roads'])))for c in caseSeeds}
for rep in stage['gradeReport']['joinedApproaches']['repairs']:
 if not set(rep['roads'])&set(varIds)or(rep['node'],tuple(sorted(rep['roads'])))in seen:continue
 raised=[i for i in rep['roads']if max(allSource[i]['elev']or[0])>1.2]
 if len(raised)==1:caseSeeds.append({**rep,'groundRoad':next(i for i in rep['roads']if i!=raised[0])})
seedPaths=[]
for c in caseSeeds:
 a=next(i for i in c['roads']if i!=c['groundRoad']);g=c['groundRoad'];node=c['node'];members=[];start=0;entry=(g,roads[g]['to']==node);visited=set()
 while entry and start<500 and len(members)<10:
  i,rev=entry
  if i in visited:break
  visited.add(i);r=roads[i];L=arcs[i][-1];members.append({'id':i,'reverse':rev,'start':start,'length':L});start+=L;far=r['from']if rev else r['to'];ih=outward(i,not rev);nxt=[]
  for j,k in ends.get(far,[]):
   if j in visited or j not in roads or not flat(j)or j in underpassIds:continue
   h=outward(j,k==-1)
   if -(h[0]*ih[0]+h[1]*ih[1])>.94:nxt.append((j,k==-1))
  same=[v for v in nxt if v[0].split('_')[0]==i.split('_')[0]];entry=same[0]if len(same)==1 else nxt[0]if len(nxt)==1 else None
 seedPaths.append({'node':node,'ramp':a,'reverse':roads[a]['to']==node,'members':members})
components=[]
for c in seedPaths:
 a=c['ramp'];rev=c['reverse'];L=arcs[a][-1];hits={};offset=0
 for m in c['members']:
  b=m['id'];na=len(qs[a]);nb=len(qs[b])
  for i,u,j,v,p in overlap(a,b):
   ai=na-1-i if rev else i;bi=offset+(nb-1-j if m['reverse']else j);sa=arcs[a][i]*(1-u)+arcs[a][i+1]*u;sb=arcs[b][j]*(1-v)+arcs[b][j+1]*v
   hits.setdefault((ai,bi),[]).append((L-sa if rev else sa,m['start']+(arcs[b][-1]-sb if m['reverse']else sb),a,b,i,u,j,v,p))
  offset+=nb
 con=set();queue=[]
 if(0,0)in hits:
  first=hits[(0,0)][0];point=roads[a]['pts'][-1 if rev else 0]
  cell=(first[2],first[3],first[4],first[6])
  if cell_is_connected(cell)and any(point_polygon_contact(point,poly)for poly in cellPolygons.get(cell,[])):queue=[(0,0)]
 while queue:
  q=queue.pop()
  if q in con:continue
  con.add(q)
  for di,dj in itertools.product([-1,0,1],repeat=2):
   z=q[0]+di,q[1]+dj
   if z in hits and z not in con:
    first=hits[q][0];second=hits[z][0]
    if cells_contact((first[2],first[3],first[4],first[6]),(second[2],second[3],second[4],second[6])):queue.append(z)
 pts=[p for k in con for p in hits[k]]
 if pts:components.append({**c,'segmentPairs':sorted({(p[2],p[3],p[4],p[6])for p in pts}),'run':max(p[0]for p in pts)+2,'groundRun':max(p[1]for p in pts)+2,'fragments':len(con)})
groundAnchors={m['id']for c in stage['corridors']for m in c['members']}
O={};N=0
for i in varIds:O[i]=N;N+=len(roads[i]['pts'])
base=np.array([h for i in varIds for h in(roads[i]['elev']or[0]*len(roads[i]['pts']))]);bounds=[(0.,40.)]*N;protected=set(r['id']for r in json.load(open(str(args.mapped_levels)))['roads'])
protected.update(i for i,e in roads.items()if e.get('elevationSource')in['surveyed','explicit'])
for i in varIds:
 e=roads[i];yy=e['elev']or[0]*len(e['pts'])
 # The conditioned branch datum/profile is preserved. Raw packed zero is not a surveyed height.
 if i not in primaryVariableIds and i not in componentWindows['roads']or i in tileIds or flat(i)or i in protected or e.get('expressway')or i in underpassIds or min(yy)<-.001:
  for j,h in enumerate(yy):bounds[O[i]+j]=(h,h)
 # Appended roads are eligible only in the proved component plus smooth recovery.
 if i in componentWindows['roads']:
  for j,h in enumerate(yy):bounds[O[i]+j]=(h,h)
  if i not in protected and not e.get('expressway')and i not in underpassIds and min(yy)>=-.001:
   spans=componentWindows['roads'][i]['ranges']
   for j,distance in enumerate(arcs[i]):
    if any(a-80<=distance<=b+80 for a,b in spans)and max(allSource[i]['elev']or[0])>1.2:bounds[O[i]+j]=(0.,40.)
 # Actual prepared shared-node datum, except the explicitly source-proved lowering.
 bounds[O[i]]=(yy[0],yy[0]);bounds[O[i]+len(yy)-1]=(yy[-1],yy[-1])
 for node,j in[(e['from'],0),(e['to'],len(yy)-1)]:
  if node in nodeTargets and i not in globals().get('jointTileIds',set()):
   rule=nodeTargets[node];target=rule['target'];assert -1e-9<=yy[j]-target<=rule['maximumLowering']+1e-9
   if abs(target-yy[j])>1e-10 and(i in protected or i in underpassIds or e.get('expressway')or min(yy)<-.001):raise ValueError('Estimated node policy would overwrite protected authority:'+i+':'+node)
   bounds[O[i]+j]=(target,target)
   if max(allSource[i]['elev']or[0])<.001:
    for k,h in enumerate(yy):
     away=arcs[i][k]if j==0 else arcs[i][-1]-arcs[i][k]
     if away<=80 and k not in(0,len(yy)-1):bounds[O[i]+k]=(0.,h)
   bounds[O[i]+j]=(target,target)
def in_ground(a,i,u,b,j,v):
 # A source-connected approach may continue underneath the very flyover it
 # joins. Projected overlap with that approach is not shared pavement inside
 # the independently stacked bridge interval. Exact endpoint joins are handled
 # separately; the general attached-apron exemption cannot waive this order.
 sa=arcs[a][i]*(1-u)+arcs[a][i+1]*u;sb=arcs[b][j]*(1-v)+arcs[b][j+1]*v
 if level(a,sa)!=level(b,sb):return False
 for c in components:
  if (a,b,i,j)not in c['segmentPairs']and(b,a,j,i)not in c['segmentPairs']:continue
  def pos(id,n,t):
   s=arcs[id][n]*(1-t)+arcs[id][n+1]*t
   if id==c['ramp']:return True,arcs[id][-1]-s if c['reverse']else s
   for m in c['members']:
    if m['id']==id:return False,m['start']+(arcs[id][-1]-s if m['reverse']else s)
  x=pos(a,i,u);y=pos(b,j,v)
  if x and y and x[0]!=y[0]and(x[1]if x[0]else y[1])<=c['run']+1e-6 and(y[1]if x[0]else x[1])<=c['groundRun']+1e-6:return True
 return False
# Exact source graph classifies only newly exposed shallow attached-junction fragments.
# Missing level tags are not an altitude. This graph supplies topology, never a zero-Y anchor.
import heapq
junctionGraph = {}
for road_id, road in allSource.items():
    if road_id not in allCurrent:
        continue
    if road_id in protected or road_id in underpassIds or min(allCurrent[road_id]['elev']or[0])<-.001 or road.get('expressway'):
        continue
    prefix=road_id.rsplit('_',1)[0];total=sourceTotals.get(prefix,1.);lo=sourceOffsets.get(road_id,0.)/total;hi=(sourceOffsets.get(road_id,0.)+length(road))/total
    if road_id in sourceRepairs:lo=min(sourceRepairs[road_id]['sourceFractions']);hi=max(sourceRepairs[road_id]['sourceFractions'])
    elif road_id in officialFractionAtControls:lo=float(min(officialFractionAtControls[road_id]));hi=float(max(officialFractionAtControls[road_id]))
    if any(rule['value']>0 and(not rule.get('between')or rule['between'][0]<hi and rule['between'][1]>lo)for rule in layers.get(prefix,[])):
        continue
    a, b = road['from'], road['to']
    if a and b:
        distance = length(road)
        junctionGraph.setdefault(a, []).append((b, distance, road_id))
        junctionGraph.setdefault(b, []).append((a, distance, road_id))
def source_apron_alignment(a,sa,ak,b,sb,bk,path):
    source=allSource[a];aa=arc(source);distance=srcS(a,sa);n=max(0,min(len(aa)-2,int(np.searchsorted(aa,distance,side='right'))-1));axis=np.subtract(source['pts'][n+1],source['pts'][n]);axis=axis/(np.linalg.norm(axis)or 1.)
    segments=[]
    spans=[(a,min(distance,aa[0 if ak==0 else -1]),max(distance,aa[0 if ak==0 else -1]))]
    bb=arc(allSource[b]);bd=srcS(b,sb);spans.append((b,min(bd,bb[0 if bk==0 else -1]),max(bd,bb[0 if bk==0 else -1])))
    spans.extend((road,0.,length(allSource[road]))for road in path)
    for road,lo,hi in spans:
        e=allSource[road];ss=arc(e)
        for j,(p,q)in enumerate(zip(e['pts'],e['pts'][1:])):
            if ss[j+1]<lo-1e-6 or ss[j]>hi+1e-6 or ss[j+1]-ss[j]<.5:continue
            d=np.subtract(q,p);dot=abs(float(np.dot(axis,d))/(np.linalg.norm(d)or 1.))
            if dot<math.cos(math.pi/6):return None
            segments.append({'road':road,'sourceSegment':j,'absoluteTangentDot':dot})
    return {'minimumSourceTangentDot':min((p['absoluteTangentDot']for p in segments),default=1.),'alignedSourceSegments':segments}

junctionPathCache = {}
def local_source_junction(a, i, u, b, j, v):
    ra, rb = roads[a], roads[b]
    sa = arcs[a][i] * (1-u) + arcs[a][i+1] * u
    sb = arcs[b][j] * (1-v) + arcs[b][j+1] * v
    options = []
    for road_id, distance, label in [(a, sa, 'a'), (b, sb, 'b')]:
        e = roads[road_id]
        raw_y = allSource[road_id]['elev'] or [0] * len(allSource[road_id]['pts'])
        options.append([(e['from'], distance, 0), (e['to'], arcs[road_id][-1]-distance, -1)])
    best = None
    for an, da, ak in options[0]:
        if not an or level(a,0. if ak==0 else arcs[a][-1])!=0:
            continue
        for bn, db, bk in options[1]:
            if not bn or da + db >= 93 or level(b,0. if bk==0 else arcs[b][-1])!=0:
                continue
            key = (an, bn)
            if key not in junctionPathCache:
                queue = [(0., an, [])]
                visited = {}
                answer = None
                while queue:
                    distance, node, path = heapq.heappop(queue)
                    if distance > 93 or distance >= visited.get(node, 1e99):
                        continue
                    visited[node] = distance
                    if node == bn:
                        answer = (distance, path)
                        break
                    for nxt, length0, edge in junctionGraph.get(node, []):
                        if distance + length0 <= 93:
                            heapq.heappush(queue, (distance + length0, nxt, path + [edge]))
                junctionPathCache[key] = answer
            answer = junctionPathCache[key]
            if answer and da + db + answer[0] < 93:
                alignment=source_apron_alignment(a,sa,ak,b,sb,bk,answer[1])
                if alignment is None:
                    # A very short at-grade junction link can join angled arms.
                    # Its actual endpoint footprints, not a long detour, define
                    # this local patch. The rejected51degree broad path remains
                    # ineligible for the shallow-apron rule.
                    footprint_radius=max(width(ra,sa),width(rb,sb))+2
                    if answer[0]>12 or da>footprint_radius or db>footprint_radius or da+db+answer[0]>25:continue
                    alignment={'category':'localized-short-source-node-junction','maximumEndpointFootprintDistance':max(da,db),'maximumConnectorPath':12}
                item = {'nodes':[an,bn], 'path':answer[1], 'sourcePathMeters':answer[0], 'upperOrFirstEndpointDistance':da, 'secondEndpointDistance':db, 'totalGraphMeters':da+db+answer[0],**alignment}
                if best is None or item['totalGraphMeters'] < best['totalGraphMeters']:
                    best = item
    return best
junctionWitnesses = []

# A real shared source connector is one physical pavement junction, including
# an angled fork. Retire only its actual connected finite overlap component;
# a later re-crossing of the same two roads remains an independent crossing.
sharedNodeFragments = {}
def source_node_components(a,b,samples):
    common={roads[a]['from'],roads[a]['to']} & {roads[b]['from'],roads[b]['to']}
    common.discard(None)
    hits={(i,j)for i,u,j,v,p in samples};out={}
    for node in common:
        seed=(0 if roads[a]['from']==node else len(qs[a])-1,0 if roads[b]['from']==node else len(qs[b])-1)
        point=roads[a]['pts'][0 if roads[a]['from']==node else -1]
        queue=[seed]if seed in hits and cell_is_connected((a,b,*seed))and any(point_polygon_contact(point,poly)for poly in cellPolygons.get((a,b,*seed),[]))else[];connected=set()
        while queue:
            item=queue.pop()
            if item in connected:continue
            ia,ib=item
            if level(a,(arcs[a][ia]+arcs[a][ia+1])/2)!=level(b,(arcs[b][ib]+arcs[b][ib+1])/2):continue
            connected.add(item)
            for di,dj in itertools.product([-1,0,1],repeat=2):
                nxt=(item[0]+di,item[1]+dj)
                if nxt in hits and nxt not in connected and cells_contact((a,b,*item),(a,b,*nxt)):queue.append(nxt)
        for item in connected:out[item]={'nodes':[node,node],'path':[],'sourcePathMeters':0.,'category':'exact-shared-source-node-finite-component','sourceRoads':[a,b],'seedSegments':seed}
    return out
sourceContinuationCache={}
def source_family_members(prefix):
 index=globals().get('sourceFamilyRoadIndex')
 if index is None or index[0]is not roads:
  groups=collections.defaultdict(list)
  for road in roads:groups[road.rsplit('_',1)[0]].append(road)
  index=(roads,groups);globals()['sourceFamilyRoadIndex']=index
 return index[1].get(prefix,[])
def source_continuation_components(a,b,samples):
    out={};hits={(i,j)for i,u,j,v,p in samples}
    for subject,reference,swapped in[(a,b,False),(b,a,True)]:
        prefix=subject.rsplit('_',1)[0]
        if prefix==reference.rsplit('_',1)[0]:continue
        for previous in source_family_members(prefix):
            if previous==subject or previous.rsplit('_',1)[0]!=prefix:continue
            common={roads[previous]['from'],roads[previous]['to']}&{roads[subject]['from'],roads[subject]['to']};common.discard(None)
            if not common:continue
            if not({roads[previous]['from'],roads[previous]['to']}&{roads[reference]['from'],roads[reference]['to']}-{None}):continue
            key=(previous,reference)
            if key not in sourceContinuationCache:
                prior_samples=overlap(previous,reference)
                sourceContinuationCache[key]=source_node_components(previous,reference,prior_samples)
            prior=sourceContinuationCache[key]
            for node in common:
                previous_end=0 if roads[previous]['from']==node else len(qs[previous])-1
                subject_end=0 if roads[subject]['from']==node else len(qs[subject])-1
                reference_segments={j for(i,j)in prior if i==previous_end}
                seeds={(i,j)for i,j in hits if(j if swapped else i)==subject_end and any(abs((i if swapped else j)-r)<=1 and cells_meet_at_source_cut((a,b,i,j),(previous,reference,previous_end,r),previous,node)for r in reference_segments)}
                queue=list(seeds);connected=set()
                while queue:
                    item=queue.pop()
                    if item in connected:continue
                    i,j=item
                    if level(a,(arcs[a][i]+arcs[a][i+1])/2)!=0 or level(b,(arcs[b][j]+arcs[b][j+1])/2)!=0:continue
                    connected.add(item)
                    for di,dj in itertools.product([-1,0,1],repeat=2):
                        nxt=(i+di,j+dj)
                        if nxt in hits and nxt not in connected and cells_contact((a,b,*item),(a,b,*nxt)):queue.append(nxt)
                for item in connected:out[item]={'category':'exact-same-source-continuation-of-node-finite-component','nodes':[node,node],'path':[previous],'sameFullSourcePrefix':prefix,'previousComponentTerminalSegments':sorted(reference_segments),'sourcePositiveInteriorExcluded':True}
    return out

heads=[];couplings=[];unclassified=[];
ownSurfaceProofs={};remoteOwnIntersections=[]
def owned_surface_intersections(road,edge,quads,ribbon,distances,minimum_area):
 """Literal self intersections, separated by physical source-path locality.

 A single quad is one intended pavement sheet. Other local intersections
 require the complete intervening control interval to fit within the local
 full-width envelope plus2m. Distant source loops never inherit that rule.
 """
 boxes=[(min(p[0]for p in q),max(p[0]for p in q),min(p[1]for p in q),max(p[1]for p in q))for q in quads]
 grid=collections.defaultdict(set)
 for j,box in enumerate(boxes):
  for x in range(math.floor(box[0]/40),math.floor(box[1]/40)+1):
   for z in range(math.floor(box[2]/40),math.floor(box[3]/40)+1):grid[(x,z)].add(j)
 for i,qa in enumerate(quads):
  box=boxes[i];nearby=set()
  for x in range(math.floor(box[0]/40),math.floor(box[1]/40)+1):
   for z in range(math.floor(box[2]/40),math.floor(box[3]/40)+1):nearby.update(grid[(x,z)])
  for j in sorted(k for k in nearby if k>=i):
   other=boxes[j]
   if box[1]<other[0]or other[1]<box[0]or box[3]<other[2]or other[3]<box[2]:continue
   qb=quads[j]
   local_width=max(math.dist(ribbon['L'][k],ribbon['R'][k])for k in[i,i+1,j,j+1]);source_span=distances[j+1]-distances[i]
   triangles=[((0,1,2),(0,2,3))]if i==j else itertools.product([(0,1,2),(0,2,3)],repeat=2)
   for ai,bi in triangles:
    # Triangles sharing the diagonal cannot overlap in area when their third
    # vertices lie on opposite sides. Avoid clipping the ordinary convex case.
    if i==j and cross(qa[0],qa[2],qa[1])*cross(qa[0],qa[2],qa[3])<=0:continue
    polygon=clip([qa[k]for k in ai],[qb[k]for k in bi]);area=abs(sum(p[0]*polygon[(k+1)%len(polygon)][1]-p[1]*polygon[(k+1)%len(polygon)][0]for k,p in enumerate(polygon)))/2
    if area<minimum_area:continue
    separation=[];signed_separation=[]
    for point in polygon:
     u=coeff(ai,bary([qa[k]for k in ai],point));v=coeff(bi,bary([qb[k]for k in bi],point))
     a=distances[i]*(1-u)+distances[i+1]*u;b=distances[j]*(1-v)+distances[j+1]*v;separation.append(abs(a-b));signed_separation.append(a-b)
    maximum_separation=max(separation)
    closed_source_node=bool(edge.get('from')and edge.get('from')==edge.get('to'))
    if closed_source_node:
     minimum_separation=0. if min(signed_separation)<=0<=max(signed_separation)else min(separation)
     maximum_separation=distances[-1]/2 if minimum_separation<=distances[-1]/2<=maximum_separation else max(min(distance,distances[-1]-distance)for distance in separation)
    # The source progress on each actual triangle is affine, so checking all
    # clipped vertices bounds the complete overlap, including coarse quads.
    # A genuine grade-separated loop cannot acquire local authority from mere
    # adjacency of segment indices.
    local=i==j or maximum_separation<=local_width+2.+1e-7
    yield {'roads':[road,road],'segments':[i,j],'triangles':[ai,bi],'polygon':polygon,'area':area,'local':local,'localFullWidth':local_width,'interveningModelArc':source_span,'maximumIntersectingArcSeparation':maximum_separation,'closedPhysicalSourceNode':closed_source_node,'proofCategory':'one-drawn-quad-fold'if i==j else'local-continuous-owned-pavement'if local else'remote-owned-source-intervals'}

def couple(a,i,u,b,j,v,p,physical):
 ya=(roads[a]['elev']or[0]*len(roads[a]['pts']));yb=(roads[b]['elev']or[0]*len(roads[b]['pts']));offset=0 if physical else(ya[i]*(1-u)+ya[i+1]*u-yb[j]*(1-v)-yb[j+1]*v)
 couplings.append((a,i,u,b,j,v,p,offset,args.same_layer_tolerance if physical else .005))
def independent_headroom_order(old_covered,gap,level_a,level_b):
 """A coincident old placeholder cannot override a mapped separation.

 Real historical separation keeps its accepted order/clearance. Otherwise a
 source-level difference supplies the order and the full new crossing budget.
 Proven local junction/apron authority is handled before this fallback.
 """
 if old_covered and abs(gap)>.01:
  return (1 if gap>0 else-1,min(5.85,abs(gap)),'old-accepted-headroom')
 if level_a!=level_b:
  return (1 if level_a>level_b else-1,5.85,'new-envelope-headroom')
 return None
def source_ground_carriageway_proof(first,second,first_source,second_source,tangent_dot):
 """Literal overlapping ground ribbons of the same source route share pavement.

 A small difference between estimated historical sheets is not headroom.
 This proof requires complete full-UUID source records, a common named route,
 parallel local tangents and no structural annotation anywhere on either
 source. A name, proximity or missing source row alone never grants it.
 The caller must already have established a finite physical ribbon overlap.
 """
 if tangent_dot<=.94 or not first_source or not second_source:return None
 name=first.get('name')
 if not name or name!=second.get('name')or name.strip().lower()in['road','bridge','flyover','highway']:return None
 if first.get('cls')not in['trunk','primary','secondary','tertiary']or first.get('cls')!=second.get('cls'):return None
 for road,source in[(first,first_source),(second,second_source)]:
  if source.get('id','')[:12]!=road['id'].split('_')[0]or len(source.get('id',''))!=36:return None
  if source.get('name')!=road.get('name')or source.get('class')!=road.get('cls')or not source.get('geometryWKB'):return None
  if 'level_rules'not in source or 'road_flags'not in source or 'sources'not in source:return None
  if source['level_rules']or source['road_flags']or road.get('expressway')or road.get('elevationSource')in['surveyed','explicit']or min(road.get('elev')or[0.])<-.001:return None
 routes=[{r['record_id']for r in source['sources']if r.get('property')=='/routes'and r.get('record_id')and r.get('dataset')=='OpenStreetMap'}for source in[first_source,second_source]]
 shared=routes[0]&routes[1]
 if not shared:return None
 return{'category':'same-source-ground-route-finite-carriageways','sourceRoads':[first_source['id'],second_source['id']],'sharedOSMRoutes':sorted(shared),'localTangentDot':tangent_dot,'sourceStructureAnnotationsAbsentOnBothCompleteRows':True}
category=collections.Counter();pairStats=[];actualPairs=0
for a,b in pairs:
 pts=overlap(a,b)
 if not pts:continue
 node_fragments=source_node_components(a,b,pts)
 continuation_fragments=source_continuation_components(a,b,pts)
 actualPairs+=1;pc=collections.Counter()
 for i,u,j,v,p in pts:
  sa=arcs[a][i]*(1-u)+arcs[a][i+1]*u;sb=arcs[b][j]*(1-v)+arcs[b][j+1]*v;la=level(a,sa);lb=level(b,sb)
  # An explicitly proved owned junction fragment has physical authority even
  # inside an otherwise unchanged recovery span. Applying historical recovery
  # preservation first would resurrect the obsolete gap at that exact join.
  local_patch=local_junction_fragment(a,i,b,j,p)
  if local_patch:
   couple(a,i,u,b,j,v,p,True);category['explicit-local-source-junction']+=1
   junctionWitnesses.append({'roads':[a,b],'segments':[i,j],'barycentricProgress':[u,v],'point':p,'proof':{key:value for key,value in local_patch.items()if key!='polygons'}});continue
  def active(road,position):
   if road in primaryVariableIds:return True
   return road in componentWindows['roads']and any(lo-80<=position<=hi+80 for lo,hi in componentWindows['roads'][road]['ranges'])
  if not args.prepare_component_closure and not active(a,sa)and not active(b,sb):
   category['untouched-component-context']+=1;pc['untouched-component-context']+=1;continue
  # Newly eligible recovery spans preserve existing surfaces. Only the proved
  # component itself acquires new physical co-elevation equations.
  physical_active=any(road in primaryVariableIds or road in componentWindows['roads']and any(lo-1e-6<=position<=hi+1e-6 for lo,hi in componentWindows['roads'][road]['ranges'])for road,position in[(a,sa),(b,sb)])
  if(i,j)in node_fragments and la==lb:
   proof=node_fragments[(i,j)];couple(a,i,u,b,j,v,p,True);category['source-node-finite-component']+=1
   junctionWitnesses.append({'roads':[a,b],'segments':[i,j],'barycentricProgress':[u,v],'point':p,'proof':proof});continue
  if(i,j)in continuation_fragments and la==lb==0:
   proof=continuation_fragments[(i,j)];couple(a,i,u,b,j,v,p,True);category['same-source-node-component-continuation']+=1
   junctionWitnesses.append({'roads':[a,b],'segments':[i,j],'barycentricProgress':[u,v],'point':p,'proof':proof});continue
  if in_ground(a,i,u,b,j,v):couple(a,i,u,b,j,v,p,True);category['attached-ground']+=1;pc['attached-ground']+=1;continue
  da=np.subtract(roads[a]['pts'][i+1],roads[a]['pts'][i]);db=np.subtract(roads[b]['pts'][j+1],roads[b]['pts'][j]);dot=abs(float(np.dot(da,db))/(np.linalg.norm(da)*np.linalg.norm(db)or 1))
  ground_carriageway=source_ground_carriageway_proof(roads[a],roads[b],rawBy.get(a.split('_')[0]),rawBy.get(b.split('_')[0]),dot)if la==lb==0 else None
  if ground_carriageway:
   couple(a,i,u,b,j,v,p,True);category['source-ground-route-carriageways']+=1;pc['source-ground-route-carriageways']+=1
   junctionWitnesses.append({'roads':[a,b],'segments':[i,j],'barycentricProgress':[u,v],'point':p,'proof':ground_carriageway});continue
  family=roads[a]['name']and str(roads[a]['name']).strip().lower()not in['flyover','bridge','road']and roads[a]['name']==roads[b]['name']and layers.get(a.split('_')[0])and layers.get(b.split('_')[0])
  if roads[a]['name']==familyEvidence['familyRule']['uniqueName']or roads[b]['name']==familyEvidence['familyRule']['uniqueName']:family=family and la==lb==familyEvidence['familyRule']['sourceRelativeLayer']
  family=family or(a.split('_')[0]in boundFamilyPrefixes and b.split('_')[0]in boundFamilyPrefixes and la==lb==familyEvidence['familyRule']['sourceRelativeLayer'])
  if family and ('de9d82ac-7f8'not in[a.split('_')[0],b.split('_')[0]]or la==lb==1)and dot>.94 and la==lb and la>0:
   couple(a,i,u,b,j,v,p,True);category['source-equal-corridor']+=1;pc['source-equal-corridor']+=1;continue
  oa=at(a,p);ob=at(b,p);oldCovered=oa is not None and ob is not None;ya=historical_reference_bounds(oa)[0]if oa else oldAtArc(a,sa);yb=historical_reference_bounds(ob)[0]if ob else oldAtArc(b,sb)
  if ya is None or yb is None:
   category['unresolved-historical-source-reference']+=1
   # A current height is only a classification fallback. It cannot produce an
   # accepted result while an exact historical source reference is unresolved.
   ya=ya if ya is not None else(roads[a]['elev']or[0]*len(roads[a]['pts']))[i]*(1-u)+(roads[a]['elev']or[0]*len(roads[a]['pts']))[i+1]*u
   yb=yb if yb is not None else(roads[b]['elev']or[0]*len(roads[b]['pts']))[j]*(1-v)+(roads[b]['elev']or[0]*len(roads[b]['pts']))[j+1]*v
  gap=historical_signed_gap(oa,ob)if oldCovered else ya-yb
  near_both_ends=min(sa,arcs[a][-1]-sa)<=max(width(roads[a],sa),width(roads[b],sb))+2 and min(sb,arcs[b][-1]-sb)<=max(width(roads[a],sa),width(roads[b],sb))+2
  if dot>.94 and(la!=lb or abs(gap)>.01)or near_both_ends and la==lb==0:
   junction = local_source_junction(a,i,u,b,j,v)
   if junction and(dot>.94 or near_both_ends and junction['sourcePathMeters']<=12 and junction['totalGraphMeters']<=25):
    couple(a,i,u,b,j,v,p,True);category['proved-short-source-apron']+=1;pc['proved-short-source-apron']+=1
    junctionWitnesses.append({'roads':[a,b],'segments':[i,j],'barycentricProgress':[u,v],'point':p,'tangentDot':dot,'oldCovered':oldCovered,'oldSignedGap':gap,'proof':junction})
    continue
  shared=set([roads[a]['from'],roads[a]['to']])&set([roads[b]['from'],roads[b]['to']]);shared.discard(None)
  common_endpoint_join=any((sa if roads[a]['from']==node else arcs[a][-1]-sa)<=2 and(sb if roads[b]['from']==node else arcs[b][-1]-sb)<=2 for node in shared)
  if shared and(la==lb==0 and abs(gap)<.25 or common_endpoint_join):
   couple(a,i,u,b,j,v,p,True);category['source-common-atgrade-node']+=1;pc['source-common-atgrade-node']+=1;continue
  # Recovery is a bound on independent surfaces. It cannot turn a proved
  # source junction into an overpass merely because that point is just beyond
  # an adjustable window. The same finite source proofs precede it in both
  # preparation and solving.
  if not args.prepare_component_closure and not physical_active:
   headroom=independent_headroom_order(oldCovered,gap,la,lb)
   if headroom:
    sign,H,kind=headroom;heads.append((a,i,u,b,j,v,H,p)if sign>0 else(b,j,v,a,i,u,H,p));category['recovery-'+kind]+=1;continue
   couple(a,i,u,b,j,v,p,False);category['recovery-input-surface']+=1;continue
  if flat(a)and flat(b)and a not in underpassIds and b not in underpassIds and oldCovered and abs(gap)<=.01 and la==lb:
   category['existing-unknown-nearlevel-contact']+=1;pc['existing-unknown-nearlevel-contact']+=1;continue
  headroom=independent_headroom_order(oldCovered,gap,la,lb)
  if headroom:
   # A newly exposed finite crossing receives full clearance. Surviving accepted corners retain min(old,5.85).
   sign,H,k=headroom
   if sign>0:heads.append((a,i,u,b,j,v,H,p))
   else:heads.append((b,j,v,a,i,u,H,p))
   category[k]+=1;pc[k]+=1;continue
  # Same source node or exact same source segment, local overlap with source ground data, is a real co-level junction.
  shared=set([roads[a]['from'],roads[a]['to']])&set([roads[b]['from'],roads[b]['to']]);shared.discard(None)
  if abs(gap)<.25 and(la==lb==0)and(shared or a.split('_')[0]==b.split('_')[0]):
   couple(a,i,u,b,j,v,p,False);category['source-local-junction']+=1;pc['source-local-junction']+=1;continue
  # Retain exact current shape for residual ordinary coplanar contacts; report positive ambiguous partial slabs explicitly.
  ca=(roads[a]['elev']or[0]*len(roads[a]['pts']))[i]*(1-u)+(roads[a]['elev']or[0]*len(roads[a]['pts']))[i+1]*u;cb=(roads[b]['elev']or[0]*len(roads[b]['pts']))[j]*(1-v)+(roads[b]['elev']or[0]*len(roads[b]['pts']))[j+1]*v
  if abs(ca-cb)<.03 and abs(gap)<.25:
   couple(a,i,u,b,j,v,p,False);category['existing-coplanar']+=1;pc['existing-coplanar']+=1
  else:
   category['unclassified']+=1;pc['unclassified']+=1
   if len(unclassified)<1000:unclassified.append({'pair':[a,b],'point':p,'levels':[la,lb],'oldGap':gap,'currentGap':ca-cb,'oldCovered':oldCovered})
 pairStats.append({'pair':[a,b],'counts':dict(pc)})
 print('',end='',flush=True)

ownFoldWindows=collections.defaultdict(list)
for road in varIds:
 e=roads[road];yy=e['elev']or[0.]*len(e['pts'])
 for fragment in owned_surface_intersections(road,e,qs[road],footprints[road],arcs[road],args.minimum_polygon_area):
  if not fragment['local']:
   remoteOwnIntersections.append(fragment);continue
  i,j=fragment['segments'];ai,bi=fragment['triangles'];polygon=fragment['polygon'];key=(road,road,i,j,ai,bi)
  register_fragments({key:fragment});ownSurfaceProofs[(road,road,i,j)]={'category':'literal-local-owned-surface','sourceRoad':road,'kind':fragment['proofCategory'],'maximumIntersectingArcSeparation':fragment['maximumIntersectingArcSeparation'],'localFullWidth':fragment['localFullWidth'],'remoteSourceLoopsExcluded':True}
  center=(sum(p[0]for p in polygon)/len(polygon),sum(p[1]for p in polygon)/len(polygon));maximum_gap=0.
  for point in[*polygon,center]:
   u=coeff(ai,bary([qs[road][i][k]for k in ai],point));v=coeff(bi,bary([qs[road][j][k]for k in bi],point))
   maximum_gap=max(maximum_gap,abs(yy[i]*(1-u)+yy[i+1]*u-yy[j]*(1-v)-yy[j+1]*v));couple(road,i,u,road,j,v,point,True);category['local-owned-surface']+=1
  if maximum_gap>args.same_layer_tolerance:
   ownFoldWindows[road].append([arcs[road][i],arcs[road][j+1]])
if args.additional_source_reference:
 for witness in junctionWitnesses:
  for road in witness['proof'].get('path',[]):
   prefix=road.rsplit('_',1)[0]
   if prefix not in layers:sourceMetadataMissing.add(prefix)
sourceMetadataCoverage={'complete':bool(args.additional_source_reference)and not sourceMetadataMissing,'retainedPrefixes':len(layers),'unresolvedPrefixes':sorted(sourceMetadataMissing),'sourceReferenceSHA256':initialInputSHA.get('additional_source_reference'),'policy':'A missing record is distinct from a retained record with no level rule; unknown metadata cannot approve a physical crossing or source-path apron.'}
print(json.dumps({'phase':'constraints-ready','variables':N,'roads':len(varIds),'broadPairs':len(pairs),'finitePairs':actualPairs,'components':len(components),'categories':category,'sourceMetadataCoverage':sourceMetadataCoverage,'seconds':time.monotonic()-T}),flush=True)
save_overlap_cache()
if args.additional_source_reference and sourceMetadataMissing and not args.prepare_component_closure:
 args.output.parent.mkdir(parents=True,exist_ok=True)
 args.output.write_text(json.dumps({'success':False,'sourceModelSHA256':initialInputSHA['model'],'sourceMetadataCoverage':sourceMetadataCoverage,'message':'Complete the exact retained source records before fitting heights; omitted metadata is not ground level.','provenance':{'inputs':initialInputSHA,'solverSHA256':solverSHAAtStart}},separators=(',',':'))+'\n')
 print(json.dumps({'phase':'source-metadata-incomplete','output':str(args.output),'unresolvedPrefixes':sorted(sourceMetadataMissing),'heightSolveStarted':False}),flush=True)
 raise SystemExit(2)
# Pure physical-graph preparation stops before fitting or releasing any heights.
def physical_window_closure(physical_couplings,current_windows,primary,growable,road_arcs,tolerance,padding=2.):
    records={road:{**record,'ranges':[list(span)for span in record['ranges']]}for road,record in current_windows.items()}
    parent=[];rank=[];vertices={};positions=collections.defaultdict(list);seeds=set()
    def vertex(road,position):
        key=(road,float(position))
        if key not in vertices:
            index=len(parent);vertices[key]=index;parent.append(index);rank.append(0);positions[road].append((position,index))
        return vertices[key]
    def find(index):
        while parent[index]!=index:
            parent[index]=parent[parent[index]];index=parent[index]
        return index
    def union(first,second):
        first=find(first);second=find(second)
        if first==second:return
        if rank[first]<rank[second]:first,second=second,first
        parent[second]=first
        if rank[first]==rank[second]:rank[first]+=1
    def anchored(road,position):
        return road in primary or any(lo-1e-6<=position<=hi+1e-6 for lo,hi in current_windows.get(road,{}).get('ranges',[]))
    edges=0
    for a,i,u,b,j,v,p,offset,cap in physical_couplings:
        if offset!=0 or cap!=tolerance:continue
        sa=road_arcs[a][i]*(1-u)+road_arcs[a][i+1]*u;sb=road_arcs[b][j]*(1-v)+road_arcs[b][j+1]*v
        # A point paired only with an unauthorized, non-growing protected
        # position is inert: merely passing it along this road cannot expand
        # this road's window. A growing counterpart can activate and return
        # the same literal edge; an already authorized fixed counterpart can
        # seed it directly.
        av=vertex(a,sa)if a in growable and(b in growable or anchored(b,sb))else None
        bv=vertex(b,sb)if b in growable and(a in growable or anchored(a,sa))else None
        if av is not None and(anchored(a,sa)or anchored(b,sb)):seeds.add(av)
        if bv is not None and(anchored(a,sa)or anchored(b,sb)):seeds.add(bv)
        if av is not None and bv is not None:union(av,bv);edges+=1
    for road,points in positions.items():
        points.sort()
        for (first,a),(second,b)in zip(points,points[1:]):
            if second-first<=padding+1e-6:union(a,b)
    reached={find(index)for index in seeds};activated=0
    for(road,position),index in vertices.items():
        if find(index)not in reached:continue
        record=records.setdefault(road,{'ranges':[],'reason':'Unprotected source road participates in the least fixed point of the same literal physical apron couplings; no new source or height authority.'})
        record['ranges'].append([max(0.,position-padding),min(road_arcs[road][-1],position+padding)]);activated+=1
    for record in records.values():
        merged=[]
        for lo,hi in sorted(record['ranges']):
            if merged and lo<=merged[-1][1]+1e-6:merged[-1][1]=max(merged[-1][1],hi)
            else:merged.append([lo,hi])
        record['ranges']=merged
    return records,{'vertices':len(vertices),'physicalEdges':edges,'seedVertices':len(seeds),'activatedVertices':activated,'paddingMetres':padding,'protectedIntervalsDoNotPropagate':True}

if args.prepare_component_closure:
    growable={road for road,e in roads.items()if road not in primaryVariableIds and road not in protected and road not in underpassIds and road not in tileIds and road not in fixedTileIds and not e.get('expressway')and min(e['elev']or[0])>=-.001 and max(map(abs,e['elev']or[0]))>=1e-9}
    closed,closure_summary=physical_window_closure(couplings,componentWindows['roads'],primaryVariableIds,growable,arcs,args.same_layer_tolerance)
    assert hashlib.sha256(Path(__file__).read_bytes()).hexdigest()==solverSHAAtStart,'Solver implementation changed during closure preparation'
    assert all(hashlib.sha256(Path(getattr(args,key)).read_bytes()).hexdigest()==digest for key,digest in initialInputSHA.items()),'Solver input changed during closure preparation'
    window_path=args.output.with_suffix('.components.json')
    payload={'sourceModelSHA256':componentWindows['sourceModelSHA256'],'iteration':0,'primaryRoads':sorted(primaryVariableIds),'roads':closed,'sourceMetadataCoverage':sourceMetadataCoverage,'coreContextCoverage':coreContextCoverage,'fixedPointPreparation':{'inputs':initialInputSHA,'solverSHA256':solverSHAAtStart,'sameLayerTolerance':args.same_layer_tolerance,**closure_summary}}
    window_path.write_text(json.dumps(payload,separators=(',',':'))+'\n')
    print(json.dumps({'phase':'least-fixed-point-components-ready','path':str(window_path),'sha256':hashlib.sha256(window_path.read_bytes()).hexdigest(),'roads':len(closed),'newRoads':sorted(set(closed)-set(componentWindows['roads'])),**closure_summary}),flush=True)
    raise SystemExit(0)


# Protect the actual finite railway corridor. A long diagonal segment's AABB
# alone is not evidence that a road a kilometre away overlaps that railway.
def point_segment_distance(p,a,b):
 d=np.subtract(b,a);u=float(np.clip(np.dot(np.subtract(p,a),d)/(np.dot(d,d)or 1.),0,1));return math.dist(p,np.array(a)+u*d)
def railway_quad_distance(a,b,q):
 for triangle in[(q[0],q[1],q[2]),(q[0],q[2],q[3])]:
  if bary(triangle,a)or bary(triangle,b):return 0.
 for p,r in zip(q,q[1:]+q[:1]):
  ab1=cross(a,b,p);ab2=cross(a,b,r);pr1=cross(p,r,a);pr2=cross(p,r,b)
  if ab1*ab2<=0 and pr1*pr2<=0 and max(min(a[0],b[0]),min(p[0],r[0]))<=min(max(a[0],b[0]),max(p[0],r[0]))+1e-9 and max(min(a[1],b[1]),min(p[1],r[1]))<=min(max(a[1],b[1]),max(p[1],r[1]))+1e-9:return 0.
 return min([point_segment_distance(p,a,b)for p in q]+[point_segment_distance(p,c,d)for p in[a,b]for c,d in zip(q,q[1:]+q[:1])])

def declared_bridge_at_control(road,index):
 if road not in officialFractionAtControls:return False
 fraction=float(officialFractionAtControls[road][index]);source=rawBy.get(road.rsplit('_',1)[0],{})
 return level(road,arcs[road][index])>0 and any('is_bridge'in rule['values']and(not rule.get('between')or rule['between'][0]-1e-6<=fraction<=rule['between'][1]+1e-6)for rule in source.get('road_flags')or[])

def positive_placeholder_height(road,index,hit_rails):
 policy=globals().get('positiveFacilityPolicy')
 if not policy:return None
 bridge=policy['positiveBridge'];owner=policy['connectedBridgeOwner']
 if road not in[bridge['road'],owner['road']]:return None
 edge=roads[road];height=(edge['elev']or[0.]*len(edge['pts']))[index]
 if abs(height)>1e-9:return None
 assert edge.get('elevationSource')not in['surveyed','explicit']and not edge.get('expressway')and road not in underpassIds
 if road==bridge['road']and set(hit_rails)&set(bridge['canonicalRailIDs'])and declared_bridge_at_control(road,index):
  assert rawBy[road.rsplit('_',1)[0]]==bridge['retainedSource'],'Positive bridge retained source changed'
  return policy['roadOverRail']
 if road==owner['road']and set(hit_rails)&set(owner['canonicalRailIDs']):
  node=owner['node'];record=jointNodeRecords[node]
  assert record['sourceConnectionVerifiedForEveryArm']and record['fullConnectorAliases']==owner['fullConnectorAliases']
  distance=arcs[road][index]if edge['from']==node else arcs[road][-1]-arcs[road][index]
  if distance>owner['maximumModelArcFromNode']:return None
  for canonical in owner['canonicalCoreArms']:
   ce=roads[canonical];end=0 if ce['from']==node else len(ce['pts'])-1
   assert declared_bridge_at_control(canonical,end)and abs((ce['elev']or[0.]*len(ce['pts']))[end]-policy['roadOverRail'])<1e-9
  return policy['roadOverRail']
 return None
# Rail-adjacent controls remain frozen to canonical post-conditioning heights.
railFrozen=0;canonicalRailControls=set();positiveRailInheritance={}
for i in varIds:
 e=roads[i];eb=bbox(e);nearRails=[r for r in rails if near(e,r)]
 if not nearRails:continue
 for j,q in enumerate(qs[i]):
  qb=(min(p[0]for p in q)-4.2,max(p[0]for p in q)+4.2,min(p[1]for p in q)-4.2,max(p[1]for p in q)+4.2)
  hit_rails={r['id']for r in nearRails for a,b in zip(r['pts'],r['pts'][1:])if min(a[0],b[0])<=qb[1]and max(a[0],b[0])>=qb[0]and min(a[1],b[1])<=qb[3]and max(a[1],b[1])>=qb[2]and railway_quad_distance(a,b,q)<=4.2}
  hit=bool(hit_rails)
  if hit:
   for n in[j,j+1]:
    h=(e['elev']or[0]*len(e['pts']))[n]
    inherited=positive_placeholder_height(i,n,hit_rails)
    if inherited is not None:
     assert all(not r['bridge']and max(map(abs,r['elev']or[0]))<1e-9 for r in nearRails if r['id']in hit_rails),'Positive bridge inheritance has unresolved rail order'
     positiveRailInheritance[(i,n)]={'road':i,'control':n,'inputHeight':h,'canonicalRoadHeight':inherited,'canonicalRailIDs':sorted(hit_rails),'sourcePolicySHA256':initialInputSHA['positive_facility_policy']}
     bounds[O[i]+n]=(inherited,inherited);canonicalRailControls.add(O[i]+n);railFrozen+=1;continue
    # A source-connected continuation of an already verified underpass may
    # move DOWN from its inherited zero sheet when every nearby canonical
    # rail sheet is above it. This increases rail separation; it never moves
    # a rail or permits a new raised street through the railway.
    if joint and i in jointNegativeTileIds and all(min(r['elev']or[0])>=h for r in nearRails):continue
    bounds[O[i]+n]=(h,h);canonicalRailControls.add(O[i]+n);railFrozen+=1

problem={k:globals()[k]for k in ['components','arcs','O','roads','bounds','couplings','junctionWitnesses']}
model=stage
sourceProtectedIds=set(protected)
protected.update(tileIds)
protected.update(underpassIds)
windows = {}
for component in problem['components']:
    for member in component['members']:
        road_id = member['id']
        length = problem['arcs'][road_id][-1]
        run = min(args.apron_window, max(0., component['groundRun'] - member['start']))
        if run > 0:
            span = (length - run, length) if member['reverse'] else (0., run)
            windows.setdefault(road_id, []).append((span, component['node']))
# The independently traced short Shaikpet connector has both ends inside the local junction.
for witness in problem.get('junctionWitnesses', []):
    for road_id in witness['proof'].get('path', []):
        if road_id in problem['O']:
            length = problem['arcs'][road_id][-1]
            windows.setdefault(road_id, []).extend([((0., min(args.apron_window, length)), witness['proof']['nodes'][0]), ((max(0., length-args.apron_window), length), witness['proof']['nodes'][-1])])
# A split of the same immutable source segment shares the real pavement at its source node.
seen_source_joins = set()
for a, i, u, b, j, v, point, offset, tolerance in problem['couplings']:
    if offset or tolerance != args.same_layer_tolerance:
        continue
    if a==b:continue
    common = {problem['roads'][a]['from'], problem['roads'][a]['to']} & {problem['roads'][b]['from'], problem['roads'][b]['to']}
    for node in common - {None}:
        for road_id in (a,b):
            key = (road_id,node)
            if key in seen_source_joins:
                continue
            seen_source_joins.add(key)
            road = problem['roads'][road_id]
            length = problem['arcs'][road_id][-1]
            span = (0.,min(args.apron_window,length)) if road['from']==node else (max(0.,length-args.apron_window),length)
            windows.setdefault(road_id,[]).append((span,node))
changes = []
for road_id, spans in windows.items():
    if road_id not in problem['O'] or road_id in protected:
        continue
    road = problem['roads'][road_id]
    if road.get('expressway') or min(road['elev'] or [0]) < -.001:
        continue
    heights = road['elev'] or [0.] * len(road['pts'])
    for index, distance in enumerate(problem['arcs'][road_id]):
        # All actual source-node datums remain identical on every incident road.
        if index in (0, len(heights)-1):
            continue
        if not any(a-1e-6 <= distance <= b+1e-6 for (a,b), node in spans):
            continue
        column = problem['O'][road_id] + index
        if column in canonicalRailControls:continue
        old_bounds = problem['bounds'][column]
        if abs(old_bounds[0] - old_bounds[1]) > 1e-10:
            continue
        height = heights[index]
        exception=next((rule for rule in apronPolicy.get('localHeightExceptions',[])if rule['id']==road_id),None)
        budget=exception['maximumCorrection']if exception else args.apron_height_adjustment
        ceiling=max(heights)
        new_bounds = (max(0., height-budget), min(ceiling,height+budget))
        problem['bounds'][column] = new_bounds
        changes.append({'road': road_id, 'control': index, 'modelDistance': distance, 'inputHeight': height, 'bounds': new_bounds, 'budget':budget,'authority': 'Generated historical street/apron profile; no surveyed-height authority', 'nodes': sorted({node for span,node in spans})})

# Coherent moved source-node families have real incident aprons. The policy
# permits only small generated-height smoothing, never endpoint motion in Y.
for road_id in varIds:
    road=roads[road_id]
    if road_id in tileIds or road_id in protected or road.get('expressway')or min(road['elev']or[0])<-.001:continue
    for node,k in [(road['from'],0),(road['to'],-1)]:
        if node not in stage.get('endpointDisplacements',{}):continue
        for j,distance in enumerate(arcs[road_id]):
            away=distance if k==0 else arcs[road_id][-1]-distance
            if j in [0,len(road['pts'])-1]or away>args.apron_window:continue
            column=O[road_id]+j;lo,hi=bounds[column]
            if column in canonicalRailControls:continue
            if lo!=hi:continue
            h=(road['elev']or[0.]*len(road['pts']))[j];bounds[column]=(max(0.,h-args.apron_height_adjustment),min(max(road['elev']or[0.]),h+args.apron_height_adjustment))
            changes.append({'road':road_id,'control':j,'inputHeight':h,'bounds':bounds[column],'node':node,'authority':'Generated incident source-node apron; endpoint datum fixed','modelDistanceFromNode':away})



for road in varIds:
    e=roads[road]
    for node,index in[(e['from'],0),(e['to'],len(e['pts'])-1)]:
        if node in nodeTargets and road not in globals().get('jointTileIds',set()):
            target=nodeTargets[node]['target'];column=O[road]+index;input_height=(e['elev']or[0.]*len(e['pts']))[index]
            if abs(target-input_height)>1e-10 and(column in canonicalRailControls or road in protected or road in underpassIds or e.get('expressway')or min(e['elev']or[0])<-.001):raise ValueError('Estimated node policy would undo a canonical/protected freeze:'+road+':'+node)
            bounds[column]=(target,target)

# Explicit shared-node policies allow local redistribution, rather than forcing
# every interior control to move only downward when an endpoint is lowered.
for road in varIds:
 e=roads[road];yy=e['elev']or[0.]*len(e['pts'])
 if road in protected or road in underpassIds or e.get('expressway')or min(yy)<-.001:continue
 for node,k in[(e['from'],0),(e['to'],len(yy)-1)]:
  if node not in nodeTargets:continue
  for j,distance in enumerate(arcs[road]):
   away=distance if k==0 else arcs[road][-1]-distance;column=O[road]+j
   if j in(0,len(yy)-1)or away>args.apron_window or column in canonicalRailControls:continue
   lo,hi=bounds[column]
   if lo==0. and hi==40.:continue
   bounds[column]=(min(lo,max(0.,yy[j]-args.apron_height_adjustment)),min(max(yy),max(hi,yy[j]+args.apron_height_adjustment)))
   changes.append({'road':road,'control':j,'inputHeight':yy[j],'bounds':bounds[column],'node':node,'authority':'Explicit generated-node reconciliation: bounded interior redistribution inside existing street envelope'})

variableNodeRows=[]
for component in variableNodeComponents:
 node_set=set(component['nodes']);low,high=component['nodeHeightBounds']
 for road in varIds:
  e=roads[road];yy=e['elev']or[0.]*len(e['pts'])
  if not node_set&{e['from'],e['to']}:continue
  # These budgets reconcile existing generated CORE profiles. A newly
  # introduced detailed approach has no inherited version of that profile;
  # it acquires the same node variable through the joint all-arm equations.
  if road in jointTileIds:continue
  if road in protected or road in underpassIds or e.get('expressway')or min(yy)<-.001:raise ValueError('Generated-node policy hits protected authority:'+road)
  for node,k in[(e['from'],0),(e['to'],len(yy)-1)]:
   if node not in node_set:continue
   column=O[road]+k
   if column in canonicalRailControls:raise ValueError('Generated-node policy hits actual rail corridor:'+road)
   bounds[column]=(low,min(high,yy[k])if component.get('nodeLoweringOnly')else high);variableNodeRows.append((node,column,road,k))
   for j,distance in enumerate(arcs[road]):
    away=distance if k==0 else arcs[road][-1]-distance;column2=O[road]+j
    if j in(0,len(yy)-1)or away>component['recoveryMeters']or column2 in canonicalRailControls:continue
    if component.get('maximumInteriorCorrection')is not None:
     prior_low,prior_high=bounds[column2];budget=component['maximumInteriorCorrection']
     bounds[column2]=(min(prior_low,max(0.,yy[j]-budget)),max(prior_high,min(max(yy),yy[j]+budget)))
    elif component.get('maximumInteriorLowering')is not None:
     prior_low,prior_high=bounds[column2];budget=component['maximumInteriorLowering']
     bounds[column2]=(min(prior_low,max(0.,yy[j]-budget)),min(prior_high,yy[j])if component.get('controlLoweringOnly')else prior_high)
    else:bounds[column2]=(0.,yy[j]if component.get('controlLoweringOnly')else max(max(yy),high))
    changes.append({'road':road,'control':j,'inputHeight':yy[j],'bounds':bounds[column2],'node':node,'authority':component['reason'],'recoveryMetres':component['recoveryMeters']})

for component in apronPolicy.get('profileLoweringComponents',[]):
 for road in component['roads']:
  if road not in O:raise ValueError('Authorized profile component is not eligible:'+road)
  e=roads[road];yy=e['elev']or[0.]*len(e['pts'])
  if road in protected or road in underpassIds or e.get('expressway')or min(yy)<-.001:raise ValueError('Lowering component hits protected authority:'+road)
  assert component['node']in[e['from'],e['to']]
  assert abs(arcs[road][-1]-component['modelLengths'][road])<1e-6,'Source-bound lowering component geometry changed'
  for j,h in enumerate(yy):
   column=O[road]+j
   if column in canonicalRailControls:continue
   if j in(0,len(yy)-1):
    lo,hi=bounds[column];bounds[column]=(lo,min(hi,h));continue
   local_node_redistribution=component.get('allowLocalNodeRedistribution',True)and any(node in group['nodes']and( arcs[road][j]if e['from']==node else arcs[road][-1]-arcs[road][j])<=args.apron_window for group in variableNodeComponents for node in[e['from'],e['to']])
   # The whole-arm lowering policy must not overwrite its separately approved
   # local junction redistribution. Keep the middle lowering-only and retain
   # the original small, peak-capped freedom next to the shared node.
   ceiling=min(max(yy),h+args.apron_height_adjustment)if local_node_redistribution else h
   bounds[column]=(0.,ceiling)
   changes.append({'road':road,'control':j,'inputHeight':h,'bounds':bounds[column],'authority':component['sourceProof'],'component':component['id'],'retainedLocalNodeRedistribution':local_node_redistribution})

# Sub-three-millimetre numerical redistribution on two already modeled bends.
# This does not change source capacity, XY, node heights or any rail authority.
for road_id,centre in [('aa6cd6f8-d6d_0',43),('c8486d6e-ac1_0',38)]:
    if road_id not in O or road_id in protected or road_id in underpassIds:continue
    e=roads[road_id];yy=e['elev']or[0.]*len(e['pts'])
    for index,distance in enumerate(arcs[road_id]):
        if index in(0,len(yy)-1)or abs(distance-arcs[road_id][centre])>10:continue
        column=O[road_id]+index;lo,hi=bounds[column]
        if column in canonicalRailControls:continue
        if lo==hi:
            bounds[column]=(max(0.,yy[index]-.004),yy[index]+.004)
            changes.append({'road':road_id,'control':index,'inputHeight':yy[index],'bounds':bounds[column],'authority':'Generated unsurveyed bend: routine4mm local redistribution to retain actual triangle grade below10%; source/protected controls unchanged','maximumWindowMetres':20})

for rule in apronPolicy.get('numericInteriorCorrections',[]):
 road=rule['id'];e=roads[road];yy=e['elev']or[0.]*len(e['pts'])
 assert road in O and road not in protected and road not in underpassIds and not e.get('expressway')and min(yy)>=-.001,'Numerical correction would overwrite protected authority:'+road
 assert 0<rule['maximumCorrection']<=.001
 for index,expected in zip(rule['controlIndices'],rule['inputHeights']):
  assert 0<index<len(yy)-1 and abs(yy[index]-expected)<1e-12,'Numerical interior correction input changed:'+road
  column=O[road]+index
  assert column not in canonicalRailControls,'Numerical correction hits canonical rail control:'+road
  lo,hi=bounds[column];budget=rule['maximumCorrection'];bounds[column]=(min(lo,max(0.,yy[index]-budget)),min(max(yy),max(hi,yy[index]+budget)))
  changes.append({'road':road,'control':index,'inputHeight':yy[index],'bounds':bounds[column],'authority':rule['reason'],'maximumCorrection':budget})

ownFoldRecovery=math.sqrt(6*args.apron_height_adjustment/args.grade_change_per_metre)
for road,spans in ownFoldWindows.items():
 e=roads[road];yy=e['elev']or[0.]*len(e['pts'])
 if road in protected or road in underpassIds or e.get('expressway')or min(yy)<-.001:continue
 for index,position in enumerate(arcs[road]):
  column=O[road]+index
  if index in(0,len(yy)-1)or column in canonicalRailControls:continue
  if not any(lo-ownFoldRecovery<=position<=hi+ownFoldRecovery for lo,hi in spans):continue
  low,high=bounds[column]
  if low==0. and high==40.:continue
  bounds[column]=(min(low,max(0.,yy[index]-args.apron_height_adjustment)),max(high,min(max(yy),yy[index]+args.apron_height_adjustment)))
  changes.append({'road':road,'control':index,'inputHeight':yy[index],'bounds':bounds[column],'authority':'Root-authorized <=15cm interior repair of literal local owned-surface folds, existing peak/endpoints/protected authority retained','foldModelArcWindows':spans,'C1RecoveryMetres':ownFoldRecovery})

# These two generated approaches have independent source/rail classification
# and a quantified curvature contradiction under the global comfort parameter.
# Only their explicitly listed generated controls may redistribute within the
# existing facility envelope. Canonical controls, floor and endpoints stay exact.
for road,policy in generatedFacilityPolicies.items():
 e=roads[road];yy=e['elev']or[0.]*len(e['pts'])
 assert road in O and road in underpassIds and e.get('elevationSource')not in['surveyed','explicit']and not e.get('expressway')
 assert allSourceLegacy[road]['elev']is None and len(yy)==policy['inputControlCount']and yy==policy['inputHeights'],'Generated facility expected profile changed:'+road
 protected_indices=set(policy['protectedControlIndices']);generated_indices=set(policy['generatedControlIndices'])
 assert protected_indices|generated_indices==set(range(len(yy)))and not protected_indices&generated_indices
 actual_protected={0,len(yy)-1}|{k for k in range(len(yy))if O[road]+k in canonicalRailControls or abs(yy[k]-min(yy))<1e-9}
 assert protected_indices==actual_protected and len(protected_indices)==10,'Canonical facility control inventory changed:'+road
 assert policy['existingHeightEnvelope']==[min(yy),max(yy)]and args.grade_change_per_metre<=policy['maximumGradeChangePerMetre']<=.015
 for index in sorted(generated_indices):
  column=O[road]+index;assert column not in canonicalRailControls
  bounds[column]=tuple(policy['existingHeightEnvelope'])
  changes.append({'road':road,'control':index,'inputHeight':yy[index],'bounds':bounds[column],'authority':'Independently classified generated recovery within an existing verified facility; protected10/floor/endpoints exact','sourcePolicySHA256':initialInputSHA['generated_facility_policy']})

for rule in apronPolicy.get('loweringOnlyRoads',[]):
 road=rule['id'];assert road in O
 for index,height in enumerate(roads[road]['elev']or[0.]*len(roads[road]['pts'])):
  column=O[road]+index;lo,hi=bounds[column]
  assert lo<=height+1e-10,'No-rise source policy contradicts a protected lower bound:'+road
  bounds[column]=(lo,min(hi,height))
  if hi>height:changes.append({'road':road,'control':index,'inputHeight':height,'bounds':bounds[column],'authority':rule['reason']})

jointNodeCouplings=[];jointEligibility=[]
if joint:
 assert jointPolicy['inputs']['sourceGeometry']['sha256']==initialInputSHA['source_geometry'],'Joint approach policy/source geometry mismatch'
 pjr_windows={r['id']:r for r in jointPolicy['generatedCoreApproachWindows']}
 pjr_bridges={r['id']:r for r in jointPolicy['sourceControlledBridgeRoads']}
 for road,record in pjr_windows.items():
  assert record['from']==roads[road]['from']and record['to']==roads[road]['to']and abs(record['modelArcWindow'][1]-arcs[road][-1])<1e-6,'Joint source-bound approach geometry changed:'+road
 for road,record in pjr_bridges.items():
  assert record['from']==roads[road]['from']and record['to']==roads[road]['to']and len(record['modelArc'])==len(arcs[road])and max(abs(a-b)for a,b in zip(record['modelArc'],arcs[road]))<1e-6,'Joint bridge geometry changed:'+road
  assert rawBy[road.split('_')[0]]['id']==record['sourceSegmentID']and layers[road.split('_')[0]]==record['sourceLevelRules'],'Joint bridge local source-order authority changed:'+road
 for road in sorted(jointTileIds):
  e=roads[road];yy=e['elev']or[0.]*len(e['pts']);low,high=jointTileHeightEnvelopes[road]
  assert e.get('joinedPavement'),'Detailed height variables require an explicit pre-height physical corridor:'+road
  if road in sourceProtectedIds or road in underpassIds or min(yy)<-.001 and road not in jointNegativeTileIds or e.get('elevationSource')in['surveyed','explicit']or e.get('expressway'):continue
  for index,h in enumerate(yy):
   column=O[road]+index
   if column in canonicalRailControls:continue
   if h<-.001 and index not in[0,len(yy)-1]:continue
   ceiling=min(max(high,h),h)if any(rule['id']==road for rule in apronPolicy.get('loweringOnlyRoads',[]))else max(high,h)
   bounds[column]=(min(low,h),ceiling)
  jointEligibility.append({'road':road,'kind':'selected-detailed-street','heightEnvelope':[low,high],'verifiedNegativeCoreFacilities':jointTileFacilityAuthority[road],'widthPolicy':'Exact pre-height runtime ribbon preserved by explicit offline metadata','structureAuthority':'Existing verified connected underpass approach'if road in jointNegativeTileIds else'Ground-connected generated approach; positive targets require explicit terrain/structure and full-world acceptance, never an automatic bridge declaration'})
 proved_component_core_ids=set(componentWindows['roads'])&{r['id']for r in stage['roads']}
 for road in sorted(jointCoreIds|proved_component_core_ids|set(pjr_windows)|set(pjr_bridges)):
  e=roads[road];yy=e['elev']or[0.]*len(e['pts']);is_pjr=road in pjr_windows or road in pjr_bridges
  if e.get('elevationSource')in['surveyed','explicit']or e.get('expressway')or road in underpassIds or min(yy)<-.001:continue
  # The general closure lowers unannotated generated approaches only. The
  # separately bound PJR policy also releases relative-layer metre SEEDS;
  # all actual independent source-ordered headroom equations remain hard.
  if road in protected and not is_pjr:continue
  if layers.get(road.split('_')[0])and not is_pjr:continue
  nodes={node for node in[e['from'],e['to']]if node in jointNodeRecords}
  for index,distance in enumerate(arcs[road]):
   column=O[road]+index
   if column in canonicalRailControls:continue
   if index in[0,len(yy)-1]and(e['from']if index==0 else e['to'])in nodeTargets:continue
   source_component=componentWindows['roads'].get(road,{}).get('ranges',[])
   if not is_pjr and not(any((distance if e['from']==node else arcs[road][-1]-distance)<=80. for node in nodes)or any(lo-80.<=distance<=hi+80. for lo,hi in source_component)):continue
   if index in[0,len(yy)-1]and(e['from']if index==0 else e['to'])not in jointNodeRecords:continue
   lo,hi=bounds[column];bounds[column]=(min(lo,0.),min(hi,yy[index]))
   changes.append({'road':road,'control':index,'inputHeight':yy[index],'bounds':bounds[column],'authority':'Source-proved joint all-arm generated-approach lowering; no surveyed or absolute-layer altitude','jointNodeScope':sorted(nodes),'PJRRelativeSeedPolicy':is_pjr,'recoveryMetres':None if is_pjr else 80.})
  jointEligibility.append({'road':road,'kind':'source-bound-PJR-component'if is_pjr else'generated-unannotated-core-approach','policy':'Lowering only inside existing estimated envelope; canonical/surveyed/negative/source-ordered independent crossing authority retained','nodes':sorted(nodes),'componentRanges':componentWindows['roads'].get(road,{}).get('ranges',[])})
 for node,record in jointNodeRecords.items():
  entries=[(road,0 if e['from']==node else len(e['pts'])-1)for road,e in roads.items()if node in[e['from'],e['to']]]
  expected={arm['id']for arm in record['coreArms']+record['tileArms']}
  assert {road for road,index in entries}==expected,'Incomplete all-arm joint height equality:'+node
  if len(entries)>1:
   for entry in entries[1:]:jointNodeCouplings.append((node,entries[0],entry))

# Explicit positive-facility recovery may reconcile generated approach nodes;
# it never releases an unrelated near-rail road or a canonical rail control.
for road,policy in positiveFacilityRoads.items():
 e=roads[road];yy=e['elev']or[0.]*len(e['pts'])
 assert road in O and yy==policy['inputHeights']and len(yy)==policy['inputControlCount']
 assert e.get('elevationSource')not in['surveyed','explicit']and not e.get('expressway')and road not in underpassIds and min(yy)>=-.001
 for index,distance in enumerate(arcs[road]):
  column=O[road]+index
  if column in canonicalRailControls:continue
  endpoint_node=e['from']if index==0 else e['to']if index==len(yy)-1 else None
  in_scope=any(lo-1e-8<=distance<=hi+1e-8 for lo,hi in policy['modelArcWindows'])and(endpoint_node is None or endpoint_node in positiveFacilityNodes)
  if in_scope:
   bounds[column]=(0.,max(yy[index],policy['maximumHeight']))
   changes.append({'road':road,'control':index,'inputHeight':yy[index],'bounds':bounds[column],'authority':'Exact source-positive road-over-rail facility, complete source-node owner closure and minimum graded recovery; not a surveyed altitude','sourcePolicySHA256':initialInputSHA['positive_facility_policy']})
  elif road in jointTileIds:bounds[column]=(yy[index],yy[index])

def reconciled_node_bounds(prior,requested,canonical):
 if canonical:
  assert prior[0]==prior[1]and requested[0]-1e-9<=prior[0]<=requested[1]+1e-9,'Canonical node datum lies outside the source-bound local envelope'
  return prior
 return tuple(requested)

# A zero in an unsurveyed generated profile is not a physical datum when all
# complete source arms prove the same junction at a different estimated Y.
# Apply this explicit policy after general lowering, so it can reconcile both
# sides of the seam. Canonical controls and separately fixed nodes stay hard.
lateCanonicalNodeAnchors=[]
for component in lateNodeComponents:
 node=component['node'];low,high=component['nodeHeightBounds']
 assert node not in nodeTargets and not any(node in c['nodes']for c in variableNodeComponents),'Overlapping node-height authority'
 for arm in component['arms']:
  road=arm['id'];e=roads[road];yy=e['elev']or[0.]*len(e['pts']);index=0 if arm['end']=='from'else len(yy)-1
  if arm['fixedSourceContext']:
   assert bounds[O[road]+index] == (yy[index],yy[index]) if road in O else road in fixedTileIds
   continue
  assert road in O and road not in sourceProtectedIds and road not in underpassIds and road not in fixedTileIds and not e.get('expressway')and e.get('elevationSource')not in['surveyed','explicit']and min(yy)>=-.001,'Generated-node policy would release protected authority:'+road
  column=O[road]+index;canonical=column in canonicalRailControls
  bounds[column]=reconciled_node_bounds(bounds[column],(low,high),canonical)
  if canonical:lateCanonicalNodeAnchors.append({'node':node,'road':road,'control':index,'fixedHeight':bounds[column][0]})
  variableNodeRows.append((node,column,road,index))
  for k,distance in enumerate(arcs[road]):
   away=distance if index==0 else arcs[road][-1]-distance;col=O[road]+k
   if k in[0,len(yy)-1]or away>component['recoveryMeters']or col in canonicalRailControls:continue
   lo,hi=bounds[col];bounds[col]=(min(lo,0.),max(hi,min(max(yy),high))if road in jointTileIds else max(hi,max(max(yy),high)))
   changes.append({'road':road,'control':k,'inputHeight':yy[k],'bounds':bounds[col],'node':node,'authority':component['reason'],'recoveryMetres':component['recoveryMeters'],'sourcePolicySHA256':initialInputSHA['generated_node_datum_policy']})
# Local datum redistribution cannot override an existing explicit no-rise rule.
for rule in apronPolicy.get('loweringOnlyRoads',[]):
 road=rule['id']
 for index,height in enumerate(roads[road]['elev']or[0.]*len(roads[road]['pts'])):
  column=O[road]+index;lo,hi=bounds[column];bounds[column]=(lo,min(hi,height))

# The same point-level propagation rule previously needed a complete city
# rebuild for each two-metre advance along an already proved apron. Compute
# its least fixed point on the immutable physical-coupling graph instead.
# Protected roads can seed only their already authorized positions; they never
# acquire growing windows or become a bridge across an unauthorized interval.

# Every unprotected participant is considered. Added bridge controls are local;
# unknown zero street profiles stay fixed instead of acquiring unsupported humps.
next_windows={road:{**record,'ranges':[list(span)for span in record['ranges']]}for road,record in componentWindows['roads'].items()}
for a,i,u,b,j,v,p,offset,tolerance in couplings:
    if offset!=0 or tolerance!=args.same_layer_tolerance:continue
    for road,index,progress in[(a,i,u),(b,j,v)]:
        e=roads[road]
        other,index_other,progress_other=(b,j,v)if road==a else(a,i,u)
        other_position=arcs[other][index_other]*(1-progress_other)+arcs[other][index_other+1]*progress_other
        other_anchored=other in primaryVariableIds or other in componentWindows['roads']and any(lo-1e-6<=other_position<=hi+1e-6 for lo,hi in componentWindows['roads'][other]['ranges'])
        if not other_anchored:continue
        if road in primaryVariableIds or road in protected or road in underpassIds or road in tileIds or road in fixedTileIds or e.get('expressway')or min(e['elev']or[0])<-.001:continue
        if max(map(abs,e['elev']or[0]))<1e-9:continue
        record=next_windows.setdefault(road,{'ranges':[],'reason':'Unprotected source road participates in a proved affected finite apron; name/layer absence is not height authority.'})
        position=arcs[road][index]*(1-progress)+arcs[road][index+1]*progress
        record['ranges'].append([max(0.,position-2),min(arcs[road][-1],position+2)])
for road,record in next_windows.items():
    spans=sorted(record['ranges']);merged=[]
    for a,b in spans:
        if merged and a<=merged[-1][1]+1e-6:merged[-1][1]=max(merged[-1][1],b)
        else:merged.append([a,b])
    record['ranges']=merged
if {road:record['ranges']for road,record in next_windows.items()}!={road:record['ranges']for road,record in componentWindows['roads'].items()}:
    if componentWindows['iteration']>=8:raise RuntimeError('Affected source component exceeded8 bounded eligibility passes; inspect component windows before expanding.')
    import sys
    window_path=args.output.with_suffix('.components.json')
    window_path.write_text(json.dumps({'sourceModelSHA256':componentWindows['sourceModelSHA256'],'iteration':componentWindows['iteration']+1,'primaryRoads':sorted(primaryVariableIds),'roads':next_windows},separators=(',',':'))+'\n')
    command=sys.argv[1:]
    if '--component-windows'in command:
        index=command.index('--component-windows');command[index+1]=str(window_path)
    else:command+=['--component-windows',str(window_path)]
    print(json.dumps({'phase':'source-component-eligibility-expansion','roads':sorted(set(next_windows)-set(componentWindows['roads'])),'pass':componentWindows['iteration']+1}),flush=True)
    os.execv(sys.executable,[sys.executable,str(Path(__file__).resolve()),*command])

# A polygon is exempt from independent headroom only when every vertex belongs
# to one proved finite apron fragment. No whole road pair is retired.
physical_samples=collections.defaultdict(set)
for a,i,u,b,j,v,p,offset,tolerance in couplings:
    if offset==0 and tolerance==args.same_layer_tolerance:
        physical_samples[(a,b,i,j)].add(tuple(round(float(x),6)for x in p))
fragment_ledger=[]
component_by_segments={}
for c in components:
    for a,b,i,j in c['segmentPairs']:
        component_by_segments[(a,b,i,j)]=c;component_by_segments[(b,a,j,i)]=c
short_by_segments={(w['roads'][0],w['roads'][1],w['segments'][0],w['segments'][1]):w for w in junctionWitnesses}
for key,fragment in fragmentPolygons.items():
    a,b,i,j,ai,bi=key
    if not all(tuple(round(float(x),6)for x in p)in physical_samples[(a,b,i,j)]for p in fragment['polygon']):
        continue
    component=component_by_segments.get((a,b,i,j))
    short=short_by_segments.get((a,b,i,j))
    proof=(ownSurfaceProofs[(a,b,i,j)]if(a,b,i,j)in ownSurfaceProofs else
           {'category':'source-node-attached-finite-apron','node':component['node'],'ramp':component['ramp'],'sourcePath':[m['id']for m in component['members']]}if component else
           {'category':'short-source-node-chain-apron',**short['proof']}if short else
           {'category':'source-supported-parallel-bridge-carriageways','name':roads[a]['name'],'relativeLevelRules':[layers.get(a.split('_')[0]),layers.get(b.split('_')[0])]})
    fragment_ledger.append({**fragment,'proof':proof,'modelArcs':[[arcs[a][i],arcs[a][i+1]],[arcs[b][j],arcs[b][j+1]]],'immutableSourceArcs':[[srcS(a,arcs[a][i]),srcS(a,arcs[a][i+1])],[srcS(b,arcs[b][j]),srcS(b,arcs[b][j+1])]]})

variableEligibility=[]
for road in varIds:
    e=roads[road];fixed=[j for j in range(len(e['pts']))if bounds[O[road]+j][0]==bounds[O[road]+j][1]]
    if road in jointTileIds:reason='Source-bound joint detailed approach, explicit pre-height footprint and all-arm physical connector equality; terrain/structure approval remains separate'
    elif road in tileIds:reason='Fixed directly bound tile-only source profile; no unsupported street lift'
    elif road in protected:reason='Mapped/protected source profile'
    elif min(e['elev']or[0])<-.001:reason='Preserved negative/underpass profile'
    elif road in underpassIds:reason='Verified underpass profile policy'
    elif e.get('expressway'):reason='Protected controlled expressway profile'
    elif road in componentWindows['roads']:reason='Estimated component profile: local recovery controls eligible; untouched region and unknown zero street profiles fixed by modeling policy, not surveyed authority'
    else:reason='Actual conditioned source-node datums and estimated branch profiles fixed by modeling policy; authorized local apron controls released'
    variableEligibility.append({'id':road,'reason':reason,'primaryAffectedRoad':road in primaryVariableIds,'controls':len(e['pts']),'freeControls':len(e['pts'])-len(fixed),'fixedControlIndices':fixed,'componentRanges':componentWindows['roads'].get(road,{}).get('ranges',[])})

input_files={key:str(getattr(args,key))for key in ['model','footprints','historical_model','historical_footprints','tile_transports','core','source_evidence','known_cases','regressions','mapped_levels','source_family_binding','source_family_evidence','apron_source_evidence','geographic_reference','historical_lowering_profiles','apron_policy','fixed_tile_constraints','source_apron_binding','source_node_fans','historical_cap_seam_proof','connected_facility_proof','generated_facility_policy','positive_facility_policy']}
if args.source_geometry:input_files['source_geometry']=str(args.source_geometry)
if args.component_windows:input_files['component_windows']=str(args.component_windows)
for key in['joint_tile_input','historical_tile_model','joint_component_policy','additional_source_reference','complete_core_context','generated_node_datum_policy','generated_facility_rebase_proof']:
 if getattr(args,key):input_files[key]=str(getattr(args,key))
input_hashes={key:{'file':Path(value).name,'sha256':hashlib.sha256(Path(value).read_bytes()).hexdigest()}for key,value in input_files.items()}
assert all(record['sha256']==initialInputSHA[key]for key,record in input_hashes.items()),'A solver input changed during classification; no mixed-stage output is permitted'
historical_fixture=json.loads(args.historical_lowering_profiles.read_text())
assert historical_fixture['historicalConditionedReferenceSHA256']==input_hashes['historical_model']['sha256'],'historical lowering fixture/model mismatch'
assert historical_fixture['immutableCoreSHA256']==input_hashes['core']['sha256'],'historical lowering fixture/core mismatch'
assert fixedConstraints['sourceCoreSHA256']==input_hashes['core']['sha256'],'fixed tile/core mismatch'
assert tile['sourceModelSHA256']==input_hashes['model']['sha256'],'tile-only supplement/model mismatch'
assert json.loads(args.historical_footprints.read_text())['sourceModelSHA256']==input_hashes['historical_model']['sha256'],'historical actual-ribbon binding mismatch'

# Actual triangles are level along each cross-section. Their true planar slope
# is delta-height / perpendicular distance to the opposite section, which can
# be larger than a centreline or L/R chord slope on a bend.
def cross_section_run(p,a,b):
    distance=math.dist(a,b)
    return abs(cross(a,b,p))/distance if distance>1e-10 else 0.

def road_grade_change_limit(road,index):
    global_limit=args.grade_change_per_metre
    policy=globals().get('generatedFacilityPolicies',{}).get(road)
    if not policy:return global_limit
    if not any(k in policy['generatedControlIndices']for k in[index-1,index,index+1]):return global_limit
    position=arcs[road][index]
    if not any(lo-1e-8<=position<=hi+1e-8 for lo,hi in policy['curvatureIntervals']):return global_limit
    assert global_limit<=policy['maximumGradeChangePerMetre']<=.015
    return policy['maximumGradeChangePerMetre']

def expression(road,index,progress):
    if road in O:
        return [(O[road]+index,1-progress),(O[road]+index+1,progress)],0.
    yy=roads[road]['elev']or[0.]*len(roads[road]['pts'])
    return [],yy[index]*(1-progress)+yy[index+1]*progress

head_expressions=[]
for a,i,u,b,j,v,required,p in heads:
    aa,ca=expression(a,i,u);bb,cb=expression(b,j,v)
    head_expressions.append(([(column,-weight)for column,weight in aa]+bb,-required+ca-cb,{'category':'independent-finite-headroom','roads':[a,b],'segments':[i,j],'point':p,'required':required,'sourceAuthority':'Historical actual ordered crossing or newly exposed source-ordered independent crossing'}))
coupling_expressions=[]
for a,i,u,b,j,v,p,offset,tolerance in couplings:
    aa,ca=expression(a,i,u);bb,cb=expression(b,j,v)
    row=aa+[(column,-weight)for column,weight in bb]
    tag={'category':'finite-apron-coelevation'if tolerance==args.same_layer_tolerance else'existing-local-surface-preservation','roads':[a,b],'segments':[i,j],'point':p,'offset':offset,'tolerance':tolerance}
    coupling_expressions.append((row,offset+tolerance-ca+cb,-offset+tolerance+ca-cb,tag))

def solve(max_grade):
    rows=[];cols=[];values=[];rhs=[];tags=[]
    def add(items,bound,tag):
        index=len(rhs);rhs.append(float(bound));tags.append(tag)
        for column,weight in items:
            if abs(weight)>1e-15:rows.append(index);cols.append(column);values.append(float(weight))
    for road in varIds:
        e=roads[road];aa=arcs[road];f=footprints[road]
        road_grade=min(max_grade,args.tile_max_grade)if road in globals().get('jointTileIds',set())else max_grade
        for j in range(len(aa)-1):
            distance=aa[j+1]-aa[j]
            if distance<1e-7:continue
            row=[(O[road]+j+1,1.),(O[road]+j,-1.)]
            fixed=all(bounds[O[road]+k][0]==bounds[O[road]+k][1]for k in[j,j+1])
            if not fixed:
                tag={'category':'centreline-grade','road':road,'control':j,'distance':distance,'maximumGrade':road_grade}
                add(row,road_grade*distance,tag);add([(c,-w)for c,w in row],road_grade*distance,tag)
            if not fixed or road in set(stage.get('geometryEdits',[])):
                run=min(cross_section_run(f['R'][j],f['R'][j+1],f['L'][j+1]),cross_section_run(f['L'][j+1],f['R'][j],f['L'][j]))
                tag={'category':'actual-triangle-grade','road':road,'control':j,'perpendicularRun':run,'maximumGrade':args.physical_max_grade}
                add(row,args.physical_max_grade*run,tag);add([(c,-w)for c,w in row],args.physical_max_grade*run,tag)
        for j in range(1,len(aa)-1):
            a=aa[j]-aa[j-1];b=aa[j+1]-aa[j]
            if min(a,b)<1e-7 or all(bounds[O[road]+k][0]==bounds[O[road]+k][1]for k in[j-1,j,j+1]):continue
            row=[(O[road]+j-1,1/a),(O[road]+j,-1/a-1/b),(O[road]+j+1,1/b)]
            curvature_limit=road_grade_change_limit(road,j)
            tag={'category':'bounded-grade-change','road':road,'control':j,'gradeChangePerMetre':curvature_limit,'globalGradeChangePerMetre':args.grade_change_per_metre}
            limit=curvature_limit*(a+b)/2
            add(row,limit,tag);add([(c,-w)for c,w in row],limit,tag)
    grouped_nodes=collections.defaultdict(list)
    for node,column,road,index in variableNodeRows:grouped_nodes[node].append((column,road,index))
    for node,entries in grouped_nodes.items():
        first=entries[0]
        for item in entries[1:]:
            row=[(first[0],1.),(item[0],-1.)];tag={'category':'exact-shared-node-datum','node':node,'roads':[first[1],item[1]],'authority':'Explicit generated local junction component; all core arms coherent'}
            add(row,0.,tag);add([(c,-w)for c,w in row],0.,tag)
    for node,first,second in globals().get('jointNodeCouplings',[]):
        def endpoint(item):
            road,index=item
            if road in O:return[(O[road]+index,1.)],0.
            return[],(roads[road]['elev']or[0.]*len(roads[road]['pts']))[index]
        aa,ca=endpoint(first);bb,cb=endpoint(second);row=aa+[(c,-w)for c,w in bb]
        tag={'category':'exact-joint-core-tile-node','node':node,'roads':[first[0],second[0]],'authority':'Identical full retained physical connector and complete all-arm owner/context inventory; no coordinate snap'}
        add(row,cb-ca,tag);add([(c,-w)for c,w in row],ca-cb,tag)
    for row,bound,tag in head_expressions:add(row,bound,tag)
    for row,positive,negative,tag in coupling_expressions:
        add(row,positive,tag);add([(c,-w)for c,w in row],negative,tag)
    for column,height in enumerate(base):
        add([(column,1.),(N+column,-1.)],height,{'category':'objective'})
        add([(column,-1.),(N+column,-1.)],-height,{'category':'objective'})
    matrix=coo_matrix((values,(rows,cols)),shape=(len(rhs),2*N)).tocsr()
    bb=bounds+[(0.,None)]*N
    lower=np.array([a if a is not None else-1e20 for a,b in bb]);upper=np.array([b if b is not None else 1e20 for a,b in bb])
    minimum=matrix.maximum(0)@lower+matrix.minimum(0)@upper
    direct=np.flatnonzero(minimum>np.array(rhs)+1e-7)
    def witness(index,weight=None):
        row=matrix.getrow(index);control=[]
        for column,coefficient in zip(row.indices,row.data):
            if column>=N:continue
            road=next(i for i in varIds if O[i]<=column<O[i]+len(roads[i]['pts']))
            k=int(column-O[road]);e=roads[road]
            authority=('fixed tile-only source street'if road in tileIds else'protected mapped/conditioned/negative profile'if road in protected or road in underpassIds or min(e['elev']or[0])<-.001 else'generated estimated model profile')
            control.append({'road':road,'control':k,'modelArc':arcs[road][k],'sourceArc':srcS(road,arcs[road][k]),'inputHeight':float(base[column]),'bounds':bounds[column],'coefficient':float(coefficient),'authority':authority,'node':e['from']if k==0 else e['to']if k==len(e['pts'])-1 else None})
        result={'row':int(index),'constraint':tags[index],'inputValue':float((row[:,:N]@base).item()),'minimumFromBounds':float(minimum[index]),'bound':rhs[index],'controls':control}
        if weight is not None:result['dualWeight']=float(weight)
        return result
    report={'grade':max_grade,'success':False,'variables':N,'constraints':len(rhs),'directConflicts':[witness(int(i))for i in direct]}
    print(json.dumps({'phase':'zero-bank-matrix','grade':max_grade,'constraints':len(rhs),'directConflicts':len(direct)}),flush=True)
    start=time.monotonic()
    deviation_weights=np.ones(N)
    for road in globals().get('jointTileIds',set()):deviation_weights[O[road]:O[road]+len(roads[road]['pts'])]=args.tile_deviation_weight
    result=linprog(np.r_[np.zeros(N),deviation_weights],A_ub=matrix,b_ub=rhs,bounds=bb,method='highs',options={'time_limit':args.time_limit})
    report.update(success=bool(result.success),status=int(result.status),message=result.message,seconds=time.monotonic()-start)
    if result.success:
        y=result.x[:N]
        report.update(maximumHeightDelta=float(max(abs(y-base))),meanHeightDelta=float(np.mean(abs(y-base))))
        report['roadData']=[{**roads[i],'elev':list(map(float,y[O[i]:O[i]+len(roads[i]['pts'])]))}for i in varIds if i not in tileIds]
        if globals().get('joint'):
            assert {r['id']for r in report['roadData']}<={r['id']for r in stage['roads']},'A fixed detailed context road leaked into core solution output'
            report['tileRoadData']=[{**roads[i],'elev':list(map(float,y[O[i]:O[i]+len(roads[i]['pts'])]))}for i in sorted(jointTileIds)]
        assert {'23427c8c-e37_0','bdf0bad3-182_0'}<={r['id']for r in report['roadData']}
        assert all(np.array_equal(y[O[i]:O[i]+len(roads[i]['pts'])],base[O[i]:O[i]+len(roads[i]['pts'])])for i in tileIds-globals().get('jointTileIds',set()))
    elif not len(direct):
        # HiGHS supplies a sparse Farkas dual ray when pairwise bound checks pass
        # but the combined source/grade/clearance component is impossible.
        from scipy.optimize._highspy import _core
        high=_core._Highs();high.setOptionValue('output_flag',False);high.setOptionValue('time_limit',30.)
        lp=_core.HighsLp();lp.num_col_=2*N;lp.num_row_=len(rhs);lp.col_cost_=np.zeros(2*N);lp.col_lower_=lower;lp.col_upper_=upper;lp.row_lower_=np.full(len(rhs),-np.inf);lp.row_upper_=np.array(rhs)
        csc=matrix.tocsc();lp.a_matrix_.format_=_core.MatrixFormat.kColwise;lp.a_matrix_.start_=csc.indptr;lp.a_matrix_.index_=csc.indices;lp.a_matrix_.value_=csc.data
        high.passModel(lp);high.run();status,has_ray,ray=high.getDualRay()
        active=np.flatnonzero(abs(ray)>1e-8)if has_ray else[]
        report['dualWitness']={'status':str(status),'hasRay':bool(has_ray),'rows':[witness(int(i),ray[i])for i in active]}
    return report

if args.diagnostic_solve_context:
 import pickle
 assert sourceMetadataCoverage['complete']and coreContextCoverage['complete'],'Diagnostic context needs complete bound inputs'
 assert hashlib.sha256(Path(__file__).read_bytes()).hexdigest()==solverSHAAtStart
 assert all(hashlib.sha256(Path(value).read_bytes()).hexdigest()==initialInputSHA[key]for key,value in input_files.items())
 names=['args','N','O','varIds','arcs','bounds','base','tileIds','protected','underpassIds','head_expressions','coupling_expressions','variableNodeRows','jointNodeCouplings','jointTileIds','canonicalRailControls','sourceDistanceAtControls','generatedFacilityPolicies']
 state={key:globals()[key]for key in names}
 state.update(roads=roads,footprints={road:footprints[road]for road in varIds},joint=bool(joint),stage={'roads':[{'id':r['id']}for r in stage['roads']],'geometryEdits':stage.get('geometryEdits',[])})
 context={'version':1,'releaseApproved':False,'scope':'Trusted local numeric diagnostic only. Geometry/classification and independent headroom expressions are frozen; production fitting and full acceptance remain mandatory.','inputs':initialInputSHA,'solverSource':Path(__file__).read_bytes(),'solverSHA256':solverSHAAtStart,'state':state,'noRiseRoads':[r['id']for r in apronPolicy.get('loweringOnlyRoads',[])]}
 with args.diagnostic_solve_context.open('xb')as output:pickle.dump(context,output,protocol=5)
 print(json.dumps({'phase':'diagnostic-solve-context-ready','path':str(args.diagnostic_solve_context),'sha256':hashlib.sha256(args.diagnostic_solve_context.read_bytes()).hexdigest(),'bytes':args.diagnostic_solve_context.stat().st_size,'releaseApproved':False}),flush=True)
 if args.diagnostic_context_only:raise SystemExit(0)
elif args.diagnostic_context_only:raise ValueError('Diagnostic-only requires a context output path')

attempts=[]
for grade in sorted(set([args.max_grade,args.fallback_grade])):
    result=solve(grade);attempts.append(result)
    print(json.dumps({key:value for key,value in result.items()if key not in['roadData','tileRoadData','directConflicts','dualWitness']}),flush=True)
    if result['success']:break
final=attempts[-1]
if historicalReferenceUnresolved:
 final.update(success=False,historicalReferenceUnresolved=list(historicalReferenceUnresolved.values()),message='Historical source reference coverage is unresolved; no geometry approval is implied even if the diagnostic LP is feasible.')
if args.additional_source_reference and sourceMetadataMissing:
 final.update(success=False,message='Actual crossing/source-path metadata is incomplete; omitted records cannot be treated as ground level.')
final.update(sourceMetadataCoverage=sourceMetadataCoverage,coreContextCoverage=coreContextCoverage)
if remoteOwnIntersections:
 final.update(success=False,remoteOwnIntersections=remoteOwnIntersections,message='Remote same-road finite intersections require independent historical/source-order clearance classification; they never inherit local fold co-elevation.')
final.update(schemaVersion=1,bank=0.,sameLayerTolerance=args.same_layer_tolerance,gradeChangePerMetre=args.grade_change_per_metre,localGradeChangePolicies=[{'road':road,'sourcePolicySHA256':input_hashes['generated_facility_policy']['sha256'],'sourceClassificationSHA256':generatedFacilityPolicy['sourceClassificationSHA256'],'controlCount':len(arcs[road]),'protectedControlIndices':policy['protectedControlIndices'],'existingHeightEnvelope':policy['existingHeightEnvelope'],'controls':[{'index':j,'modelArc':arcs[road][j-1:j+2],'maximumGradeChangePerMetre':road_grade_change_limit(road,j)}for j in range(1,len(arcs[road])-1)if road_grade_change_limit(road,j)>args.grade_change_per_metre]}for road,policy in generatedFacilityPolicies.items()],sourceModelSHA256=input_hashes['model']['sha256'],provenance={'inputs':input_hashes,'solverSHA256':solverSHAAtStart,'numpyVersion':np.__version__,'scipyVersion':__import__('scipy').__version__,'historicalAuthority':historical_fixture['historicalReferenceAuthority'],'noHeightResamplingAfterSolve':True,'tileOnlyYFixed':not bool(joint)},constraintSummary={'categories':dict(category),'finitePairs':actualPairs,'broadPairs':len(pairs),'physicalApronFragments':len(fragment_ledger),'railFrozenControls':railFrozen,'sourceNodeDatumsFixed':not bool(variableNodeComponents),'explicitGeneratedNodeComponents':variableNodeComponents,'historicalReferenceMethod':'Bound full-UUID geographic correctedOfficialMetres to exact historical owner legacyArc; source topology guarded, no endpoint clamping','apronAdjustmentMeters':args.apron_height_adjustment,'apronWindowMeters':args.apron_window,'permittedApronControls':len(changes),'remainingUnclassifiedSampleCount':category['unclassified'],'requiresIndependentPhysicalAcceptance':True})
if generatedFacilityRebase:final['generatedFacilityRebase']=generatedFacilityRebase
if joint:
 final['constraintSummary']['generatedNodeDatumPolicy']={'sourcePolicySHA256':initialInputSHA.get('generated_node_datum_policy'),'nodes':len(lateNodeComponents),'fullSourceConnectorAndCompleteOwnerIncidenceRequired':True,'canonicalRailControlsRemainExact':True,'canonicalNodeAnchors':lateCanonicalNodeAnchors}
 final['constraintSummary']['sourceNodeDatumsFixed']=not bool(variableNodeComponents or lateNodeComponents)
 final['constraintSummary']['jointDetailedRoads']={'requested':len(joint['requestedRoadIDs']),'variable':len(jointTileIds),'fixedSource':sorted(set(joint['requestedRoadIDs'])&fixedTileIds),'allArmNodes':len(jointNodeRecords),'nodeEqualities':len(jointNodeCouplings),'defaultGrade':args.tile_max_grade,'deviationWeight':args.tile_deviation_weight,'positiveGroundTargetsNeedTerrainAndStructureApproval':True,'actualHistoricalTrianglesAndCaps':True}
 final['provenance']['geographiclibVersion']=__import__('geographiclib').__version__
args.output.parent.mkdir(parents=True,exist_ok=True)
# Timings belong in the review ledger, so identical bound inputs regenerate a stable solution.
assert hashlib.sha256(Path(__file__).read_bytes()).hexdigest()==solverSHAAtStart,'Solver implementation changed during execution'
assert all(hashlib.sha256(Path(value).read_bytes()).hexdigest()==initialInputSHA[key]for key,value in input_files.items()),'Solver input changed during optimization'
if joint and final['success']:
 def profile_input(e):
  value={key:e.get(key)for key in['pts','elev','w','lanes','from','to','oneway']}
  if 'joinedPavement'in e:value['joinedPavement']=e['joinedPavement']
  value.update({key:e.get(key)for key in['laneEvidence','sourceLaneIntervals','sceneryWidth','expressway','scenerySource']})
  return value
 core_targets={r['id']:r for r in final['roadData']};tile_targets={r['id']:r for r in final.pop('tileRoadData')}
 final_model={**stage,'roads':[core_targets.get(r['id'],r)for r in stage['roads']]}
 model_path=args.output.with_suffix('.model.json');model_path.write_text(json.dumps(final_model,separators=(',',':'))+'\n');model_sha=hashlib.sha256(model_path.read_bytes()).hexdigest()
 requested=sorted(joint['requestedRoadIDs'])
 for road in requested:
  if road not in tile_targets:tile_targets[road]={**allCurrent[road],'elev':allCurrent[road]['elev']or[0.]*len(allCurrent[road]['pts'])}
 tile_profiles=[{'id':road,'stage':'conditionedWorld','expected':profile_input(allCurrent[road]),'elev':tile_targets[road]['elev']}for road in requested]
 tiles_path=args.output.with_suffix('.tiles.json');tiles_payload={'version':1,'sourceModelSHA256':model_sha,'sourceConditionedInputSHA256':input_hashes['model']['sha256'],'sourceCoreSHA256':input_hashes['core']['sha256'],'sourceRoadGeometryGeneration':sourceGeometry['generationID'],'sourcePackSHA256':joint['sourcePackSHA256'],'requestedRoadIDs':requested,'tileProfiles':tile_profiles,'roads':[tile_targets[road]for road in requested],'transports':joint['transports'],'sourceJointInputSHA256':input_hashes['joint_tile_input']['sha256'],'groundStructureApprovalRequired':[road for road in requested if max(tile_targets[road]['elev'])>1.2 and not layers.get(road.split('_')[0])],'verifiedUnderpassContinuations':{road:jointTileFacilityAuthority[road]for road in sorted(jointNegativeTileIds)},'scope':'Offline joint linear-height solution; exact actual runtime footprint, terrain, structure and full-vehicle acceptance remain mandatory','releaseApproved':False}
 tiles_path.write_text(json.dumps(tiles_payload,separators=(',',':'))+'\n')
 final['jointArtifacts']={'coreModel':{'path':str(model_path),'sha256':model_sha},'tiles':{'path':str(tiles_path),'sha256':hashlib.sha256(tiles_path.read_bytes()).hexdigest()},'requiresFreshRuntimeFootprintParity':True}
payload={key:value for key,value in final.items()if key!='seconds'}
args.output.write_text(json.dumps(payload,separators=(',',':'))+'\n')
ledger=args.ledger or args.output.with_suffix('.ledger.json')
ledger.write_text(json.dumps({'sourceModelSHA256':input_hashes['model']['sha256'],'historicalModelSHA256':input_hashes['historical_model']['sha256'],'footprintsSHA256':input_hashes['footprints']['sha256'],'sameLevelTolerance':args.same_layer_tolerance,'scope':'Exact source-proved finite apron polygons only; all other independent historical/new-envelope rows retained. No whole-pair exemption.','fragments':fragment_ledger,'sourceJunctionWitnesses':junctionWitnesses,'localJunctionProofs':localJunctionProofs,'ambiguousOverlapCells':[list(cell)for cell in sorted(ambiguousOverlapCells)],'variableEligibility':variableEligibility,'jointEligibility':jointEligibility,'connectedFacilityInheritance':jointFacilityInheritance,'positiveRailInheritance':list(positiveRailInheritance.values()),'positiveFacilityPolicySHA256':initialInputSHA['positive_facility_policy'],'localGeneratedFacilityPolicies':list(generatedFacilityPolicies.values()),'correctedSourceProjection':sourceProjectionReport,'estimatedNodeTargets':list(nodeTargets.values()),'apronHeightPolicy':{'maximumCorrection':args.apron_height_adjustment,'maximumWindow':args.apron_window,'permittedControls':changes},'attempts':[{k:v for k,v in r.items()if k not in['roadData','tileRoadData']}for r in attempts],'historicalReferenceUnresolved':list(historicalReferenceUnresolved.values()),'historicalOwnSeamEnvelopes':list(historicalOwnSeamEnvelopes.values()),'historicalMultiBindingReferences':list(historicalMultiBindingReferences.values()),'historicalOwnSeamProofSHA256':initialInputSHA['historical_cap_seam_proof'],'unclassifiedSamples':unclassified},separators=(',',':'))+'\n')
print(json.dumps({'output':str(args.output),'sha256':hashlib.sha256(args.output.read_bytes()).hexdigest(),'ledger':str(ledger),'ledgerSHA256':hashlib.sha256(ledger.read_bytes()).hexdigest(),'success':final['success']}),flush=True)
raise SystemExit(0 if final['success']else 2)
