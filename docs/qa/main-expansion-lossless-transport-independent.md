# Independent lossless asset transport review

## Verdict and boundary

**PASS for the reviewed lossless transport, after the encoding-whitespace correction. No remaining transport blocker was found.** This review covers packaging, generated asset routes, Worker streaming, representation negotiation, cache metadata, source identity, and package size. It does not approve the concurrent road changes, the whole release, publication, mobile performance, or new artwork.

The independent review found that valid `Accept-Encoding: gzip ;q=1, identity;q=0` and the equivalent tab form incorrectly returned 406. RFC 9110 permits optional whitespace before the weight separator. Root corrected the coding-token trim in `worker/asset-transport.ts:11-12`. Three variants now pass independent tests and actual local compiled-Worker HTTP with exact decoded source SHA. [RFC 9110 quality values](https://www.rfc-editor.org/rfc/rfc9110.html#section-12.4.2), [encoding negotiation](https://www.rfc-editor.org/rfc/rfc9110.html#section-12.5.3).

## Independently observed evidence

- All **18/18 packed assets**, including **17/17 approved GLBs**, match the bytes in source commit `a679b72bacefb751057f0282a86571e8e6ef006d` and current `public/`. Every stored gzip matches its manifest SHA and decodes exactly to source. Every GLB also matches the approved registry SHA and has the expected `glTF` magic, version 2, and declared file length. Git shows no changes to `public/` or the character registry.
- Raw HTTP from an independently started compiled Worker on `127.0.0.1:4293` returns exact stored gzip SHA and exact identity SHA for every original URL. Query strings do not change the mapped source. Each asset passes identity 304 and a gzip-validator/identity-request full 200 check; variant ETags differ and responses vary on `Accept-Encoding`.
- Both gzip and identity HEAD responses have no body. Range requests return the complete source as 200 with no `Content-Range`. Internal storage access returns 404; POST, PUT, DELETE, and OPTIONS on mapped URLs return 405 with `Allow: GET, HEAD`. Existing report and unknown API routes retain 405/404 behavior. Encoded spellings of the internal namespace redirect to its canonical blocked URL rather than exposing stored bytes.
- Independent adversarial regressions pass **5/5**: legal space/tab negotiation; response availability before the stored stream ends; a later packaging failure retaining earlier raw copies; duplicate URLs and a linked dist directory failing safely; and private/no-store cache policy plus CORS metadata surviving identity transformation.
- The existing focused transport tests pass **10/10**, and build-fingerprint tests pass **2/2** on independent rerun. Worker TypeScript checks pass against both the installed package and official Workers types **5.20261103.1**.

Per-asset source/gzip hashes, exact reviewed input hashes, protocol results and package inventory are in [independent HTTP evidence](evidence/main-expansion/lossless-transport-independent-http.json). The current isolated Worker bundle SHA is `c02eb64da6b86dc64a9e0092cbd006cf40468bcfa3f9405393f5c33d8447357f`; its corrected transport source SHA is `285503d21a1bbd5012b83a1939390fbbcfef78a42e6c4f20847e563191054124`. [Whitespace HTTP evidence](evidence/main-expansion/lossless-transport-independent-whitespace.json), [independent unit log](evidence/main-expansion/lossless-transport-independent-unit.log), [focused rerun](evidence/main-expansion/lossless-transport-independent-producer-regressions.log), [fingerprint rerun](evidence/main-expansion/lossless-transport-independent-fingerprint.log), [typecheck log](evidence/main-expansion/lossless-transport-independent-typecheck.log).

## Code, configuration, and security assessment

Packaging reads the approved registry and verifies public-source, copied-source, and approved GLB hashes before accepting a compressed artifact. Compression, decompression verification, and hashing use streams. It rejects traversal/encoded URL forms, duplicate approved paths, and symlinked input/copy paths. Raw dist copies are removed only after all candidates pass. The independent late-failure regression verifies that a failure after an earlier successful compression preserves both raw dist copies and all source bytes.

The generated manifest embeds only exact original paths and content-addressed internal paths. The generated configuration routes every original mapped URL and the internal namespace through the Worker; ordinary static requests and the report API keep their existing routing. No new credentials, external fetches, authorization rules, account settings, or D1 writes were introduced. The existing compatibility date, Node compatibility flag, asset binding, D1 placeholder/provisioning arrangement, and observability remain consistent with this change. Array-valued `run_worker_first` is supported by the installed Wrangler schema and current [Cloudflare Worker-first documentation](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/).

Gzip bodies are passed through, and identity bodies use native `DecompressionStream('gzip')`; neither path waits for a complete model in application memory. `encodeBody: 'manual'` prevents the already compressed representation from being compressed again. Original client encoding uses `request.cf.clientAcceptEncoding`, which Cloudflare documents as retaining the header before normalization. [Cloudflare streaming guidance](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/), [Response encoding](https://developers.cloudflare.com/workers/runtime-apis/response/), [original client encoding](https://developers.cloudflare.com/workers/runtime-apis/request/).

Representation-specific ETags, `Vary: Accept-Encoding`, and revalidation prevent cross-variant validator confusion. Existing private and no-store policies are respected. Missing/non-200 assets, HTML fallbacks, a conflicting declared gzip length, and unexpected outer content encoding produce noncacheable 503 responses. Streaming does not pre-hash every response body: corrupt gzip fails decoding, and the existing character loader verifies the decoded approved SHA before parsing. The build and this review independently verify every shipped gzip and decoded source.

## Size, build identity, and final release gate

Independent inventory totals **258,063,251 bytes**, including an earlier preview's **68,268 bytes** of `.wrangler` artifacts and Root's **5,307-byte** temporary browser verification page. Excluding those explicitly identified test artifacts gives **257,989,676 bytes**, which independently reproduces the reported clean candidate size and leaves **10,445,780 bytes** below 256 MiB. The packed assets contain 146,844,715 original bytes and 116,950,692 gzip bytes, saving 29,894,023 bytes without changing decoded content.

`scripts/asset-transport.mjs` is included in the build fingerprint; the Worker directory, public files and catalog were already included. `npm run preview` uses the compiled manifest-bearing configuration. The existing `dist/client/build-info.json` identifies an earlier dirty candidate with fingerprint `afb050afc6b22631f07c19b911ef261ddef77d41f97589639cf141db6b20329e`. For the corrected HTTP check, only the full current Worker was recompiled into `/tmp` using the existing generated manifest; shared dist was not rebuilt during concurrent road work. The evidence distinguishes that source snapshot from the older client build fingerprint.

Root must still complete the final committed clean rebuild and integrated-candidate verification. The build removes the old dist tree, so preview artifacts and the temporary verification page should not enter the final package. This review made no UI navigation, publication, or credential changes. The independent live tests above establish code and byte/protocol evidence; Root's native Chrome captures are assessed separately below.

## Root-captured native smoke evidence reviewed

The independent reviewer opened both Root-captured screenshots: [opaque driving tip](evidence/main-expansion/lossless-transport-native/normal-production-driving-tip.png) shows a readable centered modal and `GOT IT` button over an opaque backdrop; [normal production world](evidence/main-expansion/lossless-transport-native/normal-production-world.png) shows the rendered 3D city, Roadster, elevated metro structure, traffic, minimap, speed readout, and driving controls with the modal dismissed. Root reports the normal `?q=low` URL sequence through title Play, Inner Ring Road loading, driving tip, and Got It on port 4293. The reviewer inspected the saved end states; Root performed the native browser interactions.

The reviewer also parsed [Root's native Chrome decoding JSON](evidence/main-expansion/lossless-transport-native/chrome-decoded-models.json): it records 17 unique models at the original port-4289 candidate, all `ok: true`, all gzip encoded, and every decoded SHA equal to both its recorded expected SHA and the current approved registry SHA. This supports a **native transport smoke PASS** alongside the independently exercised HTTP checks. It does not establish final road geometry, a completed delivery, or native/mobile FPS. The final committed clean rebuild and integrated road verification remain separate gates.

Reproduce focused independent checks:

```sh
node scripts/test-v21-fixes.mjs asset-transport-independent
node scripts/test-v21-fixes.mjs asset-transport.test
node scripts/test-v21-fixes.mjs build-fingerprint
npm run typecheck:worker
```

