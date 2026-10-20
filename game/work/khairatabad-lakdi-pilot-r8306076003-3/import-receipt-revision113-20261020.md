# Reviewed Lakdikapul pilot import receipt — revision 113

**Outcome:** imported once into the primary survey as two pending context observations only. This receipt records importer admission of the reviewed handoff; it is not independent imagery review, coverage approval, assignment release, worker notification, or publication.

## Immutable handoff and preflight

- Handoff: `/Users/tharun/Documents/Codex/2026-10-18/task-2/reviews/worker-first-batch-81ce543c/immutable-handoff/IMPORT_HANDOFF.md`
- Pinned worker commit in that handoff: `81ce543c677e2eb6e59cbcfe29d8ff20bb973022`.
- Batch: `game/data/research/batches/second-computer-01-khairatabad-lakdi-pilot-001-20261019.json`
- Handoff file SHA-256: `7108b5b31e4d7a9f3e5fbbd755320a3b6e2f307239a77dadabdb0e2f0c7728a5`; copied primary file has the same SHA-256.
- Canonical content hash: `8367814cde80fd0f11911d8c778740396135ad2d2233dbff4ab481c85d7841e1`.
- Fresh base before import: revision 112, SHA-256 `a20c72f6989479ae909847686ca9eeb69f62488d312cef4a7e84873700e3da3e`. No prior applied-batch entry or duplicate source/observation IDs were present.
- Importer `--check` returned `validated_preview`, hypothetical revision 113, with the reviewed canonical hash above.

## Import result

The primary importer returned `imported`, revision **113**, content hash `8367814cde80fd0f11911d8c778740396135ad2d2233dbff4ab481c85d7841e1`.

The batch contributes two November 2021 camera-angle sources and exactly two pending observations on the reserved road `r_8306076003_3` (headings 48° and 228°). It adds no named tenant, storefront placement, frontage range, road review, coverage interval, side completion, or verified status. The separate April 2026 locator/date break remains excluded. The reservation for both sides, arclength 20.00–168.60 m, was left unchanged. No independent imagery review was performed during this import.

## Validation

- `survey-validate`: passed, 0 errors.
- `survey-network.mjs --check`: `ok` after refreshing the generated survey summary and network indexes.
- Primary survey: 808 sources, 583 observations, 169 provisional storefronts, 0 verified storefronts, 0 verified sides, and 0% verified coverage.
- Post-refresh survey SHA-256: `17741d5b1fe3df3845944c2632da2628a5e22f2d8a54bee7e58272a4e5c3f66a`.

The immutable handoff file was not modified. No worker message, coordination publication, deployment, or GitHub push was made.
