# Continuing storefront naming

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

Use a local Python environment containing `numpy`, `opencv-python`,
`rapidocr-onnxruntime`, `rapidfuzz`, and `wordninja` for OCR/matching. Set your own
`MAPILLARY_TOKEN` in the environment. It is never committed or printed by the
worker. `PIPELINE_BUILD` and `CITY_PACKS` can override the repository-relative data
paths.

Prepare photo metadata once before starting workers:

```bash
ZONE=spots python3 pipeline/mapillary_ocr_fast.py \
  --manifest pipeline/build/spots-images.json --prepare
```

Shipped named boards provide photo-sampling density when original placement files
are absent. This prioritization does not promote those placements to verified
observations. Reading photos from a prepared manifest is resumable:

```bash
ZONE=spots python3 pipeline/mapillary_ocr_fast.py \
  --manifest pipeline/build/spots-images.json \
  --shards 4 --shard-index 0 --max-new 250
```

Run the other shard indices in separate workers. The same shard cannot be run
twice concurrently. Completed images are skipped across all OCR shard files;
interrupted final JSON lines are repaired, while interior corruption is rejected.
`ocr_match.py` and `ocr_boards.py` read all completed shards and retain original
image IDs/sequence IDs. The application pass preserves photo attribution and
existing source-backed additions. North-facing zero-degree camera headings are
preserved correctly. Missing sequence IDs do not count as independent photo runs.

`ocr_match.py` still needs the original `placements.json`; `ocr_boards.py` needs it
for its conservative business-name vocabulary. Restore that build input before
running either final matching stage. OCR alone does not certify a shop's current
name or exact order; candidates remain attributable automated photo observations.

## Verification

```bash
python3 -m unittest discover -s pipeline/tests -v
```

Tests cover disjoint shards, interrupted resume, lock exclusion, zero headings,
exact versus shifted outlines, shared-frontage refusal, source provenance,
idempotent apply, and an intervening frontage update by another worker.
