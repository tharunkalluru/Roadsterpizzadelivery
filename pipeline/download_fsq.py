"""Download Foursquare OS Places (Apache 2.0) for the Hyderabad ORR extent. Needs HF_TOKEN in the environment
(the dataset is gated on Hugging Face; the token is never written to disk by this script)."""
import os, time, duckdb
OUT = os.path.join(os.path.dirname(__file__), 'raw', 'fsq_places.parquet')
DT = '2026-10-15'
con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs;")
p = os.environ.get('HTTPS_PROXY')
if p: con.execute(f"SET http_proxy='{p.replace('http://', '')}'")
con.execute("SET ca_cert_file='/root/.ccr/ca-bundle.crt'")
con.execute(f"CREATE SECRET hf (TYPE huggingface, TOKEN '{os.environ['HF_TOKEN']}')")
t = time.time()
con.execute(f"""COPY (
  SELECT fsq_place_id, name, latitude AS lat, longitude AS lon, address, locality, postcode, fsq_category_ids,
         fsq_category_labels, date_created, date_refreshed, date_closed, tel, website
  FROM read_parquet('hf://datasets/foursquare/fsq-os-places/release/dt={DT}/places/parquet/*.parquet')
  WHERE country = 'IN' AND latitude BETWEEN 17.20 AND 17.62 AND longitude BETWEEN 78.20 AND 78.70
) TO '{OUT}' (FORMAT parquet, COMPRESSION zstd)""")
print('fsq rows', con.execute(f"SELECT count(*) FROM '{OUT}'").fetchone()[0], round(time.time() - t), 's')
