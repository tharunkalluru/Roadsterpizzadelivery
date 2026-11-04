# Scoped independent railway source and facility review

No blocking defect was reproduced in the actual 70 proposed crossings. This is isolated research preparation only. **No full source, full city, fitted-world, native or release acceptance is granted.**

- Existing-evidence baseline changes 0 roads. Adding the proposal changes 205 roads.
- Independent checks found 70 unique changed railway centreline crossings; all have exact road/rail/location evidence. No unauthorized new centreline underpass was reproduced.
- All 142 applied road/rail/evidence finite-span groups are contiguous; all 70 proposed groups are present. No disconnected same-pair application was found. Proposed applied span endpoints remain within 11.93617110511527 m (11.937 m rounded) of their audited crossing anchors, despite a maximum admissible radius of 144 m.
- The source-relative layer handling remains fail-closed for new proposal authority. Of 155 retained source railway bridges, 153 have the required source layer and matching geometry; the two layer-missing ways receive no new proposal authority.
- Use “source railway bridges.” Only 24 ways explicitly confirm `bridge:structure=beam`; the remaining 131 do not specify their structure.
- Lowered positive-source approaches are not proof of reversed relative order. No reduced road/road centreline crossing within the reviewed active positive extents was found. Hislop’s lowered samples lie outside its active source bridge extent.

The original probe skipped finite checking of `elev[0]` and checked railway object identity rather than a deep geometry snapshot. Neither produced an observed failure in the original artifact; root is handling those validator gaps.

Open gates remain: 106 detailed source-owner promotion reviews (parent-reported), global fitting and graph closure, full finite source-order/headroom checks, rendered mesh and car contact, native driving, and release approval.

The receipts below preserve the original generator hashes separately from persistence-time source hashes because root changed the audit/probe scripts during follow-up. No broad check was rerun to save these receipts.

## Original inputs and artifacts

| Input/artifact | SHA-256 |
| --- | --- |
| `model` — `/tmp/roadster-road-freezes/source-9413-af5-pjr-capacity-v1/model-be04dc1797d38d0112ad8bec9b7a405e5e766aed69f4420ec8200dd4850a72a7.json` | `be04dc1797d38d0112ad8bec9b7a405e5e766aed69f4420ec8200dd4850a72a7` |
| `source-data` — `/tmp/roadster-road-freezes/source-9413-af5-pjr-capacity-v1/sourceData-55ee3dbc0c741072e204d7560731296db086959c23ef765a9518da4a27cd237b.json` | `55ee3dbc0c741072e204d7560731296db086959c23ef765a9518da4a27cd237b` |
| `source-reference` — `/tmp/roadster-rail-bridge-complete-source-reference-9413-v7.json` | `92d62e939fe13831c9d7fe45fcedf12d4bd4dbf828667a3df710c55822c978a0` |
| `current-rail-source` — `/tmp/roadster-all-rail-bridge-source-20261104/combined.json` | `641231a77208137392356b2f6a12a6b6cd5fb9cddc1eb98203ac5a6c75d3e733` |
| `crossingAuditV4` — `/tmp/roadster-all-source-railway-bridge-crossings-9413-v4.json` | `e47862a2c99c14971e9bbbff34a979a666b6d58e8ae7c187c55a5fbf24cbc0aa` |
| `additionalFacilityProposalV1` — `/tmp/roadster-source-proved-additional-railway-facilities-9413-v1.json` | `923a99aa1f8ae1d5775ecc86731fdd5b77a8f142cca59fe0156259d90b631dfe` |
| `preparationProbeV1` — `/tmp/roadster-source-proved-railway-facility-preparation-9413-v1.json` | `c6ee7f799d946db4a443db03093cea8b2ee6a92f6ec2f476cfe316bf9c31742e` |

Original audit generator recorded by v4: `6bc8e7aae5561d6d55646a7ab63e9ede906dda708adf17f9fe78a6db9227d79d`.
Original preparation probe generator recorded by v1: `28e48e1a0b346a328c434a53c343d2ae7a1d03f82e6e28dbc1b36171d638265d`.

## Persistence-time code hashes

| Source | SHA-256 |
| --- | --- |
| `/Users/tharun/Documents/Codex/2026-10-31/fourteen-delivery-private-upload-batches/scripts/qa/audit-source-railway-bridge-crossings.py` | `61ffe66052f787224696dbac23e3a2d6e4f269391b1ea732a464321d3c047598` |
| `/Users/tharun/Documents/Codex/2026-10-31/fourteen-delivery-private-upload-batches/scripts/qa/probe-source-railway-facilities.mjs` | `36275cf9ef6a0c7cfde3275b979bbb75eacdd9829f841b0caa3ad985c586bfcb` |
| `/Users/tharun/Documents/Codex/2026-10-31/fourteen-delivery-private-upload-batches/src/world/railway-clearance.ts` | `0db1e710dc744338f899b2bca8f5ec622fafc91e3d108d3f434049f4b3dfa3bc` |
| `/Users/tharun/Documents/Codex/2026-10-31/fourteen-delivery-private-upload-batches/src/world/railway-evidence.ts` | `bcf79d05349ceb4954d1716884b0ec7f8aa8a88a550960eb56998b91aceadeb5` |

Finite instrumentation receipt: [roadster-rail-source-facility-independent-review-20261104-finite-instrumentation.json](/tmp/roadster-rail-source-facility-independent-review-20261104-finite-instrumentation.json) — SHA-256 `22dba7a535a8b52af3faf4df60f6ca528f00bc19e0eee067f4574157f9d74a39`.
Machine-readable review: [roadster-rail-source-facility-independent-review-20261104.json](/tmp/roadster-rail-source-facility-independent-review-20261104.json) — SHA-256 `666324c13ee797bb23802733229189d2f42b1d3e4894e9654498be30b3a1bfe6`.

The instrumentation receipt records the completed in-memory method and observations. The scope does not extend to arbitrary future radii or changed geometry.
