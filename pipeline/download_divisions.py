"""Neighbourhood and locality names (Overture divisions, ODbL via OSM) for the city extent -> raw/overture_divisions.parquet
Run: env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY python3 download_divisions.py
"""
import os, duckdb
RELEASE = '2026-10-21.0'
CITY = dict(xmin=78.20, xmax=78.70, ymin=17.20, ymax=17.62)
OUT = os.path.join(os.path.dirname(__file__), 'raw')
con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;")
proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
if proxy: con.execute(f"SET http_proxy='{proxy.replace('http://', '')}'")
con.execute("SET ca_cert_file='/root/.ccr/ca-bundle.crt'")
con.execute("CREATE SECRET anon (TYPE s3, KEY_ID '', SECRET '', REGION 'us-west-2')")
base = f"s3://overturemaps-us-west-2/release/{RELEASE}"
where = f"bbox.xmin >= {CITY['xmin']} AND bbox.xmax <= {CITY['xmax']} AND bbox.ymin >= {CITY['ymin']} AND bbox.ymax <= {CITY['ymax']}"
con.execute(f"""COPY (SELECT id, names.primary AS name, subtype, class, ST_X(geometry) AS lon, ST_Y(geometry) AS lat
  FROM read_parquet('{base}/theme=divisions/type=division/*', hive_partitioning=1, union_by_name=1)
  WHERE {where} AND subtype IN ('locality','neighborhood','microhood','macrohood'))
  TO '{OUT}/overture_divisions.parquet' (FORMAT parquet)""")
print(con.execute(f"SELECT subtype, count(*) FROM '{OUT}/overture_divisions.parquet' GROUP BY 1").fetchall())
