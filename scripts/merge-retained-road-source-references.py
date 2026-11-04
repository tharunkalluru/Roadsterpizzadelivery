"""Union complete source metadata reads without changing any source record."""
import argparse
import hashlib
import json
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--inputs', type=Path, nargs='+', required=True)
p.add_argument('--output', type=Path, required=True)
a = p.parse_args()
assert not a.output.exists()
parents, rows, releases, sources = {}, {}, set(), set()
sha = lambda data: hashlib.sha256(data).hexdigest()
for path in a.inputs:
    data = path.read_bytes(); parents[str(path.resolve())] = sha(data)
    record = json.loads(data)
    assert record['complete'] and not record['missingPrefixes']
    releases.add(record['release']); sources.add(record['source'])
    requested = record['requestedPrefixes']
    assert len(requested) == len(set(requested))
    returned = [row['id'][:12] for row in record['rows']]
    assert sorted(returned) == sorted(requested)
    for row in record['rows']:
        prefix = row['id'][:12]
        assert prefix not in rows or rows[prefix] == row, 'Retained source disagreement: ' + prefix
        rows[prefix] = row
assert releases == {'2026-10-21.0'} and len(sources) == 1
for path, digest in parents.items(): assert sha(Path(path).read_bytes()) == digest
report = {'version': 1, 'release': '2026-10-21.0', 'source': next(iter(sources)),
          'requestedPrefixes': sorted(rows), 'rows': [rows[prefix] for prefix in sorted(rows)],
          'complete': True, 'missingPrefixes': [], 'parents': parents,
          'generatorSHA256': sha(Path(__file__).read_bytes()),
          'scope': 'Exact union of complete immutable source metadata reads. No record edits, metric height, geometry, structure or release approval.'}
with a.output.open('x') as f:
    json.dump(report, f, indent=2); f.write('\n')
print(json.dumps({'output': str(a.output), 'sha256': sha(a.output.read_bytes()), 'rows': len(rows)}))
