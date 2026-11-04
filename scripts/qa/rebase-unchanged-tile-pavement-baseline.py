"""Rebind the existing 21 literal tile pavements after an additive source repair.

All parent source records and node corrections must remain exact. No new road
or corrected node may affect these 21 owners. The literal records/footprints,
raw packs and historical reference remain unchanged. A subsequent actual joint
export must still replay its ordinary source-copy and ribbon guards.
"""
import argparse
import copy
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path

_spec = importlib.util.spec_from_file_location('exact_baseline_rebase',
    Path(__file__).with_name('verify-scoped-generated-facility-rebase.py'))
EXACT = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(EXACT)


def require(value, message):
    if not value:
        raise ValueError(message)


def inventory(rows):
    result = {r['id']: r for r in rows}
    require(len(result) == len(rows), 'Duplicate source road or source family')
    return result


def write_bound_output(path, value):
    # The existing joint consumer pins JSON.stringify(expected) and literal
    # footprint hashes. Preserve nested insertion order; canonical key sorting
    # would change those actual consumer bytes despite equal numeric geometry.
    with path.open('x') as stream:
        json.dump(value, stream, separators=(',', ':'), allow_nan=False)
        stream.write('\n')


def prepare(baseline, old, new, bindings):
    require(baseline['version'] == 1 and baseline['kind'] ==
            'literal-historical-tile-pavement-baseline', 'Changed literal baseline kind')
    require(baseline['sourceDataSHA256'] == bindings['old_source']['sha256'] and
            baseline['sourceRoadGeometryGeneration'] == old['generationID'],
            'Parent source frame does not bind the literal baseline')
    require(old['sourceCorePackSHA256'] == new['sourceCorePackSHA256'] ==
            baseline['sourceCoreSHA256'], 'Raw core changed')
    require(EXACT.exact(old['origin'], new['origin']) and
            EXACT.exact(old['heightPolicy'], new['heightPolicy']), 'Source origin or height policy changed')
    ids = {r['id'] for r in baseline['roads']}
    require(len(ids) == len(baseline['roads']) == 21, 'Original 21-road baseline scope changed')
    nodes = {r['expected'][end] for r in baseline['roads'] for end in ['from', 'to']}
    added = {}
    for key in ['roads', 'sources']:
        before, after = inventory(old[key]), inventory(new[key])
        require(set(before) <= set(after), 'Parent source record omitted: ' + key)
        require(all(EXACT.exact(row, after[ident]) for ident, row in before.items()),
                'A parent source record changed: ' + key)
        added[key] = sorted(set(after)-set(before))
    require(not ids.intersection(added['roads']), 'New correction intersects a literal baseline owner')
    require(all(ident in new['nodes'] and EXACT.exact(record, new['nodes'][ident])
                for ident, record in old['nodes'].items()), 'Parent source node changed')
    added['nodes'] = sorted(set(new['nodes'])-set(old['nodes']))
    require(not nodes.intersection(added['nodes']), 'New node correction affects a literal baseline endpoint')
    # A newly introduced family cannot reinterpret a baseline owner, even if
    # the writer omitted that owner's road correction from its added records.
    require(not {ident.split('_')[0] for ident in ids}.intersection(
            ident[:12] for ident in added['sources']), 'New source family affects the literal baseline')
    for path, digest in old['sourcePackSHA256'].items():
        require(new['sourcePackSHA256'].get(path) == digest, 'Parent source pack hash changed')
    proof = {'schema': 'unchanged-literal-tile-pavement-source-frame-rebase-v1',
             'inputs': copy.deepcopy(bindings), 'retainedLiteralRoadIDs': sorted(ids),
             'retainedEndpointAliases': sorted(nodes), 'addedCorrectionsOutsideScope': added,
             'allParentSourceRecordsAndNodeCorrectionsExact': True,
             'allLiteralRecordsFootprintsWidthsAndCoarseControlsExact': True,
             'noNewHeightOrGeometryAuthority': True, 'actualJointExportStillRequired': True,
             'runtimeActivated': False, 'releaseApproved': False}
    output = copy.deepcopy(baseline)
    output.update(sourceDataSHA256=bindings['new_source']['sha256'],
                  sourceRoadGeometryGeneration=new['generationID'],
                  scopedUnchangedInputRebase=proof)
    return output, proof


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ['repo', 'baseline', 'old-source', 'new-source', 'output', 'proof']:
        p.add_argument('--'+name, type=Path, required=True)
    args = p.parse_args()
    require(args.output.resolve() != args.proof.resolve() and not args.output.exists()
            and not args.proof.exists(), 'Preserve prior outputs')
    held = {}
    def read(key, path):
        raw = path.read_bytes()
        held[key] = (path, raw)
        return json.loads(raw, object_pairs_hook=EXACT.no_duplicate_keys)
    baseline, old, new = (read(key, getattr(args, key)) for key in
                          ['baseline', 'old_source', 'new_source'])
    bindings = {key: {'path': str(path.resolve()), 'sha256': EXACT.sha(raw)}
                for key, (path, raw) in held.items()}
    result, proof = prepare(baseline, old, new, bindings)
    core_path = args.repo/'public/city/core.pack.wasm'
    core_raw = core_path.read_bytes()
    require(EXACT.sha(core_raw) == baseline['sourceCoreSHA256'], 'Raw core bytes changed')
    core = json.loads(gzip.decompress(core_raw))
    ids = set(proof['retainedLiteralRoadIDs'])
    copies = {ident: [] for ident in ids}
    pack_hashes = {}
    for descriptor in core['packs']:
        relative = descriptor['file']
        raw = (args.repo/'public/city'/relative).read_bytes()
        digest = EXACT.sha(raw)
        require(baseline['sourcePackSHA256'].get('public/city/'+relative) in (None, digest),
                'Literal historical pack changed: '+relative)
        for source in [old, new]:
            require(source['sourcePackSHA256'].get(relative) in (None, digest),
                    'Source correction pack changed: '+relative)
        pack_hashes['public/city/'+relative] = digest
        pack = json.loads(gzip.decompress(raw))
        for tile, blob in pack['tiles'].items():
            for row in blob.get('roads', []):
                if row['id'] in ids:
                    copies[row['id']].append({'tile': tile, 'context': bool(row.get('ctx')),
                        'pack': relative, 'fullRawRecordSHA256': EXACT.record_sha(row),
                        'from': row.get('from'), 'to': row.get('to')})
    require(set(baseline['sourcePackSHA256']) <= set(pack_hashes), 'Historical source pack omitted')
    require(all(copies.values()) and all(any(not c['context'] for c in rows)
                                       for rows in copies.values()), 'Literal physical owner missing')
    # Also cover raw variants whose endpoint aliases differ from the baseline
    # projection, rather than relying solely on the 21 representative records.
    aliases = {c.get(end) for rows in copies.values() for c in rows for end in ['from','to']}
    require(not aliases.intersection(proof['addedCorrectionsOutsideScope']['nodes']),
            'New source node influences an actual literal source copy')
    proof.update(rawCoreSHA256=EXACT.sha(core_raw), allActualPackSHA256=pack_hashes,
                 allActualLiteralCopies=copies,
                 all304PackPhysicalOwnerCensusComplete=len(core['packs']) == 304,
                 generatorSHA256=EXACT.sha(Path(__file__).read_bytes()),
                 exactHelperSHA256=EXACT.sha(Path(EXACT.__file__).read_bytes()))
    require(proof['all304PackPhysicalOwnerCensusComplete'], 'Unexpected raw pack census')
    require(all(path.read_bytes() == raw for path, raw in held.values()) and
            core_path.read_bytes() == core_raw, 'Source input changed during preparation')
    # The result embeds the very same proof object, including the actual census.
    result['scopedUnchangedInputRebase'] = proof
    for path, value in [(args.output, result), (args.proof, proof)]:
        write_bound_output(path, value)
    print(json.dumps({'baseline': str(args.output), 'sha256': EXACT.sha(args.output.read_bytes()),
                     'proof': str(args.proof), 'proofSHA256': EXACT.sha(args.proof.read_bytes()),
                     'roads': len(ids), 'copies': sum(map(len,copies.values())), 'releaseApproved': False}))


if __name__ == '__main__':
    main()
