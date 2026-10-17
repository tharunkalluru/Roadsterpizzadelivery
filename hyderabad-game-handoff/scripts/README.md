# Handoff validation, source acquisition and inventory scripts

These Python 3.10+ scripts use only the standard library. They prepare and inspect source material for the game builder. They do not implement the game or establish that Hyderabad has been fully reconstructed.

The default manifest is resolved from each script's own location:

`../resources/osm/resource-acquisition-manifest.json`

The commands below work from the kit root. Absolute script paths also work from another working directory.

## Check the complete original handoff

```bash
python3 scripts/check_handoff.py
```

Run this before intentionally modifying the handoff. It verifies manifest-listed paths, sizes and SHA-256 hashes, parses listed JSON, checks the complete 82 acceptance IDs and descriptions against the master, verifies the master hash binding, and checks the shared flight, required platforms, Whiteout reference and Claude Code setup invariants. It also checks indexed local resource paths.

Exit 0 means this handoff is internally consistent, exit 1 reports failed validation, and exit 2 reports a parse, input or file error. It does not verify an independent signature, inspect gameplay, certify imagery or measurements, or start a game. The application is built separately inside game/. Keep the original kit intact when copying and adapting contracts into that app.

The original user-provided prompting guide and downloaded source/license files are preserved as source material. Authored-document style checks do not rewrite those bytes.

## 1. Verify the frozen cache before building

```bash
python3 scripts/fetch_sources.py --verify
```

Running `fetch_sources.py` with no arguments has the same behavior. It makes no network requests, writes no source files, and compares every manifest-listed file's byte count and SHA-256 against the frozen manifest.

An exit code of `0` means all listed bytes match. It does not prove that the manifest is independently authenticated or that any mapped feature is correct in the real world. A hash check is a reproducibility check, not a survey.

## 2. Calculate a source inventory

```bash
python3 scripts/inventory_osm.py --output /tmp/hyderabad-source-inventory.json
```

The output report is created exclusively. If that path already exists, choose a new report name. The script never replaces an existing file through this option.

To inspect the report without creating a file:

```bash
python3 scripts/inventory_osm.py --json
```

The inventory first verifies all hashes. It then selects the four manifest-listed corridor XML sources numbered `01` through `04`, parses their OSM elements, and deduplicates by `(type, id)`.

It calculates:

- Unique node, way, and relation counts.
- Highway classifications and the presence of name, width, lanes, oneway, and surface tags.
- Building height and level-tag coverage.
- POI and multilingual name-tag counts.
- Missing node references in ways.
- Missing member references in parent relations, with the exact unresolved references.
- Imported turn-restriction relations and missing members.
- Different object versions across overlapping extracts.
- Contradictory semantic content for the same object version.
- Suspicious raw name fields, with source IDs and review reasons.

The highest encountered object version is selected for counting. If the same version has conflicting contents, the first encountered representation is retained and the conflict is reported. Conflicts do not pass the source inventory gate. The frozen inputs are never modified.

Name checks only flag possible placeholders, location descriptions, specific suspicious spellings, whitespace, and control characters. They do not automatically correct, translate, title-case, merge, or replace names. A legitimate business can match a heuristic, and an incorrect name can evade one. Human or independently evidenced review remains necessary.

### Baseline observed in this kit

These values were calculated from the bundled four-box extract. The scripts do not hard-code them as passing results.

| Metric | Observed value |
|---|---:|
| Unique nodes | 37,990 |
| Unique ways | 8,336 |
| Unique relations | 56 |
| Highway-tagged ways | 1,347 |
| Highway ways carrying `name` | 165 |
| Highway ways carrying `width` | 7 |
| Highway ways carrying `lanes` | 26 |
| Building features | 6,767 |
| Building features carrying `height` | 2 |
| Building features carrying `building:levels` | 26 |
| POI-tagged features | 269 |
| POI features carrying `name` | 218 |
| Named features overall | 632 |
| Named features carrying `name:te` | 34 |
| Ways with missing node references | 0 |
| Parent relations with missing members | 25 |
| Imported turn-restriction relations | 0 |
| Source-version conflicts | 0 |
| Same-version content conflicts | 0 |
| Suspicious raw name fields | 7 |

Highway ways are not a count of physical roads. They include road segments, footways, steps, and service areas. Named features are not a count of shops. Missing tags do not establish that a real-world attribute is absent.

Zero turn-restriction relations means that this import has no such records. It does not mean that every turn is allowed.

## 3. Explicitly acquire a new source snapshot

The supplied sources are already downloaded. Refresh only when a new dated source comparison is intended:

```bash
python3 scripts/fetch_sources.py --refresh
```

This creates a new uniquely named UTC directory under `resources/osm-snapshots/`. It never overwrites the frozen cache or an earlier snapshot.

To select a different parent directory:

```bash
python3 scripts/fetch_sources.py --refresh --output-root /tmp/hyderabad-source-snapshots
```

To refresh one manifest-listed resource:

```bash
python3 scripts/fetch_sources.py --refresh --only metro-network-full.json
```

`--only` can be repeated. A snapshot containing only metro data can be hash-verified, but the corridor inventory deliberately requires all four corridor XML sources.

The refresh helper:

- Uses manifest-provided GET URLs for public OSM sources.
- Supports the documented metro Overpass POST with its manifest-listed `.overpassql` file.
- Requires the POST query bytes to match their frozen manifest hash before sending them.
- Copies that verified query into the new snapshot for reproducibility.
- Skips derived reports and other entries without download URLs. Derived reports must be recalculated against the new sources.
- Restricts requests and redirects to HTTPS on `api.openstreetmap.org`, `www.openstreetmap.org`, `openstreetmap.org`, and `overpass-api.de`.
- Accepts only OSM GET map and relation endpoints under `/api/0.6/`, and GET or the documented read-only POST at the Overpass interpreter.
- Rejects URL credentials and credential-like query parameters. It uses no API keys, cookies, authorization headers, or ambient proxy credentials.
- Runs requests sequentially, with a one-second delay by default and no automatic retry loop.
- Allows at most 20 source requests per invocation. Use an appropriate bulk extract for larger acquisition work.
- Applies a 12 MiB default response cap per source and a 40 MiB budget for fully received responses. An interrupted or oversized attempt remains bounded by its per-request cap; bytes consumed by a failed partial transfer are not included in the completed-response total.
- Uses a 30-second socket timeout and a 60-second elapsed-time guard by default. The guard is checked between reads, so a blocked read can finish up to one socket timeout after that guard expires.
- Rejects HTML, malformed XML/JSON, embedded API errors, and Overpass error remarks before treating a response as usable source data.
- Records new hashes, byte counts, timestamps, element counts, previous hashes, and failures in a separate snapshot manifest.

The helper uses direct HTTPS and does not read proxy credentials from the environment. A network that requires an authenticated proxy may block refresh. Local cache verification and inventory remain available.

After a complete refresh, copy the printed snapshot path into these commands:

```bash
python3 scripts/fetch_sources.py --verify --manifest /absolute/snapshot/path/resource-acquisition-manifest.json
python3 scripts/inventory_osm.py --manifest /absolute/snapshot/path/resource-acquisition-manifest.json --output /tmp/hyderabad-new-source-inventory.json
```

The example snapshot path must be replaced with the actual printed path. A partial snapshot remains partial even when its successfully downloaded files have valid hashes. Inspect its `status` and `failures` fields before accepting it. Refresh does not promote itself into the frozen baseline or the game world package.

## 4. Interpret exit codes and reports

| Script result | Exit code | Meaning |
|---|---:|---|
| Cache verification passes | 0 | Listed bytes match the supplied manifest. |
| Inventory completes with no source conflicts or missing way nodes | 0 | Import can move to geographic review. Partial parent relations and attribute/name gaps remain explicit. |
| Any cache mismatch, source conflict, or missing way nodes | 1 | Resolve the reported source problem before relying on this inventory. |
| Refresh has any failed source | 1 | A dated partial snapshot is retained with a failure report. |
| Invalid argument, unsafe path/URL, malformed manifest, or file error | 2 | The requested operation could not complete. |

`source_inventory_complete_requires_geographic_review` is an intentionally limited result. It is not a storefront, navigation, flight-clearance, art-quality, or release approval.

For a game release, the build monitor must separately establish selected-road connectivity, car access, legal approach direction, canonical names, surveyed or evidenced widths/heights, facade placement, delivery entrances, physical collisions, flight behavior, and measured phone performance.

OSM `layer` is relative stacking, not metres. A metro stop coordinate is not a road entrance. Missing parent members are unresolved references, not proof that those features do not exist. Raw OSM contributor metadata and POI contact tags should not be copied into runtime payloads unless the game needs them or provenance requires them.

## 5. Run local failure tests

```bash
python3 scripts/inventory_osm.py --self-test
python3 scripts/fetch_sources.py --self-test
```

The inventory tests cover tampered bytes, path traversal and symlink escape, overlapping source versions, conflicting same-version content, missing references, suspicious names, API error payloads, and refusal to overwrite reports.

The acquisition tests use mocked network responses. They verify the offline default, allowed hosts/methods, redirect rejection, a response-size failure, query-hash checking, preservation of frozen bytes, unique snapshot directories, and valid GET/POST snapshot manifests. They make no live provider requests.

The included live source data was acquired separately with recorded URLs and timestamps. These mocked tests do not establish future service availability. No script test establishes geographic accuracy or device performance.

## Source and API references

- [OpenStreetMap data licensing](https://www.openstreetmap.org/copyright)
- [OSM API documentation](https://wiki.openstreetmap.org/wiki/API_v0.6)
- [Overpass public-instance guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)
- [Overpass bounding-box order](https://dev.overpass-api.de/overpass-doc/en/full_data/bbox.html)
- [Overpass QL reference](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL)

Public OSM and Overpass endpoints are source acquisition services. Package reviewed world data for the game and serve it from the game's own static asset pipeline. Do not make timed gameplay depend on these public services.
