# Prospective joint-node XZ qualification

The bounded read-only qualification is complete for all 75 selected nodes. Of these, 69 have a connected center region for a 2.2 m wide Roadster footprint; six remain unresolved for width. Every node has connected literal pavement in projected XZ. These findings do not approve height continuity, full-length vehicle passage or a release.

The evidence uses the source9413 / model `1f989f2883da05c3a58c624df2ac2d707ffbf07d43c2665e0b3ca2fa2c165d67` hold and joint input SHA `740221cfb0d110ca1e4b5c9ead78d200ffa83f672c08c876470cdb074ffed7e6`. It runs the actual source normalization, core patches, prospective 487 bound tile transports, tile profiles, construction stage and `buildTile` with canonical transit, landmark, airfield and destination context. The runtime manifest remains inactive. No runtime, source dataset, LP input, model or source repair was changed.

Literal Float32 triangles retain their original Y values. The qualifier projects only their XZ coordinates, unions the incident source roads and actual emitted caps, then conservatively erodes that union by 1.101 m. This includes a 1 mm safety margin over the physical 1.1 m half-width and exceeds the polygonal arc approximation error. Each arm supplies a finite cross-section clipped to its own emitted asphalt; a driver may choose a lateral position rather than being forced onto one source-centerline point. Short source pieces use an interior probe rather than probing the next junction's terminal boundary. Exact raw owner tiles are included because a nearby context copy does not always draw a short road.

The check binds 304 immutable source packs and builds 52 owner/local tiles. All 388 consumed input hashes were verified before and after the final controls. Five negative controls pass: literal gaps cannot be filled by analytic capsules, a real emitted bridge can close a gap, a narrow neck cannot pass a car, XZ projection cannot approve or rewrite 3D heights, and a legitimate lateral entry does not require widened pavement.

The largest source endpoint spreads, approximately 6.351 m and 5.554 m, both pass the literal width check through existing emitted pavement/caps. That does not certify their geographic accuracy; it shows why source-coordinate spread alone cannot establish a physical driving gap or authorize a blanket new source generation.

| Node | Approximate disk-width bottleneck | Midpoint XZ | Declared endpoint Y range |
|---|---:|---|---|
| `d2ab460b-d94` | 1.9277 m | `[-4936.104, -6427.947]` | 0 to 0.35 m |
| `86b9e850-45d` | 0.7333 m | `[12124.915, -6110.605]` | 0 to 0 m |
| `94a9e148-715` | 0.2326 m | `[2506.238, -682.860]` | 0 to 0 m |
| `ed23d7b5-380` | 1.4834 m | `[-359.332, 2984.239]` | 0 to 0 m |
| `3ed0e4d7-409` | 1.4746 m | `[5110.891, -3685.529]` | 0 to 0.2211 m |
| `401799ef-d1a` | 1.9752 m | `[-14698.741, -8811.435]` | 0 to 0 m |

These are finite width witnesses, not proof that a geodetic source-cut repair is the correct remedy. Folded or pinched local ribbons and miter construction may be responsible. At `d2ab460b-d94`, current endpoint heights exceed the actual 0.25 m cap grouping threshold, so the solved co-elevation/cap emission may change the XZ result. Zero is an existing datum, not a declaration of surveyed ground. Exact arm IDs, literal triangles, original height ranges, eroded regions and narrow-width intervals are retained in the reports.

Primary evidence:

- `evidence/reported-roads/joint-spread-all75-emitted-xz-1f989-20261103-v3.json`, SHA `86bc5e309ecff83577accb3727ab52787694ff54785521a846c4e123f4277403`.
- `evidence/reported-roads/joint-spread-all75-qualified-xz-1f989-20261103-v3.json`, SHA `9ca6e17c534c0cecb2855f4febf5dc36c8e265be87e05be54d5769cec2ee5f22`.
- `evidence/reported-roads/joint-spread-xz-independent-receipt-1f989-20261103.json`, SHA `1e7dc4f6432b385224139b2ff412c7b7acfab389b5953d5c211e4425a3af4c9d`.
- Six SVG geometry witnesses in `evidence/reported-roads/joint-spread-xz-witnesses-1f989-20261103/`; receipt SHA `da150001e32fd3b48df6cea2ee4ced553aab401a8157386cffb12495171fa39e`. These are diagrams of emitted geometry, not gameplay screenshots.

The earlier worst-seven and version2 reports are retained as diagnostic iterations; use the version3 all75 results above. The first local-only pass exposed an omitted owner tile, and the original fixed-center probes overconstrained lateral driving. Both harness issues were corrected without altering pavement.

The broader loaded tiles also contain 164 road-material triangles outside every queried node neighborhood, all in tile `-4_-5` and over 592 m from the nearest query. A separate exact `drawAirfieldTile`/`TiledBatch` Float32 replay matches every triangle to non-network airfield material. Four bind Begumpet apron landmark support IDs; 160 taxiway strips lack landmark support bindings in the current airfield code. The strong landmark-binding control deliberately exits1, preserving this open issue in `joint-spread-airfield-material-binding-1f989-20261103.json` (SHA `443d07f8f54b59efbbaf2a6b371dd992313ba12df2b72b2a09d6503eb50cfdd5`). None of those triangles supplies source-road support in this qualification, and no global matcher/support waiver is inferred.

The 4.8 m oriented car, turning radius, medians/barriers, terrain, actual tyre/body contact, support height, headroom, final solved density, active cache/reuse and native gameplay remain separate open gates. No source repair was authorized or implemented by this review.

Reproduction uses isolated Shapely 2.0.7 and NumPy 1.26.4 in `/tmp/road-xz-qualifier-deps`; no repository or runtime dependency changed:

```sh
node scripts/qa/export-joint-spread-xz.mjs --output NEW_EMITTED.json
PYTHONPATH=/tmp/road-xz-qualifier-deps python3 scripts/qa/test-joint-spread-xz.py
PYTHONPATH=/tmp/road-xz-qualifier-deps python3 scripts/qa/qualify-joint-spread-xz.py --input NEW_EMITTED.json --output NEW_QUALIFIED.json
python3 scripts/qa/render-joint-spread-xz-witnesses.py --qualified NEW_QUALIFIED.json --emitted NEW_EMITTED.json --directory NEW_DIRECTORY
```
