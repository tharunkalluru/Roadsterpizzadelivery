# Bounded Mapillary storefront research

The background naming queue can sample the full playable city incrementally.
Mapillary observations supplement Overture/Foursquare/OpenStreetMap names; a
source name or an OCR reading alone does not establish today's exact storefront,
floor, or left-to-right order. Original image IDs, capture dates, sequence IDs,
source links, and license remain attached to observations.

## Credentials and runtime

The worker uses `MAPILLARY_TOKEN` when present. On macOS, when that variable is
absent, it reads only the user's configured Keychain item with account
`thisistharun` and service `codex-roadster-mapillary`. Its contents are captured in
memory and never printed or saved in repository files. `MAPILLARY_TOKEN=''`
explicitly requests cache-only operation. Missing credentials produce
`metadata.status: missing_token`, leave pending work pending, and make zero
Mapillary requests. Existing cached image metadata can still be selected.

Use the repository `pipeline/.venv/bin/python` when its OCR dependencies are installed:
`numpy`, `opencv-python`, `rapidocr-onnxruntime`, `rapidfuzz`, and `wordninja`.
Install the tested direct dependency versions with
`pipeline/.venv/bin/python -m pip install -r pipeline/requirements-ocr.txt`.
Metadata preparation needs only Python's standard library. Each preparation
report includes `ocrReadiness.status` and a list of missing package names.
An OCR run with pending images and missing dependencies stops with that explicit
list rather than failing deep inside the image processor.

## Prepare one bounded batch

From the repository root:

```bash
ZONE=city pipeline/.venv/bin/python pipeline/mapillary_ocr_fast.py \
  --prepare --manifest pipeline/build/city-images.json \
  --max-cells 1 --max-pages 1
```

This makes at most **four metadata requests**: four sub-boxes within one pending
0.01-degree city cell. It does not enumerate every city cell over the network.
The default `--max-cells 4 --max-pages 2` permits at most 32 requests. Requests are
serialized, each with a 30-second timeout, with no automatic request retries in
this preparation stage. `--max-pages` applies separately to each sub-box.

To work on a particular corridor, add a bbox in **south,west,north,east** order:

```bash
ZONE=city pipeline/.venv/bin/python pipeline/mapillary_ocr_fast.py \
  --prepare --manifest pipeline/build/rtc-images.json \
  --bbox 17.398,78.488,17.412,78.502 --max-cells 1 --max-pages 1
```

With no bbox, the shipped core manifest's full bounds define the region,
including map edges beyond the old ORR sampling box. Pending cells run from the
core origin outward, bringing central shop areas forward while still covering
the periphery; changing bbox does not change cell identities or relative priority. A stable grid allows overlapping corridor queries to reuse the same completed
cells. Metadata requests cover intersecting grid cells; selected images are
filtered to the requested bbox. Hero and spots selections use the same bounded
metadata preparation. `ZONE=spots` requires multiple photo runs near a shop area
and may legitimately produce no images even when the metadata cache is populated.

Completed cells live in `pipeline/build/mly_images_city.jsonl`. Partial cells,
including resumable pagination cursors, live in
`pipeline/build/mly_metadata_progress.jsonl`. Pagination URLs containing access
tokens are never stored. Failed cells remain pending; error reports contain only
exception classes. A preparation lock prevents duplicate coordinators from
writing the metadata cache simultaneously. Interrupted final JSONL lines are
repaired; internal corruption fails explicitly.

`--prepare` refreshes an existing manifest from the current cache and the bounded
new batch. `pipeline/build/mly_prepare_status.json` and the manifest's `metadata`
record report visited/completed/remaining cells, request counts, cached images,
credential presence, and OCR dependencies. Status `partial` is expected until all
selected cells are complete. A completed metadata cell means its paginated image
listing is complete; it does **not** mean that every storefront there was read,
verified, or added to the game.

## Read selected photos in parallel

Only start OCR workers after the shared manifest has been prepared:

```bash
ZONE=city pipeline/.venv/bin/python pipeline/mapillary_ocr_fast.py \
  --manifest pipeline/build/city-images.json \
  --shards 2 --shard-index 0 --max-new 20
```

Run shard 1 separately with `--shard-index 1`. Stable image hashing keeps work
disjoint. Outputs are append-only shard files; completed image IDs across all
shards are skipped on future runs. Original image bytes are processed in memory
and discarded. `--max-new` bounds each worker's image count. CPU OCR time and
thumbnail download time remain variable.

## Match candidates without original placement files

```bash
pipeline/.venv/bin/python pipeline/ocr_match.py
pipeline/.venv/bin/python pipeline/ocr_boards.py
```

These commands generate reports without changing city packs. When the original
`pipeline/build/placements.json` exists, it is used with its original IDs and
flags. When it does not, `ocr_candidates.py` derives compatible candidate records
from shipped board coordinates and `game/public/city/core.pack.wasm`'s origin.
It uses exactly the inverse ellipsoid projection from `export_city.py`, preserves
board IDs and source links, and marks the recovered placement
`mapped_board_candidate_inferred_facade`. This fallback also supplies the
conservative local business-name vocabulary; it does not invent name readings or
upgrade mapped fronts to photo verification.

Photo matches and generated new-board candidates are labeled
`automated_photo_match_candidate`, with inferred or ray-cast placement status
retained separately. Their `sources` include each original Mapillary image link,
capture timestamp, sequence ID, and license. The existing `images`/`photos` ID
arrays remain available for legacy tooling.
For each hourly review, take at most ten unreviewed candidates from
`ocr_photo_boards.json` and ten matches from `ocr_matches.json`, scoped to the
current corridor. Open each original image at
`https://www.mapillary.com/app/?pKey=IMAGE_ID` and inspect the actual sign; compare
independent photo sequences and dates, the mapped building/facade/floor, and its
neighbors' order. Record readable source text, image IDs/URLs, capture dates,
review date, board/building IDs, and an explicit accepted/ambiguous/stale decision
in a separate evidence file before any individual board update. Ambiguous or
unreadable candidates stay pending, and conflicting dates must not silently
rename the current shop.

There is currently **no reviewed-photo apply command**. The background coordinator
can add only unambiguous OSM names through `shopfront_batch.py`'s source-backed
path; Mapillary results stay review candidates until their visual evidence and
placement are reviewed and applied individually. The legacy `ocr_boards.py
--apply` reallocates shared-front slots automatically and lacks the newer
coordinator's lock, atomic pack replacement, and core-size refresh. It must not
be used as an unattended batch importer. Metadata
preparation, OCR, and candidate generation never run the legacy
`ocr_boards.py --apply` automatically.

Run the offline regressions with:

```bash
python3 -m unittest discover -s pipeline/tests -p test_mapillary_readiness.py -v
```

The tests cover projected coordinates and changed origins, unchanged legacy flags,
bounded request budgets, resumable pages, secret-free errors/cache files,
credential precedence, missing dependencies, and cache-only CLI behavior.
