#!/usr/bin/env python3
"""Preserve an unapproved additive union of strict historical road exports.

This only extends offline reference coverage. It assigns no current heights and
does not approve a model, an ambiguous surface, a new structure or a release.
"""
import argparse
import collections
import hashlib
import json
import math
from pathlib import Path
import subprocess


REVISION = 'a679b72bacefb751057f0282a86571e8e6ef006d'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def record_key(record):
    return sha(json.dumps(record, sort_keys=True, separators=(',', ':'), allow_nan=False).encode())


def union_map(left, right):
    result = dict(left)
    for key, value in right.items():
        assert key not in result or result[key] == value, 'Changed historical binding: ' + key
        result[key] = value
    return result


def union_records(left, right):
    result = list(left)
    seen = {record_key(e) for e in left}
    for e in right:
        key = record_key(e)
        if key not in seen:
            result.append(e)
            seen.add(key)
    return result


def physical(road):
    # Match the historical exporter's insertion order and explicit null fields.
    return {k: road.get(k) for k in ['pts', 'elev', 'w', 'from', 'to', 'oneway']}


def by_id(records, label):
    result = {e['id']: e for e in records}
    assert len(result) == len(records), 'Duplicate historical IDs: ' + label
    return result


def literal_javascript_hashes(records):
    """Check the exporter's SHA representation, including its float syntax.

    Only the small variant/alternate provenance set is sent to Node. Python's
    JSON float spelling is not the SHA representation used by the exporter.
    """
    if not records:
        return []
    script = """
      const fs = require('node:fs'), {createHash} = require('node:crypto');
      const rows = JSON.parse(fs.readFileSync(0, 'utf8'));
      process.stdout.write(JSON.stringify(rows.map(row =>
        createHash('sha256').update(JSON.stringify(row)).digest('hex'))));
    """
    result = subprocess.run(['node', '-e', script], input=json.dumps(records, allow_nan=False),
                            text=True, capture_output=True, check=True)
    hashes = json.loads(result.stdout)
    assert len(hashes) == len(records) and all(isinstance(s, str) and len(s) == 64 for s in hashes)
    return hashes


def merge_coverage(base, extra, joint, core_coverage, core_coverage_sha256, inputs, generator_sha256):
    assert base['revision'] == extra['revision'] == REVISION
    assert base['sourceCoreSHA256'] == extra['sourceCoreSHA256'] == joint['sourceCoreSHA256']
    assert not extra['unmatched'] and not extra['inputDisagreements']
    assert base['observer'] == extra['observer'], 'Historical observation algorithm changed'
    coverage_binding = joint['inputs']['physicalCoreCoverage']
    assert coverage_binding['sha256'] == core_coverage_sha256, 'Unbound protected core coverage'
    assert core_coverage['version'] == 1 and core_coverage['researchOnly'] is True
    assert core_coverage['releaseApproved'] is False
    assert core_coverage['sourceModelSHA256'] == joint['sourceModelSHA256'], 'Mixed core coverage model'
    assert core_coverage['sourceFootprints']['sha256'] == joint['inputs']['physicalCoreFootprints']['sha256']
    assert set(core_coverage['sourceSelectedRoadIDs']) == set(joint['requestedRoadIDs'])
    core_ids = set(core_coverage['roads'])
    assert core_ids == set(extra['includedCoreRoadIDs']), 'Incomplete protected core selector'
    assert set(base['includedCoreRoadIDs']) <= core_ids, 'Parent core selector would be omitted'
    selected = set(joint['requestedRoadIDs'])
    contexts = {e['id'] for e in joint['contextRoads']}
    required = selected | contexts
    protected = required | core_ids

    source_files = union_map(base['sourceFiles'], extra['sourceFiles'])
    raw_sources = union_map(base['scannedSourceSHA256'], extra['scannedSourceSHA256'])
    source_packs = union_map(base['sourcePackSHA256'], extra['sourcePackSHA256'])
    rows = by_id(base['roads'], 'parent roads')
    extra_rows = by_id(extra['roads'], 'supplement roads')
    for ident, road in extra_rows.items():
        assert ident not in rows or physical(rows[ident]) == physical(road), 'Historical road variant: ' + ident
        rows.setdefault(ident, road)
    footprints = by_id(base['physicalFootprints'], 'parent footprints')
    extra_footprints = by_id(extra['physicalFootprints'], 'supplement footprints')
    alternates = []
    for ident, footprint in extra_footprints.items():
        if ident in footprints and footprints[ident] != footprint:
            assert ident not in protected, 'Protected historical footprint representative changed: ' + ident
            alternates.append(footprint)
        else:
            footprints.setdefault(ident, footprint)
    assert list(footprints.values())[:len(base['physicalFootprints'])] == base['physicalFootprints']

    exports = {'base': base, 'supplement': extra}
    copy_indices = {}
    for label, export in exports.items():
        index = collections.defaultdict(list)
        for copy in export['copies']:
            index[copy['id']].append(copy)
        copy_indices[label] = index

    # Bind every retained variant and both representatives of each newly found
    # difference to literal original copies. A representative is never replaced.
    alternate_ids = {f['id'] for f in alternates}
    checks = [(label, variant['footprint'], variant)
              for label, export in exports.items() for variant in export['footprintVariants']]
    checks += [(label, footprint, None)
               for label, export in exports.items() for footprint in export['physicalFootprints']
               if footprint['id'] in alternate_ids]
    hash_rows = []
    for label, footprint, origin in checks:
        ident = footprint['id']
        assert ident in rows, 'Variant has no historical road: ' + ident
        if origin is not None:
            assert origin['id'] == ident, 'Variant footprint ID disagrees with origin'
        hash_rows.extend([footprint, physical(rows[ident])])
    hashes = literal_javascript_hashes(hash_rows)
    origins = []
    alternate_origins = []
    for n, (label, footprint, origin) in enumerate(checks):
        ident = footprint['id']
        footprint_sha, physical_sha = hashes[n * 2:n * 2 + 2]
        copies = [c for c in copy_indices[label][ident] if c['footprintSHA256'] == footprint_sha]
        if origin is not None:
            copies = [c for c in copies if all(c[k] == origin[k] for k in ['tile', 'pack', 'context'])]
        assert copies, 'Historical footprint has no exact original copy: ' + ident
        for copy in copies:
            assert copy['physicalSHA256'] == physical_sha, 'Footprint copy changed physical road: ' + ident
            assert isinstance(copy['emittedTriangles'], int) and copy['emittedTriangles'] > 0, 'Footprint copy has no literal emissions: ' + ident
            pack = 'public/city/' + copy['pack']
            assert pack in exports[label]['sourcePackSHA256'], 'Footprint copy has no historical pack: ' + ident
            assert exports[label]['sourcePackSHA256'][pack] == exports[label]['scannedSourceSHA256'][pack]
        proof = {'source': label, 'id': ident, 'footprintSHA256': footprint_sha,
                 'physicalSHA256': physical_sha,
                 'copies': [{k: c[k] for k in ['tile', 'pack', 'context', 'emittedSHA256', 'emittedTriangles']} for c in copies]}
        origins.append(proof)
        if origin is None and label == 'supplement':
            for copy in copies:
                alternate_origins.append({**{k: copy[k] for k in ['id', 'tile', 'pack', 'context']}, 'footprint': footprint})

    variants = union_records(base['footprintVariants'], extra['footprintVariants'])
    variants = union_records(variants, alternate_origins)
    assert variants[:len(base['footprintVariants'])] == base['footprintVariants']
    blockers = []
    for ident in sorted({v['id'] for v in variants} & protected):
        blockers.append({'id': ident, 'selectedOwner': ident in selected,
                         'fixedContext': ident in contexts, 'includedCore': ident in core_ids,
                         'reason': 'Literal historical copy footprint variants remain unresolved; preservation grants no canonical choice or surface approval.',
                         'origins': [p for p in origins if p['id'] == ident],
                         'releaseApproved': False})

    triangles = union_records(base['triangles'], extra['triangles'])
    assert triangles[:len(base['triangles'])] == base['triangles'], 'Parent literal surfaces were changed'
    for triangle in triangles:
        bindings = triangle.get('actualSurfaceBindings', [triangle.get('actualSurface')])
        assert bindings and triangle['actualSurface'] in bindings
        assert all(isinstance(s['paintLift'], (int, float)) and math.isfinite(s['paintLift'])
                   and s['paintLift'] >= 0 and len(s['structuralQuad']) == 4 for s in bindings)
    emitted = {t['road'] for t in triangles}
    assert protected <= rows.keys(), 'Incomplete extended historical road inventory'
    assert protected <= footprints.keys(), 'Incomplete extended historical footprint inventory'
    assert protected <= emitted, 'A required historical road has no literal emitted triangles'

    out = dict(base)
    out.update(roads=list(rows.values()), physicalFootprints=list(footprints.values()), triangles=triangles,
               requestedRoadIDs=joint['requestedRoadIDs'], contextRoadIDs=[e['id'] for e in joint['contextRoads']],
               includedCoreRoadIDs=extra['includedCoreRoadIDs'], includedCoreNotRendered=[],
               contextNotRendered=[], requestedNotRendered=[], sourceFiles=source_files,
               scannedSourceSHA256=raw_sources, sourcePackSHA256=source_packs,
               footprintVariants=variants, researchOnly=True, releaseApproved=False)
    for key in ['copies', 'rawRequestedCopies', 'derivations', 'unmatched', 'outsideRegionUnmatched', 'inputDisagreements']:
        out[key] = union_records(base[key], extra[key])
    out['historicalCoverageUnion'] = {
        'schemaVersion': 2, 'inputs': inputs, 'generatorSHA256': generator_sha256,
        'baseTrianglesPreservedExactly': len(base['triangles']), 'supplementTriangles': len(extra['triangles']),
        'appendedTriangles': len(triangles) - len(base['triangles']),
        'baseFootprintsPreservedExactly': len(base['physicalFootprints']),
        'baseFootprintVariantsPreservedExactly': len(base['footprintVariants']),
        'alternateRepresentativesPreserved': len(alternates), 'alternateRepresentativeRoadIDs': sorted(alternate_ids),
        'alternateRepresentativeOrigins': [p for p in origins if p['id'] in alternate_ids],
        'allInputVariantOriginsVerified': True,
        'selectedOwners': len(selected), 'fixedContexts': len(contexts), 'includedCoreRoads': len(core_ids),
        'requiredHistoricalRoads': len(required), 'allRequiredRoadsHaveLiteralSurfaces': True,
        'allIncludedCoreRoadsHaveLiteralSurfaces': True,
        'parentExportProvenanceAppliesToBasePrefix': True,
        'supplementProvenance': {k: extra[k] for k in ['inputs', 'generatorSHA256', 'metadataExport', 'coverageRegion', 'summary']},
        'footprintReview': {'status': 'blocked' if blockers else 'no-protected-variant-blockers',
                            'blockingReviewRequired': bool(blockers), 'protectedVariantRoadIDs': [b['id'] for b in blockers],
                            'blockers': blockers, 'solverReferenceApproved': False,
                            'policy': 'Incidental representative alternatives preserve literal source copies only. Protected representative changes reject the union; existing protected variants remain explicit blocking review findings.'},
        'scope': 'Unapproved additive strict-a679 historical inventory; parent surfaces and origin-bound variants remain literal.',
        'releaseApproved': False,
    }
    out['summary'] = {**base['summary'], 'uniqueTriangles': len(triangles), 'nearbyRoads': len(rows),
                      'requested': len(selected), 'includedCore': len(core_ids),
                      'footprintVariants': len(variants), 'footprintVariantRoadIDs': len({v['id'] for v in variants}),
                      'protectedFootprintVariantBlockers': len(blockers),
                      'unionBuiltTileCountRequiresParentScopes': True}
    out['scope'] = 'Unapproved strict historical coverage inventory. Base and supplement retain independent provenance; all protected footprint variants require review. No geometry resampling, averaging, height assignment, solver acceptance or release approval.'
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ['base', 'supplement', 'joint', 'core-coverage', 'output']:
        parser.add_argument('--' + key, type=Path, required=True)
    args = parser.parse_args()
    held = {}

    def read(path):
        data = path.read_bytes()
        held[str(path)] = sha(data)
        return json.loads(data)

    base, extra, joint, coverage = map(read, [args.base, args.supplement, args.joint, args.core_coverage])
    generator_sha = sha(Path(__file__).read_bytes())
    out = merge_coverage(base, extra, joint, coverage, held[str(args.core_coverage)], held, generator_sha)
    for path, expected in held.items():
        assert sha(Path(path).read_bytes()) == expected, 'Input changed during historical union'
    assert sha(Path(__file__).read_bytes()) == generator_sha, 'Historical union generator changed during merge'
    with args.output.open('x') as stream:
        json.dump(out, stream, separators=(',', ':'), allow_nan=False)
        stream.write('\n')
    print(json.dumps({'output': str(args.output), 'sha256': sha(args.output.read_bytes()),
                      'roads': len(out['roads']), 'triangles': len(out['triangles']),
                      'requiredRoads': out['historicalCoverageUnion']['requiredHistoricalRoads'],
                      'footprintVariants': len(out['footprintVariants']),
                      'protectedFootprintVariantBlockers': out['historicalCoverageUnion']['footprintReview']['protectedVariantRoadIDs'],
                      'releaseApproved': False}))


if __name__ == '__main__':
    main()
