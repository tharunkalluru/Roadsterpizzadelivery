"""Adversarial scope and binding checks for an inactive source-frame rebase."""
import copy
import importlib.util
import struct
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('railway_research_rebase',ROOT/'scripts/qa/rebase-unchanged-railway-research-evidence.py')
M=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(M)


class RailwayResearchRebase(unittest.TestCase):
 def fixture(self):
  roadid='aaaaaaaa-aaa_0';full='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  road={'id':roadid,'from':'n1','to':'n2','pts':[[-10.,0.],[10.,0.]],'elev':[0.,0.],'w':6.,'lanes':2,'legacy':{'preserve':True}}
  added=sorted(M.NEW_SOURCE_IDS);others=[dict(road,id=k,pts=[[100.+i*10.,100.],[101.+i*10.,100.]])for i,k in enumerate(added)if k.startswith('09c1')]
  profiles=[{'id':'w1','pts':[[0.,-10.],[0.,10.]],'elev':[0.,0.],'bridge':True},{'id':'w2','pts':[[20.,-10.],[20.,10.]],'elev':[0.,0.],'bridge':False}]
  origin={'lat':0.,'lon':0.,'NR':1.,'MR':1.}
  os={'origin':origin,'sourceCorePackSHA256':'core','generationID':'oldgen','release':'release','roads':[{'id':roadid,'retained':True}],'sources':[{'id':full,'retained':True}],'nodes':{}}
  ns=copy.deepcopy(os);ns['generationID']='newgen'
  for i,k in enumerate(added):ns['roads'].append({'id':k,'pts':[[100.+i*10.,100.],[101.+i*10.,100.]],'expected':{'w':1.},'copies':[{'kind':'core'if k.startswith('09c1')else'tile'}]})
  old={'roads':[road]+others,'profiles':profiles,'report':{'unchanged':True},'sourceRoadGeometryGeneration':'oldgen','sourceGeometryReference':{'sha256':'oldsource','generationID':'oldgen'},'preconditioningReference':{'sha256':'oldpre'}}
  new=copy.deepcopy(old);new.update(sourceRoadGeometryGeneration='newgen',sourceGeometryReference={'sha256':'newsource','generationID':'newgen'},preconditioningReference={'sha256':'newpre'})
  for r in new['roads'][1:]:r['pts'][1][0]+=.01
  fp=[{'id':r['id'],'L':[[p[0],p[1]-3.]for p in r['pts']],'R':[[p[0],p[1]+3.]for p in r['pts']]}for r in old['roads']]
  raw={key:None for key in M.SOURCE_FIELDS};raw.update(id=full,geometryWKB=(struct.pack('<BI',1,2)+struct.pack('<I',2)+struct.pack('<dddd',-10.,0.,10.,0.)).hex(),connectors=[{'connector_id':'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','at':0.}])
  proof={'fullSourceRoadID':full,'officialSourceFraction':.5,'activeRoadLevel':0,'activeRoadFlags':[],'sourceModelIntersectionDifferenceM':0.,'sourceRelativeRailLayer':1,'noPositiveRoadStructureElsewhereOnThisSource':True,'radiusScope':'exact retained beam'}
  entry={'name':'retained','roads':[roadid],'rails':['w1'],'anchor':[0.,0.],'radius':2.,'source':'retained-source','proof':proof}
  proposal={'version':1,'releaseApproved':False,'sourceModelSHA256':'oldmodel','sourceReferenceSHA256':'oldreference','sourceCrossingAuditSHA256':'audit','proposedEntries':[entry],'annotatedRoadsRequiringAdditionalFiniteExtentReview':[{'road':'excluded'}]}
  tags={'bridge':'yes','railway':'rail','layer':'1'}
  crossing={'road':roadid,'rail':'w1','roadSegment':0,'railSegment':0,'officialSourceFraction':.5,'nearestOriginalCrossingDifferenceM':0.,'classification':'research-confirmed-road-below-source-rail-bridge-needs-model-review','localSourceLevel':0,'localSourceFlags':[],'point':[0.,0.]}
  audit={'inputs':{k:{'sha256':v}for k,v in [('model','oldmodel'),('source-data','oldsource'),('source-reference','oldreference'),('current-rail-source','railsource')]},'crossings':[crossing],'railways':[{'rail':'w1','sourceGeometryMatches':True,'currentSourceMatchesRetainedBridge':True,'tags':tags}]}
  data={'proposal':proposal,'old_model':old,'new_model':new,'old_source':os,'new_source':ns,'old_pre':{'sourceRoadGeometryGeneration':'oldgen','sourceGeometryReference':old['sourceGeometryReference'],'profiles':profiles},'new_pre':{'sourceRoadGeometryGeneration':'newgen','sourceGeometryReference':new['sourceGeometryReference'],'profiles':copy.deepcopy(profiles)},'old_footprints':{'sourceModelSHA256':'oldmodel','roads':fp},'new_footprints':{'sourceModelSHA256':'newmodel','roads':copy.deepcopy(fp)},'old_reference':{'complete':True,'release':'release','rows':[raw]},'new_reference':{'complete':True,'release':'release','rows':[copy.deepcopy(raw)]},'crossing_audit':audit,'rail_source':{'ways':[{'id':1,'nodes':[1,2],'tags':tags}],'nodes':[{'id':1,'lon':0,'lat':-10},{'id':2,'lon':0,'lat':10}]}}
  binding={k:{'path':k,'sha256':v}for k,v in [('proposal','pinned'),('old_model','oldmodel'),('new_model','newmodel'),('old_source','oldsource'),('new_source','newsource'),('old_pre','oldpre'),('new_pre','newpre'),('old_footprints','oldfp'),('new_footprints','newfp'),('old_reference','oldreference'),('new_reference','newreference'),('crossing_audit','audit'),('rail_source','railsource'),('raw_core','core')]}
  return data,binding

 def prepare(self,mutate=None):
  d,b=self.fixture()
  if mutate:mutate(d,b)
  with patch.object(M,'PARENT_PROPOSAL_SHA','pinned'),patch.object(M,'NEW_SOURCE_SHA','newsource'),patch.object(M,'NEW_SOURCE_GENERATION','newgen'),patch.object(M,'EXPECTED_COUNTS',(1,1,2)):
   return M.build_proof(d,b)

 def test_rebase_preserves_full_entries_exclusions_and_declared_scope(self):
  out,proof=self.prepare();original,_=self.fixture()
  self.assertEqual(out['proposedEntries'],original['proposal']['proposedEntries'])
  self.assertEqual(out['annotatedRoadsRequiringAdditionalFiniteExtentReview'],original['proposal']['annotatedRoadsRequiringAdditionalFiniteExtentReview'])
  self.assertEqual(out['sourceModelSHA256'],'newmodel');self.assertEqual(out['sourceReferenceSHA256'],'newreference')
  self.assertEqual(out['sourceCrossingAuditSHA256'],'audit')
  self.assertFalse(proof['heightEnvelopeChanged']);self.assertFalse(proof['heightAuthorityGranted']);self.assertFalse(proof['runtimeActivated'])

 def test_every_full_road_field_and_signed_zero_are_protected(self):
  for key,value in [('w',7.),('lanes',3),('elev',[-0.,0.]),('legacy',{'preserve':False})]:
   with self.subTest(field=key),self.assertRaisesRegex(ValueError,'outside new source families|Full facility road'):
    self.prepare(lambda d,b:d['new_model']['roads'][0].update({key:value}))

 def test_finite_ribbon_all_rails_and_source_origin_are_protected(self):
  mutations=[lambda d,b:d['new_footprints']['roads'][0]['R'][0].__setitem__(0,.01),lambda d,b:d['new_model']['profiles'][1]['elev'].__setitem__(0,.01),lambda d,b:d['new_source']['origin'].update(lon=.01)]
  for mutate in mutations:
   with self.assertRaises(ValueError):self.prepare(mutate)

 def test_stale_model_source_pre_footprint_and_audit_bindings_fail_closed(self):
  mutations=[lambda d,b:d['proposal'].update(sourceModelSHA256='wrong'),lambda d,b:d['new_model']['sourceGeometryReference'].update(sha256='wrong'),lambda d,b:d['new_model']['sourceGeometryReference'].update(generationID='wrong'),lambda d,b:d['new_model']['preconditioningReference'].update(sha256='wrong'),lambda d,b:d['new_footprints'].update(sourceModelSHA256='wrong'),lambda d,b:d['crossing_audit']['inputs']['current-rail-source'].update(sha256='wrong'),lambda d,b:b['new_source'].update(sha256='unreviewed')]
  for mutate in mutations:
   with self.assertRaises(ValueError):self.prepare(mutate)

 def test_full_raw_source_fields_cannot_be_omitted_or_reinterpreted(self):
  for mutate in [lambda d,b:d['new_reference']['rows'][0].pop('road_flags'),lambda d,b:d['new_reference']['rows'][0].update(road_flags=[]),lambda d,b:d['new_reference']['rows'][0].update(geometryWKB='0000')]:
   with self.assertRaisesRegex(ValueError,'raw source row changed'):
    self.prepare(mutate)

 def test_changed_or_missing_existing_source_geometry_and_nodes_are_rejected(self):
  for mutate in [lambda d,b:d['new_source']['roads'][0].update(retained=False),lambda d,b:d['new_source']['sources'].clear(),lambda d,b:d['new_model']['roads'].pop()]:
   with self.assertRaises(ValueError):self.prepare(mutate)

 def test_new_piece_entering_finite_facility_radius_never_rebases(self):
  with self.assertRaisesRegex(ValueError,'may enter a retained facility envelope'):
   self.prepare(lambda d,b:d['new_source']['roads'][1].update(pts=[[-1.,0.],[1.,0.]]))

 def test_duplicate_source_or_road_inventory_is_rejected(self):
  for mutate in [lambda d,b:d['new_model']['roads'].append(copy.deepcopy(d['new_model']['roads'][0])),lambda d,b:d['new_reference']['rows'].append(copy.deepcopy(d['new_reference']['rows'][0]))]:
   with self.assertRaisesRegex(ValueError,'duplicate'):
    self.prepare(mutate)

 def test_wrong_rail_identity_order_or_missing_raw_node_is_rejected(self):
  for mutate in [lambda d,b:d['rail_source']['ways'][0]['tags'].update(layer='0'),lambda d,b:d['rail_source']['nodes'].pop(),lambda d,b:d['new_model']['profiles'].reverse()]:
   with self.assertRaises(ValueError):self.prepare(mutate)

 def test_missing_ambiguous_or_uncontained_crossing_evidence_is_rejected(self):
  for mutate in [lambda d,b:d['crossing_audit']['crossings'].clear(),lambda d,b:d['crossing_audit']['crossings'].append(copy.deepcopy(d['crossing_audit']['crossings'][0])),lambda d,b:d['proposal']['proposedEntries'][0].update(anchor=[50.,50.])]:
   with self.assertRaises(ValueError):self.prepare(mutate)

 def test_geometry_primitives_respect_finite_segments_and_degeneracies(self):
  self.assertIsNone(M.intersect([0,0],[1,0],[2,-1],[2,1]))
  self.assertIsNone(M.intersect([0,0],[1,0],[0,1],[1,1]))
  self.assertEqual(M.intersect([0,0],[1,0],[.5,-1],[.5,1])[2],[.5,0.])
  self.assertEqual(M.distance([3,4],[0,0],[0,0]),5.)

 def test_shared_rail_vertex_retains_both_distinct_literal_cells(self):
  def vertex(d,b):
   other=copy.deepcopy(d['crossing_audit']['crossings'][0]);other['railSegment']=1
   d['crossing_audit']['crossings'].append(other)
  result,proof=self.prepare(vertex)
  self.assertEqual(len(proof['entries'][0]['retainedCrossingCells']),2)
  self.assertEqual(result['proposedEntries'][0]['radius'],2.)
  def ambiguous(d,b):
   vertex(d,b);d['crossing_audit']['crossings'][1]['point']=[.001,0.]
  with self.assertRaisesRegex(ValueError,'Ambiguous retained physical crossing'):
   self.prepare(ambiguous)

 def test_fraction_replay_uses_physical_error_and_never_accepts_a_geometry_shift(self):
  self.assertLess(M.source_replay_error(.5+1e-12,.5,100.,.04,.04),1e-7)
  for values in [(.5+1e-8,.5,100.,.04,.04),(.5,.5,100.,.040001,.04),(.5,.5,0.,.04,.04),(.5,float('nan'),100.,.04,.04)]:
   with self.subTest(values=values),self.assertRaises(ValueError):M.source_replay_error(*values)

if __name__=='__main__':unittest.main()
