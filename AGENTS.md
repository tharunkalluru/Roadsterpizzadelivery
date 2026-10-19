# Roadster worker instructions

## Every startup, resume, checkout, or pull

Read this file, then **[STATUS.md](STATUS.md), [ASSIGNMENTS.md](ASSIGNMENTS.md), [WORKER_GUIDE.md](docs/handoff/WORKER_GUIDE.md)** and the latest checkpoint linked from your assignment. These files carry context; Git does not run an agent or inherit memory. Older `game/docs/handoff` prompts are historical project context and do not activate work or supersede the current coordination files.

Run `git status --short`, `git branch --show-current`, `git rev-parse HEAD`, and `git fetch origin`. Compare your branch's base and the current remote coordination state. Confirm in your work log the exact base hash, survey revision/hash, worker identity, active assignment ID, exclusive pair, canonical road IDs/ranges/sides, and resume pointer **before mapping**. An unconfirmed/proposed assignment is not permission to begin research. If the remote changed, reread these files from the integrator's current branch and reconcile before resuming. Network/authentication failures mean the freshness check is blocked; do not claim exclusivity from a stale clone.

## Ownership and boundaries

**Role separation:** The parent/designated coordinator is the single integrator. It may update and push expressly authorized coordination documents/reservations on the handoff branch and alone owns shared-data imports/integration/deployments. The personal-branch-only restrictions below apply to external mapping workers, not to that coordinator. This does not authorize force-pushes, credential/access changes, provider evasion or unrelated edits. Read `docs/handoff/RESERVATIONS.json`; its active bounded lease takes precedence over the historical broad proposal.

- Work only on a personal `worker/<worker-id>/<assignment-id>` branch. Never push shared `main`, the default branch `claude/adoring-dijkstra-ireick`, or the handoff/integrator branch. Never force-push, enable auto-merge, change visibility/access, or deploy.
- Current sole mapping owner `01a155cd-daee-76ce-a294-b890d8aaa02b` exclusively owns **Peddamma Gudi → Jubilee Hills Checkpost**, both directions and sides, including junction alternatives and station connectors. Do not overlap it.
- **Miyapur ↔ JNTU College is reserved and provider-blocked.** It is not available to claim. Madhapur → Peddamma has a saved quick pass with explicit gaps; it is not a free new assignment.
- External worker **`second-computer-01`** has ACTIVE assignment **`khairatabad-lakdi-pilot-r8306076003-3`**: only **`r_8306076003_3`**, both canonical sides, **20.00–168.60m** in stored-point order. Endpoint buffers/junctions, all other roads/carriageways and station connectors/gates are excluded. The whole Khairatabad → Lakdi-ka-pul pair remains unassigned; never expand beyond this pilot. Confirm startup bindings in ASSIGNMENTS and the machine reservation before research.

## Evidence and shared files

Author immutable new JSON batches in `game/data/research/batches/` and checkpoint notes under `game/work/<assignment-id>/`. Use the canonical types and real IDs in `game/src/world/streetSurveyTypes.ts` and the committed `hyd-metro/2.0.0` core/chunks. Do not change stable IDs, origin, world version, immutable prior batches or their hashes.

External workers must not directly edit `game/public/research/`, `game/public/world/`, survey revision/receipts, generated queues, manifests, shared assignment state, or deployment metadata. A designated single integrator owns these mutations, including the shared authored `street-survey.json`. Preview an import in a disposable local clone if needed; generated preview output must stay out of worker commits.

Record real source URLs, capture date separately from research/review date, reviewer, camera point/heading, source IDs, confidence and explicit unknowns. A camera is not an entrance; a sign/listing is not a verified premise. Canonical side follows stored road point direction, independent of camera heading. Keep uncertain records pending/provisional. Do not invent dimensions, routes, shop identities, coverage, source dates or completion. Preserve source/licence notices; imagery is reference only unless explicitly licensed for redistribution.

Respect provider traffic restrictions, access blocks and rate limits. Stop the blocked action and record its exact scope/reason/resume point. Do not use proxies, account/session rotation, hidden endpoints or other evasion.

## Every save, commit, push and handoff

Update your checkpoint with UTC time, base hash, branch, assignment state, batch IDs/hashes, completed/blocked/unverified work, last and next panorama URLs/headings/dates, gaps, next action and validation results. The integrator updates STATUS/ASSIGNMENTS and snapshot bindings when saving a new coordinated state. Fetch before push and compare the upstream base; surface conflicts for integration. Never silently overwrite a newer reservation or receipt.

Stage explicit paths only, inspect `git diff --cached`, and scan for secrets/browser state/private screenshots. Exclude `.env`, tokens, credentials, cookies/session exports, `.playwright-cli`, `node_modules`, `dist`, virtualenvs and unrelated private data. Run the applicable documented checks and report failures accurately. Push your personal branch explicitly and open a draft PR with base, assignment, immutable receipts, gaps and checks; no automatic merge or deployment. Verify the remote branch SHA after push.

The full source-accuracy layer is stored losslessly in `game/data/archives/source-accuracy.json.gz` and restored by npm setup/build hooks. Only the integrator edits this archive or `game/config/runtime-data-archives.json`; workers must not commit the restored ignored JSON. See README for checksum verification and `npm run setup:data`.
