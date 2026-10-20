# Assignments and exclusive reservations

Updated **2026-10-19T22:30:52+00:00**. Coordination-only activation; frozen runtime remains survey **102**, source base `7145ba2b954c2ec01c67e902a44e45c6fc5d91a4`. The disjointness audit used the current owner's revision **106**, SHA-256 `02e9583394434ff69a7f9ac6d11ed44c0cf8ea4b5d670c029cc760f1468e43ff`. No later runtime records are copied into this branch. Fetch/reread this file and [RESERVATIONS.json](docs/handoff/RESERVATIONS.json) on every startup/resume/pull.

| Assignment | Owner | State / exclusive scope |
|---|---|---|
| `peddamma-jubilee-checkpost` | `01a155cd-daee-76ce-a294-b890d8aaa02b` | **ACTIVE, unchanged**: entire Peddamma Gudi → Jubilee Hills Checkpost pair, both directions/sides, junction alternatives and station connectors. Exact route unresolved; avoid the whole pair. |
| `miyapur-jntu` | Existing cloud reservation | **RESERVED / PROVIDER-BLOCKED, unchanged**:35roads/70sides; IDs retained in RESERVATIONS.json. No reassignment or evasion. |
| `madhapur-peddamma` | Existing owner/integrator | **QUICK PASS SAVED; GAPS OPEN**, no external reassignment. |
| `khairatabad-lakdi-pilot-r8306076003-3` | `second-computer-01` | **ACTIVE**: only `r_8306076003_3`, canonical **left and right**, **20.00–168.60m** in stored-point order. |

## Active second-computer pilot

This is a **148.60m interior road slice per side**, not permission to map the whole Khairatabad → Lakdi-ka-pul pair. The road is the ground-level, routable, provisional Lakdikapul Road edge, length188.60m. Canonical sides follow `road.points`, independent of camera heading. Reverse-facing imagery does not authorize wrong-way vehicle travel.

- Source endpoint nodes:`n_57046252173` → `n_4127550256`.
- Include both sides only within closed interval20.00–168.60m.
- Exclude0–20m and168.60–188.60m outside the included endpoints, both junctions, every other road/carriageway, all branch roads, station connectors and gates. No authority to expand if Street View follows another edge.
- Approximate start17.4064797,78.4625119; end17.4054927,78.4634551. These are map anchors, not surveyed entrances or a verified station route.
- Branch:`worker/second-computer-01/khairatabad-lakdi-pilot-r8306076003-3`. New batches:`game/data/research/batches/second-computer-01-khairatabad-lakdi-pilot-<sequence>-<YYYYMMDD>.json`; checkpoints:`game/work/khairatabad-lakdi-pilot-r8306076003-3/`.
- Existing survey source IDs for this pilot:none. Canonical source references:`ovt:seg/1ef14a963395`, `osm:r3249370@248`. New dated source IDs use `sv-second-computer-01-khairatabad-lakdi-pilot-`; assign them only after actual inspection. Last/next pano, capture date and heading are currently unknown.

The parent confirmed primary-owner notification of this exact reservation and authorized activation. The audit finds both selected sides unreviewed, no attached observations/overrides/corrections and no recorded camera source within350m; nearest recorded source is≈1,107m away. Geometry matches the frozen102 world exactly. The35cloud-road intersection is empty. These findings apply only to the bounded pilot; earlier sampled stretches elsewhere remain sampled. See [pilot audit](docs/handoff/PILOT_RESERVATION_AUDIT.json). The broader [historical proposal audit](docs/handoff/PROPOSED_ASSIGNMENT_AUDIT.json) is screening only and grants no larger lease.

## Exact activation/base and startup binding

`baseCommit` in the machine manifest is the frozen prepared predecessor `7145ba2b954c2ec01c67e902a44e45c6fc5d91a4`. The **activation/worker base SHA** is the commit introducing the current reservation; resolve its full hash using `git log -1 --format=%H -- docs/handoff/RESERVATIONS.json` after fetching the coordination branch. This Git-derived exact SHA avoids an impossible self-referential commit hash inside its own JSON. The integrator returns that SHA after the verified push. Branch from that exact activation commit and record it in the worker's first checkpoint.

Before research, report worker/assignment, actual clone HEAD, resolved activation SHA, personal branch, frozen survey102 SHA-256 `2500760b5de99102489055f7f52d1639ad64b486424fdbcbe54b5ece3d7f1e2a`, both side/ranges, exclusions, freshness/lease match and setup results. This is active authorization; no second approval is required when bindings match. Changed lease, stale branch, provider/auth block or unresolved edge alignment stops the affected work. The worker can inspect only within the lease and must preserve unknowns.

Only the parent/designated integrator imports shared survey data, regenerates queues, maintains reservations, integrates and deploys. The external worker authors immutable source/evidence batches and checkpoints on its personal branch, never edits shared generated files, never pushes handoff/main/default and never deploys. Use the normal draft-PR review flow; no auto-merge.

## First batch review and bounded continuation

See [docs/handoff/reviews/second-computer-01-first-batch-81ce543c.md](docs/handoff/reviews/second-computer-01-first-batch-81ce543c.md) and its JSON receipt. Worker HEAD81ce543c was structurally validated for two pending contexts; **imported=false**, exact import now user-approved, awaiting actual sole-primary import receipt. No coordinator/concurrent import; do not claim imported or edit reservation restrictions. The existing ACTIVE r_8306076003_3 left/right20.00–168.60m lease is unchanged. Parent-authorized next bounded evidence batch002 may continue from S76a under the receipt rules; it does not require batch001 admission. No duplicate001, scope expansion, shared runtime edits or coverage promotion.
