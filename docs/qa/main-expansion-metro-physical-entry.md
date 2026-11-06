# Physical ground-entry clearance after the Bharat Nagar footbridge finding

Source held for independent/native review, 2026-11-02. No publication performed.

## Actual defect and cause

The earlier native Bharat Nagar view exposed a real mapped footbridge stair tower touching the new lift. The source feature is `w1480567593`; its free endpoint is (-7067.9, -6418.4). The retained rendered tower is 3.6 × 3.2 m and 6.6 m high, while its general gameplay obstacle uses radius 1.8 m. The previous access planner checked roads, railways, metro geometry and corrected buildings, but did not consider previously emitted non-building scenery. Both the shaft and its inward ground-door approach could therefore occupy the tower.

The footbridge remains unchanged. Moving or deleting the mapped source was not used as a fix.

## Final production change

- Before any generated station emits supports/colliders, capture an immutable spatial index of the tile's existing physical obstacle proxies. Clone the values, so later station objects cannot feed back into the plan or mutate the snapshot.
- Use three-dimensional height intervals. Elevated links can remain above a lower fixture; a fixture overhead does not block an unrelated lower pedestrian route.
- For planning only, conservatively enclose possible rectangular fixture corners with `radius × sqrt(2) + 0.08 m`. This contains the actual footbridge tower corners that the original radius missed. Gameplay obstacle geometry is unchanged.
- Combine the physical index with the existing road, railway, metro and corrected-building checks for the complete shaft, stair flights, horizontal links and interchange links.
- Reserve a 1.6 m-wide, approximately 2 m-long human approach in front of the **actual inward ground lift door**, plus the street stair foot approach. A shaft that clears a fixture while its door faces that fixture is rejected.
- Existing bounded fallback placement chooses a safe alternate position. Bharat Nagar now retains the actual full-height bank at local u=4 on side -1, replacing the conflicting u=0 candidate.
- Build the temporary physical index only on tiles that own a station. Ordinary streamed city tiles do not allocate/fill that grid. The index is not retained in tile output or used per frame.

## Actual-builder verification instead of preferred-plan reconstruction

`buildTile` now accepts a strictly optional, synchronous passive `observeStationAccess` callback for cold geometry inspection. It provides the actual retained assembly plan and the exact read-only clearance/occupancy functions and immutable physical index used by that build, after the corresponding structure has been emitted. Ordinary workers never supply or serialize the callback; no diagnostic object is allocated when it is absent, and no new metadata is returned on every tile.

Focused and independently owned tests now consume those actual observed plans and match them to actual emitted `structureSupports`. Re-running a separate building-only plan would miss the new physical inputs and was explicitly replaced.

## Final checks

- **9/9 focused tests pass**: immutable and height-aware physical index, conservative rectangle corners across index cells, a door-only obstruction, bounded safe fallback, lower-only lift stop fidelity, disconnected floor rejection, real full-width landing floors, actual emitted structures for all station identities, every emitted ground shaft and door approach, and physical guard crossings.
- Current data: **59 assemblies / 56 unique station identities**, all with a real emitted ground entry (shared interchange secondary assemblies use their retained primary/transfer connection).
- **74 actual ground shafts and 74 actual inward human approaches** clear the immutable existing scenery.
- **444 actual full-width lift-guard crossing samples** remain open.
- Original plus independent metro-access suites: **18/18 pass**. The independent Bharat regression preserves the original footbridge and checks its exact rotated rectangle against the actual emitted shaft and full door approach, in addition to its gameplay obstacle.
- Dependent street-lamp audit: **7/7 pass**, covering 51 actual station tiles and 6,613 retained street fixtures with zero structure conflicts.
- Typecheck and diff checks pass.

Logs: `/tmp/roadster-metro-physical-actual-all-final.log`, `/tmp/roadster-metro-physical-access-all-final.log`, `/tmp/roadster-metro-physical-lamps-final.log`, `/tmp/roadster-metro-physical-typecheck-held.log`. Independent reviewer log: `/tmp/roadster-independent-bharat-physical-after.log`.

## Source ownership and remaining gate

This pass owns `metro-station-access.ts`, its focused test, and only the coordinated station-planning/optional-inspection boundary in `city.ts`. Root's road, paint, lighting queue and other city changes were preserved. `extras.ts` was read and not edited.

Root must still capture fresh native Bharat Nagar entry and side views from a new frozen build. Older images/builds predate the corrected physical input. This report does not certify surveyed entrance coordinates, physical-phone frame rate or the whole campaign.

## Held fingerprints

- `src/world/metro-station-access.ts`: `724bd6f25e4c73709fb533ba3bc470053d3656fe4767c003f8798481e34a6ef0`
- `src/world/city.ts`: `bc6adedd9116534fb2ee32a74fc17ebe705d5ab454cba91ecf3629c50ec64a86`
- `tests/v21-fixes/metro-ground-access.test.ts`: `24a8c92853a6f940420145014a2c6e09daec5c3eed0892cee838cc4ce99a6758`
- `src/world/extras.ts`: `9c6901e9d5bd88d396309d2ed3b389e55e6904e2e7769ff4c0db8cfb4c23d3dc`
