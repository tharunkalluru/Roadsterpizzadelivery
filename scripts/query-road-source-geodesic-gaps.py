"""One bounded anonymous retained-release query; never alters repair/model data."""
import argparse
import hashlib
import json
import time
from pathlib import Path

import duckdb

parser = argparse.ArgumentParser()
parser.add_argument("--missing", type=Path, required=True)
parser.add_argument("--httpfs", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--expected-count", type=int, choices=[1, 35], default=35)
parser.add_argument("--missing-key", choices=["missingSourcePrefixes", "missingRepairSourcePrefixes"], default="missingSourcePrefixes")
args = parser.parse_args()
profile_path = args.output.with_suffix(".profile.json")
assert not args.output.exists() and not profile_path.exists(), "Refusing to overwrite evidence"
missing_bytes = args.missing.read_bytes()
prefixes = sorted(set(json.loads(missing_bytes)[args.missing_key]))
assert len(prefixes) == args.expected_count and all(len(p) == 12 and all(c in "0123456789abcdef-" for c in p) for p in prefixes)
connection = duckdb.connect()
connection.execute("LOAD '" + str(args.httpfs).replace("'", "''") + "'")
connection.execute("CREATE SECRET anonymous_geodesic_gap_audit (TYPE s3, KEY_ID '', SECRET '', REGION 'us-west-2')")
connection.execute("SET threads=4")
connection.execute("SET http_timeout=35")
connection.execute("PRAGMA enable_profiling='json'")
connection.execute("PRAGMA profiling_output='" + str(profile_path).replace("'", "''") + "'")
source = "s3://overturemaps-us-west-2/release/2026-10-21.0/theme=transportation/type=segment/*"
query = "SELECT id,names.primary AS name,class,width_rules,level_rules,road_flags,access_restrictions,connectors,sources,hex(geometry) AS geometryWKB,bbox FROM read_parquet(?,hive_partitioning=1) WHERE bbox.xmin<78.72 AND bbox.xmax>78.18 AND bbox.ymin<17.64 AND bbox.ymax>17.18 AND substring(id,1,12) IN (" + ",".join("'" + p + "'" for p in prefixes) + ")"
print("query-start", len(prefixes), "exact prefixes", flush=True)
start = time.monotonic()
rows = connection.execute(query, [source]).fetchall()
columns = [d[0] for d in connection.description]
result = [dict(zip(columns, row)) for row in rows]
connection.close()
returned = [row["id"][:12] for row in result]
assert sorted(returned) == prefixes, "Missing/ambiguous retained source prefix"
output = {"release": "2026-10-21.0", "source": "https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/2026-10-21.0/theme=transportation/type=segment/",
          "missingAuditSHA256": hashlib.sha256(missing_bytes).hexdigest(), "query": query, "requestedPrefixes": prefixes,
          "seconds": time.monotonic() - start, "duckdbVersion": duckdb.__version__, "rows": result,
          "scope": f"Exact{args.expected_count}missing source prefixes for the bounded source-cut audit. Anonymous public read only; no account/billing, geometry inference, activation or model mutation."}
args.output.write_text(json.dumps(output, indent=2, default=str) + "\n")
print(json.dumps({"rows": len(result), "bytes": args.output.stat().st_size, "seconds": output["seconds"],
                  "sha256": hashlib.sha256(args.output.read_bytes()).hexdigest(), "profile": str(profile_path)}, indent=2), flush=True)
