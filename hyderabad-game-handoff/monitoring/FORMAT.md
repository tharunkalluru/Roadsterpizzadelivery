# Monitoring ledger format and verifier

## What is supplied

| File | Purpose |
|---|---|
| `SUPERVISOR_PROMPT.md` | Instructions for continuous implementation supervision and final review. |
| `status.template.json` | An explicitly unstarted run with 82 `not_run` checks and eight unpassed gates. |
| `scope.template.json` | An unfrozen, empty geographic inventory with unknown length denominators. |
| `requirements.template.json` | All 82 acceptance descriptions from the revised master specification and minimum evidence policies. |
| `evidence-index.template.json` | An empty evidence index. |
| `verify_run.py` | Standard-library-only, read-only ledger and file-integrity validator. |
| `test_verify_run.py` | Synthetic self-tests of the validator. They do not test the proposed game. |

Use Python 3.9 or later. The CLI does not download, execute project code, change metadata, repair hashes, send network requests, or publish anything. The separate test suite creates temporary artificial fixtures and deletes them when tests finish.

Use Python 3.10 or newer for the handoff as a whole. This supplied product contract requires both Android and iOS exactly once in required_platforms. Removing either platform does not reduce the required release evidence; the checker rejects that weakened configuration.

The validator is an integrity and readiness checker for declared records. It is not an authenticator of physical devices, photographs, geographic facts, reviewer identity, or semantic test correctness. A self-consistent fabricated ledger can satisfy structural checks. The supervisor must inspect evidence and independently rerun consequential checks.

## Initialize an implementation project

Copy the templates into the actual implementation project using these target paths:

| Template | Target |
|---|---|
| `status.template.json` | `qa/status.json` |
| `scope.template.json` | `scope-manifest.json` |
| `requirements.template.json` | `requirements.json` |
| `evidence-index.template.json` | `qa/evidence-index.json` |

Keep the supplied project contract at `config/project-contract.json`. Keep the validator and supervisor files under `monitoring/` or invoke the validator through its actual location.

Do not copy passing results from the synthetic tests. Initialize from the empty templates.

From the project root, run:

```bash
python monitoring/verify_run.py --root . --status qa/status.json --requirements requirements.json --scope scope-manifest.json --evidence qa/evidence-index.json
```

For a release check, append `--release`.

| Exit code | Meaning |
|---|---|
| 0 in report mode | The ledger is structurally consistent. It may still be completely unimplemented. Read `ready_for_requested_release`. |
| 0 in release mode | No structural errors or declared completion blockers were found for the entire requested release. Underlying evidence still needs substantive review. |
| 1 | Release mode found incomplete, failed, blocked, stale, or missing completion work. |
| 2 | Invalid JSON/schema, contradictory claims, unsafe paths, missing files for claimed evidence, hash mismatch, or other invalid ledger data. |

The CLI writes its JSON report to standard output. It does not save a report file unless the caller explicitly redirects output. Initial templates should return `valid_ledger: true`, `ready_for_requested_release: false`, and 82 `not_run` checks in report mode. They must fail release mode.

## Shared conventions

All four ledgers and the bound configuration/build/world manifests use integer `schema_version: 1` and a common nonempty `project_id`. Booleans are actual JSON booleans. Nonnegative numeric values must be finite. Unknown selected-scope denominators are `null`, not zero or 100%.

IDs are stable nonempty strings and unique within their inventories. Requirement IDs must be exactly G01-G12, F01-F24, M01-M14, U01-U12, P01-P08, and Q01-Q12. Gate IDs must be exactly C0-C7. All 82 requirements remain mandatory for the requested final release.

Check/evidence/gate results are `passed`, `failed`, `blocked`, `not_run`, or `stale`. A skipped or timed-out operation is not a pass. Retain historical results separately; a current passed check must link only to current, relevant, valid passing records.

Timestamps use ISO 8601 with an explicit timezone. Source observation dates can use a dated source string where exact time is unavailable. Do not invent a date to make a record look current.

### Artifact references

Every artifact reference has this shape:

```json
{
  "path": "qa/evidence/actual-test-log.json",
  "sha256": "64 lowercase hexadecimal characters from the actual file"
}
```

The explanatory hash above is a format description, not a usable digest. Compute hashes from actual file bytes.

Paths are relative POSIX paths inside `--root`. Absolute paths, parent traversal, backslashes, drive/URL prefixes, symlink escapes, nonexistent evidence files, and mismatched hashes are rejected. Metadata files are limited to 16 MiB each; evidence artifacts are streamed for hashing.

In an initial `status.bindings` entry, the hash can be null while the artifact is unbuilt. That creates a completion blocker. Null is not allowed for an artifact used as passing evidence.

## Status

The supplied template is the canonical top-level shape. Populate:

- `run_id`, `updated_at`, `phase`, and `activity` with actual execution state.
- `requested_release` with `completed_requested_network`.
- `achieved_release` with one of `development_fixture`, `playable_authentic_slice`, `playable_corridor_with_gaps`, `geographically_verified_corridor`, `mobile_validated_verified_corridor`, or `completed_requested_network`.
- `code_revision` with the actual source revision, or null until one is recorded.
- `bindings` with references to the current build, world, config, scope, and requirements files.
- `checks` with all 82 IDs, result, and `evidence_ids` array.
- `gates` with all eight IDs and results.
- `blockers` and `next_actions` with plain-language arrays.
- `budget_usage` with recorded nonnegative `paid_spend`, `source_download_bytes`, `asset_bytes`, and `elapsed_minutes`.

Default binding paths are:

| Binding | Path |
|---|---|
| build | `dist/build-manifest.json` |
| world | `public/world/world-manifest.json` |
| config | `config/project-contract.json` |
| scope | `scope-manifest.json` |
| requirements | `requirements.json` |

The scope and requirements bindings must identify the same files supplied through the CLI arguments. Extra informational fields are permitted; they do not override required fields or weaken evidence policies.

## Configuration contract

The validator reads the hash-bound configuration. Required settings are:

```json
{
  "schema_version": 1,
  "project_id": "hyderabad-metro-delivery",
  "requested_release": "completed_requested_network",
  "simulation_hz": 60,
  "required_platforms": ["android", "ios"],
  "flight": {
    "model": "shared_per_contract",
    "default_budget_seconds": 25,
    "allowed_budget_seconds": [20, 25, 30],
    "regenerates_during_contract": false,
    "continuous_flight_allowed": true,
    "split_flights_allowed": true,
    "per_burst_limit_seconds": null,
    "airborne_phases_metered": ["takeoff", "travel", "hover", "braking", "coasting", "descent"],
    "reserve_is_within_budget": true,
    "intermediate_stop_refills": false,
    "recovery_refunds": false
  }
}
```

Takeoff, travel, hover, and descent are required in the metered-phase array; braking and coasting are also accepted. These actions still consume flight resource when they occur during an airborne phase. Duplicate or unknown phase values are rejected.

The checker rejects a non-null per-burst limit, enabled regeneration, and common active legacy recharge/cooldown/per-launch aliases. This metadata test does not inspect the game's source code for hidden contradictory behavior. Acceptance F01-F24 supplies the behavioral evidence.

## Production-build and world manifests

A production-build manifest is a JSON object with:

| Field | Value |
|---|---|
| `schema_version` | 1 |
| `project_id` | Shared project ID |
| `kind` | `production_build` |
| `code_revision` | Same current revision recorded in status |
| `built_at` | Actual build timestamp with timezone |
| `entrypoint` | Project-relative entry point, also listed in artifacts |
| `artifacts` | Nonempty array of file references with hashes |

List the actual distributed files needed for the release. The checker validates the listed files; it does not automatically discover every unlisted application dependency. The final audit must inspect inventory completeness.

A world manifest has `schema_version`, `project_id`, `kind: world_manifest`, `scope_sha256`, `source_snapshot_id`, and a nonempty `artifacts` array. Its scope hash must equal the current scope file hash; its source snapshot ID must equal the scope's source snapshot ID. Include actual world-pack dependencies and use the source manifest to describe their provenance.

The build and world manifests themselves are bound by status. Avoid including a manifest's own hash inside itself. Generate asset hashes first, manifests second, then bind their hashes in status and evidence.

## Frozen geographic scope

The scope template starts unfrozen and empty. Before claiming the requested release, use `frozen: true`, a stable `revision`, `scope_extent: requested_network`, a source snapshot ID, reference date, and the requested corridor IDs `red`, `blue`, and `green`.

The required inventories are:

| Inventory | Required record fields used by the checker |
|---|---|
| `roads` | `id`, positive `length_metres`, `corridor_ids`, `source_refs`, `implemented`, `geometry_verified` |
| `junctions` | `id`, `implemented`, `verified` |
| `stations` | `id`, `position_verified`, `name_verified` |
| `metro_structures` | `id`, `implemented`, `verified` |
| `frontage_intervals` | `id`, `road_id`, `side` as left/right, positive `length_metres`, `inspection_status`, `inventory_complete` |
| `businesses` | `id`, `frontage_interval_id`, `name`, `implemented`, `identity_verified`, `placement_verified`, `source_refs` |
| `displayed_names` | `id`, `entity_id`, `entity_type`, `name`, `language`, `verified`, `source_date`, `source_refs` |
| `delivery_locations` | `id`, `verified_access` |
| `route_cases` | `id`, `evidence_ids` |
| `review_views` | `id`, `evidence_ids` |

These are the monitoring fields. Add the fuller coordinates, graph connections, level IDs, entrances, languages, feature IDs, and provenance from the master specification. The ledger checker does not replace the world-data validators.

`inspection_status` is `uninspected`, `partial`, or `inspected`. `inventory_complete: true` requires inspected status. Preserve a comprehensive street-side interval inventory before deriving business completeness. A legitimate completed interval can contain no businesses. Zero known businesses across uninspected frontage is an unknown inventory.

`geometry_artifact` points to a hashed GeoJSON FeatureCollection containing every selected road ID as a feature ID. `baseline_artifact` points to a hashed inventory-baseline JSON file containing `schema_version`, `project_id`, and the same ten inventory arrays. Preserve the initial selected IDs. The checker compares current IDs with the baseline, and compares road length/corridor membership and frontage length/road/side fields. A changed scope requires a reviewed new baseline revision, with the preceding revision retained. The validator cannot authenticate who approved that revision.

All non-business inventories required by this monitoring contract must be nonempty for the requested final release. The roads must represent all three requested corridor IDs. This is a basic ledger check, not independent confirmation that the complete real network was selected.

### Derived coverage

The checker recomputes coverage from the scope and evidence and compares it with `status.coverage`:

| Field | Computation |
|---|---|
| `roads_total_metres` | Sum of frozen physical road lengths, or null for an empty unknown inventory |
| `roads_implemented_metres` | Sum of implemented road lengths |
| `roads_verified_metres` | Sum of geometry-verified road lengths |
| `frontage_total_metres` | Sum of frozen street-side audit lengths, or null when unknown |
| `frontage_inspected_metres` | Length with both inspected status and complete inventory |
| `business_inventory_complete` | Nonempty frontage inventory with all interval length accounted for |
| `businesses_inventoried` | Number of business records found so far |
| `businesses_verified_and_implemented` | Records with implementation, identity, and placement flags all true |
| `displayed_names_total` / `displayed_names_verified` | Name-registry count and verified subset |
| `required_route_cases` / `passed_route_cases` | Required route cases and those with current graph plus runtime evidence |
| `required_review_views` / `passed_review_views` | Required source/render views and current comparisons |

A route case needs a current `simulation_test` record for graph validation plus a current `browser_test`, `physical_android`, or `physical_ios` record for runtime traversal. Both records must include that case ID in `scope_ids`.

A review view needs a current `ai_visual_review` or `local_field_review` with a matching `comparison.view_id`. The checker verifies linked files and hashes. The reviewer evaluates what the pictures actually show.

## Evidence index

Use `records` as an array of uniquely identified records. A passing record requires:

| Field | Meaning |
|---|---|
| `id` | Stable unique evidence ID |
| `requirement_ids` | Nonempty list of acceptance IDs actually covered |
| `scope_ids` | Related route, view, or geographic IDs |
| `result` | `passed` for a currently passing record |
| `evidence_class` | One of the classes below |
| `bindings` | Exact current hash strings for build, world, config, scope, requirements |
| `started_at` | Actual timestamp with timezone |
| `duration_seconds` | Actual positive duration |
| `command_or_method` | Reproducible command or concrete inspection method |
| `expected` | Specific expected result |
| `observed` | Specific observed result |
| `limitations` | Honest limits of the measurement or review |
| `artifacts` | Nonempty array of existing evidence file references |
| `environment` | Device class and physical-device declaration, plus applicable platform details |

A nonpassing record still identifies its requirement IDs, scope IDs, result, class, and artifacts array. It can retain older hashes and optional historical details. It cannot support a currently passed check.

### Evidence classes

`simulation_test`, `browser_test`, `mobile_emulation`, `physical_android`, `physical_ios`, `source_inspection`, `ai_visual_review`, `local_field_review`, `build_check`, `asset_audit`, and `release_review` are distinct methods.

An environment object has `device_class` and boolean `physical_device`. Physical Android evidence requires `device_class: android` and `physical_device: true`; physical iOS evidence requires `device_class: ios` and `physical_device: true`. Both require nonempty `device_model`, `os`, and `browser`. Emulation cannot declare itself a physical test.

U01, U03, U04, and P03 require physical evidence for each platform listed in `config.required_platforms`. P03 requires at least one 900-second record for each platform. Include the actual performance logs and conditions in the artifacts. The validator checks declared method, duration, and files; the supervisor evaluates the measurements and authenticity.

### Visual and local review

Visual and local-review records include:

```json
{
  "comparison": {
    "view_id": "a-required-review-view-id",
    "source_date": "actual observation date",
    "reviewed_properties": ["road bend", "frontage order", "entrance side"],
    "source_artifact": {"path": "references/actual-source.jpg", "sha256": "actual digest"},
    "game_screenshot_artifact": {"path": "qa/views/current-game.png", "sha256": "actual digest"}
  }
}
```

Replace descriptive values with actual records and hashes. Store only imagery permitted for the intended use.

Local field review additionally requires `reviewer: {kind: human_local, name: actual reviewer name}`. An AI review cannot satisfy G12's local-review class. Reviewer identity remains a declaration requiring substantive audit.

A release review has a named reviewer with kind `independent_agent`, `human`, or `same_agent_adversarial_pass`. Report the actual method without upgrading a self-review into independence.

### Minimum requirement policies

The `evidence_policy.groups` arrays are ANDed. At least one class from each group must be present among current passing records linked to the requirement. For example, G04 requires source inspection and one of AI visual review or local field review. G02/G03/G08/G11 require source inspection and a simulation or browser test. M01 requires browser evidence. G12 requires local field review.

Policies are enforced by the checker as well as stored in the requirements file. Removing an ID, setting a mandatory requirement false, or weakening its policy does not bypass the release gate. The requirements file's source-specification hash records the master version used to prepare the template. It is provenance metadata, not an automatic prose-diff or source-accuracy validator.

## Freshness and historical evidence

Every currently passed record must match all five current binding hashes. The shipped validator conservatively uses exact full bindings. It does not compute a dependency graph or decide that an old test remains applicable after unrelated code changes.

Keep the final artifact and ledger files unchanged while the release check runs. The checker does not lock an actively changing development tree into an atomic filesystem snapshot.

Historical artifacts may be retained. Mark obsolete result records stale. A current substantive review can reference unchanged original source materials while accurately stating what was reviewed against the current build. Do not change the hash label on an old build/device result to pretend it tested a newer artifact. Final browser smoke and required physical-device tests must represent the actual final build.

The source photographs and raw map snapshots themselves need not change when code changes. Their hashes establish their identity as reusable inputs.

## Self-tests

Run:

```bash
python -B -m unittest discover -s monitoring -p 'test_verify_run.py' -v
```

The suite checks valid and incomplete ledgers, all current-binding hashes, artifact tampering, missing files, forged references, unknown frontage inventory, baseline shrinkage, path traversal, symlink escape, physical/emulated classes, sustained-run duration, visual-reference files, obsolete flight settings, mandatory IDs/policies, malformed types, and CLI read-only behavior.

Its positive fixture is named `synthetic-ledger-fixture-NOT-A-GAME`. It deliberately contains artificial declarations to exercise the validator. None of its claimed scenes, device names, test durations, or review identities are evidence for the real game. Do not include its temporary data in a game's release evidence.


## Supplemental Whiteout review

Copy visual-reference-review.template.json to qa/visual-reference-review.json inside the application project. Populate it after actual gameplay inspection and compare the running game using GRAPHICS_REFERENCE_WHITEOUT.md. Its art-review categories are descriptive and separate from canonical acceptance statuses. Keep unobserved dimensions not_inspected and the acceptance check blocked when the reference is inaccessible.

Register the actual review and capture artifacts with hashes in qa/evidence-index.json under Q08/C4. The ledger checker validates the registered artifact relationships and bytes using its existing rules; it does not parse this companion record into an automatic visual score or establish that the captures were truly inspected. The supervisor must review the underlying images, motion evidence, assumptions, and findings. This supplement adds no acceptance IDs and cannot replace geographic or physical-device evidence.
