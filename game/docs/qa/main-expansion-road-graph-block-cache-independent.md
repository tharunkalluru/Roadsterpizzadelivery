# Independent long-road block-cache review

The bounded leaf review passes. Receipt `evidence/reported-roads/road-graph-blocks-independent-9413-20261103.json` has SHA256 `007f00dbc4d0fdce76e9ce3b6bd250539075fe557b304b696e319eb16d1942ce`. All 619 recorded inputs remained unchanged during the 36 focused graph, curve, posture/collision tests and TypeScript check. No runtime files were edited by the reviewer.

Four new independent block controls cover actual emitted Float32 asphalt at positive/negative city coordinates, 64-segment boundaries, pavement-width tapers and ORR auxiliary lanes at both road ends in both travel directions. Across 720 samples, maximum root-to-emitted support error is 0.00001042054 m. Generated quad coordinates are exactly equal to the complete renderer ribbon, and horizontal position/heading remain exactly equal to the pre-height-correction formula. Warm sampling introduces no tuple-array iteration, raw point/elevation/arc scan or city/neighbor scan. Ramp addition/removal invalidates every retained block. Global eviction, mixed small/full entries, standalone arc ownership and the original 96-edge/131072-point bounds retain exact accounting.

`evidence/reported-roads/road-graph-blocks-pressure-independent-9413-20261103.json` (SHA256 `15d4ff938af1734587b582231e2ec4174f5dcd3bcaf18ae4def93af7f0b2a737`) independently replays the current 875b model's eight longest varying roads plus 47 flat roads. Initial cold sampling creates 55 entries and 8 blocks. One hundred warmed frames produce zero misses across 800 block requests. Travel through 94 sections forces global eviction while remaining below 130944 generated points; the last active sections stay warm with zero misses across 80 follow-up requests. The retired full-road-cache failure artifact is retained by path/hash. It is not overwritten or reclassified as a passing result.

With observation wrappers removed from the timed methods, twelve paired desktop chunks show median added cost 0.003885139 ms per 55 queries. This establishes bounded leaf CPU behavior on this Mac; it does not establish full Traffic.update cost, phone performance, GPU frame time, heat, battery life or actual game smoothness.

Final feasible core/tile models, source-bound generated cache, emitted geometry/strict finite headroom/known30, active conditioned-core reuse/restart, complete nonlinear bus/truck meshes/tyres/jump roofs and native driving remain open. Nothing was activated or published.

Commands:

```sh
node scripts/test-v21-fixes.mjs road-graph-surface
node scripts/test-v21-fixes.mjs traffic-curve-road-support
node scripts/test-v21-fixes.mjs traffic-road-posture
node node_modules/typescript/bin/tsc --noEmit
node docs/qa/evidence/reported-roads/road-graph-blocks-pressure-independent.mjs --output NEW_FILE.json
```
