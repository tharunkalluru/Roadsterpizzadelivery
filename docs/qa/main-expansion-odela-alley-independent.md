# Independent Paradise car-bay and approach check

Reviewer: `/root/metro_independent_review`. Bounded read-only help for the L4basket-placement correction; no production source or UI edits.

**SCOPED PASS for the current exact Paradise car bay/path checks.** The final independent `node scripts/test-v21-fixes.mjs odela-bucket-physical-independent` run passes4/4groups, including the exact frozen20Prepare-only road spawn added below. This consumes the actual graded packed neighborhood, exact Paradise frontage, production Roadster geometry, actual drawn basket panels and production `stepStoryPose`. Every tested approach pose has no actual car-triangle/basket intersection and no visible car vertex inside the retained neighboring building rings. It still completes the existing basket mechanism and retained character viewing.

The marker is `(-1021.3815,.02,-3917.8625)`, beside mapped Paradise building `5b496a6d-84b`. Its outward normal is `(0.9999563309242353,0.009345386270322041)`, with tangent `(-0.009345386270322041,0.9999563309242353)`. Current adjacent parking uses tangent distance4.723093586706446m, within the existing6.5mtransfer reach:

- Positive side: `(-1021.4256391339586,.57,-3913.1396126664254)`.
- Negative side: `(-1021.3373608660413,.57,-3922.585387333575)`.

The important correction is choosing the facade-parallel heading nearest the player's existing yaw, independently of the near-side parking choice. The observed43°pose now rotates toward approximately−0.53546°rather than sweeping through90°toward179°. No additional normal translation, moved building, changed basket, new collider exemption or invented geometry is necessary for these tested valid starts. A normal−.65mheading-held shift was independently found to be a possible fallback, but it is not required or retained in the smaller production correction.

The three passing source cases are the centered start while the basket starts high, a valid+6mtangent start with the basket already low, and a valid−12mstart with the basket already low. The positive12mfixture must not be treated as a valid clear starting position: my additional actual-source probe found3,726visible car vertices already inside retained buildings before movement. Positive8mand10mwere also invalid initially(828and2,232vertices); center,+6m,−6m,−8m,−10mand−12mwere initially clear. This independently supports replacing the old+12mrequired-start fixture with+6m, rather than weakening collision assertions.

Evidence: `evidence/main-expansion/odela-independent-current-body-path.log` and `odela-independent-alley-probe-v2.json`. The latter records the exploratory normal-shift alternative and initial-pose validity; it must not be mislabeled as the final production route. The passing3group log is the current production-route verification.

This check covers car placement and interpolation in the exact reported alley. It does not approve the carton throw trajectory through the basket wall, active/held camera pixels, arbitrary approach headings or physical-phone performance. The producer and separate physical/camera reviewer retain those remaining gates. No broad static-camera cylinder result was used to dismiss a genuine visible-geometry collision.

## Exact frozen20ordinary road-spawn recheck

Root's final native sequence used Prepare only, without Stage relocation: player `(-1020,.55,-3932.4)` at90°yaw. This is a different legitimate starting position from the earlier marker/side fixtures. Added a dedicated fourth independent test, with an optional initial-pose argument to the existing fixture; all three original cases and their physical assertions remain intact. The production source was not changed.

The new test checks that the exact road-spawn car is initially clear, then checks every production `stepStoryPose` through automatic capture, parking, bucket lowering, actual carton throw and basket raising. The complete visible Roadster triangles must avoid every drawn basket panel; visible car vertices must remain outside retained packed building rings; actual carton triangles must also avoid the panels. It finishes the real mechanism and retained view, rather than merely finding a clear endpoint.

**4/4groups pass**, including the new native-start group. After171simulation steps of.05s, the player is `(-1021.3373608660413,.57,-3922.585387333575)`, yaw3.132247131282301rad(179.46454°), matching Root's rounded final native pose. Initial and every-step car/building/basket/carton intersection counts are zero. This final current-source test now additionally checks the corrected carton trajectory; native camera pixels and arbitrary headings still require their separate review.

Evidence: `evidence/main-expansion/odela-independent-native20-road-spawn.log`. Held `src/delivery/modules/street-scenes.ts` SHA-256 remains `2d69e6cf618cff849b7b4e309bd129cb954f762b656264392925d6c1ecb20dd5`. The source check represents the actual native starting pose and existing scene; it does not claim direct manual observation of every native recording frame or physical-phone performance.
