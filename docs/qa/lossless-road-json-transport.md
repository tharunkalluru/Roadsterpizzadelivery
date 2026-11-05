# Lossless road JSON transport

This optional transport is inactive until a separately accepted road release
selects it. It grants no source, geometry, height or physical approval.

`packageRoadJSON` in `scripts/package-road-json.mjs` takes original per-role
file paths and independently expected SHA-256 values. It interns repeated raw
JSON value text, gzip-compresses the resulting dictionary, reconstructs every
original file through the production decoder and compares every byte before
writing a new package directory. Input and codec files are held across the
transaction. Existing packages are never overwritten.

The format preserves original whitespace, escaped Unicode, duplicate keys,
property order and numeric spellings, including negative zero. It rejects a
UTF-8 BOM rather than silently dropping it. It does not parse and reserialize
the source files as normalized JSON.

The optional `json-parts-gzip` branch of `released-road-assets.ts` binds the
compressed bytes, dictionary bytes and each original role separately. Shared
dictionary descriptors must agree before any download. Two bounded readers
share one download and release the dictionary after assembling the inputs.
Every reconstructed file still passes the loader's actual SHA-256 check and
the existing model, source-copy and fitted-stage validators.

The decoder bounds serialized bytes, container depth/count before JSON.parse,
nodes, parts, literal bytes, expansion bytes and execution steps. References
must point backwards. Iterative emission handles a long valid chain without
recursive calls. Unknown roles, mismatched bindings, invalid Unicode and
cyclic or excessive expansion fail closed.

The 5 November check used actual source/model files and an explicitly
**synthetic unchanged-height fitted protocol fixture**. Its 88,311,317 original
bytes packed into 5,911,759 bytes; all six reconstructed bodies matched exactly
in Node and headed desktop Chrome. The browser ran the current production
decoder through the local Vite module endpoint. This is transport evidence,
not a fitted road solution, physical-phone benchmark or release acceptance.

Twenty-six focused checks passed, including eight independently authored
adversarial groups. Both TypeScript projects passed. Evidence and exact code
bindings are under `evidence/main-expansion/lossless-road-json-transport-20261105/`.
