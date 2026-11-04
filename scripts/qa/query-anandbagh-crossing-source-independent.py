"""Bounded anonymous immutable Overture read for three actual crossing roads."""
import argparse,hashlib,json,time
from pathlib import Path
import duckdb
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);a=p.parse_args();assert not a.output.exists()
prefixes=['f6178e1c-79a','551f9213-352','c8594f29-bfe']
source='s3://overturemaps-us-west-2/release/2026-10-21.0/theme=transportation/type=segment/*'
query="SELECT *,hex(geometry) AS geometryWKB FROM read_parquet(?,hive_partitioning=1) WHERE bbox.xmin<78.72 AND bbox.xmax>78.18 AND bbox.ymin<17.64 AND bbox.ymax>17.18 AND substring(id,1,12) IN ("+','.join("'"+x+"'"for x in prefixes)+')'
c=duckdb.connect();c.execute("LOAD '/tmp/tarnaka-duckdb-ext/httpfs.duckdb_extension'");c.execute("CREATE SECRET anand_crossing_read_only (TYPE s3, KEY_ID '', SECRET '', REGION 'us-west-2')");c.execute('SET threads=4');c.execute('SET http_timeout=35')
t=time.monotonic();print('query-start:3 exact source prefixes',flush=True);r=c.execute(query,[source]);keys=[d[0]for d in r.description];rows=[dict(zip(keys,row))for row in r.fetchall()];c.close()
assert sorted(r['id'][:12]for r in rows)==sorted(prefixes),'Missing or ambiguous official identity'
report={'release':'2026-10-21.0','source':source,'query':query,'prefixes':prefixes,'rows':rows,'seconds':time.monotonic()-t,'duckdbVersion':duckdb.__version__,'scope':'Read-only full identity/connectors/geometry for source-classifying actual Anandbagh finite crossing witnesses; no source geometry/profile/node/manifest change and no metric survey inferred.'}
with a.output.open('x')as f:json.dump(report,f,indent=2,default=str);f.write('\n')
print(json.dumps({'output':str(a.output),'rows':len(rows),'sha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'seconds':report['seconds']}),flush=True)
