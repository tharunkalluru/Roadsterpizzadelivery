# Connected street access at dense metro frontages

Source held for independent/native review, 2026-11-02. No publication performed.

## Independently reported problem

The complete packed-city check uses runtime road grades, retained railway/metro clearance, and the corrected visible building grid. It found no street stairs or lifts at Bharat Nagar, Chikkadpally, Paradise and RTC Cross Roads. Safely omitting obstructed geometry was correct, but omitting every street connection did not produce a usable station.

Current checked content contains **59 assemblies and 56 unique station identities**. Earlier notes estimated 57; this report uses the actual current core data.

## Final change

- Keep the current preferred stairs and lift locations whenever any external entry survives.
- Only when all preferred external entries fail, search bounded alternate longitudinal shaft positions inside the existing static station envelope. Preserve the same complete shaft, horizontal link, corrected-building, road, railway and metro clearance checks.
- A link must meet a real retained full-width concourse floor segment. A ground-to-concourse-only bank is permitted only when a retained internal staircase exists and the entry shares a connected component of the actual 14 × 5 retained floor cells with an internal stair landing. A disconnected floor island does not qualify.
- Cut lift parapet openings at the physical full-width landing crossing, rather than at the nominal shaft coordinate. Concourse crossings use the actual straight parapet; platform crossings use the same curved ten-metre guard faces as rendering.
- No station, road, railway or neighboring building was moved. No runtime per-frame search, asset, transparency, animation timing or driving behavior changed.

The active packed data uses three alternate full-height banks: Bharat Nagar, Chikkadpally and RTC Cross Roads, each on side −1 at local longitudinal u=0. They retain both real concourse and platform links. The lower-only mode is exercised by constrained fixtures, not claimed as a newly placed current station bank.

## Paradise source conflict

The remaining Paradise failure was traced to source building `18f6a0df-e72`, class `transportation`, height 15.9 m. Its station-aligned source footprint enclosed the actual station anchor. Existing generic extrusion trimming left a continuous approximately 139 m × 1.6 m, 15.9 m-high wall across the only clear street side. A within-envelope straight or elbow link cannot pass through that retained wall without violating clearance.

The separate station-footprint agent fixed that exact duplicate station source representation in `building-clearance.ts`, guarded by source identity, class, height, every reviewed footprint point and actual Paradise blue station assembly. This agent did not edit that file or relax occupancy. After that fix, Paradise retains its normal one stair arm, one lift and two internal flights. The raw source record is preserved; the existing procedural station supplies its rendered station structure.

## Files owned in this pass

- `src/world/metro-station-access.ts` — bounded fallback, retained-floor connectivity, exact lift guard crossings.
- `src/world/city.ts` — only the access import and the two lift guard-opening expressions, explicitly coordinated with Root. Other city changes belong to the larger main pass and were preserved.
- `tests/v21-fixes/metro-ground-access.test.ts` — five focused groups.

Access-source SHA-256: `52897c73640466a26ffc1be1f79f82d68ddac8715eb60678bb6b40c985009aa6`.

## Verification

- Focused ground-access tests: **5/5 pass**, including unsupported floor-island rejection, lower-only stop fidelity, all current station identities, whole-width retained landing support and **528 actual lift-guard crossing samples**.
- Original plus independently authored metro access suites: **16/16 pass**, including packed buildings, curved lower connections, indexed flight envelope, retained shared interchange transfers and static geometry budgets.
- Typecheck and diff checks pass.
- Logs: `/tmp/roadster-metro-ground-access-focused-final2.log`, `/tmp/roadster-metro-access-all-after-groundfix.log`, `/tmp/roadster-metro-ground-typecheck-final.log`.

## Remaining acceptance

The independent reviewer owns `metro-access-independent.test.ts` and final review status. Root must capture fresh correctly labeled native Street/Entrance/Concourse views of the four restored stations from a new frozen build; old v2 captures predate this fix. These fitted game entrances are not claimed to be surveyed real entrance coordinates. This report does not certify phone FPS or the whole campaign.
