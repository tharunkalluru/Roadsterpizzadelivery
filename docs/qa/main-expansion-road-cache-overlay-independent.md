# Independent cache and modeled-road boundary review

Bounded source/transport review: **PASS after two producer corrections.** The generated global geometry and startup cache remain disabled. This is not final road, physical-model, cache-artifact, native, publication or phone-performance acceptance.

## Corrected findings

1. Reused modeled cores initially checked only the listed model/profile roads and the moved node table. A retained actual-source negative control demonstrates that appending a stale road at a moved node returned `active: true, reused: true` even though the road endpoint stayed at `(30,10)` and its node was `(30,12)`. The producer added all-incident endpoint validation and persistent road-inventory count binding to reused cores. Independent controls now reject added incident roads, added unrelated roads and removed roads without mutation or another stop rebase. The original compiled-source negative control is preserved, source-hashed and still reproduces its failure; it is test evidence, not shipped code.
2. The tile helper initially moved its nodes and tile-only streets even when one final core-road patch was omitted. That left a source endpoint beside a moved junction while reporting no mismatch. The producer now checks the exact modeled/final conditioned core target and every incident endpoint after both patch sets. A mismatch returns the original complete zone with no applied node/road list. The independent missing-core-patch case and later stale tile-only source case now pass; the earlier failing log remains preserved.

## Verification

The guarded review run passed **25 focused groups**: 14 existing cache controls, 6 producer overlay/reuse controls and 5 new independent boundary controls. TypeScript passed. All fourteen recorded source inputs had identical hashes before and after the run.

The independent additions verify:

- Exact negative-zero signs in nested original-corridor coordinates and heights through raw gzip, already-decoded HTTP representation, current worker patches and structured clone.
- A malformed later `scenerySource` width, coordinate, elevation, elevation count or missing elevation cannot partially warm the prepared/report/patch WeakMaps or mutate raw roads.
- Added/removed prepared-core road inventory fails closed on reuse, including a newly stale incident endpoint.
- A missing final core patch cannot partially move a tile's junction/side streets.
- A later stale tile-only source returns the complete original zone atomically.

The verified raw-core-ID restriction remains intact: tile-only IDs stay outside the startup prepared-cache payload. The shared core overlay runs after generic/cached preparation; ordinary World conditioning and the final conditioned profiles follow it. The tile worker receives final core patches, then applies the same tile-only/node overlay only when the core reports active. The source cache performs no per-frame work or rendering-quality change.

The persistent model state records its generation, modeled/conditioned phase, road and stop inventory counts, and snapshots of changed stops. Current modeled-core installation clones correction arrays before making them mutable in the core. Reuse compares the appropriate numeric target and stop snapshots, retains the active worker path and does not perform the source-arclength stop move again. The actual World/worker reviewer owns the final active-data constructor, structured-cloned-core and restart proof; the synthetic controls here do not replace that gate.

Both release guards correctly rejected the current pre-activation state without generating artifacts: cache verification exited 1 with `Generate and review the prepared road cache before release.`, and profile `--hash-only` verification exited 1 because the required global release scope/geometry is absent. The old two-profile Tarnaka data therefore cannot silently unlock this branch's release through a cache regeneration.

## Evidence and repeatability

[Source identities, command exits and scope](evidence/main-expansion/road-cache-overlay-source-review/review.json), [new controls](../../tests/v21-fixes/road-cache-overlay-independent.test.ts), [original reuse failure](evidence/main-expansion/road-cache-overlay-source-review/reuse-before.json), [original mixed-tile failure](evidence/main-expansion/road-cache-overlay-source-review/mixed-tile-before.log), [passing controls](evidence/main-expansion/road-cache-overlay-source-review/independent.log), [cache controls](evidence/main-expansion/road-cache-overlay-source-review/cache.log), [overlay controls](evidence/main-expansion/road-cache-overlay-source-review/overlay.log), [typecheck](evidence/main-expansion/road-cache-overlay-source-review/typecheck.log).

Run `node docs/qa/evidence/main-expansion/road-cache-overlay-review.mjs /tmp/NEW-REVIEW-PATH` from the checkout. The wrapper refuses an existing output directory, records the exact source hashes before and after all commands, and preserves each command's exit status/log. Its two expected-failure guard commands apply only to this explicitly disabled pre-activation state; after generation the final artifact review must expect successful verification instead.

## Open final gates

After the producer and architect hold a feasible global model, independently verify the actual serialized cache artifact and exact source/compiler bindings; compare generic and verified-cache results through the complete active World/tile/node path, including original-corridor metadata and stop state; execute same-core, structured-clone and worker-restart checks; check actual HTTP decoding, native startup and package size. Final finite/vehicle/civil geometry and real input driving remain separate gates. No cache generation, dist rebuild, UI operation or publication was performed by this reviewer. Production writes remain held.
