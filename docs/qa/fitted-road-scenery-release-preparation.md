# Fitted-road scenery release preparation

The final fitted road height can enable a wider native pavement than the earlier
source-height stage. Furniture placement must clear that actual pavement.

`src/world/fitted-road-scenery-clearance.ts` derives the exclusion width from the
maximum of the retained source margin and the current native pavement width.
It changes no height, lane, transport preparation, support or road ribbon. The
City import change remains staged until the complete road release is accepted;
the source files held by the genuine source-permission process remain unchanged.

The final isolated City staging manifest is
`/tmp/roadster-postfit-scenery-clearance-staged-root-v2/manifest.json`, SHA-256
`32c9b2a3ad4cdc78c0c596f146b0c3ed135b56bac7d708bf74eee47019a96b18`.
It changes the City import to use the separate helper. The final native capture
must include this change in a new observer staging generation and code closure.

Three targeted tests cover the height threshold, declared versus default single
lanes, retained margins, tapered pavement and unchanged native geometry. The
first equivalent inline-helper probe checked all 3,016 allocated owners at the
original and two domain extremes: 9,048 local hypotheses, 82 enlarged margins,
no mutation of source objects, support or native ribbons. Those domain extremes
are not a feasible city vector or driving acceptance.

Independent isolated-helper review:
`/tmp/roadster-isolated-fitted-scenery-clearance-independent-review-v2.json`,
SHA-256 `19be73c2e3cadc4d9157ff38696278d839ce2aaf755e152242ccad8a5179f14b`.

For an explicitly supplied optional scenery asset, use
`scripts/qa/build-current-native-late-fitted-profile-candidate-v3.mjs`.
The original builder checked two nonexistent binding fields. V3 validates the
actual six-field binding, current numerical/source generations, raw copy
contract and readable bound authority. It executes the current production
constructor and replays every declared tile copy after fitting, checking that
only the exclusion margin changes and every fitted height remains intact.

The validator's V2 held-byte compiler reads each source before compilation and
rechecks it afterward. An independent controlled-write test reproduced the
earlier compile-before-hold race and verified its rejection in V2. The earlier
helpers/builders remain frozen diagnostic history, not the release entrypoint.

Independent validator review:
`/tmp/roadster-fitted-scenery-validator-independent-review-v2.json`, SHA-256
`27f8d3971b15a9aa595e1ba24a3199c4f23cbe8ca7d37e8e1c1d507ab642b252`.

These changes do not grant physical fit acceptance, activate a new road default,
or establish full-car/furniture/terrain clearance. Final World/worker geometry,
all source copies and the complete road release gate still have to pass.
