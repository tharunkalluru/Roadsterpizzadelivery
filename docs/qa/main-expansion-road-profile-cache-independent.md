# Independent prepared-road startup cache review

**Bounded implementation review: PASS after Root's compiler corrections. The real cache artifact is not generated or accepted yet.** No remaining implementation blocker was found within the checks below. This review does not approve road geometry, native startup timing, publication, or FPS, and does not replace the held-source artifact comparison.

## Findings resolved during review

The initial compiler compared the in-memory payload before serialization using JSON equality. An independent synthetic probe demonstrated that JSON changes report `Infinity` values to `null` and geometry `-0` to `+0`, while JSON equality hides both distinctions. Root changed the compiler to serialize and parse first, install that restored payload, compare the complete serialized model/patches/report, and use `Object.is` for every point coordinate, elevation, width, and lane count. Published report metadata must contain finite numbers. This prevents silently claiming numeric identity when serialization changed a prepared coordinate.

The initial compiler/build verifier also lacked the loader's 32 MiB representation limit. Root added matching gzip/payload limits and bounded build-time gunzip output to the declared payload size. The independent test verifies that oversized metadata is rejected before reading any artifact. The actual resulting artifact's size remains unmeasured until generation from the held road source.

Root subsequently added tagged negative-zero serialization and matching browser revival so real `-0` coordinates and elevations survive the wire format. Independent adversarial review found that a literal `{ "$roadProfileNegativeZero": true }` source object could impersonate a numeric `-0` in the initial canonical source hash. Root corrected both compiler/runtime source canonicalizers to reject original reserved-marker objects and validate numeric source geometry before hashing. The independent collision regression now passes; exact signed zeros survive both raw-gzip and server-decoded transport, and a signed source change is rejected before fetching. Lookalike payload markers with extra keys or non-true values remain invalid coordinates.

## Independent checks

- New regressions: **9/9 PASS**. A later invalid patch, unknown/duplicate ID, invalid point/elevation/width, or malformed report cannot partially warm the WeakMaps. Unknown/stale raw roads and invalid size metadata trigger no fetch or install. A response resolving after timeout cannot install a late model. A server-decoded serialized fixture restores the derived finite profiles and report. Disabled/oversized build metadata is rejected without changing artifacts. The three added codec tests cover exact signed zeros/source binding, the reserved-source-marker collision, and malformed payload-marker rejection.
- Existing cache regressions: **5/5 PASS**; build fingerprint regressions: **2/2 PASS**; independent `npm run typecheck`: **PASS**.
- Direct `node scripts/compile-road-profile-cache.mjs --verify` exits **1** with `Generate and review the prepared road cache before release.` The source manifest remains `{ "version": 1, "enabled": false }`, and the production cache asset does not exist. No production cache generation or shared dist rebuild was performed.
- The source core contains **52,412 roads**, including **7 negative-zero numbers** and no reserved-marker keys. Its tagged canonical source has **13,773,620 bytes** and SHA `3f72a07d52318f4660e3d6996cef1cc1f37199d997685b72f0230df1c3b06ba4`. The earlier plain-JSON SHA `52908c3e0eac48c644fd61fe408ce3920febb2069eb004af45df23c9110b5be0` does not preserve signed-zero identity and is no longer the runtime binding. This is an inventory measurement, not generated cache size.
- A read-only check passed the entire actual core through the updated runtime source validator and canonical SHA check with a deliberately mocked 404: exactly one request, zero installations, and the expected unavailable fallback. No production cache was generated. [Actual-core codec compatibility evidence](evidence/main-expansion/road-profile-cache-independent-codec-core.json).

[Reviewed source hashes and result metadata](evidence/main-expansion/road-profile-cache-independent-review.json), [independent test log](evidence/main-expansion/road-profile-cache-independent-unit.log), [existing cache rerun](evidence/main-expansion/road-profile-cache-independent-producer.log), [fingerprint rerun](evidence/main-expansion/road-profile-cache-independent-fingerprint.log), [current typecheck](evidence/main-expansion/road-profile-cache-independent-typecheck.log).

## Binding, fallback, and integration assessment

The runtime loader validates the manifest shape and limits, then hashes the untouched raw-road array before requesting the fixed same-origin-relative `/city/road-profiles-v1.pack.wasm` asset with a payload-SHA query parameter. It verifies compressed bytes when gzip magic is present and verifies decoded payload bytes and SHA in both raw-gzip and server-decoded cases. The download and decompression paths are bounded; the timer aborts the request, and failure retains ordinary preparation. Installation happens after the raced download completes, so a late response cannot warm a fallback world.

The installer validates every patch before applying any and only then populates the existing prepared/profile/report WeakMaps. `main.ts` awaits warming between raw core loading and the existing `prepareRoadGrades` call; failure follows that existing preparation path. The cache introduces no per-frame code, vehicle/camera tuning, or quality-setting changes.

Runtime binding is to raw-road SHA and payload SHA. `sourceCorePackSha256` and `generatorInputsSha256` are shape-checked at runtime; their exact content binding is enforced by the build verifier. That verifier binds the source core and every source file except the generated manifest, package files, and the compiler itself. The compiler is also included in the ordinary build fingerprint. The build runs verification before deleting/rebuilding dist, so disabled or stale data cannot be silently shipped through the production build command.

Static review also confirms the LP profile `--hash-only` gate precedes cache verification in the production build, `check:release` runs the full `audit:road-profiles` command, and all three LP helper scripts participate in the build fingerprint and passing fingerprint regressions. These commands were not used to regenerate any profiles during this review. The native diagnostic `Road profiles: verified startup cache` is logged only when warming reports `used: true`; this is an observation aid for the pending real-artifact/native gate.

The `.pack.wasm` static-asset route follows the established city-pack format; loader tests cover both raw gzip and already decoded response bytes. Actual HTTP/native behavior of this new artifact is still pending because no artifact exists.

## Open artifact gates

After the final road source is held, generate the actual cache and independently compare its serialized installed result against ordinary preparation, including numeric profile identity, complete patches/report, source/core/compiler bindings, and size. Then verify actual HTTP decoding and a normal native game startup, followed by the final committed clean build, build fingerprint, and total package size. Root owns UI and publication. The earlier independent lossless-model transport verdict remains unchanged.

Only the independent cache test, this report, and its evidence files were written by this reviewer. All further writes are held.

