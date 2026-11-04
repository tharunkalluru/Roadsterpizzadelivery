# Paradise duplicate station footprint correction

Status: producer checks pass. Independent post-fix native review remains required. No publication, asset registration, route changes, or source-building removal performed by this agent.

## Actual defect

The packed source tile `-2_-5` in `public/city/packs/p-1_-2.pack.wasm` contains transportation building `18f6a0df-e72`, height 15.9m. Its seven-vertex footprint encloses the Paradise station anchor and extends about 139m along the rendered station. The procedural station already represents that location. Ordinary transport-width cropping left a high outer strip and end walls from the second, generic solid extrusion. Those remnants blocked every otherwise viable ground entrance.

This is a correction to the generated model for one exact source feature. It is not a survey of the real station's entrance coordinates.

## Narrow change

`buildingTransportClearance.correct()` replaces this generic shell with the existing station assembly only when all of these hold:

- Exact packed source ID `18f6a0df-e72`.
- Classification `transportation`, height within 0.025m of 15.9m.
- All seven independently inspected source footprint vertices still match within 0.025m; winding and first-vertex order may differ.
- An actual Blue-line `st_paradise` assembly exists, centered within 2m of the reviewed anchor and aligned with that footprint.

The correction returns no generic solid fragments/colliders and records the real station key plus the explicit reason `reviewed duplicate mapped metro station model replaced by station assembly`. The input source building remains byte-for-byte unchanged. Changed source geometry, another property, an office, or absent/moved station does not satisfy this replacement rule and continues through ordinary transport clearance.

No occupancy checks were relaxed. No road, flyover, rail, platform, stair or lift was moved by this correction. The separate ground-access producer owns the safe fallback lifts and actual parapet openings.

## Verification

- `node scripts/test-v21-fixes.mjs metro-station-footprint`: 4/4 pass. Tests consume the actual packed source feature, verify zero duplicate-model remnants and unchanged source metadata, reject wrong ID/class/height/changed or malformed footprint and absent/moved matching stations, and retain equivalent ring encodings.
- `node scripts/test-v21-fixes.mjs metro-access-independent`: 7/7 pass, including actual packed buildings and runtime road grades. Full before/after station access logic comes from the independent reviewer and separate access producer; this result includes their latest source changes.
- Actual generated Paradise plan now retains one ground stair, one lift, and two internal platform stairs. Across runtime station identities, `missingGroundEntries` is empty.
- `npm run typecheck`: pass.

Raw after log: `docs/qa/evidence/main-expansion/metro-access-after-station-footprint.log`.

## Count definitions

The current core pack contains **57 source station records and 57 unique source IDs**. Existing `metroRuntimeStations()` suppresses the legacy extra `st_jbs` anchor because `st_parade_grounds` already provides its Green-line identity; see the pre-existing `METRO_STATION_ALIASES` in `src/world/metro-interchanges.ts`. Therefore the actual access audit covers **56 runtime station identities** and **59 line-specific platform assemblies**. Ameerpet, MGBS and Parade each have two line assemblies. The earlier phrase “57 station identities” referred to source records, not the deduplicated runtime set. No station was invented or newly removed by this patch.

## Remaining gate

The independent metro reviewer should inspect this exact replacement guard, repeat the actual all-station access regression, and inspect fresh Paradise plus the three other repaired station views in the final frozen native build. Geometry checks do not certify surveyed station architecture or real-phone performance.

## Source fingerprints

- `src/world/building-clearance.ts`: `950afe1798f146048f72784858c08af54b8eeea6ec47de36a66ef52b30dd88b5`
- `tests/v21-fixes/metro-station-footprint.test.ts`: `08fc0ee85c7fd69faa0b5a99b626aeedde7d0dcc921d8efc334e62f2b74de4b1`
