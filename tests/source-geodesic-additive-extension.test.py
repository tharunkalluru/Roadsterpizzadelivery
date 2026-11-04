import copy
import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('source_extension',Path(__file__).resolve().parents[1]/'scripts/qa/extend-source-geodesic-additively.py')
M=importlib.util.module_from_spec(spec);spec.loader.exec_module(M)


def fixture():
    road=lambda name,family,node:{'id':name,'sourceSegmentID':family,'expected':{'pts':[[0.,0.],[1.,1.]]},'pts':[[0.,0.],[1.,1.]],'copies':[{'kind':'core'}],
        'from':node,'to':'far','cuts':{'declared':[0,1],'actualAfter':[0,1],'repaired':[True,False],'unselectedCutsRetainedExactly':True}}
    old={'version':1,'kind':'source','release':'2026-10-21.0','generationID':'old','sourceCorePackSHA256':'core','sourceEvidenceSHA256':'source',
         'origin':{'lat':17.},'heightPolicy':'inherited','preflightSHA256':'oldpreflight','sourcePackSHA256':{'oldpack':'unchanged'},
         'roads':[road('old-road','old-family','old-node')],'nodes':{'old-node':{'incidentRoadIDs':['old-road']}},
         'sources':[{'id':'old-family','geometryLonLat':[[78.,17.],[79.,18.]],'connectors':[],'vertexFractions':[0.,1.]}]}
    fresh=copy.deepcopy(old);fresh['preflightSHA256']='newpreflight';fresh['roads'][0]['pts'][1][0]+=1e-9
    fresh['sources'][0]['vertexFractions'][1]-=1e-15;fresh['roads'].append(road('new-road','new-family','new-node'))
    fresh['nodes']['new-node']={'incidentRoadIDs':['new-road']};fresh['sources'].append({'id':'new-family','geometryLonLat':[[1.,2.],[2.,3.]],'connectors':[]})
    fresh['sourcePackSHA256']['newpack']='new';preflight={'sourceCoreSHA256':'core','missingRepairSourcePrefixes':[],
        'nodeIDs':['old-node','new-node'],'roads':copy.deepcopy(fresh['roads'])}
    return old,fresh,preflight,{'preflight':{'sha256':'newpreflight'}}


class AdditiveSourceExtensionTests(unittest.TestCase):
    def test_old_values_exact_new_families_only(self):
        args=fixture();old=copy.deepcopy(args[0]);fresh=copy.deepcopy(args[1]);result,receipt=M.prepare(*args)
        self.assertEqual(result['roads'][0],old['roads'][0]);self.assertEqual(result['sources'][0],old['sources'][0])
        self.assertEqual(result['nodes']['old-node'],old['nodes']['old-node']);self.assertEqual(args[0],old);self.assertEqual(args[1],fresh)
        self.assertEqual(receipt['freshOldRoadRecalculationsNotInstalled'],['old-road']);self.assertFalse(receipt['runtimeActivated'])

    def test_old_correspondence_and_node_drift_rejected(self):
        for mutation in [lambda f:f['roads'][0]['expected'].update(pts=[[2.,3.]]),lambda f:f['nodes']['old-node'].update(after=[1.,2.]),
                         lambda f:f['sourcePackSHA256'].update(oldpack='altered'),lambda f:f['sources'][0].update(connectors=[1]),
                         lambda f:f['roads'][0]['cuts'].update(actualAfter=[.1,1])]:
            args=fixture();mutation(args[1])
            with self.assertRaises(ValueError):M.prepare(*args)

    def test_incomplete_or_old_family_reuse_rejected(self):
        args=fixture();args[1]['roads'][1]['sourceSegmentID']='old-family'
        with self.assertRaises(ValueError):M.prepare(*args)
        args=fixture();args[2]['roads'].pop()
        with self.assertRaises(ValueError):M.prepare(*args)
        args=fixture();args[1]['nodes']['new-node']['incidentRoadIDs'].append('missing')
        with self.assertRaises(ValueError):M.prepare(*args)

    def test_unselected_fraction_recalculation_is_never_installed(self):
        args=fixture();args[1]['roads'][0]['cuts']['actualAfter'][1]-=1e-15
        result,_=M.prepare(*args)
        self.assertEqual(result['roads'][0],args[0]['roads'][0])

    def test_frame_source_and_duplicates_rejected(self):
        for mutation in [lambda f:f.update(origin={'lat':18.}),lambda f:f.update(preflightSHA256='stale'),
                         lambda f:f['roads'].append(copy.deepcopy(f['roads'][0]))]:
            args=fixture();mutation(args[1])
            with self.assertRaises(ValueError):M.prepare(*args)
        args=fixture();args[2]['missingRepairSourcePrefixes']=['missing']
        with self.assertRaises(ValueError):M.prepare(*args)


if __name__=='__main__':unittest.main()
