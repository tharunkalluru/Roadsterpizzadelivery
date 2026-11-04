"""Optional anonymous public source re-query. Never modifies packs or game files."""
import argparse
import hashlib
import json
import time
from pathlib import Path

import duckdb

HERE = Path(__file__).resolve().parent
INVENTORY_SHA = "74f326ae165946b826b6456b39fdc696b940958f901fb2facde2f8250f7c4af4"
parser = argparse.ArgumentParser()
parser.add_argument("--inventory", type=Path, default=HERE.parent / "all-tile-only-node-height-boundaries.json")
parser.add_argument("--httpfs", type=Path, required=True, help="Existing compatible DuckDB HTTPFS extension")
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
assert not args.output.exists(), "Refusing to overwrite evidence"
assert hashlib.sha256(args.inventory.read_bytes()).hexdigest() == INVENTORY_SHA
inventory = json.loads(args.inventory.read_text())
prefixes = sorted({r["id"].split("_")[0] for r in inventory["rows"]} |
                  {e["id"].split("_")[0] for r in inventory["rows"] for e in r["currentCoreLevels"]})
assert all(len(p) == 12 and all(c in "0123456789abcdef-" for c in p) for p in prefixes)
connection = duckdb.connect()
connection.execute("LOAD '" + str(args.httpfs).replace("'", "''") + "'")
connection.execute("CREATE SECRET anonymous_tile_boundary_audit (TYPE s3, KEY_ID '', SECRET '', REGION 'us-west-2')")
connection.execute("SET threads=4")
connection.execute("SET http_timeout=35")
base = "s3://overturemaps-us-west-2/release/2026-10-21.0/theme=transportation/type=segment/*"
values = ",".join("'" + p + "'" for p in prefixes)
query = "SELECT id,names.primary AS name,class,width_rules,level_rules,road_flags,access_restrictions,connectors,sources,hex(geometry) AS geometryWKB,bbox FROM read_parquet(?,hive_partitioning=1) WHERE bbox.xmin<78.72 AND bbox.xmax>78.18 AND bbox.ymin<17.64 AND bbox.ymax>17.18 AND substring(id,1,12) IN (" + values + ")"
print("query-start", len(prefixes), "prefixes", flush=True)
start = time.monotonic()
rows = connection.execute(query, [base]).fetchall()
columns = [d[0] for d in connection.description]
output = {"release": "2026-10-21.0", "source": "https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/2026-10-21.0/theme=transportation/type=segment/",
          "query": query, "requestedPrefixes": prefixes, "seconds": time.monotonic() - start,
          "duckdbVersion": duckdb.__version__, "rows": [dict(zip(columns, row)) for row in rows]}
args.output.write_text(json.dumps(output, indent=2, default=str) + "\n")
print(json.dumps({"file": str(args.output), "rows": len(rows), "requested": len(prefixes), "seconds": output["seconds"]}))
