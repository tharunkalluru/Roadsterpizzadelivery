"""Exact solver controls for joint historical surfaces, node equations and street grades.

These small synthetic controls do not approve world geometry or a release.
The matrix fixture is shared with the independent solver audit.
"""
import argparse
import ast
import collections
import contextlib
import hashlib
import io
import itertools
import json
import math
import time
from pathlib import Path
import numpy as np
from scipy.optimize import linprog
from scipy.sparse import coo_matrix

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repo',type=Path,default=Path(__file__).resolve().parents[2])
parser.add_argument('--report',type=Path)
args=parser.parse_args()
source_path=args.repo/'scripts/solve-road-profiles.py';source_bytes=source_path.read_bytes();tree=ast.parse(source_bytes)
fixture_path=args.repo/'scripts/qa/verify-road-solver-independent.py';fixture_bytes=fixture_path.read_bytes()
fixtures_path=args.repo/'tests/fixtures/solver-finite-source-components-independent.json';fixtures=json.loads(fixtures_path.read_text())['fixtures']
env=globals().copy();env.update(A='23427c8c-e37_0',B='bdf0bad3-182_0',C='constant-context')
for node in ast.parse(fixture_bytes).body:
 if isinstance(node,ast.FunctionDef)and node.name in['namespace','matrix_case','prepare_expressions','solve']:
  exec(compile(ast.Module(body=[node],type_ignores=[]),str(fixture_path),'exec'),env)
tests=0
case=env['namespace']();road_width={'w':6.,'lanes':1,'joinedPavement':{'physicalWidth':8.4,'originalWidth':8.4,'intervals':[[0.,100.]],'taper':1.}}
assert case['width'](road_width,50.)==8.4 and road_width['w']==6. and road_width['lanes']==1;tests+=1
road_width={'w':7.,'joinedPavement':{'originalWidth':9.4,'intervals':[[0.,100.]],'taper':30.}}
assert case['width'](road_width,50.)==7. and case['width'](road_width,130.)==9.4;tests+=1
joint_setup=next(node for node in tree.body if isinstance(node,ast.If)and ast.unparse(node.test)=='joint'and 'Mixed joint ordinary model' in ast.unparse(node))
context_binding=next(node for node in joint_setup.body if isinstance(node,ast.AugAssign)and isinstance(node.target,ast.Name)and node.target.id=='fixedTileIds')
case={'fixedTileIds':{'explicit-fixed'},'jointContextIds':{'nearby-context'},'varIds':{'core','nearby-context'}}
exec(compile(ast.Module(body=[context_binding],type_ignores=[]),str(source_path),'exec'),case)
exclusion=next(node for node in tree.body if isinstance(node,ast.AugAssign)and isinstance(node.target,ast.Name)and node.target.id=='varIds'and isinstance(node.op,ast.Sub))
exec(compile(ast.Module(body=[exclusion],type_ignores=[]),str(source_path),'exec'),case);assert case['varIds']=={'core'};tests+=1
family_expansion=next(node for node in tree.body if isinstance(node,ast.For)and ast.unparse(node.iter)=='list(varIds)'and 'fixedTileIds' in ast.unparse(node))
case={'varIds':{'core_0'},'fixedTileIds':{'context_0'},'allCurrent':{'core_0':{'name':'bridge'},'context_0':{'name':'bridge'}},'layers':{'core':[{'value':1}],'context':[{'value':1}]},'near':lambda *_:True}
exec(compile(ast.Module(body=[family_expansion],type_ignores=[]),str(source_path),'exec'),case);assert case['varIds']=={'core_0'};tests+=1
preparation_guard=next(node for node in tree.body if isinstance(node,ast.If)and ast.unparse(node.test)=="componentWindows.get('fixedPointPreparation')")
case={'componentWindows':{'fixedPointPreparation':{'inputs':{'model':'same'},'sameLayerTolerance':.008}},'initialInputSHA':{'model':'same','joint_tile_input':'new'},'args':argparse.Namespace(same_layer_tolerance=.008)}
try:exec(compile(ast.Module(body=[preparation_guard],type_ignores=[]),str(source_path),'exec'),case)
except AssertionError:pass
else:raise AssertionError('A core-only component cache must not authorize new joint input')
tests+=1
case['initialInputSHA']={'model':'same','component_windows':'cache'}
exec(compile(ast.Module(body=[preparation_guard],type_ignores=[]),str(source_path),'exec'),case);tests+=1
case=env['namespace']();a,b,c=env['A'],env['B'],env['C']
case.update(varIds={a,b},jointNonPrimaryCoreIds={b},automaticFamilyContextIds=set(),fixedPreparationCoreIds=set(),fixedTileIds=set(),componentWindows={'roads':{}},args=argparse.Namespace(component_windows=None),allCurrent={a:{'pts':[[0.,0.],[10.,0.]],'from':'selected-start','to':'selected-node'},b:{'pts':[[10.,0.],[1000.,0.]],'from':'selected-node','to':'far-node'},c:{'pts':[[1000.,0.],[1010.,0.]],'from':'far-node','to':'far-neighbour'}})
initializer=next(node for node in tree.body if isinstance(node,ast.If)and ast.unparse(node.test)=='args.component_windows is None')
exec(compile(ast.Module(body=[initializer],type_ignores=[]),str(source_path),'exec'),case)
assert case['componentWindows']['primaryRoads']==[a]and case['componentWindows']['roads'][b]['ranges']==[[0.,2.]]and c not in case['varIds'];tests+=1
joint_block=next(node for node in tree.body if isinstance(node,ast.If)and ast.unparse(node.test)=='joint'and 'Joint approach policy/source geometry mismatch' in ast.unparse(node))
tile_release=next(node for node in joint_block.body if isinstance(node,ast.For)and ast.unparse(node.iter)=='sorted(jointTileIds)')
core_release=next(node for node in joint_block.body if isinstance(node,ast.For)and 'proved_component_core_ids' in ast.unparse(node.iter))
def component_core_case():
 road='generated_0'
 return {'jointCoreIds':set(),'proved_component_core_ids':{road},'pjr_windows':{},'pjr_bridges':{},'roads':{road:{'pts':[[0.,0.],[50.,0.],[100.,0.]],'elev':[2.,1.,0.],'from':'outside-from','to':'outside-to'}},'arcs':{road:[0.,50.,100.]},'O':{road:0},'bounds':[(2.,2.),(1.,1.),(0.,0.)],'protected':set(),'underpassIds':set(),'canonicalRailControls':set(),'layers':{},'nodeTargets':{},'jointNodeRecords':{},'componentWindows':{'roads':{road:{'ranges':[[40.,60.]]}}},'changes':[],'jointEligibility':[]}
case=component_core_case();exec(compile(ast.Module(body=[core_release],type_ignores=[]),str(source_path),'exec'),case);assert case['bounds']==[(2.,2.),(0.,1.),(0.,0.)];tests+=1
case=component_core_case();case['layers']={'generated':[{'value':1}]};exec(compile(ast.Module(body=[core_release],type_ignores=[]),str(source_path),'exec'),case);assert case['bounds']==[(2.,2.),(1.,1.),(0.,0.)];tests+=1
case=component_core_case();case['canonicalRailControls']={1};exec(compile(ast.Module(body=[core_release],type_ignores=[]),str(source_path),'exec'),case);assert case['bounds'][1]==(1.,1.);tests+=1
case=component_core_case();case['arcs']['generated_0']=[0.,200.,400.];case['componentWindows']['roads']['generated_0']['ranges']=[[0.,2.]];exec(compile(ast.Module(body=[core_release],type_ignores=[]),str(source_path),'exec'),case);assert case['bounds'][1]==(1.,1.);tests+=1
road='498623cd-db1_0'
def tile_case():
 return {'jointTileIds':{road},'roads':{road:{'pts':[[0.,0.],[50.,0.]],'elev':None,'joinedPavement':{'originalWidth':4.5}}},'jointTileHeightEnvelopes':{road:(0.,2.)},'jointTileFacilityAuthority':{road:[]},'O':{road:0},'bounds':[(0.,0.),(0.,0.)],'protected':{road},'sourceProtectedIds':set(),'underpassIds':set(),'canonicalRailControls':set(),'apronPolicy':{},'jointEligibility':[],'jointNegativeTileIds':set()}
initial_bounds=next(node for node in tree.body if isinstance(node,ast.For)and isinstance(node.target,ast.Name)and node.target.id=='i'and isinstance(node.iter,ast.Name)and node.iter.id=='varIds'and 'maximumLowering' in ast.unparse(node))
case=tile_case();case.update(varIds=[road],primaryVariableIds={road},tileIds={road},protected=set(),flat=lambda _:True,componentWindows={'roads':{}},arcs={road:[0.,50.]},nodeTargets={'18b0835d-65f':{'target':1.9722803309924128,'maximumLowering':.018}},allSource={road:case['roads'][road]});case['roads'][road].update({'from':'18b0835d-65f','to':'other'})
exec(compile(ast.Module(body=[initial_bounds],type_ignores=[]),str(source_path),'exec'),case);assert case['bounds'][0]==(0.,0.);tests+=1
case['jointTileIds']=set()
try:exec(compile(ast.Module(body=[initial_bounds],type_ignores=[]),str(source_path),'exec'),case)
except AssertionError:pass
else:raise AssertionError('Core lowering policy must still reject a rise outside its authority')
tests+=1
case=tile_case();exec(compile(ast.Module(body=[tile_release],type_ignores=[]),str(source_path),'exec'),case);assert case['bounds']==[(0.,2.),(0.,2.)];tests+=1
case=tile_case();case['sourceProtectedIds']={road};exec(compile(ast.Module(body=[tile_release],type_ignores=[]),str(source_path),'exec'),case);assert case['bounds']==[(0.,0.),(0.,0.)];tests+=1
case=tile_case();case['canonicalRailControls']={0};exec(compile(ast.Module(body=[tile_release],type_ignores=[]),str(source_path),'exec'),case);assert case['bounds']==[(0.,0.),(0.,2.)];tests+=1
case=tile_case();case['apronPolicy']={'loweringOnlyRoads':[{'id':road}]};exec(compile(ast.Module(body=[tile_release],type_ignores=[]),str(source_path),'exec'),case);assert case['bounds']==[(0.,0.),(0.,0.)];tests+=1
case=env['matrix_case'](a_base=(0.,.8),a_bounds=[(0.,0.),(.8,1.)]);case['jointTileIds']={env['A']};case['args'].tile_max_grade=.065;case['args'].tile_deviation_weight=1000.
env['prepare_expressions'](case);result=env['solve'](case)
assert not result['success']and any(w['constraint']['category']=='centreline-grade'and w['constraint']['maximumGrade']==.065 for w in result['directConflicts'])
tests+=1
case=env['matrix_case'](a_base=(0.,.65),a_bounds=[(0.,0.),(.65,.7)]);case['jointTileIds']={env['A']};case['args'].tile_max_grade=.065;case['args'].tile_deviation_weight=1000.
env['prepare_expressions'](case);assert env['solve'](case)['success'];tests+=1
for context in[False,True]:
 case=env['matrix_case'](a_base=(3.,1.),a_bounds=[(3.,3.),(0.,4.)],b_base=(3.,3.));case['jointNodeCouplings']=[('source-node',(env['A'],1),(env['C']if context else env['B'],0))]
 env['prepare_expressions'](case);result=env['solve'](case);assert result['success'];road=next(r for r in result['roadData']if r['id']==env['A']);assert abs(road['elev'][-1]-3.)<1e-10;tests+=1
case=env['namespace']();road='actual-minor';triangle={'road':road,'tile':'0_0','arc':[0.,10.],'centre':[[0.,0.],[10.,0.]],'points':[[0.,.038,0.],[10.,1.038,0.],[0.,.038,10.]],'actualSurface':{'paintLift':.038}}
case.update(historicalActualGrid={road:{(0,0):[0]}},historicalActualTriangles={road:[triangle]},allOld={road:{'cls':'service'}},historicalReferenceUnresolved={})
assert abs(case['at'](road,(1.,1.))['minimum']-.1)<1e-12;tests+=1
assert case['at'](road,(9.,9.))is None;tests+=1
case['historicalActualTriangles'][road].append({**triangle,'points':[[x,y+1.,z]for x,y,z in triangle['points']]});case['historicalActualGrid'][road][(0,0)].append(1)
assert case['at'](road,(1.,1.))is None and len(case['historicalReferenceUnresolved'])==1;tests+=1
# Literal cap film can differ from its owner class; cap/clipped-strip flags
# supply no film authority. A missing surface value must fail closed.
case['historicalActualTriangles'][road]=[{**triangle,'actualSurface':{}}];case['historicalActualGrid'][road][(0,0)]=[0]
assert case['at'](road,(1.,1.))is None;tests+=1
cap={**triangle,'points':[[x,y+.024,z]for x,y,z in triangle['points']],'actualSurface':{'paintLift':.062},'cap':True}
case['historicalActualTriangles'][road]=[triangle,cap];case['historicalActualGrid'][road][(0,0)]=[0,1]
reference=case['at'](road,(1.,1.));assert abs(reference['minimum']-.1)<1e-12 and abs(reference['maximum']-.1)<1e-12;tests+=1
# An inherited own junction step is an envelope only for the exact same
# all-arm source proof, literal triangle, film and legacy source branch.
cap={**triangle,'points':[[x,y+.144,z]for x,y,z in triangle['points']],'actualSurface':{'paintLift':.062},'cap':True}
case['historicalActualTriangles'][road]=[triangle,cap]
bindings={}
for surface in[triangle,cap]:
 bindings[case['historical_surface_key'](surface)]=[{'node':'verified-node','paintLift':surface['actualSurface']['paintLift'],'branches':[{'arc':surface['arc'],'centre':surface['centre']}]}]
case['historicalOwnSeamBindings']=bindings;reference=case['at'](road,(1.,1.))
assert abs(reference['minimum']-.1)<1e-12 and abs(reference['maximum']-.22)<1e-12 and reference['sourceNodes']==['verified-node']and len(reference['surfaces'])==2;tests+=1
bindings[case['historical_surface_key'](cap)][0]['node']='different-node'
assert case['at'](road,(1.,1.))is None;tests+=1
bindings[case['historical_surface_key'](cap)][0]['node']='verified-node';bindings[case['historical_surface_key'](cap)][0]['paintLift']=.061
assert case['at'](road,(1.,1.))is None;tests+=1
bindings[case['historical_surface_key'](cap)][0]['paintLift']=.062;bindings[case['historical_surface_key'](cap)][0]['branches']=[{'arc':[100.,110.],'centre':triangle['centre']}]
assert case['at'](road,(1.,1.))is None;tests+=1
gap=case['historical_signed_gap'];upper={'minimum':5.9,'maximum':6.2};lower={'minimum':0.,'maximum':.1}
assert abs(gap(upper,lower)-5.8)<1e-12 and abs(gap(lower,upper)+5.8)<1e-12;tests+=1
assert gap({'minimum':0.,'maximum':.15},{'minimum':.1,'maximum':.2})==0.;tests+=1
assert gap((6.,None,None),(0.,None,None))==6.;tests+=1
# Duplicate actual source quads may share one literal Float32 triangle.
# Every binding is sampled; equivalent flat heights need no layer decision.
case=env['namespace']();case.update(historicalActualGrid={road:{(0,0):[0]}},historicalActualTriangles={road:[triangle]},historicalReferenceUnresolved={})
first=triangle['actualSurface'];triangle['actualSurfaceBindings']=[first,{**first,'structuralQuad':[[0.,0.,0.],[1.,0.,0.],[0.,0.,1.],[0.,0.,1.]]}]
reference=case['at'](road,(1.,1.));assert reference['minimum']==reference['maximum']and len(reference['structuralValues'])==2;tests+=1
triangle['actualSurfaceBindings'][1]={**first,'paintLift':.2}
assert case['at'](road,(1.,1.))is None;tests+=1
# Only an independently observed, fully source-connected negative owner may
# inherit a canonical facility approach. A nearby negative road is insufficient.
case=env['namespace']();canonical={'id':'canonical','pts':[[0.,0.],[10.,0.]],'elev':[-6.5,-.725]}
joint={'sourceRoadGeometryGeneration':'source-generation','requestedRoadIDs':['owner'],'coreAnchorNodes':[{'node':'node','sourceConnectionVerifiedForEveryArm':True,'fullConnectorAliases':['full-node-uuid'],'coreArms':[{'id':'canonical','end':'to'}],'tileArms':[{'id':'owner','end':'from'}]}]}
proof={'sourceRoadGeometryGeneration':'source-generation','results':[{'node':'node','classification':'actual-emitted-support-seam','finiteOverlaps':[],'negativeSeams':[{'id':'owner','end':'from','category':'protected-real-underpass','coreHeight':-.725,'graphAnchorCompatible':True,'coreLevelAmbiguous':False}]}]}
inherit=case['verified_negative_owner_connections'];current={'canonical':canonical}
assert inherit(joint,proof,current)[0]['height']==-.725 and canonical['elev']==[-6.5,-.725];tests+=1
for invalid in['different-canonical','different-generation','unverified-source','unresolved-no-overlap']:
 import copy
 jj,pp,cc=copy.deepcopy(joint),copy.deepcopy(proof),copy.deepcopy(current)
 if invalid=='different-canonical':cc['canonical']['elev'][-1]=-.8
 elif invalid=='different-generation':pp['sourceRoadGeometryGeneration']='other'
 elif invalid=='unverified-source':jj['coreAnchorNodes'][0]['sourceConnectionVerifiedForEveryArm']=False
 else:pp['results'][0]['classification']='unresolved'
 try:inherit(jj,pp,cc)
 except AssertionError:pass
 else:raise AssertionError('Connected facility inheritance must fail closed:'+invalid)
 tests+=1
proof['results'][0]['classification']='unresolved';proof['results'][0]['finiteOverlaps']=[{'roads':['owner','canonical'],'area':.1}]
assert inherit(joint,proof,current)[0]['height']==-.725;tests+=1
# The conditional facility comfort coefficient is local, source-bound and
# cannot touch a protected control or become a global curvature relaxation.
case=env['namespace']();case.update(args=argparse.Namespace(grade_change_per_metre=.00625),arcs={'facility':[0.,1.,2.,3.]},generatedFacilityPolicies={'facility':{'generatedControlIndices':[1],'curvatureIntervals':[[.9,1.1]],'maximumGradeChangePerMetre':.0149969}})
assert case['road_grade_change_limit']('facility',1)==.0149969;tests+=1
assert case['road_grade_change_limit']('facility',2)==.00625 and case['road_grade_change_limit']('other',1)==.00625;tests+=1
case['generatedFacilityPolicies']['facility']['generatedControlIndices']=[]
assert case['road_grade_change_limit']('facility',1)==.00625;tests+=1
policy_release=next(node for node in tree.body if isinstance(node,ast.For)and ast.unparse(node.iter)=='generatedFacilityPolicies.items()')
def generated_facility_case():
 road='facility';yy=[0.]+[-6.5]*8+[-4.,-2.,0.];pp={'inputControlCount':12,'inputHeights':yy[:],'protectedControlIndices':[0,1,2,3,4,5,6,7,8,11],'generatedControlIndices':[9,10],'existingHeightEnvelope':[-6.5,0.],'maximumGradeChangePerMetre':.0149969}
 return {'generatedFacilityPolicies':{road:pp},'roads':{road:{'pts':[[float(k),0.]for k in range(12)],'elev':yy}},'O':{road:0},'underpassIds':{road},'allSourceLegacy':{road:{'elev':None}},'canonicalRailControls':set(range(1,9)),'bounds':[(h,h)for h in yy],'args':argparse.Namespace(grade_change_per_metre=.00625),'changes':[],'initialInputSHA':{'generated_facility_policy':'bound-policy'}}
case=generated_facility_case();exec(compile(ast.Module(body=[policy_release],type_ignores=[]),str(source_path),'exec'),case)
assert case['bounds'][9:11]==[(-6.5,0.),(-6.5,0.)]and all(case['bounds'][k]==(case['roads']['facility']['elev'][k],)*2 for k in[0,1,2,3,4,5,6,7,8,11]);tests+=1
for invalid in['canonical-control','surveyed','raw-height-authority','coefficient']:
 case=generated_facility_case()
 if invalid=='canonical-control':case['canonicalRailControls'].add(9)
 elif invalid=='surveyed':case['roads']['facility']['elevationSource']='surveyed'
 elif invalid=='raw-height-authority':case['allSourceLegacy']['facility']['elev']=[0.]*12
 else:case['generatedFacilityPolicies']['facility']['maximumGradeChangePerMetre']=.02
 try:exec(compile(ast.Module(body=[policy_release],type_ignores=[]),str(source_path),'exec'),case)
 except AssertionError:pass
 else:raise AssertionError('Generated facility policy must preserve hard authority:'+invalid)
 tests+=1
# Restoring a positive bridge placeholder never releases another near-rail
# street. Both source order and the exact facility/rail identity are required.
case=env['namespace']();case.update(positiveFacilityPolicy={'roadOverRail':6.8,'positiveBridge':{'road':'bridge','canonicalRailIDs':['rail'],'retainedSource':{'id':'full-source'}},'connectedBridgeOwner':{'road':'owner','node':'node','canonicalRailIDs':['rail'],'canonicalCoreArms':['canonical'],'fullConnectorAliases':['full-node'],'maximumModelArcFromNode':30.}},roads={'bridge':{'pts':[[0.,0.],[10.,0.]],'elev':[0.,0.]},'owner':{'pts':[[0.,0.],[10.,0.]],'elev':[0.,0.],'from':'node','to':'far'},'canonical':{'pts':[[0.,0.],[10.,0.]],'elev':[6.8,6.8],'from':'node','to':'other'}},arcs={'bridge':[0.,10.],'owner':[0.,10.],'canonical':[0.,10.]},rawBy={'bridge':{'id':'full-source'}},underpassIds={'unrelated'},declared_bridge_at_control=lambda road,index:road in['bridge','canonical'],jointNodeRecords={'node':{'sourceConnectionVerifiedForEveryArm':True,'fullConnectorAliases':['full-node']}})
assert case['positive_placeholder_height']('unrelated',0,{'rail'})is None;tests+=1
assert case['positive_placeholder_height']('bridge',0,{'other-rail'})is None and case['positive_placeholder_height']('bridge',0,{'rail'})==6.8;tests+=1
assert case['positive_placeholder_height']('owner',1,{'rail'})==6.8;tests+=1
case['declared_bridge_at_control']=lambda *_:False
assert case['positive_placeholder_height']('bridge',0,{'rail'})is None;tests+=1
case['declared_bridge_at_control']=lambda *_:True;case['underpassIds'].add('bridge')
try:case['positive_placeholder_height']('bridge',0,{'rail'})
except AssertionError:pass
else:raise AssertionError('Positive inheritance must not overwrite a verified underpass')
tests+=1
# An exact local crosslink clip excludes positive-source interiors even when
# endpoints on either side are unannotated.
case=env['namespace']();case.update(officialFractionAtControls={'road':[0.,1.]},arcs={'road':[0.,100.]},layers={'road':[{'value':1,'between':[.4,.6]}]},level=lambda road,s:1 if .4-1e-6<=s/100<=.6+1e-6 else 0)
spans=case['local_source_level_progress_intervals']('road',0,0)
assert len(spans)==2 and abs(spans[0][1]-.399999)<1e-10 and abs(spans[1][0]-.600001)<1e-10;tests+=1
assert source_path.read_bytes()==source_bytes and fixture_path.read_bytes()==fixture_bytes
report={'success':True,'tests':tests,'solverSHA256':hashlib.sha256(source_bytes).hexdigest(),'sharedIndependentFixtureSHA256':hashlib.sha256(fixture_bytes).hexdigest(),'scope':'Exact-function joint controls: separate6.5% detailed grade under10% core fallback, variable/fixed all-arm node equations, literal historical surface film and ambiguity/coverage failures. No city or vehicle acceptance.'}
if args.report:
 with args.report.open('x')as output:json.dump(report,output,indent=2);output.write('\n')
print(json.dumps(report))
