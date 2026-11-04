# Independent intended-road curve-height review

This bounded review passes for the source bound in `evidence/reported-roads/traffic-curve-support-independent-9413-20261103.json` (SHA256 `6c660d199af40fe04b618ff93dc8b741e166cce0bbca0c8a0e11f27161f0dd2d`). It does not approve a final road model or release. The 610 recorded input hashes were unchanged during the checks.

The twelve focused curve controls (six independent and six implementation controls), seven existing posture/collision/kinematic groups, and TypeScript check pass. Independent controls cover nonuniform asymmetric reverse windows, actual three-edge bus-span planning with a reversed intermediate and clipped reverse exit, exact road/segment ownership, excluded same-road loop branches, unbound caps, ambiguous layers, the window and per-cell limits, unchanged horizontal sampling/length/heading and the immutable original chord guide. A warmed lookup performs nine local map reads with no array iteration, raw source-bucket filtering or whole-grid scan. Actual World merge/unload code was inspected: append changes the bucket length and unload replaces or deletes the bucket, matching the tested invalidation rules.

The separate budget diagnostic is `evidence/reported-roads/traffic-curve-budget-independent-9413-20261103.json` (SHA256 `65db5d1bbfb1f9fb4d8a4132f2071068713538f8651fd7989d8d516ab525544d`). It replays actual `buildTile` with current explicit source9413/model875b/tilef487 inputs and canonical metro, rail, landmarks, airfields and construction context. Two city tiles produce 1,556 merged surface cells. The largest bucket contains126 surfaces; its largest same-road subset contains39. Across60m curve candidates on both Tarnaka directions and the western continuation, all1,005 queries find finite intended support: no512/256 budget rejection or missing/ambiguous fallback occurs. Consumed packs, held artifacts and imported sources are hash guarded.

The census is diagnostic for the current unsolved prototype. It must be repeated after final LP and tile-profile emission, especially if control spacing becomes0.5m. It does not establish correct complete bus/truck mesh posture, tyres, jump roof sections, bridge headroom, real underpass continuity, cache/reuse parity or native driving. The separate graph long-road cache-pressure negative remains open; a small warmed short-edge benchmark does not close that performance issue.

Commands:

```sh
node scripts/test-v21-fixes.mjs traffic-curve-road-support
node scripts/test-v21-fixes.mjs traffic-road-posture
node node_modules/typescript/bin/tsc --noEmit
node docs/qa/evidence/reported-roads/traffic-curve-budget-independent.mjs --output NEW_FILE.json
```

No runtime files were edited by the independent reviewer. No model was activated and no build was published.
