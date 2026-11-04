# Final independent reported-road review

**Held candidate: CHANGES REQUIRED; NOT APPROVED FOR RELEASE.** The short reported start is clear, but the continued Tarnaka ramp still intersects the complete car. Twenty-one of the thirty previously identified cases still bury actual car geometry, and thirteen separate crossing pairs lose positive headroom.

No production road, legacy test, UI, or publication changes were made by this reviewer. Reviewer-owned tests and evidence have distinct `reported-road-final-independent` names.

## Exact source reviewed

The independent prepared-model export is byte-for-byte identical to the producer's held export:

- Candidate model SHA256: `6efb0eb7b534b6912368f92f6e9863f0e404bbfe9a2a70b12bf40f60b5e742d3`.
- Original accepted model SHA256: `67f0b8be0d2123156653ed4e48facf7e6d06c07ddae4533d3f0167d95181d496`.
- Fourteen-file functional source manifest SHA256: `8c579fd6cc63403cbd137354f5022f926e10eb1ada61d03281cccc01e697c223`.

`shasum -c /tmp/reported-road-source-hold-sha256.txt` independently passed every held source entry. Large full-model exports remain under `/tmp`; they are not release assets. After all runs completed, a next-candidate edit changed `src/world/road-grades.ts`; the final checksum recheck records that one mismatch and thirteen unchanged entries. This report applies to the saved held model and source manifest above, not that subsequent working candidate. All core road IDs, original XY controls, graph endpoints and direction identities were retained in the prepared export. Every changed source width has matching `joinedPavement.sourceWidth` provenance; there are no width changes outside those profiles. See `evidence/main-expansion/reported-road-final-independent-source-identities.json`.

## Results

| Independent check | Held-source result |
| --- | --- |
| Complete visible Roadster at the exact reported heading, 0–40 m every 0.5 m | PASS for actual source and all three class variants; 81 frames per world and 7,276 unique visible vertices. |
| Complete-car continuations through eight real Tarnaka fork/bypass paths | Seven PASS; `23427c8c-e37_0` FAIL at 111.228 m. |
| Actual emitted Float32 asphalt at the genuine transverse bdf/7db crossing | PASS: 26 overlap polygons, 118 samples, minimum surface gap 6.799999885 m. |
| Thirty previously classified source-ground merge cases | Twenty-one FAIL with actual car geometry in an actual slab; nine have no penetration over the sampled three paths. |
| Accepted finite crossing comparison | FAIL: thirteen ordered road pairs lose positive headroom. |
| Actual traffic bus/car model bounds at their production lane offsets | Local lane separation PASS; minimum gap 0.844 m and bus shoulder margin 0.280 m. This does not certify swept turns. |
| True west ground continuation `38a..._0` → `38a..._1` | Production `busTurn` returns no curve. East `37e..._1` reverse → `37e..._0` reverse generates a curve. |
| Unchanged metro/bridge legacy suite, including d993 cylinder absence | PASS: fourteen groups. |
| Railway focused and moving-rail legacy suites | PASS: 107 focused tests and thirteen legacy groups. |
| Changed-road finite railway envelopes after underpass/rail conditioning | PASS: 318 changed roads, 1,106 polygons, 5,216 previously separated samples; no loss of clearance or ground gates. |

The narrowed pavement legitimately moves some initial shoulder points off asphalt. The new exact-start gate keeps the complete-car sweep on those ground frames, independently compares tyre support with reachable emitted asphalt, and requires later genuine road entry. Twenty of the 81 frames per world are off asphalt; none were dropped from the body sweep. No body gap, slab penetration, or headroom threshold was relaxed. The shared older test's historical `support.kind === 'road'` assumption was left untouched.

The full-car oracle checks all visible model vertices against actual emitted Float32 asphalt and matching actual soffits, including node-cap asphalt, with the ordinary steady road pitch. The fork test continues after a failed case so all eight paths are exercised. This is offline model/support verification, not a claim that the full Player input/collision loop was driven.

## Direct continued-driving blocker

On `23427c8c-e37_0`, 111.228 m from its east source node, the center is `(3910.442857,-2110.982143)`. Tyre support is 4.522898540 m. An actual complete-car vertex is `(3909.304331,5.140246409,-2112.586838)`, inside the separately emitted neighboring slab: asphalt 5.239497537 m and soffit 4.269497345 m. The short screenshot-path repair therefore does not clear the continued ramp.

Evidence: `evidence/main-expansion/reported-road-final-independent-forks.log`. The source/class exact-start passes are in `reported-road-final-independent-exact-start.log`; the original held run and genuine transverse crossing result remain in `reported-road-final-independent-dense.log`.

## Known class cases remain blocked

`reported-road-final-independent-known30.json` retains every one of the thirty original cases, rather than considering only the candidate's current unresolved list. The audit follows the chosen bypass from its real node, samples center and ±1.3 m paths every 2.5 m out to 250 m or the end of the source edge, and stops a failing case at its first confirmed contact. All 7,276 unique visible complete-car vertices are included, without the older coarse quantization or vertical filtering. Touched tiles are selected at the same spacing with an 8 m margin.

Twenty-one cases still fail; nine have no penetration in the sampled paths. All twenty-one failing pairs have both source endpoints physically coincident at the same real node and both endpoint source heights zero. They cannot be classified as unrelated grade-separated crossings to waive the collision.

The first is node `b31f417a-5c7`, ground road `b9b14256-b1a_0`, at 12.5 m. Actual vertex `(-13676.586039,0.848647322,-14886.152594)` lies between emitted soffit 0.768806279 m and asphalt 1.738806306 m while tyre support is 0.049303625 m.

The full case list, exact first contacts, current unresolved records and source endpoint evidence are saved in that JSON; the runnable audit and log have the same `known30` basename.

## Finite crossing regression gate

The audit compares the original accepted finite ribbons, including every relevant triangle overlap polygon's vertices and centroid, against the candidate. It includes the entire `joinedPavement` property in changed-road detection and matches each local source arc branch, so looping roads do not create false reversed-order results.

There are 318 changed model roads and 855 affected ordered accepted pairs. The original-side pass examines 69,189 overlap polygons and 247,291 previously separated samples. Of these, 222,548 remain covered by both candidate surfaces; 20,547 old boundary samples and 4,196 old centroids lose coverage. Those missing samples are inventoried as local-width-profile coverage changes, not car collisions or automatic whole-pair waivers.

A second independent clipping pass examines the candidate's surviving ribbons: 65,398 polygons and 233,248 samples whose corresponding old local branches were separated. After spatially classifying genuine source-ground continuations, thirteen positive-headroom pairs still fail: 1,303 old-side samples and 1,380 candidate-side samples. The smallest remaining failing surface gap is 4.002766477 m. No exemption applies to these reduced-positive gaps.

For example, `e954c275-1a3_0 / 5a23ce42-637_1` loses its old 5.752099438 m gap at `(-14432.702640,-5607.461803)`, becoming 4.109995465 m. The upper road is lowered by 1.642103973 m while the lower road stays at zero.

Coplanar corrections are accepted only inside independently reconstructed finite overlap components attached to actual source nodes and compatible source-ground continuation chains. This includes the reported bdf forks and three separately traced source-zero continuations beyond their positive bridge-layer ends. Remote overlap of any such pair remains subject to the ordinary crossing gate.

The identity control runs the same arc-matching and both finite passes on unchanged geometry: 138,337 separated samples, zero missing samples, zero regressions. This guards against false failures from self-crossings or height-branch selection.

Detailed results and reproducible source: `reported-road-final-independent-finite.json` and `reported-road-final-independent-finite-audit.ts`. Old/new upper/lower heights and neighboring XY/elevation controls for all thirteen failing pairs are in `reported-road-final-independent-regression-controls.json`.

## d993 and traffic scope

The held `d99323ba-b75_0` profile retains its 1.227690544 m maximum inferred hump and its original 6.1 m source width; it has no `joinedPavement` correction. Its renderer therefore retains the widened approach, and the legacy draw-call test confirms that the disputed cylinder is absent while the original road surface remains. No historical absence assertion was removed or weakened. There is no retained cylinder/cap at this site requiring a new clearance waiver.

The lane check uses actual emitted prototype bounds, including mirrors and decals, with the production `busLane` and opposite `Traffic.pickLane`. These local transverse bounds fit the corrected 7 m usable width. It is a bounded result: the true western continuation has no production bus turn, and these bounds do not establish a complete bus swept-path clearance pass through every endpoint or furniture layout. See `reported-road-final-independent-lanes.json`.

Root owns fresh normal-input driving, native images, integration and any publication decision. These results do not approve the held candidate, locate the other two screenshots, establish surveyed Hyderabad elevations, certify all city driving, or measure physical-phone performance.


## Separate read-only smooth-profile experiment

After recording the held-source failures, an esbuild-only override substituted the two exact-XY Tarnaka elevation arrays from `/tmp/tarnaka-unified-lp-0.075-0.01-smooth0.00625.json`. Only the arrays were replaced after result construction; they were not Hermite-resampled. Every XY control and elevation-array length was asserted before replacement. Production source and the held model remained unchanged.

This smooth candidate passes the strict eight-fork complete-car test, including the held source's 111.228 m failure, and the actual Float32 bdf/7db crossing test. The latter has 118 samples and a minimum gap 6.746830367 m. Independent arithmetic confirms both profiles have maximum absolute grade 0.075 and maximum adjacent grade change 0.01 per 1.6 m. The LP input SHA256 is `0b17e1b0678fea91f2895cdb0c2f064b980c86c7a9fd1862270193cf35cdf8fa`. Logs are `reported-road-final-independent-lp-smooth.log` and `reported-road-final-independent-lp-smooth-profile.json`. The earlier unsmoothed 2 cm candidate also passed those two focused groups, recorded separately in `reported-road-final-independent-lp.log`.

The railway audit stages both the held and smooth models through evidenced underpasses and railway conditioning. Across all 318 changed held roads, the independent finite ribbon/rail-envelope comparison covers 1,106 overlap polygons and 5,216 previously separated samples. It finds zero lost clearance, zero missing old coverage, zero lost ground gates, and zero new depressed-road IDs. Canonical railway IDs, XY and elevations are byte-equivalent. The fourteen evidenced underpass IDs are retained; neither rail report has unresolved road/rail or derived road/road constraints.

The smooth experiment changes only the two Tarnaka roads. Neither has a finite railway footprint overlap, and railway conditioning changes neither replacement elevation array. Staged exports are `/tmp/reported-road-final-staged-held.json` and `/tmp/reported-road-final-staged-lp-smooth.json`; detailed results are `reported-road-final-independent-rail-stage.json`. The existing 107 focused tests additionally inspect 11,054 full-coach positions and 77 retained ground crossings after conditioning; the thirteen moving-rail legacy groups pass.

This is a scoped pass for the temporary two-road experiment. It does not fix or approve the held source, clear the twenty-one other known cases, or preserve the thirteen failed independent road crossing pairs by itself. Any broader solver candidate requires the same held-source and full-body regression gates again.
