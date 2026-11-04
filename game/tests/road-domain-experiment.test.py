"""Adversarial semantic guards for the local diagnostic domain adapter."""
import argparse
import copy
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('domain_experiment', ROOT / 'scripts/qa/prepare-road-domain-experiment.py')
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


def fixture():
    profiles = {'P': [0.,2.,4.,2.,0.], 'Q': [0.,0.,0.,0.,0.],
                'N': [0.,-1.,-3.,-6.,-3.,-1.,0.], 'A': [0.,-1.,-2.,-3.,-2.,-1.,0.]}
    roads = {r: {'id':r, 'pts':[[float(k),0.] for k in range(len(yy))], 'elev':yy,
                 'from':r+'-from', 'to':r+'-to', 'expressway':r == 'P'} for r,yy in profiles.items()}
    offsets = {}; bounds = []; base = []
    for road, yy in profiles.items():
        offsets[road] = len(bounds); bounds += [(h,h) for h in yy]; base += yy
    bounds[offsets['P']+1] = (0.,1.)
    bounds[offsets['P']+2] = (7.,7.)  # Inherited canonical value differs from base Y.
    bounds[offsets['P']+3] = (0.,8.)  # Already broader than the source ceiling.
    for k in [1,2,3,4,5]: bounds[offsets['A']+k] = (-6.,0.)
    canonical = {offsets['P']+2, offsets['N']+2}
    footprints = {r:{'id':r, 'L':e['pts'], 'R':e['pts']} for r,e in roads.items()}
    state = {'args':argparse.Namespace(physical_max_grade=.0995, grade_change_per_metre=.00625, same_layer_tolerance=.008),
             'N':len(bounds), 'O':offsets, 'varIds':list(roads), 'roads':roads, 'bounds':bounds, 'base':base,
             'arcs':{r:list(map(float,range(len(yy)))) for r,yy in profiles.items()},
             'canonicalRailControls':canonical, 'underpassIds':{'N'}, 'protected':{'N','P'},
             'footprints':footprints, 'stage':{'roads':[{'id':r} for r in roads]},
             'head_expressions':[([(1,1.),(11,-1.)],-5.85,{'category':'independent-finite-headroom'})],
             'coupling_expressions':[([(1,1.),(11,-1.)],.008,.008,{'category':'finite-apron-coelevation'})],
             'jointNodeCouplings':[('node',('P',0),('Q',0))], 'variableNodeRows':[],
             'generatedFacilityPolicies':{'A':{'maximumGradeChangePerMetre':.015, 'curvatureIntervals':[[1.,5.]]}}}
    solver = b'held source only; never execute this annotation'
    inputs = {'model':'M','footprints':'F','joint_tile_input':'J','additional_source_reference':'R','generated_node_datum_policy':'D'}
    ctx = {'version':1, 'releaseApproved':False, 'scope':'parent', 'solverSource':solver,
           'solverSHA256':M.sha(solver), 'inputs':inputs, 'state':state, 'noRiseRoads':[]}
    pos = {'schema':'positive-finite-join-parameter-domain-candidate-v1', 'researchOnly':True,
           'releaseApproved':False, 'activeProductionConsumer':False,
           'inputs':{pk:{'sha256':inputs[ck]} for ck,pk in [('model','newModel'),('footprints','newFootprints'),
                      ('joint_tile_input','newJoint'),('additional_source_reference','newReference'),('generated_node_datum_policy','newNodePolicy')]},
           'results':[{'roads':['P','Q'], 'domains':{'P':[0.,4.],'Q':[0.,0.]}, 'existingHeightCeiling':7.,
                       'finiteJoinSamples':1, 'sharedSourceEndpointEqualityExact':True, 'endpointBoundsChanged':False,
                       'canonicalBoundsChanged':False, 'maximumGrade':.075, 'maximumTriangleGrade':.0995,
                       'gradeChangePerMetre':.00625, 'sameSurfaceTolerance':.008}]}
    pos['inputs']['solver'] = {'sha256':ctx['solverSHA256']}
    pa = {'schema':'positive-finite-domain-current-bound-audit-v1','readOnly':True,'releaseApproved':False,
          'solverSHA256':ctx['solverSHA256'], 'summary':{'candidateCanonicalMaskAndValuesExactlyEqual':True,'candidateCeilingsStillExact':True},
          'canonicalErrors':[], 'ceilingErrors':[], 'absentVariableRoads':[],
          'additionalBoundsNeeded':[{'road':'P','control':1,'modelArc':1.,'inputHeight':2.,
                                    'target':[0.,7.],'actualBounds':[0.,1.],'protectedRoad':True,'expressway':True}]}
    signed = {'version':1,'schema':'signed-facility-parameter-domain-candidate-v1', 'releaseApproved':False,
              'heightAuthorityGranted':False,'activePolicy':False,
              'inputs':{sk:{'sha256':inputs[ck]} for ck,sk in [('model','model'),('footprints','footprints'),
                         ('joint_tile_input','joint'),('additional_source_reference','source-reference')]}, 'roads':[]}
    signed['inputs']['solver'] = {'sha256':ctx['solverSHA256']}
    for road, candidates in [('N',[[1],[4,5]]),('A',[[2,3,4]])]:
        yy = profiles[road]; free = {k for run in candidates for k in run}; fixed = []
        for k,h in enumerate(yy):
            if k in free: continue
            reasons = []
            if offsets[road]+k in canonical: reasons.append('canonical-literal-rail-corridor')
            if road == 'N' and k == 3: reasons.append('actual-facility-floor')
            fixed.append({'index':k,'height':h,'reasons':reasons})
        domains = []
        for run in candidates:
            anchors = [run[0]-1,run[-1]+1]; envelope = yy[anchors[0]:anchors[1]+1]
            domains.append({'controlIndices':run,'fixedAnchorIndices':anchors,
                            'candidateHeightBounds':[min(envelope),min(0.,max(envelope))],
                            'existingLocalInputHeights':envelope})
        signed['roads'].append({'id':road,'inputRoadSHA256':M.canonical_sha(roads[road]),
                               'inputFootprintSHA256':M.canonical_sha(footprints[road]),'inputHeights':list(yy),
                               'railFloorOwner':road == 'N','roadFloorOwner':False,
                               'fixedControls':fixed,'candidateRecoveryDomains':domains})
    sa = {'releaseApproved':False,'context':{'solverSHA256':ctx['solverSHA256']},
          'canonicalParity':{'exactCandidateMaskAndValuesEqualActual':True,'actualBoundsNotExactInputY':[]},
          'floors':{'actualBoundsNotExactInputY':[]},'inputBindings':{'postAuditBindingMismatches':[]},
          'candidateInteriors':{'deltas':[]}}
    for row in signed['roads']:
        for domain in row['candidateRecoveryDomains']:
            for k in domain['controlIndices']:
                sa['candidateInteriors']['deltas'].append({'road':row['id'],'control':k,'inputHeight':profiles[row['id']][k],
                                                          'from':bounds[offsets[row['id']]+k], 'to':domain['candidateHeightBounds']})
    return ctx,pos,pa,signed,sa


class DomainExperimentBoundaries(unittest.TestCase):
    def test_legal_expansions_retain_canonical_floor_endpoints_current_max_and_old_policy(self):
        data = fixture(); original = copy.deepcopy(data[0])
        before_hashes = {k:M.frozen_sha(v) for k,v in data[0]['state'].items() if k != 'bounds'}
        out,report = M.build_experiment(*data)
        s = out['state']; old = original['state']; offsets = s['O']
        self.assertEqual(s['bounds'][offsets['P']+1],(0.,7.))
        self.assertEqual(s['bounds'][offsets['P']+2],(7.,7.))
        self.assertEqual(s['bounds'][offsets['P']+3],(0.,8.))
        self.assertEqual(s['bounds'][offsets['N']+3],(-6.,-6.))
        self.assertEqual(s['bounds'][offsets['N']+1],(-3.,0.))
        self.assertEqual(s['bounds'][offsets['A']:],old['bounds'][offsets['A']:])
        self.assertEqual(report['summary']['signedContainedControlsKeptExact'],3)
        self.assertEqual(report['summary']['preexistingVariableSignedFixedAnnotationsKeptExact'],2)
        self.assertEqual(data[0],original)
        for key in old:
            if key != 'bounds': self.assertEqual(M.frozen_sha(s[key]),before_hashes[key])
        self.assertEqual(report['deltas'][0]['hypotheticalOverrides'],['protected-owner','expressway'])
        self.assertFalse(out['heightAuthorityGranted']); self.assertFalse(out['releaseApproved'])

    def test_canonical_gap_forgery_rejected(self):
        data = fixture(); data[0]['state']['canonicalRailControls'].add(data[0]['state']['O']['P']+1)
        with self.assertRaises(ValueError): M.build_experiment(*data)

    def test_floor_release_forgery_rejected(self):
        data = fixture(); row = data[3]['roads'][0]
        row['fixedControls'] = [r for r in row['fixedControls'] if r['index'] != 3]
        row['candidateRecoveryDomains'][1]['controlIndices'] = [3,4,5]
        with self.assertRaisesRegex(ValueError,'floor mask'): M.build_experiment(*data)

    def test_endpoint_forgery_rejected(self):
        data = fixture(); data[2]['additionalBoundsNeeded'][0]['control'] = 0
        with self.assertRaises(ValueError): M.build_experiment(*data)

    def test_positive_out_of_window_or_missing_audit_control_rejected(self):
        data = fixture(); data[1]['results'][0]['domains']['P'] = [2.,4.]
        with self.assertRaises(ValueError): M.build_experiment(*data)
        data = fixture(); data[2]['additionalBoundsNeeded'] = []
        with self.assertRaisesRegex(ValueError,'omits'): M.build_experiment(*data)

    def test_signed_out_of_envelope_and_noncontiguous_controls_rejected(self):
        data = fixture(); data[3]['roads'][0]['candidateRecoveryDomains'][0]['candidateHeightBounds'] = [-40.,0.]
        with self.assertRaisesRegex(ValueError,'envelope'): M.build_experiment(*data)
        data = fixture(); data[3]['roads'][0]['candidateRecoveryDomains'][1]['controlIndices'] = [4,6]
        with self.assertRaises(ValueError): M.build_experiment(*data)

    def test_positive_negative_height_and_forged_current_bound_ceiling_rejected(self):
        data = fixture(); data[0]['state']['roads']['P']['elev'][0] = -.1
        with self.assertRaisesRegex(ValueError,'negative'): M.build_experiment(*data)
        data = fixture(); data[1]['results'][0]['existingHeightCeiling'] = 8.
        with self.assertRaisesRegex(ValueError,'ceiling'): M.build_experiment(*data)
        data = fixture(); data[2]['additionalBoundsNeeded'][0]['target'][0] = -1.
        with self.assertRaises(ValueError): M.build_experiment(*data)

    def test_signed_recovery_zero_rejected(self):
        data = fixture(); s = data[0]['state']; s['roads']['N']['elev'][5] = 0.
        row = data[3]['roads'][0]; row['inputHeights'] = list(s['roads']['N']['elev'])
        row['inputRoadSHA256'] = M.canonical_sha(s['roads']['N'])
        row['candidateRecoveryDomains'][1]['existingLocalInputHeights'][2] = 0.
        with self.assertRaisesRegex(ValueError,'zero/positive'): M.build_experiment(*data)

    def test_no_rise_caps_survive_and_forged_uncapped_target_fails(self):
        data = fixture(); data[0]['noRiseRoads'] = ['P']; data[2]['additionalBoundsNeeded'][0]['target'] = [0.,2.]
        out,_ = M.build_experiment(*data)
        self.assertEqual(out['state']['bounds'][1],(0.,2.))
        data[2]['additionalBoundsNeeded'][0]['target'] = [0.,7.]
        with self.assertRaises(ValueError): M.build_experiment(*data)

    def test_new_signed_domains_require_actually_fixed_anchors(self):
        data = fixture(); s = data[0]['state']; s['bounds'][s['O']['N']] = (-6.,0.)
        s['generatedFacilityPolicies']['N'] = {'existingPolicy':True}
        with self.assertRaisesRegex(ValueError,'actually fixed anchors'): M.build_experiment(*data)

    def test_source_tuple_audit_schema_and_duplicate_gaps_fail_closed(self):
        data = fixture(); data[1]['inputs']['newModel']['sha256'] = 'forged'
        with self.assertRaisesRegex(ValueError,'tuple'): M.build_experiment(*data)
        data = fixture(); data[2]['schema'] = 'unknown'
        with self.assertRaisesRegex(ValueError,'schema'): M.build_experiment(*data)
        data = fixture(); data[2]['additionalBoundsNeeded'] *= 2
        with self.assertRaisesRegex(ValueError,'duplicates'): M.build_experiment(*data)

    def test_binding_hash_and_drift_checked(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'held'; path.write_bytes(b'original'); bindings = M.Bindings()
            with self.assertRaisesRegex(ValueError,'Binding changed'): bindings.read(path,M.sha(b'forged'))
            bindings.read(path,M.sha(b'original')); path.write_bytes(b'drift')
            with self.assertRaisesRegex(ValueError,'drift'): bindings.recheck()

    def test_no_overwrite_and_float_bit_identity(self):
        self.assertFalse(M.same_bounds((-0.,0.),(0.,0.)))
        with tempfile.TemporaryDirectory() as directory:
            context = Path(directory)/'context'; report = Path(directory)/'report'
            context.write_bytes(b'preserve')
            with self.assertRaisesRegex(ValueError,'Preserve'): M.write_outputs(context,report,{}, {})
            self.assertEqual(context.read_bytes(),b'preserve'); self.assertFalse(report.exists())


if __name__ == '__main__':
    unittest.main()
