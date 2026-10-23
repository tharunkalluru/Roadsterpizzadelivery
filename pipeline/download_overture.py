"""Download Overture places + buildings for the Hyderabad ORR extent into local parquet files.

Run: env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY python3 download_overture.py
"""
import os, time, duckdb

RELEASE = '2026-10-21.0'
CITY = dict(xmin=78.20, xmax=78.70, ymin=17.20, ymax=17.62)   # roughly the Outer Ring Road
OUT = os.path.join(os.path.dirname(__file__), 'raw')
os.makedirs(OUT, exist_ok=True)

con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;")
proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
if proxy:
    con.execute(f"SET http_proxy='{proxy.replace('http://', '')}'")
con.execute("SET ca_cert_file='/root/.ccr/ca-bundle.crt'")
con.execute("CREATE SECRET anon (TYPE s3, KEY_ID '', SECRET '', REGION 'us-west-2')")

base = f"s3://overturemaps-us-west-2/release/{RELEASE}"
where = f"bbox.xmin >= {CITY['xmin']} AND bbox.xmax <= {CITY['xmax']} AND bbox.ymin >= {CITY['ymin']} AND bbox.ymax <= {CITY['ymax']}"

jobs = {
    'overture_places.parquet': f"""
        SELECT id, names.primary AS name, basic_category, taxonomy.primary AS category, taxonomy.hierarchy AS cat_hierarchy,
               taxonomy.alternates AS cat_alt, confidence, brand.names.primary AS brand_name, brand.wikidata AS brand_wikidata,
               addresses, websites, phones, operating_status, sources, ST_X(geometry) AS lon, ST_Y(geometry) AS lat
        FROM read_parquet('{base}/theme=places/type=place/*', hive_partitioning=1, union_by_name=1)
        WHERE {where}""",
    'overture_buildings.parquet': f"""
        SELECT id, names.primary AS name, class, subtype, height, min_height, num_floors, is_underground, roof_shape,
               facade_color, facade_material, roof_color, level, has_parts, sources, ST_AsWKB(geometry) AS wkb,
               (bbox.xmin + bbox.xmax) / 2 AS cx, (bbox.ymin + bbox.ymax) / 2 AS cy
        FROM read_parquet('{base}/theme=buildings/type=building/*', hive_partitioning=1, union_by_name=1)
        WHERE {where}""",
    'overture_segments.parquet': f"""
        SELECT id, names.primary AS name, subtype, class, subclass, connectors, road_surface, road_flags, rail_flags,
               width_rules, level_rules, speed_limits, access_restrictions, routes, sources, ST_AsWKB(geometry) AS wkb
        FROM read_parquet('{base}/theme=transportation/type=segment/*', hive_partitioning=1, union_by_name=1)
        WHERE {where}""",
    'overture_connectors.parquet': f"""
        SELECT id, ST_X(geometry) AS lon, ST_Y(geometry) AS lat
        FROM read_parquet('{base}/theme=transportation/type=connector/*', hive_partitioning=1, union_by_name=1)
        WHERE {where}""",
    'overture_infrastructure.parquet': f"""
        SELECT id, names.primary AS name, subtype, class, height, surface, level, sources, ST_AsWKB(geometry) AS wkb
        FROM read_parquet('{base}/theme=base/type=infrastructure/*', hive_partitioning=1, union_by_name=1)
        WHERE {where}""",
    'overture_land_use.parquet': f"""
        SELECT id, names.primary AS name, subtype, class, surface, sources, ST_AsWKB(geometry) AS wkb
        FROM read_parquet('{base}/theme=base/type=land_use/*', hive_partitioning=1, union_by_name=1)
        WHERE {where}""",
    'overture_water.parquet': f"""
        SELECT id, names.primary AS name, subtype, class, is_salt, is_intermittent, sources, ST_AsWKB(geometry) AS wkb
        FROM read_parquet('{base}/theme=base/type=water/*', hive_partitioning=1, union_by_name=1)
        WHERE {where}""",
}
for fname, sql in jobs.items():
    path = os.path.join(OUT, fname)
    if os.path.exists(path):
        print('exists', fname); continue
    t = time.time()
    try:
        con.execute(f"COPY ({sql}) TO '{path}' (FORMAT parquet, COMPRESSION zstd)")
    except duckdb.BinderException as e:
        # schema drift between releases: retry without optional columns
        print('binder issue, retrying minimal:', str(e)[:160])
        sql2 = sql.replace(', basic_category, taxonomy', '').replace(', operating_status', '')
        con.execute(f"COPY ({sql2}) TO '{path}' (FORMAT parquet, COMPRESSION zstd)")
    n = con.execute(f"SELECT count(*) FROM '{path}'").fetchone()[0]
    print(fname, n, 'rows', round(time.time() - t, 1), 's', round(os.path.getsize(path) / 1e6, 1), 'MB')
