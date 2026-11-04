#!/usr/bin/env python3
"""Check every packed owner at diagnosed junctions; read-only evidence."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
for name in ['repo', 'joint', 'diagnosis', 'output']:
    p.add_argument('--' + name, type=Path, required=True)
a = p.parse_args()
sha = lambda data: hashlib.sha256(data).hexdigest()
raw_core = (a.repo / 'public/city/core.pack.wasm').read_bytes()
core = json.loads(gzip.decompress(raw_core))
core_ids = {r['id'] for r in core['roads']}
diagnosis_bytes, joint_bytes = a.diagnosis.read_bytes(), a.joint.read_bytes()
diagnosis, joint = json.loads(diagnosis_bytes), json.loads(joint_bytes)
assert joint['sourceCoreSHA256'] == sha(raw_core)
nodes = {r['node'] for r in diagnosis['nodes']}
fields = ['id', 'pts', 'elev', 'from', 'to', 'w', 'lanes', 'oneway']
owners, copies, variants, packs = {}, {}, [], {}
for pack in core['packs']:
    relative = 'public/city/' + pack['file']
    data = (a.repo / relative).read_bytes()
    packs[relative] = sha(data)
    for key, tile in json.loads(gzip.decompress(data))['tiles'].items():
        for road in tile['roads']:
            if road['id'] in core_ids or road.get('ctx') or not nodes & {road['from'], road['to']}:
                continue
            physical = {field: road.get(field) for field in fields}
            ident = road['id']
            copies[ident] = copies.get(ident, 0) + 1
            if ident in owners:
                if owners[ident]['physical'] != physical:
                    variants.append({'id': ident, 'pack': pack['file'], 'tile': key})
                owners[ident]['ownerPacks'].append(pack['file'])
                owners[ident]['ownerTiles'].append(key)
            else:
                owners[ident] = {'physical': physical, 'ownerPacks': [pack['file']], 'ownerTiles': [key]}
joint_ids = {r['id'] for r in joint['contextRoads'] + joint['tileRoads']}
missing = sorted(set(owners) - joint_ids)
assert a.diagnosis.read_bytes() == diagnosis_bytes and a.joint.read_bytes() == joint_bytes
assert (a.repo / 'public/city/core.pack.wasm').read_bytes() == raw_core
for path, digest in packs.items():
    assert sha((a.repo / path).read_bytes()) == digest
out = {'version': 1, 'scope': 'Root complete packed-owner incidence audit; no heights or release approval',
       'releaseApproved': False, 'sourceCoreSHA256': sha(raw_core), 'sourceDiagnosisSHA256': sha(diagnosis_bytes),
       'sourceJointSHA256': sha(joint_bytes), 'nodes': sorted(nodes), 'packSHA256': packs,
       'tileOwners': owners, 'ownerCopies': copies, 'ownerVariants': variants, 'missingFromCurrentJoint': missing,
       'generatorSHA256': sha(Path(__file__).read_bytes())}
with a.output.open('x') as f:
    json.dump(out, f, indent=2)
    f.write('\n')
print(json.dumps({'output': str(a.output), 'sha256': sha(a.output.read_bytes()), 'nodes': len(nodes),
                  'packs': len(packs), 'owners': len(owners), 'variants': len(variants), 'missingOwners': missing}))
