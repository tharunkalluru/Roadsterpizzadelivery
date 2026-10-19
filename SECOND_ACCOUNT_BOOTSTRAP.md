# Start the activated second-computer pilot

You are `second-computer-01`, assignment **`khairatabad-lakdi-pilot-r8306076003-3`**. The parent has activated only the bounded road slice below; earlier broad proposal text is historical and grants no extra scope. Pulling alone does not execute research.

1. Preserve any local changes first. With a clean checkout, run:

```sh
git fetch origin
git switch handoff/parallel-mapping-2026-10-19
git pull --ff-only origin handoff/parallel-mapping-2026-10-19
git status --short
git rev-parse HEAD
```

2. Read `AGENTS.md`, `STATUS.md`, `ASSIGNMENTS.md`, `docs/handoff/RESERVATIONS.json`, `docs/handoff/SECOND_COMPUTER_ACTIVATION.md`, `docs/handoff/WORKER_GUIDE.md`, `docs/handoff/VALIDATION.md` and `docs/handoff/SNAPSHOT.json`. Confirm the named ACTIVE lease. Resolve the exact activation/base commit:

```sh
git log -1 --format=%H -- docs/handoff/RESERVATIONS.json
```

Use that full SHA, also supplied by the integrator after publication, in:

```sh
git switch -c worker/second-computer-01/khairatabad-lakdi-pilot-r8306076003-3 EXACT_ACTIVATION_SHA
```

If the personal branch already exists, preserve it and compare/reconcile the base; do not reset, overwrite or create a second writer.

3. Report worker=`second-computer-01`, assignment=`khairatabad-lakdi-pilot-r8306076003-3`, exact HEAD/activation SHA, personal branch and setup results. Verify frozen survey102 SHA-256=`2500760b5de99102489055f7f52d1639ad64b486424fdbcbe54b5ece3d7f1e2a`; source snapshot predecessor=`7145ba2b954c2ec01c67e902a44e45c6fc5d91a4`. Do not claim the frozen runtime is the live owner's106. Existing successful setup can be retained; if missing, use Node24.13.1 and the documented npm setup. No `.env` or runtime API key is required. Preserve the lossless checksum-bound source-accuracy archive and ignored restored output.

4. **Then begin only this ACTIVE pilot:** `r_8306076003_3` (Lakdikapul Road), canonical left and right, closed arclength20.00–168.60m along stored `road.points`. Exclude0–20m and168.60–188.60m outside the included endpoints, both endpoint junctions, every other road/carriageway, branches, station connectors and gates. Approximate map endpoints17.4064797,78.4625119 →17.4054927,78.4634551. This is not the whole Khairatabad–Lakdi-ka-pul route. Actual pano/date/heading is unknown; locate and align via supported ordinary imagery UI. Stop and checkpoint if unavailable/misaligned; do not expand scope.

5. Save new immutable evidence batches as `game/data/research/batches/second-computer-01-khairatabad-lakdi-pilot-<sequence>-<YYYYMMDD>.json`, source IDs prefixed `sv-second-computer-01-khairatabad-lakdi-pilot-`, and checkpoints under `game/work/khairatabad-lakdi-pilot-r8306076003-3/`. Record actual source URLs/date/camera positions/headings, confidence, unknowns and non-shop gaps; camera points are not doors. No source evidence is preapproved. Keep unsupported placement pending; never inflate coverage.

6. Keep Peddamma–Jubilee Hills Checkpost entirely with primary owner `01a155cd-daee-76ce-a294-b890d8aaa02b`; keep Miyapur–JNTU's35roads/70sides reserved/provider-blocked; do not resume earlier sampled pairs. Never edit shared generated survey/world data, revisions/receipts, old batches, reservations or deployment metadata. One integrator imports, coordinates, merges and deploys. Stop provider blocks without evasion or redistribution of reference imagery.

7. Fetch/check the live lease before saving/pushing. Stage only your explicit new batch/checkpoint files, scan for secrets/browser state, push your personal branch using your supported GitHub login, then open a **draft PR into `handoff/parallel-mapping-2026-10-19`** with base, batch hashes, checks, completed/blocked/unverified details and resume pointer. No handoff/main/default push, force-push, auto-merge, deployment or access change.

When startup bindings match, the ACTIVE reservation already authorizes bounded research; no additional conversational approval is required. A changed/inactive lease or freshness/auth/provider/alignment problem pauses only the affected work and must be reported precisely.
