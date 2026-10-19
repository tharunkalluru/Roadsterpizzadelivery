# Roadster — Hyderabad metro delivery game

This handoff branch contains the current runnable game and a frozen, validated street-survey snapshot at **revision 102**. It preserves the repository's existing history. The default branch is currently `claude/adoring-dijkstra-ireick`; this handoff is a separate branch and has not been merged. A normal pull of the default branch does **not** fetch these files into your working tree.

## Second computer quick start

Install Git and Node.js **24.13.1** (npm 11.8.0 was used for this handoff). From a new directory:

```sh
git clone --branch handoff/parallel-mapping-2026-10-19 https://github.com/tharunkalluru/Roadsterpizzadelivery.git
cd Roadsterpizzadelivery
git rev-parse HEAD
cat AGENTS.md STATUS.md ASSIGNMENTS.md
cd game
npm ci
npm run build
npm run survey:validate
npm run survey:check
node --experimental-strip-types scripts/survey-queue.mjs --check
npm run dev -- --host 127.0.0.1
```

Open http://127.0.0.1:5173. The runtime uses committed world data, procedural artwork, and licensed assets; no API key, `.env`, Python environment, Google login or live data fetch is needed to run it. `npm ci` requires access to the npm registry or a compatible local npm cache. `dist/` and dependencies are generated locally. Use `npm run preview -- --host 127.0.0.1` after building for the production bundle at http://127.0.0.1:4173.

If already cloned:

```sh
git status --short
# Save your own changes first. Do not overwrite another worker's work.
git fetch origin
git switch --track origin/handoff/parallel-mapping-2026-10-19
# If the local handoff branch already exists: git switch handoff/parallel-mapping-2026-10-19
git pull --ff-only origin handoff/parallel-mapping-2026-10-19
```

Then reread the coordination files. A Git pull changes files; **it does not start an agent, transfer conversation memory, or activate a mapping assignment**. Paste [SECOND_ACCOUNT_BOOTSTRAP.md](SECOND_ACCOUNT_BOOTSTRAP.md) into the new account's agent after opening the clone.

## Work and validation

- [AGENTS.md](AGENTS.md): mandatory startup and save/push rules.
- [STATUS.md](STATUS.md): frozen base, honest validation status and latest mapping resume pointer.
- [ASSIGNMENTS.md](ASSIGNMENTS.md): ownership, exclusions, and the **NOT ACTIVE** external proposal.
- [Worker guide](docs/handoff/WORKER_GUIDE.md): immutable evidence, branches, conflicts, checkpoints and integration.
- [Snapshot hashes](docs/handoff/SNAPSHOT.json) and [handoff validation](docs/handoff/VALIDATION.md).
- [Game README](game/README.md), [source/licence notices](game/DATA_SOURCES.md), [survey schema/workflow](game/data/research/street-survey.md), [immutable batches](game/data/research/batches/README.md).

Run focused unit checks with `cd game && npm test -- tests/unit/street-survey.test.ts tests/unit/street-survey-batch.test.ts tests/unit/world-identity.test.ts`. Full `npm test` also performs expensive route calibration and writes QA artifacts; see the validation record for known failures. Browser E2E requires an installed Chromium and `CHROMIUM_PATH=/absolute/path/to/chromium npm run test:e2e`; the existing configuration's default executable is a Linux CI path. The handoff does not claim physical-phone or browser E2E validation.

Research workers add new evidence batches and checkpoints on their own branches. Only the designated integrator imports into the shared authored survey, regenerates world/queue data, merges, or deploys. Existing Sites deployment 101 is managed separately by the parent publishing workflow; a GitHub push does not deploy this game.

## Assets and reproduction

The committed runtime is sufficient for install/build/run and survey checks. Keep the attribution files and manifests: OpenStreetMap (ODbL), Overture Places (CDLA-Permissive 2.0), Poly Haven (CC0), Noto Sans Telugu (OFL), and Google Open Buildings derived height estimates (CC BY 4.0, 2023 estimates). Google Street View links and factual notes are reference only; do not redistribute its imagery as textures. See [DATA_SOURCES.md](game/DATA_SOURCES.md), [assets-manifest.json](game/assets-manifest.json), and the retained source manifests. No new code licence is granted by this handoff.

The optional Python world/source rebuild pipeline is integrator work, separate from the reproducible npm app setup. The 93.7 MB raw Open Buildings raster, Python virtualenv, intermediate caches, browser state, unnecessary screenshots and local build artifacts are omitted. Its fetch manifest and frozen derived runtime layer remain committed. Recreating the entire data acquisition pipeline requires the documented public sources, Python geospatial packages, network access and source review; do not represent that optional pipeline as an offline rebuild or bypass a provider restriction.

## Lossless runtime-data setup

The complete source-accuracy layer is tracked as `game/data/archives/source-accuracy.json.gz` (about 2 MB), with exact byte count and SHA-256 in `game/config/runtime-data-archives.json`. `npm ci` restores `game/public/world/hyd-metro/v2/source-accuracy.json` automatically; build/dev/test and survey scripts also run the restore preflight. If install scripts are disabled, run `cd game && npm run setup:data` explicitly. Decompression uses only Node built-ins, performs no network access, and must reproduce the full original **19,856,474 bytes**, SHA-256 `53ffc82503447ec72846894343e1562c9f5f33456514bfc90aadea3103111e05`. World data, manifests and runtime hashes are unchanged. The restored JSON is ignored by Git; do not commit it.

Only the single integrator may update this generated layer: preserve/review the new JSON, run `npm run archive:data`, and commit the archive plus its checksum manifest and related world bindings together. Setup refuses to overwrite an existing divergent output. Keep source/licence attribution with the compressed data. No reference imagery, records or precision were removed.
