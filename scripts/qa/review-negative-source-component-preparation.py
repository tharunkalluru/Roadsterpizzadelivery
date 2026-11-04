#!/usr/bin/env python3
"""Recompute inactive component overlap/replacement/source preparation evidence.

Retained reviews supply pinned input locations and comparison expectations, not
new height authority. Numeric overlaps, replacement records, raw owner records,
full-WKB endpoint points, source-row preservation and failed witness arithmetic
are recomputed from the actual bound inputs. No fit or consumer is run.
"""
import argparse
import bisect
import collections
import copy
import gzip
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys


def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def canon(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()
def intersection(bounds):
 low=max(b[0]for b in bounds);high=min(b[1]for b in bounds)
 return [low,high]if low<=high else None
def base(schema):return dict(schema=schema,researchOnly=True,activePolicy=False,releaseApproved=False,heightAuthorityGranted=False,endpointPermissionGranted=False)
def main():
 parser=argparse.ArgumentParser(description=__doc__)
 for name in ['component','prior-overlap','prior-replacement','prior-handoff']:
  parser.add_argument('--'+name,type=Path,required=True);parser.add_argument('--'+name+'-sha256',required=True)
 parser.add_argument('--repo',type=Path,default=Path(__file__).resolve().parents[2]);parser.add_argument('--geographiclib',type=Path,required=True)
 for name in ['overlap-output','replacement-output','handoff-output']:parser.add_argument('--'+name,type=Path,required=True)
 cli=parser.parse_args();root=cli.repo.resolve();sys.path.insert(0,str(cli.geographiclib));held={}
 def read(name,path,expected=None):
  data=Path(path).read_bytes();h=hashlib.sha256(data).hexdigest()
  if expected is not None and h!=expected:raise ValueError('Input changed: '+str(path))
  held[name]={'path':str(path),'sha256':h};return json.loads(data)
 def bound(name,record):return read(name,record['path'],record['sha256'])
 for name in ['overlap_output','replacement_output','handoff_output']:
  if getattr(cli,name).exists():raise FileExistsError(getattr(cli,name))
 c=read('component',cli.component,cli.component_sha256)
 old=read('priorOverlap',cli.prior_overlap,cli.prior_overlap_sha256)
 oldrep=read('priorReplacement',cli.prior_replacement,cli.prior_replacement_sha256)
 oldhand=read('priorHandoff',cli.prior_handoff,cli.prior_handoff_sha256)
 held['generator']={'path':str(Path(__file__).resolve()),'sha256':sha(__file__)}
 m=bound('model',c['inputs']['model']);j=bound('joint',c['inputs']['joint']);geo=bound('geo',c['inputs']['geo'])
 roads={r['id']:r for r in m['roads']+j['tileRoads']+j['contextRoads']}
 interior=bound('interior8744',old['inputs']['interior8744']);v3=bound('interiorV3',oldrep['inputs']['interiorV3'])
 policy=bound('node301',old['inputs']['node301']);positive=bound('positiveFacility',old['inputs']['positiveFacility']);anand=bound('Anand',old['inputs']['Anand']);fixed=bound('fixed24',old['inputs']['fixed24'])
 ref=bound('oldSourceV11',c['inputs']['reference']);union=bound('sourceUnionV13',c['inputs']['auxiliarySourceUnion'])
 for name in ['sourceAuxD88','sourceAuxF2']:bound(name,oldrep['inputs'][name])
 new=collections.defaultdict(list);physical={};direct=set()
 for p in c['components']:
  for x in p['requiredDirectBlockingFootprint']:direct.add((x['road'],x['index']))
  for w in p['finiteRecoveryWindows']:
   assert all(b==a+1 for a,b in zip(w['controlIndices'],w['controlIndices'][1:]))
   for x in w['controls']:
    key=(x['road'],x['index']);new[key].append({'seed':p['node'],'bounds':x['requestedNegativeOnlyModeledBounds']});physical[key]=x
    assert not x['genuineImmutableReasons']and not x['separateExistingPolicyReasons']and not x['unresolvedSourceReasons']
    assert -6.5<=x['requestedNegativeOnlyModeledBounds'][0]<=x['requestedNegativeOnlyModeledBounds'][1]<=0
 new_roads={r for r,k in new};named={}
 selected_seed_nodes={p['node']for p in c['components']}
 for n in fixed['nodes']:
  if n['node']not in selected_seed_nodes:continue
  assert n['sharedRequestedModeledDatumIntersection'][0]==n['sharedRequestedModeledDatumIntersection'][1]
  for a in n['completeIncidentArms']:
   k=0 if a['end']=='from'else len(roads[a['road']]['pts'])-1
   named[(a['road'],k)]=n['sharedRequestedModeledDatumIntersection']
 for values in new.values():values.sort(key=lambda x:x['seed'])
 scopes={name:collections.defaultdict(list)for name in ['node301','positiveFacility','Anand','interior8744','signed346Anchors']}
 # Existing protected policy roads are disjoint here; fail closed if future
 # inputs overlap rather than inventing policy semantics in this review.
 policy_roads={a['id']for n in policy['nodes']for a in n['arms']}
 assert not new_roads&policy_roads
 assert not new_roads&{r['id']for r in positive['roads']}
 assert not new_roads&{r['id']for r in anand['roads']}
 for row in interior['finiteControls']:
  key=(row['road'],row['control'])
  scopes['interior8744'][key].append({'bounds':row['to'],'from':row['from'],'family':row['family'],'permissionProposalStatus':row['permissionProposalStatus'],'provenanceGaps':row['provenanceGaps'],'authority':'inactive-interior-reconstruction-proposal'})
  for k in row.get('anchors',[]):
   yy=roads[row['road']]['elev']or[0.]*len(roads[row['road']]['pts'])
   val={'bounds':[yy[k],yy[k]],'authority':'previous-generated-domain-boundary-anchor-not-automatically-surveyed'}
   if val not in scopes['signed346Anchors'][(row['road'],k)]:scopes['signed346Anchors'][(row['road'],k)].append(val)
 reports={}
 for name,scope in scopes.items():
  output=[];shared=sorted(new_roads&{r for r,k in scope})
  for key in sorted(new.keys()&scope.keys()):
   n=intersection([x['bounds']for x in new[key]]);e=intersection([x['bounds']for x in scope[key]]);joint=intersection([n,e])if n is not None and e is not None else None
   status='compatible-intersection-only-no-union'
   if joint is None:status='empty-intersection-explicit-replacement-review-required'
   elif joint[0]>=-1e-12 and n[0]<-1e-9:status='zero-only-intersection-removes-negative-freedom-replacement-review-required'
   elif key in named and not joint[0]-1e-9<=named[key][0]<=joint[1]+1e-9:status='fixed-node-incompatible-intersection-replacement-review-required'
   output.append({'road':key[0],'control':key[1],'newPerSeedDomains':new[key],'newConservativeIntersection':n,'existingScope':scope[key],'existingScopeIntersection':e,'jointConservativeIntersection':joint,'namedFixedModeledDatum':named.get(key),'directBlockingFootprint':key in direct,'status':status,'actualCanonicalOrFloor':bool(set(physical[key]['genuineImmutableReasons'])&{'actual-canonical-bound','actual-52-owner-minimum'}),'oldEstimatedScopeNotTreatedAsSurveyed':True,'replacementAuthorityGranted':False})
  reports[name]={'sharedRoads':shared,'sharedRoadCount':len(shared),'overlappingControls':len(output),'statuses':dict(collections.Counter(x['status']for x in output)),'controls':output}
 conflicts=[]
 for key,values in new.items():
  joint=intersection([v['bounds']for v in values]);datum=named.get(key)
  if datum is not None and(joint is None or not joint[0]-1e-9<=datum[0]<=joint[1]+1e-9):conflicts.append({'road':key[0],'control':key[1],'perSeed':values,'conservativeIntersection':joint,'namedFixedModeledDatum':datum})
 # Keyed comparison avoids dependence on historical heap insertion order.
 for name,report in reports.items():
  assert report['sharedRoads']==old['scopeReports'][name]['sharedRoads']
  assert {(r['road'],r['control']):r for r in report['controls']}=={(r['road'],r['control']):r for r in old['scopeReports'][name]['controls']}
 assert {(r['road'],r['control']):r for r in conflicts}=={(r['road'],r['control']):r for r in old['newPerSeedDomainConflicts']}
 owners=[]
 for original in old['newPreparationOwnerInventory']:
  pack=original['pack'];data=Path(pack['path']).read_bytes();assert hashlib.sha256(data).hexdigest()==pack['sha256']
  assert any(v==pack for k,v in c['inputs'].items()if k.startswith('pack:'))
  found=[]
  for tile,value in json.loads(gzip.decompress(data))['tiles'].items():
   for road in value['roads']:
    if road['id']==original['rawPhysical']['id']and not road.get('ctx'):
     raw={k:road.get(k)for k in ['id','pts','elev','from','to','w','lanes','oneway']}
     found.append({'pack':pack,'tile':tile,'rawPhysical':raw,'rawPhysicalSHA256':canon(raw),'rawNullNotSurveyedZero':raw['elev']is None,'conditioningAndFullJointInputRequired':True})
  assert found==[original];owners.extend(found)
 assert sorted(o['rawPhysical']['id']for o in owners)==c['preparationRequirements']['newDetailedOwnerRoadsAbsentPreparedJoint']
 overlap=base('negative-component-existing-policy-overlap-review-v2');overlap.update(inputs=copy.deepcopy(held),summary={n:{k:r[k]for k in ['sharedRoadCount','overlappingControls','statuses']}for n,r in reports.items()},scopeReports=reports,newPerSeedDomainConflicts=conflicts,newPreparationOwnerInventory=owners,additionalMissingSourcePrefixesFromAllArmProof=old['additionalMissingSourcePrefixesFromAllArmProof'],requiredReplacementRule=old['requiredReplacementRule'],sourceProofGates=old['sourceProofGates'])
 overlap['summary']['newPerSeedDomainConflicts']=len(conflicts)
 overlap['freshRecomputation']={'allOverlapDomainsAndStatusesRecomputedFromActualInputs':True,'oldPoliciesUnchanged':True,'normalizedSelectedControlSetUnchanged':True,'ownerPackedRecordRereadAndAll304PackHashesHeldByActualComponentProducer':True}
 spec=importlib.util.spec_from_file_location('signed',root/'scripts/qa/prepare-signed-facility-domains.py');signed=importlib.util.module_from_spec(spec);spec.loader.exec_module(signed)
 spec=importlib.util.spec_from_file_location('complete',root/'scripts/qa/prepare-complete-source-node-domains.py');complete=importlib.util.module_from_spec(spec);spec.loader.exec_module(complete)
 rows={r['id'][:12]:r for r in union['rows']};line_cache={}
 def proof(ident,k):
  r=roads[ident];row=rows[ident[:12]]
  if row['id']not in line_cache:line_cache[row['id']]=signed.source_line(row,geo['origin'])
  line,metres=line_cache[row['id']];p=signed.project_fraction(r['pts'][k],line,metres)
  full=complete.connector(row,r['from']if k==0 else r['to'])if k in [0,len(r['pts'])-1]else None
  out={'road':ident,'control':k,'point':r['pts'][k],'sourceSegmentID':row['id'],'sourceGeometryWKB_SHA256':hashlib.sha256(bytes.fromhex(row['geometryWKB'])).hexdigest(),'sourceProjection':p,'fullConnector':full,'sourceRelativeLevels':row['level_rules'],'sourceFlags':row['road_flags'],'metricHeightInferred':False}
  if full:
   distance=full['at']*metres[-1];index=min(len(line)-2,max(0,bisect.bisect_right(metres,distance)-1));t=(distance-metres[index])/(metres[index+1]-metres[index]);point=[line[index][a]+t*(line[index+1][a]-line[index][a])for a in [0,1]]
   euclidean=math.dist(point,r['pts'][k]);arc=abs(p['officialSourceFraction']-full['at'])*metres[-1]
   out.update(officialConnectorPointOnFullWKB=point,actualEndpointEuclideanDistanceToOfficialConnectorM=euclidean,nearestProjectionSourceArcDistanceToOfficialConnectorM=arc,noEndpointMovePerformed=True,requiresFullUUIDGuidedBranchAndAllArmGeometryReview=p['ambiguousSourceBranch']or euclidean>.15 or arc>.15)
  return out
 replacements=[]
 for record in reports['signed346Anchors']['controls']:
  if record['status']=='compatible-intersection-only-no-union':continue
  key=(record['road'],record['control']);x=physical[key]
  why=[{'seed':p['node'],'reason':y['whyIncluded'],'blockingRows':y['directBlockingRows'],'remainingSourceRecoveryBudget':y['remainingSourceRecoveryBudget']}for p in c['components']for w in p['finiteRecoveryWindows']for y in w['controls']if(y['road'],y['index'])==key]
  replacements.append({'road':key[0],'control':key[1],'oldGeneratedBoundaryAnchor':record['existingScopeIntersection'],'requestedNegativeOnlyReplacementDomain':record['newConservativeIntersection'],'notSurveyedOrCanonicalOrFloor':True,'newCompleteUnderpassComponentSeeds':[v['seed']for v in new[key]],'sourceProof':proof(*key),'inputRibbonSHA256':x['inputRibbonSHA256'],'whyNeeded':why,'requiresExplicitSourceBackedReplacementPolicy':True,'replacementApplied':False})
 joint_replacements=[]
 for record in conflicts:
  key=(record['road'],record['control']);datum=record['namedFixedModeledDatum']
  joint_replacements.append({'road':key[0],'control':key[1],'oldSeparateSeedDomains':record['perSeed'],'oldConservativeIntersection':record['conservativeIntersection'],'sourceConnectedNamedModeledDatum':datum,'requiredSharedEndpointValue':datum,'proposedExplicitJointEnvelope':[min(v['bounds'][0]for v in record['perSeed']),max(v['bounds'][1]for v in record['perSeed'])],'why':'A shallow seed parameterization cannot redefine another exact full-source node. Replace the incompatible estimated per-seed domain for this joint component while preserving the named modeled datum and complete all-arm equality.','sourceProof':proof(*key),'inputRibbonSHA256':physical[key]['inputRibbonSHA256'],'modeledDatumNotSurveyedMetricAltitude':True,'noBlindUnion':True,'replacementApplied':False})
 for name,actual in [('generatedBoundaryReplacementRequests',replacements),('jointParameterizationReplacementRequests',joint_replacements)]:
  assert {(r['road'],r['control']):r for r in actual}=={(r['road'],r['control']):r for r in oldrep[name]}
 oldrows={r['id']:r for r in ref['rows']};newrows={r['id']:r for r in union['rows']};assert len(newrows)==len(union['rows'])and all(newrows.get(k)==v for k,v in oldrows.items())
 iv2={(r['road'],r['control']):(r['from'],r['to'])for r in interior['finiteControls']};iv3={(r['road'],r['control']):(r['from'],r['to'])for r in v3['finiteControls']};assert iv2==iv3 and len(iv3)==8744
 gates=[{'road':r['road'],'control':r['control']}for r in v3['finiteControls']if(r['road'],r['control'])in new and r['physicalStructureBaselineApprovalRequiredBeforeActivation']]
 roads[owners[0]['rawPhysical']['id']]=owners[0]['rawPhysical']
 newsource={'d88SourceAuxiliary':proof('d88b84ba-356_0',len(roads['d88b84ba-356_0']['pts'])-1),'newRetainedSourceUnion':{**held['sourceUnionV13'],'complete':union['complete'],'old10432RowsUnchanged':True,'notYetBoundIntoV34Or301Policy':True},'f2eeNewRawOwnerInventory':owners[0],'f2eeFullSourceEndpointProofs':[proof(owners[0]['rawPhysical']['id'],k)for k in [0,len(owners[0]['rawPhysical']['pts'])-1]],'rawNullHeightNotSurveyedZero':True,'requiresFreshConditionedJointRoadFootprintAndAllArmIncidence':True}
 ambiguity=[proof(ident,k)for ident,k in [('09c1bfe9-5f2_0',len(roads['09c1bfe9-5f2_0']['pts'])-1),('09c1bfe9-5f2_1',0)]]
 assert newsource==oldrep['newSourcePreparation'];assert ambiguity==oldrep['ambiguousEndpointGeometryReview']
 write(cli.overlap_output,overlap);held['freshOverlap']={'path':str(cli.overlap_output),'sha256':sha(cli.overlap_output)}
 replacement=base('negative-component-explicit-replacement-and-preparation-review-v2');replacement.update(inputs=copy.deepcopy(held),summary=copy.deepcopy(oldrep['summary']),generatedBoundaryReplacementRequests=replacements,jointParameterizationReplacementRequests=joint_replacements,interiorV3GateReview={'same8744EnumeratedControlsAndFromToBoundsAsD390V2':True,'additionalActivationGateControlsAmong75Overlaps':gates,'allOtherV3RenderingTerrainStructureConditionsRemainHard':True},newSourcePreparation=newsource,ambiguousEndpointGeometryReview=ambiguity,mandatoryNextPreparation=oldrep['mandatoryNextPreparation'],metricProvenance=oldrep['metricProvenance'],frontierNormalization=c['frontierNormalization'])
 replacement['freshRecomputation']={'allReplacementDomainsAndSourcePointProofsRecomputed':True,'sourceV13PreservationRecomputed':True,'allOldGeometryAndIndependentPolygonGatesStillOpen':True,'noPhysicalFitOrPreparationPerformed':True}
 assert len(replacements)==5 and len(joint_replacements)==5 and not gates and len(newrows)==10434 and len(oldrows)==10432
 write(cli.replacement_output,replacement);held['freshReplacement']={'path':str(cli.replacement_output),'sha256':sha(cli.replacement_output)}
 failed=bound('failedDiagnostic',c['inputs']['failed']);categories=collections.Counter();witnesses=0
 for result in failed['results']:
  for row in result['directConflictsWithOutsideExistingBounds']:
   keys=[(x['road'],x['control'])for x in row['controls']];assert len(keys)==len(set(keys))
   minimum=sum(x['coefficient']*x['diagnosticBounds'][0 if x['coefficient']>=0 else 1]for x in row['controls'])
   assert abs(minimum-row['minimumWithAllOriginalOutsideBounds'])<=1e-9 and minimum>row['bound']+1e-9
   categories[row['constraint']['category']]+=1;witnesses+=1
 assert witnesses==2580
 handoff=copy.deepcopy(oldhand);handoff['schema']='negative-source-component-research-handoff-receipt-v2';handoff['artifacts'].update(componentProposal=held['component'],scopeOverlap=held['freshOverlap'],replacementAndPreparationReview=held['freshReplacement'],componentProducer=c['inputs']['generator'],provenanceProducer=c['annotationGenerator'],componentReviewProducer=held['generator'],normalizationTests={'path':str(root/'tests/negative-source-components.test.py'),'sha256':sha(root/'tests/negative-source-components.test.py')})
 handoff['fixedArrayDiagnostic']['exactDirectWitnessRowsIndependentlyRecomputed']=witnesses;handoff['fixedArrayDiagnostic']['categories']=dict(categories)
 handoff['frontierNormalization']=c['frontierNormalization'];handoff['validation'].update(newBoundaryAdversarialTestsPassed=10,expandedProposalIndependentReviewPending=True,sourceRowsAndAllOverlapReplacementAndEndpointProofsFreshlyRecomputed=True)
 handoff['reproducibilityInputs']=copy.deepcopy(held)
 for value in held.values():assert sha(value['path'])==value['sha256']
 for value in handoff['artifacts'].values():assert sha(value['path'])==value['sha256']
 write(cli.handoff_output,handoff)
 print(json.dumps({'overlap':{'path':str(cli.overlap_output),'sha256':sha(cli.overlap_output)},'replacement':{'path':str(cli.replacement_output),'sha256':sha(cli.replacement_output)},'handoff':{'path':str(cli.handoff_output),'sha256':sha(cli.handoff_output)},'summary':replacement['summary']}))

def write(path,value):
 with Path(path).open('x')as f:json.dump(value,f,indent=2,allow_nan=False);f.write('\n')

if __name__=='__main__':main()
