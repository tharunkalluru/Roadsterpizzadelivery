# Branches, evidence and integration

## Personal branches and freshness

Read root AGENTS/STATUS/ASSIGNMENTS and the linked checkpoint at every startup, resume and pull. `git fetch origin` then compare `git rev-parse HEAD`, `git rev-parse origin/<integrator-branch>` and `git merge-base HEAD origin/<integrator-branch>`. In a worker branch, `git log --oneline HEAD..origin/<integrator-branch>` reveals integrator changes you lack. Read their coordination files before deciding whether your assignment is still valid. Fetch/auth failure blocks a fresh exclusivity assertion. Save your changes before switching; do not discard or overwrite work.

When the parent activates your named reservation, branch from the recorded exact commit:

```sh
git switch -c worker/YOUR_ID/ASSIGNMENT_ID APPROVED_COMMIT_SHA
```

Use your actual GitHub account's supported authentication. Existing public visibility permits cloning, not necessarily pushing. If push access is unavailable, propose changes through your own fork/PR if authorized, or report the exact access blocker; do not alter repository permissions, accounts or visibility. No account expansion is part of this handoff.

## Immutable evidence and canonical meaning

Use `game/data/research/batches/README.md` and `game/src/world/streetSurveyTypes.ts`. Each batch has `schemaVersion: 1`, stable unique `id`, `worldId: hyd-metro`, `worldVersion: 2.0.0`, `reviewedAt`, `reviewer`, `notes` and appropriate source/observation arrays. Do not add unsupported schema fields: express confidence and unknowns explicitly in notes where no typed confidence field exists. A minimal batch can have only dated source-linked **pending** observations; omit road IDs when unknown rather than guessing.

Separate capture date from observed/reviewed date; null means unknown. Record actual URLs, pano IDs, camera coordinates and headings, reference-only asset policy and limits. Preserve ambiguous/unreadable operators, non-shop gaps, repeated advertising and date discontinuities. A roof/ground repeat of a brand is not another premise. Listing identity does not establish side/floor/facade/entrance or current tenancy. Canonical road side follows `road.points` order; X east, Z south. `r_*`, `b_*`, `c_*`, and `st_*` must refer to the existing world. Panorama displacement and station-marker distance are not measured route length.

Batch receipts hash canonical content with `surveyRecordHash` in `streetSurveyBatch.ts`. Reimport of identical content is a no-op; changed content under an existing ID is rejected. Corrections/retractions require exact previous record hashes via `expectedPrevious`, explanatory evidence and a new batch ID. Never edit an imported batch to evade conflict checks. A worker branch must not change an older batch or shared receipts.

## Checkpoint and resume

Save `game/work/<assignment-id>/checkpoint-<UTC-or-sequence>.md` and a structured evidence ledger as useful. Include:

- worker/assignment/branch, exact base commit and survey revision/hash, UTC timestamp, exclusive road/side/ranges;
- completed observations and batch IDs plus canonical hashes, validation results and immutable source chain;
- last inspected and next panorama URLs, capture date, heading, position, direction and exact next action;
- route breaks, provider blocks, hidden/unreadable units, canonical alignment and all remaining unknowns;
- separate observed, provisional, visually inventoried and strictly verified status; no completion inflation.

Resume from this checkpoint only after freshness/ownership checks. Stop the blocked action with its exact target/reason and leave an explicit pointer. Respect traffic restrictions; no proxy/account/session rotation, hidden-endpoint scraping or other evasion. A provider-blocked route remains reserved until its owner releases it.

## Validation and single integrator

Workers can validate against the frozen world in a **disposable local clone**:

```sh
cd game
node --experimental-strip-types scripts/survey-import-batch.mjs data/research/batches/YOUR_BATCH.json --check
```

Check the preview result and conflict diagnostics. Do not commit resulting shared/generated files. Only the designated integrator, on the current coordinated base, imports and regenerates:

```sh
node --experimental-strip-types scripts/survey-import-batch.mjs data/research/batches/YOUR_BATCH.json
npm run survey:validate
npm run survey:network
node --experimental-strip-types scripts/survey-queue.mjs
npm run survey:check
node --experimental-strip-types scripts/survey-queue.mjs --check
npm run build
```

The importer uses a lock and atomic rename. A stale `expectedPrevious` conflict requires review/rebase/correction, not bypassing the lock. The integrator reconciles duplicate source/identity claims, validates across real chunks, maintains STATUS/ASSIGNMENTS/checkpoints/hashes, and alone changes shared generated world data or deployment. Code-only changes use separate narrow branches and focused tests, avoiding another owner's files. A worker's requested PR target is the integrator's **current branch**, not automatically the repository default.

## Save and push

Fetch first and recheck base/reservation. Stage only your new immutable batch and checkpoint paths; inspect the entire staged diff for `.env`, credentials, tokens, cookies, browser sessions, private screenshots and unrelated data. Do not commit `node_modules`, `dist`, `.playwright-cli`, virtualenvs or raw downloaded reference imagery. Preserve required licensed runtime assets and notices.

```sh
git add game/data/research/batches/YOUR_BATCH.json game/work/YOUR_ASSIGNMENT/YOUR_CHECKPOINT.md
git diff --cached --check
git diff --cached --stat
git commit -m "Record ASSIGNMENT dated evidence batch"
git push -u origin HEAD:refs/heads/worker/YOUR_ID/ASSIGNMENT_ID
git ls-remote origin refs/heads/worker/YOUR_ID/ASSIGNMENT_ID
```

Open a draft PR containing base SHA, assignment scope, batch hashes, source dates, completed/blocked/unverified details, validation and next pointer. No force-push, merge, auto-merge or deployment. The parent reviews/integrates and releases/reassigns reservations explicitly. Pulling a branch alone never starts autonomous work.

## Lossless runtime-data setup

The complete source-accuracy layer is tracked as `game/data/archives/source-accuracy.json.gz` (about 2 MB), with exact byte count and SHA-256 in `game/config/runtime-data-archives.json`. `npm ci` restores `game/public/world/hyd-metro/v2/source-accuracy.json` automatically; build/dev/test and survey scripts also run the restore preflight. If install scripts are disabled, run `cd game && npm run setup:data` explicitly. Decompression uses only Node built-ins, performs no network access, and must reproduce the full original **19,856,474 bytes**, SHA-256 `53ffc82503447ec72846894343e1562c9f5f33456514bfc90aadea3103111e05`. World data, manifests and runtime hashes are unchanged. The restored JSON is ignored by Git; do not commit it.

Only the single integrator may update this generated layer: preserve/review the new JSON, run `npm run archive:data`, and commit the archive plus its checksum manifest and related world bindings together. Setup refuses to overwrite an existing divergent output. Keep source/licence attribution with the compressed data. No reference imagery, records or precision were removed.
