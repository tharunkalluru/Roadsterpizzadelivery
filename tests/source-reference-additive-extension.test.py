import copy
import importlib.util
from pathlib import Path
import unittest

P=Path(__file__).resolve().parents[1]/'scripts/qa/extend-source-reference-additively.py'
SPEC=importlib.util.spec_from_file_location('source_reference_extension',P)
M=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class AdditiveSourceReference(unittest.TestCase):
    def fixture(self):
        patch={'id':'old_0','sourceSegmentID':'source','expected':{'pts':[[0.,0.],[1.,0.]]}}
        old={'sourceCorePackSHA256':'core','generationID':'old-generation','origin':[78.,17.],
             'roads':[patch],'sources':[{'id':'source','geodeticLengthM':1.}],
             'nodes':{'node':{'after':[1.,0.]}}}
        new=copy.deepcopy(old);new['generationID']='new-generation'
        new['roads'].append({**copy.deepcopy(patch),'id':'new_0'})
        record={'id':'old_0','sourceSegmentID':'source','legacyArc':[0.,1.],
                'legacyOfficialMetres':[0.,1.],'projectionErrors':[0.,0.],
                'correctedArc':[0.,1.],'correctedOfficialMetres':[0.,1.]}
        parent={'version':1,'kind':'verified-overture-geographic-source-reference',
                'generationID':'old-generation','sourceDataSHA256':'old-source',
                'sourceCorePackSHA256':'core','geographiclib':'2.1','policy':{'tolerance':.075},
                'roads':[record],'unresolved':[],'summary':{}}
        fresh=copy.deepcopy(parent);fresh.update(generationID='new-generation',sourceDataSHA256='new-source')
        fresh['roads'][0]['legacyArc'][1]+=1e-13
        fresh['roads'].append({**copy.deepcopy(record),'id':'new_0'})
        bindings={'old_source':{'sha256':'old-source'},'new_source':{'sha256':'new-source'}}
        return parent,fresh,old,new,bindings,copy.deepcopy(fresh['roads'][1:])

    def test_unchanged_arrays_are_retained_and_only_new_source_repair_is_added(self):
        values=self.fixture();before=copy.deepcopy(values)
        result,proof=M.extend(*values)
        self.assertEqual(values,before)
        self.assertEqual(result['roads'][0],values[0]['roads'][0])
        self.assertNotEqual(result['roads'][0],values[1]['roads'][0])
        self.assertEqual(result['roads'][1],values[1]['roads'][1])
        self.assertEqual(proof['addedRoadIDs'],['new_0'])
        self.assertFalse(proof['heightAuthorityGranted'])

    def test_existing_source_geometry_family_node_and_frame_changes_are_rejected(self):
        for key in ['geometry','family','node','frame']:
            a,b,c,d,e,f=self.fixture()
            if key=='geometry':d['roads'][0]['expected']['pts'][0][0]=.1
            if key=='family':d['sources'][0]['geodeticLengthM']=1.1
            if key=='node':d['nodes']['node']['after'][0]=2.
            if key=='frame':d['origin'][0]=77.
            with self.subTest(key=key),self.assertRaises(ValueError):M.extend(a,b,c,d,e,f)

    def test_corrected_arrays_or_large_replay_differences_cannot_be_hidden(self):
        for key in ['correctedArc','correctedOfficialMetres','legacyArc','legacyOfficialMetres','projectionErrors']:
            a,b,c,d,e,f=self.fixture();b['roads'][0][key][1]+=.01
            with self.subTest(key=key),self.assertRaises(ValueError):M.extend(a,b,c,d,e,f)

    def test_duplicate_omitted_and_unresolved_rows_fail_closed(self):
        for key in ['duplicate','omitted','unresolved','extra']:
            a,b,c,d,e,f=self.fixture()
            if key=='duplicate':b['roads'].append(copy.deepcopy(b['roads'][0]))
            if key=='omitted':b['roads'].pop()
            if key=='unresolved':b['unresolved']=[{'id':'new_0'}]
            if key=='extra':b['roads'].append({**copy.deepcopy(b['roads'][0]),'id':'foreign'})
            with self.subTest(key=key),self.assertRaises(ValueError):M.extend(a,b,c,d,e,f)

    def test_changed_projection_policy_or_source_hash_is_rejected(self):
        for key in ['policy','source','library']:
            a,b,c,d,e,f=self.fixture()
            if key=='policy':b['policy']['tolerance']=.1
            if key=='source':b['sourceDataSHA256']='foreign'
            if key=='library':b['geographiclib']='different'
            with self.subTest(key=key),self.assertRaises(ValueError):M.extend(a,b,c,d,e,f)

    def test_forged_new_source_id_arcs_errors_or_legacy_interior_are_rejected(self):
        for key in ['sourceSegmentID','correctedArc','projectionErrors','legacyOfficialMetres']:
            a,b,c,d,e,f=self.fixture()
            if key=='sourceSegmentID':b['roads'][1][key]='foreign-full-source-family'
            elif key=='projectionErrors':b['roads'][1][key][1]=.08
            else:b['roads'][1][key][1]+=.01
            with self.subTest(key=key),self.assertRaisesRegex(ValueError,'actual source-geodesic'):
                M.extend(a,b,c,d,e,f)


if __name__=='__main__':unittest.main()
