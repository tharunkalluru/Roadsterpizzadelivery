# Lossless production asset transport

## Scope and result

The rejected publication package expanded to 287,859,948 bytes. The clean production build now expands to **257,989,676 bytes**, below the 268,435,456-byte limit by **10,445,780 bytes**. The 17 required character GLBs and the large RTC fallback zone JSON use gzip transport; the other city packs remain unchanged.

All `public/` files and `src/delivery/art/character-assets.json` remain byte-identical to source commit `a679b72bacefb751057f0282a86571e8e6ef006d`, verified by Git comparison. This is download packaging, not model/texture simplification. It makes no phone FPS or thermal-performance claim.

The 18 mapped assets total 146,844,715 original bytes and 116,950,692 stored gzip bytes, saving 29,894,023 bytes. Sources, public URLs, geometry, rigs, materials and approved SHA values are retained. Only verified redundant raw **dist copies** are removed, after every candidate passes source/copy/approved-SHA and gzip round-trip checks.

## Build and Worker behavior

- `scripts/asset-transport.mjs` uses Node streams to compress source-verified production copies and stream-decode/hash each result before accepting it. A generated whitelist contains original path, internal stored path, original MIME, byte counts and both SHA values.
- `scripts/build.mjs` embeds that whitelist into the compiled Worker, emits the manifest and explicit `run_worker_first` routes for every original mapped URL plus the internal namespace, and rejects a dist tree over 256 MiB. The new build helper participates in the build fingerprint.
- `npm run preview` now uses `dist/server/wrangler.json`, the compiled manifest-bearing configuration. Other API, D1, authentication and audience settings are unchanged.
- The Worker handles only exact mapped URLs; other normal static requests retain the existing asset behavior. Direct access to the internal stored namespace is rejected. There are no new authorization or data-storage paths.
- Gzip responses stream the stored bytes with `Content-Encoding: gzip` and `encodeBody: 'manual'`. Identity clients receive a native streaming `DecompressionStream`. No large payload is buffered in Worker application code.
- Negotiation honors `request.cf.clientAcceptEncoding`, because Cloudflare normalizes the ordinary incoming header. Variant-specific ETags and `Vary: Accept-Encoding` prevent identity/gzip validator confusion. Existing private/no-store policies are retained; otherwise responses revalidate.
- HEAD/304 contain no body. Range requests deliberately receive a complete 200 representation with `Accept-Ranges: none`; encoded partial bytes are never labeled as decoded GLB offsets. Missing/non-200/HTML fallback, invalid declared length or unexpected outer encoding fail with a noncacheable 503 instead of returning SPA HTML as a model.
- A streaming pass-through cannot prevalidate arbitrary same-length corruption. Corrupt gzip fails decompression; other decoded corruption fails the existing approved SHA gate. The build verifies stored files before publication; no per-request whole-model hash buffer was added.

## Verification

- Frontend and Worker TypeScript checks: PASS.
- Transport focused regressions: **10/10 PASS**, including real Worker routing injection, original Cloudflare header negotiation, exact bytes, HEAD/304/ranges, errors/corruption, cache policy and safe packaging failure.
- Build-fingerprint regressions: **2/2 PASS**; changing only the compression helper invalidates the identity.
- Bug-report storage/privacy/retry regression groups: **16/16 PASS**. Its fingerprint fixture was extended to include the new required input; report production behavior is unchanged.
- Actual compiled local Wrangler HTTP: **18/18 assets PASS**, including all 17 original GLB URLs. Raw HTTP gzip bytes match the stored SHA; one gzip decode matches approved source SHA; native Node `fetch` decoding matches approved source SHA; identity requests return exact source SHA. Original MIME, HEAD, conditional 304, full-200 range, internal 404, mapped POST 405 and unchanged API 405 pass.
- A request explicitly excluding both gzip and identity is rejected by local workerd's HTTP gateway with 415 on mapped models **and untouched static/API controls**. The handler's 406 is independently unit-tested. The evidence does not misreport this gateway response as a Worker 406.
- Full portable legacy rerun: **37/38 PASS**. The concrete remaining failure is `metro-clearance-regressions.mjs:256`, `d99323ba-b75_0: actual obstructing cylinder removed`, during the concurrent road correction. Parent notified; this report does not approve the overall release while that regression remains open.

Reproduce compiled HTTP verification after `npm run build` and starting `npm run preview -- --port 4289`:

```sh
node tests/legacy/asset-transport-http.mjs http://127.0.0.1:4289 docs/qa/evidence/main-expansion/lossless-asset-transport-http.json
```

The actual local check used Wrangler 4.153.0. The clean build fingerprint is `afb050afc6b22631f07c19b911ef261ddef77d41f97589639cf141db6b20329e`; source was dirty because the held transport and concurrent road fixes were not yet committed. Root must perform the final committed clean rebuild and browser verification. The HTTP test establishes byte identity, not native browser/gameplay acceptance.

## Evidence and release boundary

Exact held source hashes and sizes: [build evidence](evidence/main-expansion/lossless-asset-transport-build.json). Per-asset HTTP hashes: [HTTP evidence](evidence/main-expansion/lossless-asset-transport-http.json). Build, focused, fingerprint, reporting, full-legacy and HTTP logs are stored beside them with the `lossless-asset-transport-` prefix.

Wrangler preview creates temporary `dist/server/.wrangler` files (68,268 bytes in this check). Root may also create a temporary browser verification HTML. The official clean rebuild removes the entire old dist tree before packaging; neither preview artifacts nor a temporary verification page should be included in the final release archive. Root owns independent review, actual browser decoding of all 17 original GLB URLs, normal production loading/render verification and publication. No publication or credentials were accessed in this task.

Current primary references: [Cloudflare Response / encodeBody](https://developers.cloudflare.com/workers/runtime-apis/response/), [Request / clientAcceptEncoding](https://developers.cloudflare.com/workers/runtime-apis/request/), [HTTP header normalization](https://developers.cloudflare.com/fundamentals/reference/http-headers/), [Worker-first asset routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/), [Workers stream guidance](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/). Current official Workers type package 5.20261103.1 was inspected for `encodeBody` and `DecompressionStream`; no runtime dependency update was needed.
