# Continuing storefront naming

ORR road geometry maintenance is documented in [the ORR repair record](../docs/orr-redesign.md).
It uses a separate cached geometry importer, shares the shopfront apply lock and
preserves business evidence. Do not rebuild the city from legacy raw-data scripts
to apply that repair.

The shipped city contains mapped business names placed on inferred building fronts.
That is not evidence of exact current shop order. Original pipeline inputs and
Mapillary image lists/OCR are not included in this repository.

## Source-backed batches and parallel researchers

Researchers work in separate `pipeline/evidence/<corridor>-<date>.json` files.
The schema is:

```json
{
  "schemaVersion": 1,
  "source": "OpenStreetMap",
  "sourceUrl": "https://overpass-api.de/api/interpreter",
  "retrievedAt": "2026-10-23T06:00:00Z",
  "bounds": [17.398, 78.488, 17.412, 78.502],
  "elements": []
}
```

Keep original OSM element IDs, names, coordinates, tags, version/timestamp when
available, and a closed way's original `geometry` if available. Save the query and
source data timestamp as well. Use `name:en` when it exists; preserve the source's
name without inventing titles. Requests to public Overpass servers must remain
serialized and polite; parallelism here is for cached evidence processing.

```bash
python3 pipeline/shopfront_batch.py \
  --evidence pipeline/evidence/rtc-cross-roads-2026-10-23.json \
  --output pipeline/build/rtc-shard-0.json --shards 4 --shard-index 0
```

Other workers use shard indices 1, 2, and 3 with separate output files. A stable
source-ID hash partitions the records without overlaps. A coordinator applies
completed reports once all workers have finished:

```bash
python3 pipeline/shopfront_batch.py --apply pipeline/build/rtc-shard-*.json
```

Re-running an apply is safe. A lock serializes coordinators. Each pack replacement
is atomic, unrelated boards are preserved, and the core manifest's compressed byte
sizes are refreshed. An interrupted apply can be repeated. Reapply the source
batches after a full legacy `patch_boards.py` or map re-export, which replaces the
base board population.

The importer has three outcomes:

- **Existing name matched:** exact original source ID, or one exact name within
  25 metres; attaches the source URL and observation date. It does not move the
  board or certify its facade/order.
- **New named building:** original named OSM building outline matches exactly one
  shipped outline within 1.5 metres and the building has no ground-floor shops.
  Adds the mapped name with an explicitly inferred road-facing facade. It never
  labels this Street View verified.
- **Needs street-photo review:** ambiguous duplicates, point-only missing names,
  changed building outlines, or buildings already containing other ground-floor
  shops. No board is inserted and no existing shop order is rearranged.

Source records may be stale even when retrieved today. A map point is insufficient
to prove whether a business is open, which facade it occupies, its floor, or the
left-to-right order of neighboring stores.

## Resumable Mapillary OCR workers

Use `pipeline/.venv/bin/python` for OCR/matching; the tested versions are pinned
in `pipeline/requirements-ocr.txt`. Credentials come from `MAPILLARY_TOKEN` first,
then the configured macOS Keychain entry. They are never printed or committed.
`MAPILLARY_TOKEN=''` forces cache-only operation. `PIPELINE_BUILD` and `CITY_PACKS`
can override the repository-relative data paths.

Prepare a bounded photo metadata batch before starting workers:

```bash
ZONE=city pipeline/.venv/bin/python pipeline/mapillary_ocr_fast.py \
  --manifest pipeline/build/city-images.json --prepare \
  --max-cells 4 --max-pages 2
```

This makes at most 32 serialized requests, checkpoints partial pagination, and
refreshes the manifest. It starts near the core origin and expands across the
full playable extent. Add `--bbox south,west,north,east` to target a corridor.
The metadata report states credential and dependency readiness explicitly.
Shipped named boards prioritize photo sampling, and streets without mapped names
remain eligible so missing businesses can be discovered.

```bash
ZONE=city pipeline/.venv/bin/python pipeline/mapillary_ocr_fast.py \
  --manifest pipeline/build/city-images.json \
  --shards 2 --shard-index 0 --max-new 40
```

Run shard 1 separately. The same shard cannot run twice concurrently. Completed
images are skipped across all OCR shard files, including before selection caps;
interrupted final JSON lines are repaired, while interior corruption is rejected.

`ocr_match.py` and `ocr_boards.py` read all completed shards, retaining original
image/sequence IDs, URLs, capture dates and licenses. When `placements.json` is
absent, `ocr_candidates.py` derives compatible mapped-name candidates from shipped
board coordinates using the core origin and the exporter's exact inverse
projection. It also supplies the local business-name vocabulary. Recovered facades
remain explicitly inferred. North-facing zero-degree camera headings are valid;
missing sequence IDs do not count as independent photo runs.

OCR outputs are `automated_photo_match_candidate` records, never a claim of exact
current shop order. The legacy `ocr_boards.py --apply` must not run unattended:
it guesses shared-front slots and lacks the source-backed coordinator's atomic
write safeguards. Keep photo candidates for visual evidence and placement review.
See [the bounded Mapillary workflow](../docs/mapillary-background.md) for exact
commands, credential behavior, cache recovery, and the review procedure.

## Verification

```bash
python3 -m unittest discover -s pipeline/tests -v
```

Tests cover disjoint shards, interrupted resume, lock exclusion, zero headings,
exact versus shifted outlines, shared-frontage refusal, source provenance,
idempotent apply, and an intervening frontage update by another worker.

## Bounded citywide naming queue

The citywide coordinator derives one stable research cell per shipped tile from
`core.pack.wasm`, its origin and playable bounds. The current map contains 2,527
one-kilometre cells. It starts near the city origin and expands outward; absent
tiles outside the playable map are not fetched. It refuses to import against a
different projection or silently replace a changed map's saved audit.

These commands inspect the queue without network requests or file changes:

```bash
python3 pipeline/citywide_shopfronts.py status
python3 pipeline/citywide_shopfronts.py run --dry-run
```

Use the bundled Python 3.12 runtime for live OpenStreetMap requests on this
Mac; the system Python 3.9/LibreSSL runtime failed the TLS handshake with Overpass.
The newer runtime succeeds with certificate verification enabled:

```bash
ROADSTER_SOURCE_PYTHON=/Users/tharun/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3
```

Advance a bounded batch, applying only the existing conservative naming rules:

```bash
"$ROADSTER_SOURCE_PYTHON" pipeline/citywide_shopfronts.py run --max-cells 2
```

`--max-cells` defaults to 2 and is capped at 10. All Overpass requests are serial,
with at least 15 seconds between requests by default (`--interval` accepts 10–60).
Queries preserve original OSM metadata and full geometries (`out meta geom`),
including businesses that have only an English `name:en`. The worker stops the
current batch on failure, saves exponential retry cooldowns, and honors numeric
HTTP `Retry-After` values. Long cooldowns do not keep a process sleeping; the next
scheduled invocation resumes when due. Exit 1 means retry items remain; exit 2
means a configuration, layout, or locking error that needs attention.

Progress lives in ignored `pipeline/build/citywide-shopfronts/status.json`; each
cell's original source evidence and reconciliation report live in `evidence/`
and `reports/` below that directory. Preserve this directory between runs. A lock
prevents overlapping coordinators, JSON replacements are atomic, successful cells
are skipped, and interrupted applications reuse cached evidence/reports rather
than requesting the same data again. Reapplying a pack update is idempotent.
`--state-dir PATH` selects another audit directory; `--core PATH` selects another
city core and its adjacent `packs/` directory. Use a new audit directory after a
full city export that replaces the board population, or reapply retained reports.

`processedCells` measures source processing coverage, **not street reconstruction
completeness**. The coordinator's `streetVerifiedCells` remains zero: a mapped
business name does not verify its facade, current operation, floor, or neighboring
shop order. Ambiguous candidates stay in the reports for photo review. Summary
record counts can include the same source crossing more than one tile boundary;
successful importer writes still deduplicate original source IDs. Recorded write
counts are conservative after an interruption between a pack write and state save.
Keep this queue independent of Mapillary metadata/OCR progress, and use the
Mapillary workflow above when imagery access and dependencies are available.

## Source-mapped traffic signals

`traffic_signals.py` imports the cached whole-bounds OSM signal snapshot and
original incident-way directions into optional authoritative core metadata:

```sh
pipeline/.venv/bin/python pipeline/traffic_signals.py --report pipeline/build/signals-review.json
pipeline/.venv/bin/python pipeline/traffic_signals.py --apply
```

The importer shares the storefront apply lock, atomically replaces only the
core's signal/source fields and refuses partial bounds or an unexpected large
source-population drop. A repeated apply is byte-idempotent. It preserves all
street-pack bytes, roads, boards, buildings and the pack manifest. Original source
IDs, tags, versions and edit timestamps remain in evidence. Private-access nodes
are excluded. Reapply this metadata after any deliberately approved full legacy
city export; do not use the legacy export to update an existing city.

The runtime replaces legacy/synthetic signal furniture using this source list.
Unmatched points remain in the review queue. Mapped points are not surveyed pole
or stop-line placements, and OSM is not an exhaustive current city inventory.
Light phases/timings are an explicit game simulation shared by NPCs and lamps;
no live Hyderabad signal-controller timings are claimed.
