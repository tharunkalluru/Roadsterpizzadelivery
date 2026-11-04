"""Read one bounded set of immutable public source rows for road diagnostics.

This produces evidence only. It neither changes the game nor grants metric
height, structure, source-cut or publication authority.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import time
import duckdb

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--selector', type=Path, required=True)
p.add_argument('--httpfs', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
a = p.parse_args()
assert not a.output.exists(), 'Preserve earlier source evidence'
held = a.selector.read_bytes()
selector = json.loads(held)
prefixes = selector['requestedPrefixes']
assert selector['release'] == '2026-10-21.0'
assert prefixes == sorted(set(prefixes)) and 1 <= len(prefixes) <= 4000
assert all(re.fullmatch('[0-9a-f]{8}-[0-9a-f]{3}', value) for value in prefixes)
source = 's3://overturemaps-us-west-2/release/2026-10-21.0/theme=transportation/type=segment/*'
query = ('SELECT id,names.primary AS name,class,width_rules,level_rules,road_flags,'
         'access_restrictions,connectors,sources,hex(geometry) AS geometryWKB,bbox '
         'FROM read_parquet(?,hive_partitioning=1) '
         'WHERE bbox.xmin<78.72 AND bbox.xmax>78.18 AND bbox.ymin<17.64 AND bbox.ymax>17.18 '
         'AND substring(id,1,12) IN (' + ','.join("'" + value + "'" for value in prefixes) + ')')
c = duckdb.connect()
c.execute("LOAD '" + str(a.httpfs).replace("'", "''") + "'")
c.execute("CREATE SECRET road_conflict_public_read (TYPE s3, KEY_ID '', SECRET '', REGION 'us-west-2')")
c.execute('SET threads=4')
c.execute('SET http_timeout=35')
start = time.monotonic()
print(json.dumps({'phase': 'query-start', 'exactPrefixes': len(prefixes)}), flush=True)
result = c.execute(query, [source])
columns = [d[0] for d in result.description]
rows = [dict(zip(columns, row)) for row in result.fetchall()]
c.close()
returned = [row['id'][:12] for row in rows]
assert len(returned) == len(set(returned)), 'Ambiguous truncated source identifier'
assert set(returned) <= set(prefixes), 'Unexpected source identifier'
missing = sorted(set(prefixes) - set(returned))
assert a.selector.read_bytes() == held, 'Selector changed during query'
report = {'version': 1, 'release': selector['release'], 'source': source, 'query': query,
          'selectorSHA256': hashlib.sha256(held).hexdigest(), 'requestedPrefixes': prefixes,
          'rows': rows, 'missingPrefixes': missing, 'complete': not missing,
          'duckdbVersion': duckdb.__version__, 'seconds': time.monotonic() - start,
          'scope': 'Anonymous read-only immutable-source completion for diagnosed road conflicts. No metric-height, structure, geometry or release approval.'}
with a.output.open('x') as f:
    json.dump(report, f, indent=2, default=str)
    f.write('\n')
print(json.dumps({'phase': 'complete', 'rows': len(rows), 'missing': len(missing),
                  'sha256': hashlib.sha256(a.output.read_bytes()).hexdigest(),
                  'seconds': report['seconds']}), flush=True)
