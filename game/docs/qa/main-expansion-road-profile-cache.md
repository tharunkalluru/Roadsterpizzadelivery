# Prepared street-profile startup cache

Status: the loader, compiler, synchronous installer and build gate are implemented. The generated manifest is deliberately disabled until the final road geometry is held and approved. The release build refuses disabled or stale generated data. No production cache or timing result is claimed yet.

The city is fixed source data. The expensive road preparation can therefore run during development and ship only its changed profiles as a separate gzip pack. Startup verifies the exact canonical source-normalized roads SHA, source generation and decoded payload SHA, then installs the same prepared arrays, road reports and worker patches through the existing preparation cache. Unknown worlds, altered source, unavailable data or malformed payloads retain ordinary preparation. Driving, camera, frame timing, graphics quality and streaming behavior are unchanged.

`scripts/compile-road-profile-cache.mjs` verifies the immutable raw core-pack and geodetic-data SHA, applies the complete source correction, then binds the cache to those corrected roads and preparation implementation inputs. Geographic business and stop XZ remain fixed through the source correction. It serializes and reads back the payload before checking the ordinary installer against the derived road model, including exact numeric geometry representations. Nonfinite report metadata and packs outside the bounded32MiB startup format are rejected. The verifier does not silently regenerate an unreviewed artifact during release builds.

The manifest is small and bundled; the profile pack is a separate asset, avoiding full-city arrays duplicated in the main and tile-worker JavaScript. It is requested with its decoded SHA as a cache-busting query. Both gzip bytes and server-decoded responses are supported, and streams are bounded by the verified sizes. Failed or timed-out downloads cannot install a partial model.

Focused loader checks pass5/5: both HTTP representations and ordinary preparation reuse; altered worlds/disabled manifests/path rejection without requests; exact negative-zero coordinate/elevation preservation and source binding; corrupt transport/payload/HTML/unknown-road rejection; bounded-stream cancellation and timeout. A tagged numeric representation preserves negative zero, which standard JSON would erase. Build-fingerprint checks pass2/2 with the cache compiler included. TypeScript checks pass. The bounded independent review passed before the added negative-zero case; the final full-city serialized comparison, cache-enabled native startup, archive budget and release checks remain open.

Generate only from the final held source:

```sh
npm run cache:roads:generate
npm run cache:roads:verify
```

After any runtime preparation input changes, regenerate, independently compare the cached/derived model, and repeat affected physical/native checks. Do not use a newly generated cache as evidence that its underlying road geometry is correct.
