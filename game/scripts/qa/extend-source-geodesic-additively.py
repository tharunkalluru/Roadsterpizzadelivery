"""Add independently inventoried source families without recomputing old ones.

The fresh generator is evidence only for NEW full source families. Every
existing road, source record and node remains byte-value exact. This produces
an inactive artifact, never writes the runtime dataset, and does not rebase a
height model or grant height authority.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path


def sha(data):
    return hashlib.sha256(data).hexdigest()


def require(value, message):
    if not value:
        raise ValueError(message)


def by_id(rows, label):
    result = {row['id']: row for row in rows}
    require(len(rows) == len(result), 'Duplicate '+label)
    return result


def prepare(base, generated, preflight, bindings):
    require(base['version'] == generated['version'] == 1, 'Unsupported source schema')
    for key in ['kind', 'release', 'sourceCorePackSHA256', 'sourceEvidenceSHA256', 'origin', 'heightPolicy']:
        require(base[key] == generated[key], 'Base source frame/policy changed: '+key)
    require(generated['preflightSHA256'] == bindings['preflight']['sha256'], 'Fresh preflight binding mismatch')
    require(preflight['sourceCoreSHA256'] == base['sourceCorePackSHA256']
            and not preflight['missingRepairSourcePrefixes'], 'Incomplete or incompatible preflight')
    old_roads = by_id(base['roads'], 'base roads'); new_roads = by_id(generated['roads'], 'fresh roads')
    old_sources = by_id(base['sources'], 'base source families'); fresh_sources = by_id(generated['sources'], 'fresh source families')
    require(old_roads.keys() <= new_roads.keys(), 'Fresh inventory omits an old road')
    require(set(base['nodes']) <= set(generated['nodes']), 'Fresh inventory omits an old node')
    for node, record in base['nodes'].items():
        require(record == generated['nodes'][node], 'Existing source node changed: '+node)
    require(old_sources.keys() <= fresh_sources.keys(), 'Fresh inventory omits an old family')
    # The old calculations can differ in their last bits across environments;
    # only correspondence metadata, not those recalculated values, is compared.
    for road, previous in old_roads.items():
        current = new_roads[road]
        for key in ['id', 'sourceSegmentID', 'expected', 'copies']:
            require(previous[key] == current[key], 'Existing raw correspondence changed: '+road+':'+key)
        for key in ['declared', 'repaired', 'unselectedCutsRetainedExactly']:
            require(previous['cuts'].get(key) == current['cuts'].get(key), 'Existing source cut changed: '+road+':'+key)
        for index, repaired in enumerate(previous['cuts']['repaired']):
            if repaired:
                require(previous['cuts']['actualAfter'][index] == current['cuts']['actualAfter'][index]
                        == previous['cuts']['declared'][index], 'Existing official repaired cut changed: '+road)
        # An unselected cut retains its exact raw expected endpoint above. Its
        # freshly recomputed legacy fraction is not installed or substituted.
    for family, previous in old_sources.items():
        current = fresh_sources[family]
        for key in ['id', 'geometryLonLat', 'connectors', 'levelRules', 'roadFlags', 'accessRestrictions', 'provenance']:
            require(previous.get(key) == current.get(key), 'Existing full source changed: '+family+':'+key)
    for pack, expected in base['sourcePackSHA256'].items():
        require(generated['sourcePackSHA256'].get(pack) == expected, 'Existing raw pack changed: '+pack)
    added_roads = [row for row in generated['roads'] if row['id'] not in old_roads]
    added_sources = [row for row in generated['sources'] if row['id'] not in old_sources]
    added_nodes = {node: record for node, record in generated['nodes'].items() if node not in base['nodes']}
    require(added_roads and added_sources and added_nodes, 'Expected a nonempty finite source-family extension')
    added_families = {row['id'] for row in added_sources}
    require({row['sourceSegmentID'] for row in added_roads} == added_families,
            'A new road reuses an old metric family or lacks its exact new source')
    require(set(preflight['nodeIDs']) == set(generated['nodes']), 'Preflight node closure differs')
    require(set(row['id'] for row in preflight['roads']) == set(new_roads), 'Preflight road closure differs')
    for node, record in added_nodes.items():
        actual_incident = {row['id'] for row in preflight['roads'] if node in [row['from'], row['to']]}
        require(actual_incident == set(record['incidentRoadIDs']), 'New source connector is not all-arm complete')
        require(actual_incident <= {row['id'] for row in added_roads}, 'New node unexpectedly changes an old source family')
    result = copy.deepcopy(base)
    result.update(preflightSHA256=generated['preflightSHA256'], sourcePackSHA256=generated['sourcePackSHA256'],
                  additionalSourceEvidence=generated.get('additionalSourceEvidence', []))
    result['roads'].extend(copy.deepcopy(added_roads)); result['sources'].extend(copy.deepcopy(added_sources))
    result['nodes'].update(copy.deepcopy(added_nodes))
    result['incrementalSourceExtension'] = {
        'version': 1, 'inputs': bindings, 'oldRoadRecordsRetainedExactly': len(old_roads),
        'oldSourceRecordsRetainedExactly': len(old_sources), 'oldNodeRecordsRetainedExactly': len(base['nodes']),
        'newRoadIDs': [row['id'] for row in added_roads], 'newSourceIDs': sorted(added_families),
        'newNodeIDs': sorted(added_nodes), 'releaseApproved': False, 'heightAuthorityGranted': False,
        'scope': 'Exact additive source-only families; fresh last-bit recalculation of prior families is deliberately not installed.'}
    result.pop('generationID')
    result['generationID'] = sha(json.dumps(result, sort_keys=True, separators=(',', ':')).encode())
    receipt = {'schema': 'source-geodesic-additive-extension-receipt-v1', 'researchOnly': True,
               'releaseApproved': False, 'heightAuthorityGranted': False, 'inputs': bindings,
               'baseGeneration': base['generationID'], 'generation': result['generationID'],
               'oldRoadRecordsRetainedExactly': len(old_roads), 'oldSourceRecordsRetainedExactly': len(old_sources),
               'oldNodeRecordsRetainedExactly': len(base['nodes']), 'newRoadIDs': [row['id'] for row in added_roads],
               'newSourceIDs': sorted(added_families), 'newNodes': added_nodes,
               'freshOldRoadRecalculationsNotInstalled': [road for road in old_roads if old_roads[road] != new_roads[road]],
               'runtimeActivated': False, 'modelRebased': False}
    return result, receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ['base-data', 'generated-data', 'preflight', 'output', 'receipt']:
        parser.add_argument('--'+key, type=Path, required=True)
    args = parser.parse_args()
    require(not args.output.exists() and not args.receipt.exists(), 'Preserve prior evidence; choose new outputs')
    documents = {}; bindings = {}; held = {}
    for key in ['base_data', 'generated_data', 'preflight']:
        path = getattr(args, key).resolve(); raw = path.read_bytes()
        documents[key] = json.loads(raw); bindings[key.replace('_', '-')] = {'path': str(path), 'sha256': sha(raw)}; held[path] = raw
    result, receipt = prepare(documents['base_data'], documents['generated_data'], documents['preflight'], bindings)
    receipt['producerSHA256'] = sha(Path(__file__).read_bytes())
    for path, raw in held.items(): require(path.read_bytes() == raw, 'Input drift during extension: '+str(path))
    output_bytes = (json.dumps(result, separators=(',', ':'))+'\n').encode()
    receipt['output'] = {'path': str(args.output.resolve()), 'sha256': sha(output_bytes)}
    with args.output.open('xb') as output: output.write(output_bytes)
    with args.receipt.open('x') as output: json.dump(receipt, output, indent=2); output.write('\n')
    print(json.dumps({'output': str(args.output), 'sha256': sha(output_bytes), 'generation': result['generationID'],
                      'newRoadIDs': receipt['newRoadIDs'], 'oldRoadRecordsRetainedExactly': len(documents['base_data']['roads'])}))


if __name__ == '__main__': main()
