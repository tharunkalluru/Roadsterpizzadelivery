"""Extend geographic correspondence without recalculating unchanged references.

The fresh producer independently computes the whole new source inventory. This
adapter preserves every prior record for byte-exact source repairs, retaining
the fresh result only for genuinely new repairs. Tiny library/operation-order
replay differences are reported, never installed on those unchanged records.
"""
import argparse
import copy
import importlib.util
import json
from pathlib import Path
import sys

_spec=importlib.util.spec_from_file_location('exact_reference_extension',
    Path(__file__).with_name('verify-scoped-generated-facility-rebase.py'))
EXACT=importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(EXACT)
require=EXACT.require


def index(rows):
    result={r['id']:r for r in rows}
    require(len(result)==len(rows),'Duplicate geographic reference/source record')
    return result


def regenerate_added_references(old_source,new_source):
    """Recompute new records from source geometry, never trust imported numbers."""
    import geographiclib
    require(geographiclib.__version__=='2.1','Use retained geographiclib==2.1')
    generator_path=Path(__file__).with_name('generate-road-source-reference.py')
    spec=importlib.util.spec_from_file_location('actual_geographic_reference_generator',generator_path)
    generator=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(generator)
    old_ids=set(index(old_source['roads']))
    data={**new_source,'roads':[r for r in new_source['roads']if r['id']not in old_ids]}
    roads,unresolved=generator.generate(data)
    require(not unresolved,'New source reference cannot be reconstructed from actual source geometry')
    return roads,{'path':str(generator_path.resolve()),'sha256':EXACT.sha(generator_path.read_bytes()),
                  'geographiclib':geographiclib.__version__}


def extend(old_reference,fresh_reference,old_source,new_source,bindings,regenerated_added):
    for reference,source,key in [(old_reference,old_source,'old_source'),
                                  (fresh_reference,new_source,'new_source')]:
        require(reference['version']==1 and reference['kind']==
                'verified-overture-geographic-source-reference','Unexpected reference schema')
        require(reference['sourceDataSHA256']==bindings[key]['sha256'] and
                reference['generationID']==source['generationID'] and
                reference['sourceCorePackSHA256']==source['sourceCorePackSHA256'],
                'Geographic reference/source frame mismatch')
        require(not reference['unresolved'],'Unresolved correspondence is not an additive result')
    require(EXACT.exact(old_reference['policy'],fresh_reference['policy']) and
            old_reference['geographiclib']==fresh_reference['geographiclib']=='2.1',
            'Projection, source-cut or geodesic policy changed')
    require(old_source['sourceCorePackSHA256']==new_source['sourceCorePackSHA256'] and
            EXACT.exact(old_source['origin'],new_source['origin']), 'Source coordinate frame changed')
    require(all(key in new_source['nodes'] and EXACT.exact(value,new_source['nodes'][key])
                for key,value in old_source['nodes'].items()),'Existing source node correction changed')
    old_patches,new_patches=index(old_source['roads']),index(new_source['roads'])
    for key in ['roads','sources']:
        before,after=index(old_source[key]),index(new_source[key])
        require(set(before)<=set(after) and all(EXACT.exact(v,after[k])for k,v in before.items()),
                'Existing source geometry record changed: '+key)
    parent,fresh=index(old_reference['roads']),index(fresh_reference['roads'])
    require(set(parent)==set(old_patches) and set(fresh)==set(new_patches),
            'Reference inventory differs from its actual source repairs')
    replay=[]
    for ident,record in parent.items():
        current=fresh[ident]
        require(record['sourceSegmentID']==current['sourceSegmentID']==old_patches[ident]['sourceSegmentID'],
                'Full source family correspondence changed')
        for key in ['correctedArc','correctedOfficialMetres']:
            require(EXACT.exact(record[key],current[key]),'Corrected source reference changed: '+ident)
        errors={}
        for key in ['legacyArc','legacyOfficialMetres','projectionErrors']:
            require(len(record[key])==len(current[key]),'Legacy reference control count changed')
            errors[key]=max(abs(a-b)for a,b in zip(record[key],current[key]))
        # These are recomputation comparisons only. The original source
        # records are exact and the original reference arrays are retained.
        require(errors['legacyArc']<=1e-8 and errors['legacyOfficialMetres']<=1e-7 and
                errors['projectionErrors']<=1e-12,'Fresh historical reference replay differs')
        replay.append({'id':ident,'retainedReferenceSHA256':EXACT.record_sha(record),
                       'freshReplayMaximumAbsoluteDifferences':errors,
                       'originalReferenceRetainedExactly':True})
    added=[r for r in fresh_reference['roads']if r['id']not in parent]
    require({r['id']for r in added}==set(new_patches)-set(old_patches),
            'Unexpected additive reference inventory')
    recomputed=index(regenerated_added)
    require(set(recomputed)=={r['id']for r in added} and all(
                EXACT.exact(record,recomputed[record['id']])for record in added),
            'New reference differs from actual source-geodesic branch replay')
    output=copy.deepcopy(old_reference)
    output.update(generationID=new_source['generationID'],
                  sourceDataSHA256=bindings['new_source']['sha256'],
                  roads=copy.deepcopy(old_reference['roads']+added),unresolved=[])
    output['summary']={'boundRoads':len(output['roads']),'unresolvedRoads':0,
                      'maximumProjectionErrorM':max(max(r['projectionErrors'])for r in output['roads'])}
    proof={'schema':'additive-geographic-source-reference-extension-v1','inputs':bindings,
           'retainedRecords':replay,'addedRoadIDs':[r['id']for r in added],
           'projectionAndSourceCutPolicyUnchanged':True,
           'allAddedReferencesRecomputedFromActualSourceGeometry':True,
           'existingCorrectedSourceCorrespondenceExact':True,
           'oldReferenceArraysNotRecalculated':True,'runtimeActivated':False,
           'heightAuthorityGranted':False,'releaseApproved':False}
    output['incrementalSourceReferenceExtension']=proof
    return output,proof


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for key in ['old-reference','fresh-reference','old-source','new-source','output','proof']:
        parser.add_argument('--'+key,type=Path,required=True)
    parser.add_argument('--geographiclib',type=Path,required=True)
    args=parser.parse_args()
    require(args.output.resolve()!=args.proof.resolve() and not args.output.exists() and
            not args.proof.exists(),'Preserve prior reference evidence')
    names=['old_reference','fresh_reference','old_source','new_source']
    held={key:getattr(args,key).read_bytes()for key in names}
    docs={key:json.loads(raw,object_pairs_hook=EXACT.no_duplicate_keys)for key,raw in held.items()}
    for doc in docs.values():EXACT.finite_json(doc)
    bindings={key:{'path':str(getattr(args,key).resolve()),'sha256':EXACT.sha(raw)}for key,raw in held.items()}
    sys.path.insert(0,str(args.geographiclib))
    regenerated,generator=regenerate_added_references(docs['old_source'],docs['new_source'])
    output,proof=extend(*(docs[key]for key in names),bindings,regenerated)
    proof['actualNewRecordGenerator']=generator
    proof['producerSHA256']=EXACT.sha(Path(__file__).read_bytes())
    proof['exactHelperSHA256']=EXACT.sha(Path(EXACT.__file__).read_bytes())
    require(all(getattr(args,key).read_bytes()==raw for key,raw in held.items()),'Reference input changed')
    for path,value in [(args.output,output),(args.proof,proof)]:
        with path.open('x')as stream:json.dump(value,stream,separators=(',',':'),allow_nan=False);stream.write('\n')
    print(json.dumps({'output':str(args.output),'sha256':EXACT.sha(args.output.read_bytes()),
                     'proofSHA256':EXACT.sha(args.proof.read_bytes()),
                     'retainedRecords':len(proof['retainedRecords']),'addedRoads':len(proof['addedRoadIDs']),
                     'releaseApproved':False}))


if __name__=='__main__':main()
