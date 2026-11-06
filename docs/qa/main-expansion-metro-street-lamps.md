# Street fixtures inside metro stations

Status: producer checks pass. Independent source review and fresh native day/night confirmation remain required. No publication or gameplay behavior change was performed by this agent.

## Observed defect

I actually inspected the native Chikkadpally and RTC Cross Roads concourse images listed in the evidence manifest. Streetlamp arms and dark housings protruded through the open concourse floor at passenger height. Ordinary city streetlamp placement checked only the pole against roads/railways. It never checked the whole mast/arm/head against a metro floor or passenger space.

## Change

- `street-lamps.ts` now provides the exact pole, projecting arm, housing/diffuser bounds and fixture metadata from the same model parameters used by the unchanged drawing code. Dynamic emitter position is deliberately below the housing and is not a substitute for geometry bounds.
- `metro-street-lamp-clearance.ts` builds one cached spatial index for the immutable metro data. It uses the shared deck height profiles and station frames for pitched viaducts, concourse floor/ribs and passenger headroom, curved platform bands, the retained canopy liner plus exterior vault/eaves, and source pier/cap extents. Horizontal tests use oriented footprint overlap and actual vertical intervals. A lamp wholly below a high station, on a separate upper road, or outside the station remains eligible.
- City placement rejects a conflicting fixture before emitting geometry, a night pool, an emitter or a collider. The concourse reservation is a street-fixture exclusion only: it does not fill the open station or add a collision wall.
- Exact external stairs/lifts depend on corrected neighboring buildings. A small worker-only site queue therefore waits for those actual retained station supports before drawing. Accepted fixtures retain their original dimensions and cadence. Rejected provisional spacing emitters are removed; generated median pole colliders are registered only when their physical fixture is retained. Mapped park/path lamps use the same final check and retain their existing simpler model.
- No tile geometry is deferred into the render loop. There is no per-frame city scan, no extra dynamic light, and no changes to vehicle timing, road geometry, access plans, shaders or interface layers.

## Additional defects found during verification

The first core-only index removed the visible concourse intrusions but a complete actual-support audit still found two street fixtures intersecting retained external access at JNTU College and Osmania Medical College. Both were generated road fixtures, so checking only mapped furniture later would miss them. The final worker-only pass checks their actual retained landing/stair/lift supports as well. The initial diagnostic is preserved and is not final acceptance evidence.

## Verification

`node scripts/test-v21-fixes.mjs metro-street-lamps`: **7/7 pass**.

The checks cover every actual emitted fixture vertex in eight headings and three base heights; arm/head-only intersections with a clear pole; separate vertical levels and an actual sloped interchange approach; all 59 line-specific station assemblies across Blue, Red and Green (including three raised interchange assemblies); 51 actual packed station tiles with current road-grade patches; park-lamp emitter/diffuser removal; and median pole collider ownership.

The final actual-tile audit retains **6,613 street fixtures** and finds **zero surviving fixture intersections with the retained concourse, stair/lift or source-pier supports**. Every retained registered fixture has its matching emitter. The two former access-conflict emitter coordinates are explicitly absent. These are current dataset counts, not fixed game design limits.

Preservation checks:

- Existing production street-lighting/gantry regression script: **5/5 groups pass**.
- Railway/road-clearance regression suite: **11/11 pass**, including lamps on depressed roads and unobstructed railway crossings.
- Typecheck and diff checks: pass.

These offline checks do not establish real-phone FPS, heat or battery behavior. Fresh final-build native views are still needed for night appearance and the absence of the original visible intrusions.

## Evidence

- `docs/qa/evidence/main-expansion/metro-street-lamps-repair.json` contains source fingerprints, the two actually inspected before images and all logs.
- `metro-street-lamps-initial-core-only-diagnostic.log` preserves the intermediate JNTU/Osmania finding.
- `metro-street-lamps-final.log` records the full final zero-conflict audit.
- The separate legacy, railway-preservation and typecheck logs are retained beside it.

## Source fingerprints

- `src/world/city.ts`: `36d55ad45c9556bf5bac28feeed2b3b3e8618008e6a517abe228d50c329e78eb`
- `src/world/street-lamps.ts`: `13698684ce71333c9fb7b4c852fb6aaa84a7bed07d15223d3714f1b738550b15`
- `src/world/metro-street-lamp-clearance.ts`: `86bb5929f92b48c12cf016e8d45e997cf7b91bc8079f0ecf4da403e8a63b831a`
- `tests/v21-fixes/metro-street-lamps.test.ts`: `7ce9b99e8146e3fe9c3ce6b85f0eb18e164676fa05245d06a6075c5433f96eca`
