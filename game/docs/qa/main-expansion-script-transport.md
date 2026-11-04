# Lossless transport for large generated scripts

The existing lossless asset packaging now also targets generated `dist/client/assets/**/*.js` files of at least 64 KiB. This allows the expanded road data to fit the Site package without removing reviewed art or reducing scene quality. Small scripts and source files remain unchanged.

The build hashes each original module, compresses it, decodes and hashes the stored result, then removes only its redundant raw production copy. Both main and city-worker modules retain their original hashed URL and `text/javascript; charset=utf-8` MIME. The existing exact Worker whitelist handles gzip or streamed identity responses; module imports and worker URLs do not redirect to storage paths. This changes storage/transfer representation, not decoded executable code, vehicle timing or rendering quality.

Seventeen focused transport tests pass. They include all prior protocol, failure, private-cache and source-preservation checks, plus exact main/worker module round trips, distinct module payloads, nested worker paths and query-bearing original URLs. An independent bounded review found no actionable issue in the extension.

This is not final HTTP/browser acceptance. The final production Worker must still pass `tests/legacy/asset-transport-http.mjs` for its complete generated whitelist, and native Chrome must visibly load the production game and city worker. Package size, decoded bytes and the exact final build identity remain release gates. Earlier model/JSON transport evidence is separately recorded in `main-expansion-lossless-asset-transport.md` and `main-expansion-lossless-transport-independent.md`.
