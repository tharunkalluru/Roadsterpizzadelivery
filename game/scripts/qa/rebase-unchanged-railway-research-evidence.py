#!/usr/bin/env python3
"""Rebase the retained 70-entry inactive railway proposal after unrelated source repair.

This is a scoped applicability proof, not a new crossing survey, metric height
policy, fit, or activation. Original proposal/source audit bytes remain retained.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import struct
import sys
import uuid

HELPER=Path(__file__).with_name('verify-scoped-generated-facility-rebase.py')
SPEC=importlib.util.spec_from_file_location('railway_rebase_exact',HELPER)
EXACT=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(EXACT)
PARENT_PROPOSAL_SHA='923a99aa1f8ae1d5775ecc86731fdd5b77a8f142cca59fe0156259d90b631dfe'
NEW_SOURCE_SHA='86775faf09c73cc7b643b1cb5fbc16bc20bb8b64dc714215be78d3acae5af89b'
NEW_SOURCE_GENERATION='ef93e0853f85f4875147cc0fce6b066219cbde74d682994b8a2689c07928bd5a'
EXPECTED_COUNTS=(70,34,816)
NEW_SOURCE_IDS={'09c1bfe9-5f2_0','09c1bfe9-5f2_1','fe98bd3f-31c_0'}
SOURCE_FIELDS={'id','name','class','width_rules','level_rules','road_flags','access_restrictions','connectors','sources','geometryWKB','bbox'}
require=EXACT.require
inventory=lambda rows,label:EXACT.inventory(rows,label)


def distance(point,a,b):
 dx,dz=b[0]-a[0],b[1]-a[1];den=dx*dx+dz*dz
 u=max(0.,min(1.,((point[0]-a[0])*dx+(point[1]-a[1])*dz)/(den or 1.)))
 return math.hypot(point[0]-a[0]-u*dx,point[1]-a[1]-u*dz)


def intersect(a,b,c,d):
 dx,dz=b[0]-a[0],b[1]-a[1];ex,ez=d[0]-c[0],d[1]-c[1];den=dx*ez-dz*ex
 if abs(den)<1e-9:return None
 u=((c[0]-a[0])*ez-(c[1]-a[1])*ex)/den;v=((c[0]-a[0])*dz-(c[1]-a[1])*dx)/den
 return(u,v,[a[0]+u*dx,a[1]+u*dz])if 0<=u<=1 and 0<=v<=1 else None


def source_replay_error(fraction,retained_fraction,length,difference,retained_difference):
 """Numeric recomputation error only; no geometry/admission tolerance changes.

The original audit producer bytes differ from the current geodesic producer.
Retained WKB, rail nodes and all proposal values must be exact independently.
A recomputed normalized fraction is compared in physical distance units, with
at most 0.1 micrometre drift; actual intersection-distance drift is at most 1nm.
"""
 require(all(math.isfinite(v)for v in [fraction,retained_fraction,length,difference,retained_difference])and length>0,'Invalid raw crossing replay number')
 error=abs(fraction-retained_fraction)*length
 require(error<=1e-7 and abs(difference-retained_difference)<=1e-9,'Raw WKB/rail crossing replay changed')
 return error


def build_proof(d,b):
 proposal=d['proposal'];require(b['proposal']['sha256']==PARENT_PROPOSAL_SHA,'Pinned parent proposal changed')
 require(proposal['version']==1 and proposal['releaseApproved']is False,'Proposal scope changed')
 require(proposal['sourceModelSHA256']==b['old_model']['sha256'],'Parent model binding changed')
 require(proposal['sourceReferenceSHA256']==b['old_reference']['sha256'],'Parent source reference binding changed')
 require(proposal['sourceCrossingAuditSHA256']==b['crossing_audit']['sha256'],'Parent crossing audit binding changed')
 audit=d['crossing_audit']
 for key,bind in [('model','old_model'),('source-data','old_source'),('source-reference','old_reference'),('current-rail-source','rail_source')]:
  require(audit['inputs'][key]['sha256']==b[bind]['sha256'],'Crossing audit input binding changed: '+key)
 old,new=d['old_model'],d['new_model'];os,ns=d['old_source'],d['new_source']
 require(b['new_source']['sha256']==NEW_SOURCE_SHA and ns['generationID']==NEW_SOURCE_GENERATION,'Reviewed additive source frame changed')
 require(EXACT.exact(os['origin'],ns['origin']),'Source frame origin changed')
 require(os['sourceCorePackSHA256']==ns['sourceCorePackSHA256']==b['raw_core']['sha256'],'Raw core binding changed')
 require(EXACT.exact(old['profiles'],new['profiles']),'Canonical rail profiles changed')
 require(EXACT.exact(old['report'],new['report']),'Canonical railway conditioning report changed')
 for label,model,source,pre,fp in [('old',old,os,d['old_pre'],d['old_footprints']),('new',new,ns,d['new_pre'],d['new_footprints'])]:
  require(model['sourceRoadGeometryGeneration']==source['generationID']==pre['sourceRoadGeometryGeneration'],'Source generation changed: '+label)
  require(model['sourceGeometryReference']['sha256']==pre['sourceGeometryReference']['sha256']==b[label+'_source']['sha256'],'Source geometry data binding changed: '+label)
  require(model['sourceGeometryReference']['generationID']==pre['sourceGeometryReference']['generationID']==source['generationID'],'Source geometry reference generation changed: '+label)
  require(model['preconditioningReference']['sha256']==b[label+'_pre']['sha256'],'Model/PRE binding changed: '+label)
  require(fp['sourceModelSHA256']==b[label+'_model']['sha256'],'Actual footprint/model binding changed: '+label)
  require(EXACT.exact(model['profiles'],pre['profiles']),'Canonical PRE/model rail references changed: '+label)
 for key in ['roads','sources']:
  oldrows=inventory(os[key],'Old source '+key);newrows=inventory(ns[key],'New source '+key)
  require(all(k in newrows and EXACT.exact(v,newrows[k])for k,v in oldrows.items()),'Existing source geometry record changed: '+key)
 require(all(k in ns['nodes']and EXACT.exact(v,ns['nodes'][k])for k,v in os['nodes'].items()),'Existing source node changed')
 added={r['id']for r in ns['roads']}-{r['id']for r in os['roads']};require(added==NEW_SOURCE_IDS,'Unexpected additive source-road inventory')
 oldref=inventory(d['old_reference']['rows'],'Old retained source');newref=inventory(d['new_reference']['rows'],'Current retained source')
 require(d['old_reference']['complete']and d['new_reference']['complete'],'Incomplete retained source')
 require(d['old_reference']['release']==d['new_reference']['release']==os['release']==ns['release'],'Retained release changed')
 require(all(k in newref and EXACT.exact(v,newref[k])for k,v in oldref.items()),'Retained raw source row changed or omitted')
 roads=inventory(old['roads'],'Old model');fresh=inventory(new['roads'],'New model')
 of=inventory(d['old_footprints']['roads'],'Old literal ribbons');nf=inventory(d['new_footprints']['roads'],'New literal ribbons')
 require(set(roads)==set(fresh)==set(of)==set(nf),'Model/footprint inventory changed')
 changed={k for k in roads if not EXACT.exact(roads[k],fresh[k])}
 require(changed=={r['id']for r in ns['roads']if r['id']in added and any(c['kind']=='core'for c in r['copies'])},'Parent roads changed outside new source families')
 rails=inventory(old['profiles'],'Canonical rail');ways={'w'+str(w['id']):w for w in d['rail_source']['ways']}
 require(len(ways)==len(d['rail_source']['ways']),'Duplicate raw source railway')
 nodes={n['id']:n for n in d['rail_source']['nodes']};require(len(nodes)==len(d['rail_source']['nodes']),'Duplicate raw rail node')
 ids={r for entry in proposal['proposedEntries']for r in entry['roads']}
 require((len(proposal['proposedEntries']),len(ids),len(rails))==EXPECTED_COUNTS,'Pinned facility/rail inventory changed')
 require(not ids&added,'New source piece enters retained facility scope')
 records=[]
 for ident in sorted(ids):
  require(ident in fresh and EXACT.exact(roads[ident],fresh[ident]),'Full facility road changed: '+ident)
  require(EXACT.exact(of[ident],nf[ident]),'Actual finite facility footprint changed: '+ident)
  records.append({'id':ident,'fullRoadRecordSHA256':EXACT.record_sha(roads[ident]),'literalFootprintRecordSHA256':EXACT.record_sha(of[ident]),'fullRoadAndLiteralRibbonExact':True})
 entry_records=[]
 for index,entry in enumerate(proposal['proposedEntries']):
  require(len(entry['roads'])==len(entry['rails'])==1,'Unexpected multi-piece facility entry')
  ident,rail=entry['roads'][0],entry['rails'][0];proof=entry['proof'];source=oldref.get(proof['fullSourceRoadID'])
  require(source is not None and SOURCE_FIELDS<=source.keys(),'Missing complete raw road source')
  require(str(uuid.UUID(source['id']))==source['id']and all(str(uuid.UUID(c['connector_id']))==c['connector_id']and 0<=c['at']<=1 for c in source['connectors']),'Malformed full source or connector UUID')
  require(source['id'].startswith(ident.split('_')[0]),'Wrong full source road UUID')
  require(rail in rails and rail in ways,'Missing canonical/raw railway')
  require(EXACT.exact(source,newref[source['id']]),'Facility raw source changed')
  matches=[r for r in audit['crossings']if r['road']==ident and r['rail']==rail and EXACT.exact(r['officialSourceFraction'],proof['officialSourceFraction'])and EXACT.exact(r['nearestOriginalCrossingDifferenceM'],proof['sourceModelIntersectionDifferenceM'])]
  require(bool(matches),'Missing retained crossing proof')
  cells=[(r['roadSegment'],r['railSegment'])for r in matches]
  require(len(cells)==len(set(cells)),'Duplicate retained literal crossing cell')
  crossing=matches[0]
  physical=lambda r:{k:v for k,v in r.items()if k not in ['roadSegment','railSegment']}
  require(all(EXACT.exact(physical(r),physical(crossing))for r in matches),'Ambiguous retained physical crossing proof')
  require(crossing['classification']=='research-confirmed-road-below-source-rail-bridge-needs-model-review','Original crossing classification changed')
  require(EXACT.exact(crossing['localSourceLevel'],proof['activeRoadLevel'])and EXACT.exact(crossing['localSourceFlags'],proof['activeRoadFlags']),'Raw source classification changed')
  require(math.dist(entry['anchor'],crossing['point'])<=entry['radius'],'Retained anchor/radius does not contain its crossing')
  require(not any(r['value']>0 for r in source['level_rules']or[])and not any('is_bridge'in r['values']for r in source['road_flags']or[]),'Source-wide positive road structure entered retained scope')
  way=ways[rail];tags=way.get('tags',{})
  require(tags.get('bridge')=='yes'and tags.get('railway')=='rail'and int(tags.get('layer','0'))==proof['sourceRelativeRailLayer']>0,'Raw source rail bridge/order changed')
  retained=next((r for r in audit['railways']if r['rail']==rail),None)
  require(retained is not None and retained['sourceGeometryMatches']and retained['currentSourceMatchesRetainedBridge']and EXACT.exact(tags,retained['tags']),'Retained railway source proof changed')
  require(all(n in nodes for n in way['nodes']),'Raw railway node missing')
  entry_records.append({'index':index,'entrySHA256':EXACT.record_sha(entry),'road':ident,'rail':rail,'rawSourceRoadRecordSHA256':EXACT.record_sha(source),'fullSourceRoadID':source['id'],'sourceWKB_SHA256':EXACT.sha(bytes.fromhex(source['geometryWKB'])),'rawRailWaySHA256':EXACT.record_sha(way),'rawRailNodeArraySHA256':EXACT.record_sha([nodes[n]for n in way['nodes']]),'canonicalRailProfileSHA256':EXACT.record_sha(rails[rail]),'retainedCrossingCells':[{'roadSegment':r['roadSegment'],'railSegment':r['railSegment'],'recordSHA256':EXACT.record_sha(r)}for r in matches],'anchorAndRadiusAndAllEvidenceFieldsUnchanged':True})
 separation=[]
 for road in ns['roads']:
  if road['id']not in added:continue
  margins=[min(distance(e['anchor'],a,c)for a,c in zip(road['pts'],road['pts'][1:]))-e['radius']-road['expected']['w']for e in proposal['proposedEntries']]
  require(min(margins)>0,'New source pavement may enter a retained facility envelope')
  separation.append({'road':road['id'],'minimumConservativeEnvelopeSeparationM':min(margins),'bufferUsesFullRawRoadWidthRatherThanHalfWidth':True,'allRetained70RadiusEnvelopesDisjoint':True})
 proof={'schema':'unchanged-railway-research-evidence-scoped-rebase-v1','researchOnly':True,'releaseApproved':False,'runtimeActivated':False,'heightAuthorityGranted':False,'heightEnvelopeChanged':False,'facilityScopeChanged':False,'inputs':b,'roadRecords':records,'entries':entry_records,'newSourcePieceSeparation':separation,'allCanonicalRailProfiles':{'count':len(rails),'sha256':EXACT.record_sha(old['profiles']),'fullOrderedArrayExact':True},'sourceOriginExact':True,'rawCoreBindingExact':True,'oldRawSourceRowsRetainedExactly':len(oldref),'sourceGeometryRecordsRetainedExactly':{'roads':len(os['roads']),'sources':len(os['sources']),'nodes':len(os['nodes'])},'parentChangedRoads':sorted(changed),'retainedCrossingAuditIsScopedByThisProofNotRelabeledGlobalAudit':True,'preservedAnnotatedRoadsRemainExcluded':True,'fullPhysicalFitPerformed':False}
 result=copy.deepcopy(proposal);result.update(sourceModelSHA256=b['new_model']['sha256'],sourceReferenceSHA256=b['new_reference']['sha256'],sourceDataSHA256=b['new_source']['sha256'],sourceRoadGeometryGeneration=ns['generationID'],sourcePreconditioningSHA256=b['new_pre']['sha256'],scopedUnchangedInputRebase=proof,researchOnly=True,releaseApproved=False)
 require(EXACT.exact(result['proposedEntries'],proposal['proposedEntries']),'Entry changed during rebase')
 return result,proof


def replay_raw_crossings(d,proof):
 """Replay each retained source/model crossing from WKB and raw OSM rail nodes."""
 from geographiclib.geodesic import Geodesic
 origin=d['new_source']['origin'];kx=origin['NR']*math.cos(math.radians(origin['lat']))*math.pi/180;kz=origin['MR']*math.pi/180
 project=lambda ll:[(ll[0]-origin['lon'])*kx,-(ll[1]-origin['lat'])*kz]
 roads=inventory(d['new_model']['roads'],'Fresh model');rails=inventory(d['new_model']['profiles'],'Fresh rails');rows=inventory(d['new_reference']['rows'],'Fresh source')
 ways={str(w['id']):w for w in d['rail_source']['ways']};nodes={n['id']:n for n in d['rail_source']['nodes']};audit=d['crossing_audit']['crossings'];cache={};replayed=[]
 for record in proof['entries']:
  entry=d['proposal']['proposedEntries'][record['index']];road=roads[record['road']];rail=rails[record['rail']];way=ways[record['rail'][1:]];row=rows[record['fullSourceRoadID']]
  sourceid=row['id']
  if sourceid not in cache:
   raw=bytes.fromhex(row['geometryWKB']);end='<'if raw[0]==1 else'>';require(struct.unpack_from(end+'I',raw,1)[0]==2,'Raw source is not a LineString')
   ll=[struct.unpack_from(end+'dd',raw,9+16*k)for k in range(struct.unpack_from(end+'I',raw,5)[0])];arc=[0.]
   for a,c in zip(ll,ll[1:]):arc.append(arc[-1]+Geodesic.WGS84.Inverse(a[1],a[0],c[1],c[0])['s12'])
   cache[sourceid]=([project(v)for v in ll],arc)
  pp,arc=cache[sourceid];qq=[project([nodes[n]['lon'],nodes[n]['lat']])for n in way['nodes']]
  rawhits=[{'point':hit[2],'officialFraction':(arc[k]+hit[0]*(arc[k+1]-arc[k]))/arc[-1]}for k,(a,c)in enumerate(zip(pp,pp[1:]))for x,z in zip(qq,qq[1:])if(hit:=intersect(a,c,x,z))]
  originals=[r for r in audit if r['road']==record['road']and r['rail']==record['rail']and EXACT.exact(r['officialSourceFraction'],entry['proof']['officialSourceFraction'])and EXACT.exact(r['nearestOriginalCrossingDifferenceM'],entry['proof']['sourceModelIntersectionDifferenceM'])]
  for original in originals:
   j,k=original['roadSegment'],original['railSegment'];hit=intersect(road['pts'][j],road['pts'][j+1],rail['pts'][k],rail['pts'][k+1]);require(hit is not None and EXACT.exact(hit[2],original['point']),'Fresh modeled crossing changed')
  closest=min(rawhits,key=lambda r:math.dist(hit[2],r['point']));fraction=closest['officialFraction'];difference=math.dist(hit[2],closest['point'])
  replay_error=source_replay_error(fraction,entry['proof']['officialSourceFraction'],arc[-1],difference,entry['proof']['sourceModelIntersectionDifferenceM'])
  active=lambda r:not r.get('between')or r['between'][0]-1e-6<=fraction<=r['between'][1]+1e-6
  level=max([r['value']for r in row['level_rules']or[]if active(r)],default=0);flags=sorted({v for r in row['road_flags']or[]if active(r)for v in r['values']})
  require(EXACT.exact(level,entry['proof']['activeRoadLevel'])and EXACT.exact(flags,entry['proof']['activeRoadFlags']),'Replayed active source classification changed')
  forward=max(min(distance(p,a,c)for a,c in zip(qq,qq[1:]))for p in rail['pts']);reverse=max(min(distance(p,a,c)for a,c in zip(rail['pts'],rail['pts'][1:]))for p in qq)
  endpoints=min(max(math.dist(rail['pts'][0],qq[0]),math.dist(rail['pts'][-1],qq[-1])),max(math.dist(rail['pts'][0],qq[-1]),math.dist(rail['pts'][-1],qq[0])))
  require(max(forward,reverse,endpoints)<=.15,'Raw/canonical railway geometry differs')
  replayed.append({'entryIndex':record['index'],'freshModelCrossing':hit[2],'retainedLiteralCrossingCellsReplayed':len(originals),'rawWKBIntersectionFraction':fraction,'fractionDifferenceFromRetainedProof':abs(fraction-entry['proof']['officialSourceFraction']),'fractionReplayDistanceErrorM':replay_error,'sourceModelIntersectionDifferenceM':difference,'differenceFromRetainedProofM':abs(difference-entry['proof']['sourceModelIntersectionDifferenceM']),'rawCanonicalRailGeometryDifferenceM':max(forward,reverse,endpoints),'relativeLevelAndFlagsReplayed':True,'surveyedMetricHeightInferred':False})
 return replayed


def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--repo',type=Path,default=Path(__file__).resolve().parents[2]);parser.add_argument('--geographiclib',type=Path,required=True)
 names=['proposal','old-model','old-footprints','old-pre','old-source','new-model','new-footprints','new-pre','new-source','old-reference','new-reference','crossing-audit','rail-source']
 for name in names+['output','proof']:parser.add_argument('--'+name,type=Path,required=True)
 a=parser.parse_args();require(a.output.resolve()!=a.proof.resolve()and not a.output.exists()and not a.proof.exists(),'Preserve existing outputs')
 paths={n.replace('-','_'):getattr(a,n.replace('-','_')).resolve()for n in names};paths['raw_core']=a.repo.resolve()/'public/city/core.pack.wasm'
 held={k:p.read_bytes()for k,p in paths.items()};b={k:{'path':str(paths[k]),'sha256':EXACT.sha(raw)}for k,raw in held.items()};d={k:json.loads(raw,object_pairs_hook=EXACT.no_duplicate_keys)for k,raw in held.items()if k!='raw_core'}
 for document in d.values():EXACT.finite_json(document)
 result,proof=build_proof(d,b);sys.path.insert(0,str(a.geographiclib));proof['rawSourceCrossingReplays']=replay_raw_crossings(d,proof)
 proof['rawReplayNumericPolicy']={'retainedAuditGeneratorSHA256':d['crossing_audit']['generatorSHA256'],'allOriginalEntryValuesRemainExact':True,'maximumFractionReplayDistanceErrorM':max(r['fractionReplayDistanceErrorM']for r in proof['rawSourceCrossingReplays']),'maximumIntersectionDistanceReplayErrorM':max(r['differenceFromRetainedProofM']for r in proof['rawSourceCrossingReplays']),'fractionReplayDistanceErrorLimitM':1e-7,'intersectionDistanceReplayErrorLimitM':1e-9,'geometryAndAdmissionToleranceChanged':False}
 proof['generator']={'path':str(Path(__file__).resolve()),'sha256':EXACT.sha(Path(__file__).read_bytes())};proof['exactVerifier']={'path':str(HELPER),'sha256':EXACT.sha(HELPER.read_bytes())}
 require(all(paths[k].read_bytes()==raw for k,raw in held.items()),'Input changed during proof')
 for path,value in [(a.output,result),(a.proof,proof)]:
  with path.open('x')as f:json.dump(value,f,indent=2,allow_nan=False);f.write('\n')
 print(json.dumps({'output':{'path':str(a.output),'sha256':EXACT.sha(a.output.read_bytes())},'proof':{'path':str(a.proof),'sha256':EXACT.sha(a.proof.read_bytes())},'entries':len(proof['entries']),'roads':len(proof['roadRecords']),'canonicalRailProfiles':proof['allCanonicalRailProfiles']['count'],'rawCrossingsReplayed':len(proof['rawSourceCrossingReplays']),'heightAuthorityGranted':False}))

if __name__=='__main__':main()
