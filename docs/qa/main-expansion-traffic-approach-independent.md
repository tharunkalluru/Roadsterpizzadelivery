# Independent traffic approach review

**Scoped PASS: seven independent test groups pass.** The exact western Tarnaka continuation now plans and executes with the complete bus on actual emitted pavement. This does not approve the broader road geometry changes or close the earlier citywide road-body and crossing findings.

The CI test is self-contained: `tests/v21-fixes/traffic-approach-independent.test.ts` reads only `tests/fixtures/reported-west-bus-continuation-independent.json`. The 40 KB fixture freezes 21 actual nearby roads from the capacity-staged design snapshot with SHA256 `be8246e417965d361e109a5eea9576b82888ffa4e9c6752df72992aaac15f132`. Its snapshot-origin path is metadata; the test requires no `/tmp` model, server, browser, network or UI session.

The exact legal source connection is `38a7824d-0e1_0` → `38a7824d-0e1_1`, direction +1, at real node `48e42102-dd2`. The original outgoing first chord is only 0.141421 m. That sampling detail must not determine the physical turning space.

| Representation | Incoming/outgoing points | Physical room in/out | Minimum bus curve radius | Executed endpoint continuation |
| --- | --- | --- | --- | --- |
| Actual staged source | 68 / 24 | 60 / 38.305679 m | 40.042292 m | 72 frames |
| Collinear samples removed | 5 / 4 | 60 / 38.305679 m | 40.042292 m | 72 frames |
| Pure collinear refinement, maximum 0.08 m segments | 1,615 / 489 | 60 / 38.305679 m | 40.042292 m | 72 frames |

Each representation samples the planned curve every 0.1 m: 63 poses, checking all 11,270 unique visible vertices of the production bus, including mirrors, glazing, normal/brake/reverse lamps, occupants and front/rear route boards. Templates use the same `RoundedBoxGeometry` and ring geometry as the main game and tile worker. The road oracle evaluates actual emitted Float32 asphalt and matching soffits independently of the tyre-height helper. Six actual shared-node cap surfaces are exercised. All bus vertices remain within the emitted finite pavement footprint and outside the road slabs.

The test then invokes the real `Traffic` planner and `update`, with the original radius, full-body `curveOK`, static-collision and movement gates active. It does not substitute a route or advance the vehicle directly. From the last incoming chord, the bus drives more than 9 m onto the outgoing road at 60 Hz. Maximum step is 0.133334 m; peak heading change is 0.002074 radians per frame. The clock matches the executed frame count and the single explicitly spawned vehicle remains present.

A separate execution test starts 5 m before the join, before the last genuine in-edge approach bend. All nine combinations of bus/car/auto and actual/coarse/dense graph representations now reach the outgoing road. Complete bus vertex checks continue through this earlier bend during normal execution. The largest step is 0.133334 m and largest heading change across these nine cases is 0.008503 radians per frame. The earlier review had reproduced dense in-edge stalls and actual/coarse car/auto stalls here; the final run no longer reproduces them.

The remaining controls establish the boundaries of this fix:

- Synthetic straight bus and ordinary-car turn geometry remains identical under pure densification, to a 1e-7 m comparison tolerance.
- A genuine 0.1 m right-angle stub remains short turning room. Adjacent internal right-angle bends retain their physical 20 m / 30 m room in both directions, with coarse and dense point sets.
- A physical median still makes the production full-body curve gate reject the bus turn; the normal planner keeps the bus stopped rather than publishing a path through it.

The four traffic source files were hashed before the final run and all four matched afterward. Exact source, test and fixture hashes are in `evidence/main-expansion/traffic-approach-independent-source.json`; checksum results are in `traffic-approach-independent-source-check.log`. The final production typecheck passes. No production code or UI was changed by this reviewer.

Reproduce from the repository root with `node scripts/test-v21-fixes.mjs traffic-approach-independent`. The result log is `evidence/main-expansion/traffic-approach-independent.log`; all seven groups pass in approximately 1.5 seconds. Broader moved-road envelopes, real buildings/supports, source-lane capacity, citywide headroom and native driving remain separate gates.
