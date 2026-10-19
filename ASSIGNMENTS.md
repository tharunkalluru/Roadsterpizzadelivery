# Assignments and exclusive reservations

Updated **2026-10-19 UTC**, frozen survey **102**. Historical base `440d5b40e3b8751ea31a51ab69d41aa8e1289a1f`; owner working branch `claude/adoring-dijkstra-ireick`; handoff branch `handoff/parallel-mapping-2026-10-19`. Always fetch/reread current coordination state on startup, resume, or pull. This snapshot cannot grant a lease against later owner changes.

| Assignment | Owner | State / exclusive scope | Resume / next step |
|---|---|---|---|
| `peddamma-jubilee-checkpost` | `01a155cd-daee-76ce-a294-b890d8aaa02b` | **ACTIVE**. Entire Peddamma Gudi → Jubilee Hills Checkpost pair, both travel directions and both canonical sides, all junction alternatives and station connectors. Exact route/road ranges remain unresolved, so another worker must avoid the whole pair. | [Revision 102 checkpoint](game/work/peddamma-jubilee-checkpost-route-progress/checkpoint-revision102-segment-b-20261019.md); panorama/action in STATUS. |
| `madhapur-peddamma` | Existing owner/integrator | **QUICK PASS SAVED; GAPS OPEN**. No external reassignment. No verified sides or complete pair claim. | [Revision 100 reconciliation](game/work/madhapur-peddamma-route-progress/checkpoint-revision100-quick-pass-reconciliation-20261019.md); targeted gaps only after reservation. |
| `miyapur-jntu` | Existing cloud reservation; identity not available in this handoff | **RESERVED / PROVIDER-BLOCKED**. Miyapur ↔ JNTU College, both directions and sides. Do not claim or assign it. | Preserve prior reservation and provider block. Parent must consult the live reservation owner. No evasion. |
| `external-khairatabad-lakdi-proposal` | **UNASSIGNED** | **PROPOSED — NOT ACTIVE**. No worker, lease, canonical side/range or activation base is reserved. | Parent verifies live exclusivity and reserves exact scope with current mapping owner before activation. |

## Proposed disjoint work (not permission to start)

**Khairatabad → Lakdi-ka-pul**, adjacent Red Line station region: canonical station IDs `st_khairatabad` (17.411564, 78.460846) and `st_lakdi_ka_pul` (17.403934, 78.465005). This is geographically separate from the active western Blue Line pair and the reserved Miyapur–JNTU pair.

At frozen revision 102, the two nearest-station work regions contain **416 roads in 64 blocks**, all **832 sides unreviewed**, with **no attached road/context evidence**. No authored Street View/source position lies within the audited 350 m buffer around the straight station-to-station segment, and no source text names either station. See the reproducible [proposal audit](docs/handoff/PROPOSED_ASSIGNMENT_AUDIT.json). Region totals are screening evidence, **not a claim that all 416 roads belong to this station-pair route**. Station markers are provisional; street availability, route continuity and actual station gates are unknown. Existing generic station-landmark research and map listings do not constitute a street survey.

Before activation the parent must: check the live owner ledger for later/other reservations; choose the public ground-road route; record exact canonical road IDs, start/end arclength and canonical sides/boundary ownership; name the worker and personal branch; record the actual activation commit hash and survey hash; reserve exclusively with the current owner; and set ACTIVE in a coordinated commit. Exclude shared boundary/junction road ranges unless specifically assigned. If another owner has claimed any part, choose another disjoint scope. **Until then the external worker may clone, install, read and validate only.**

## Required fields in every active external reservation

`assignmentId`, `status`, `updatedAt` (UTC), `workerId`, `ownerBranch`, `baseCommit` (exact activation SHA), `surveyRevision`, `surveySha256`, station pair/direction, explicit canonical `roadId` + `side` + `startM/endM` ranges, excluded boundaries, reservation confirmation, latest checkpoint, last/next panorama URL and heading/capture date, completed/blocked/unverified status and next action. Unknowns must be literal unknowns, not guessed values. The single integrator maintains this file; workers propose reservation changes through a PR/checkpoint.
