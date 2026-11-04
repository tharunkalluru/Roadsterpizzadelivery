"""Bounded public read of three missing immutable-release connector records."""
import argparse
import hashlib
import json
import time
from pathlib import Path
import duckdb

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--output', type=Path, required=True)
a = p.parse_args()
assert not a.output.exists(), 'Preserve evidence'
prefixes = ['55d8e614-341', 'dff0279b-409', 'b15cc638-da9']
source = 's3://overturemaps-us-west-2/release/2026-10-21.0/theme=transportation/type=segment/*'
query = "SELECT *,hex(geometry) AS geometryWKB FROM read_parquet(?,hive_partitioning=1) WHERE bbox.xmin<78.72 AND bbox.xmax>78.18 AND bbox.ymin<17.64 AND bbox.ymax>17.18 AND substring(id,1,12) IN (" + ','.join("'"+x+"'" for x in prefixes) + ')'
c = duckdb.connect()
c.execute("LOAD '/tmp/tarnaka-duckdb-ext/httpfs.duckdb_extension'")
c.execute("CREATE SECRET cap_connector_read_only (TYPE s3, KEY_ID '', SECRET '', REGION 'us-west-2')")
c.execute('SET threads=4')
c.execute('SET http_timeout=35')
t = time.monotonic()
print('query-start:3 exact source prefixes', flush=True)
result = c.execute(query, [source])
keys = [d[0] for d in result.description]
rows = [dict(zip(keys, row)) for row in result.fetchall()]
c.close()
assert sorted(row['id'][:12] for row in rows) == sorted(prefixes), 'Source records missing or ambiguous'
report = {'release': '2026-10-21.0', 'query': query, 'source': source, 'prefixes': prefixes, 'rows': rows, 'seconds': time.monotonic()-t, 'duckdbVersion': duckdb.__version__, 'scope': 'Anonymous read-only source completion for one historical same-connector cap datum. No profile/model/cut/manifest change or height survey inference.'}
with a.output.open('x') as f:
    json.dump(report, f, indent=2, default=str)
    f.write('\n')
print(json.dumps({'rows': len(rows), 'sha256': hashlib.sha256(a.output.read_bytes()).hexdigest(), 'seconds': report['seconds']}), flush=True)
