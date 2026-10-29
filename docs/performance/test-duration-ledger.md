# Independent test-duration ledger

Updated 2026-10-28T11:05:30Z.

The exact interval union plus the retained older control floor establishes **41.233 minutes** of active visible-control/movement testing **across several source revisions**. Both30 and40minute effort thresholds are evidenced. This is not a continuous final-build40minute run or a phone performance pass.

Earlier documented floor:22.402min. New held-control intervals:12.587min. New explicitly observed moving-coast waits:3.659min. Other bounded visible maneuvers add2.584min. Without the coast observations, the older floor plus new endurance held intervals is34.989min; these categories remain separate in JSON.

Only explicit fromMs/toMs waits with actual advancing simulation and position evidence count as coasting. Gaps, static idle, setup, paused menus, loader freeze/retry time and broad Android windows are excluded. All new exact intervals are merged, and none overlaps an older counted artifact envelope.

Six185s segments tested source6390d3e / index-BJHn7S3q.js / fingerprint68739301065a0f26881402e10b9f2b6651654bc6ac280007e5cd168c03ab947d. Their measured frame thresholds have mixed failures; duration completion is not a performance pass. The later5849714context fix and pending Roadster batching build require separate targeted checks. Desktop progress reached29 across builds, including20→29 in these sixsegments; Android1is independent.

See [test-duration-ledger.json](test-duration-ledger.json) for exact interval and build provenance.

Latest targeted append 2026-10-28T11:26:01Z: source1e28c22 / index-BqqcYt0B.js added **6.270min** of strictly counted controls/moving-coast waits, bringing the across-build lower bound to **47.503min**. Desktop progress29→32; Android1remains separate. High/native p95/p99 upper18.5/19.5ms; Low at4.04x p9522.5ms fails the strict20ms gate, p9930.5ms. Both runs had0application console/pageerrors. Context-loss/viewport recovery has0gameplaydurationcredit.
