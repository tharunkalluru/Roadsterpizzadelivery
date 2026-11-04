# Independent reported flyover/pavement review

Reviewer: `/root/metro_independent_review`. No production road, UI or publication edits; only independent tests and this report.

## Current gate

**CHANGES REQUIRED; NOT APPROVED.** The candidate passes the five independent reported-location groups and one new protected/disconnected-control group, but a subsequent whole-model finite-overlap comparison finds75ordered road pairs with reduced positive headroom, including45pairs below2.5m. These are separate from32now-coplanar categories that need topology classification. Acceptance requires a guarded correction, final held-source finite crossing recheck, preserved protected/layer-separated geometry, connected fork/ramp driving and Root's fresh native evidence.

## Actual report and independent failure

Actually opened all three supplied screenshots: `codex-clipboard-4201d306-0a50-4046-911b-aea5f0cf2412.png`, `codex-clipboard-c3be5cc1-db60-440c-b5ce-edb07fc2b5d4.png`, and `codex-clipboard-2c8020d2-6ac8-4aa5-84a8-d5a9b1909a62.png`. The first supplies car `(3983.1,.6,-2073.2)`, yaw280.3°. That center itself is on the shoulder with no finite road quad below it; it must not be mislabeled as the exact sinking point. Following its actual heading enters the real overlapping road approach near the x4000tile boundary. The other two screenshots visibly show a buried car or broken/raised merge, but do not supply independent coordinates; no exact-location claim is made for them.

The reported area is Tarnaka/Habsiguda, not the earlier Rasoolpura example. Actual joined roads are `ad6f78f1-dc9_0` and Tarnaka `23427c8c-e37_0`, with shared real node `d6ba3a6d-36c` at `(4015.4,-2074.2)`. Their wide finite pavements overlap before the centerlines meet. The old height solver gives those sheets different grades through the shared approach. Support selects a reachable lower road, while the separately drawn upper asphalt/soffit occupies the car's body space. This is not proof that the tyre query should teleport onto the upper road.

Added reviewer-owned `tests/v21-fixes/reported-flyover-independent.test.ts`. Its visible-surface oracle evaluates **actual emitted Float32 B.road triangles** independently rather than reusing `roadQuadHeight`, which is also used by the existing support checks. It samples nose/body/tail and both sides while following the actual reported heading from5mto32m. The first body-envelope collision occurs at distance16.5m, nose+2m/side+.85m, point `(4001.453855084619,-2075.671538697409)`: support1.65481573391664from`ad6`, rendered asphalt3.41775509598941, gap1.762939362m. The source case and primary/secondary, secondary/tertiary and trunk/primary class variants all fail before correction: **0/4pass**.

A fifth group additionally instantiates the complete visible production Roadster, including wheels/body/equipment, and requires its actual geometry to stay outside the independently emitted road top and matching actual soffit. Against the unchanged `a679b72`grade source, it fails at distance18m: body-skin vertex `(4002.3973432047974,2.4259158598206163,-2075.9160331960993)` lies inside the real drawn slab bounded by top3.36460372577150and soffit2.39466369481492. The lower tyre surface is1.58947946894385. This rules out an enclosing-box or reused-height-helper false positive.

That original-body reproduction used an esbuild-only module override reading `a679b72bacefb751057f0282a86571e8e6ef006d:src/world/road-grades.ts`. No worktree file or branch was reset. Evidence preserves both failures independently of later producer edits:

- `evidence/main-expansion/reported-flyover-independent-before.log` — original four source/class failures.
- `evidence/main-expansion/reported-flyover-independent-exact-body-original.log` — actual complete-car slab penetration on original source.
- `evidence/main-expansion/reported-flyover-independent-first-candidate.log` — first candidate five-group pass, despite unrelated clearance regressions still under review.

## Correction review requirements

Repair the physically joined pavement in the road model, using actual local shared endpoints and compatible original source levels. Retain source XY alignments and graph identities. A remote shared node or nearby disconnected carriageway is not permission to flatten a crossing. Protected surveyed/explicit controls, controlled expressways and mapped separate layers must remain protected. The model is an estimated game profile, not a surveyed Hyderabad elevation claim; no new underpass or invented flyover is justified by this defect.

The producer's revised approach adds fixed compatible ground-merge controls **before** the ordinary grade/crossing solve. This is preferable to flattening after the solver, which could silently reduce existing bridge clearance. Its current finite overlap search is bounded; candidates that cannot retain the existing independent crossing headroom must be rejected/reported. The initial candidate changed99pairs/183roads and exposed three old separated-crossing regressions. This review explicitly keeps those unresolved until the producer supplies final results.

The prefilter's centerline-crossing checks do not alone cover all finite-ribbon corner overlaps. Final review must compare the previously accepted finite crossing headrooms, not just rerun a small centerline fixture set. Check endpoint heights and grade limits, both fork approaches, true separate-height crossings, full car support/body contact and actual rendered/support consistency across the tile seam. No ignored collider or support-only snap is acceptable.

No source/test pass here certifies all city roads driven manually, the two unlocated screenshots, real surveyed elevations or physical-phone performance. Root owns final native driving and publication.

## Independent negative controls and finite-crossing regression audit

Added a sixth group to the reviewer test. It exercises a real eligible finite shallow source merge, then rejects five negative variants: nearby disconnected road, same graph ID at remote coordinates, incompatible endpoint source height, explicit surveyed profile and controlled expressway profile. Source inputs remain unchanged. This group independently passes; it does not waive the broader failures below.

The producer exported the complete originala679and candidate prepared road models plus their crossing reports. A separate independent audit reconstructs actual finite ribbons and clips all relevant triangle pairs, sampling intersection-polygon vertices and centroids. The old accepted crossing report contains12,218records.313model roads changed;1,054ordered accepted road pairs involve at least one changed road.85,137overlap polygons produce320,860previously separated samples(old gap≥4.5m);314,068still have both new road surfaces at that point. The audit does not substitute centerline intersection tests for finite pavement geometry.

The candidate loses positive headroom on**75ordered pairs/17,147samples**;45pairs reach below2.5m. Examples include `22be8f27-c0f_0 / c601e334-611_2` near`(-13718.917845,-14830.027105)`, old6.8m→new1.723369m, and `df771331-cef_0 / 5cb4518a-9ba_2` near`(-12423.122282,-4905.138438)`, old5.80317m→new1.689864m. This proves that the first reported-location repair can introduce the same class of car/body obstruction elsewhere despite the local and small legacy suites passing.

Separately,32ordered pair categories become near-coplanar(≤.15mgap,5,796samples). They are not automatically counted as overhead barriers: some can be legitimate source-connected ground pavement corrections. Exemptions require actual connected-component/topology evidence, not a blanket whole-road-pair rule.6,381oldboundary samples and411oldcentroids no longer have both surfaces at the identical point, including width/tessellation changes; those need classification and are not automatically called car collisions.

Complete counts, affected pairs and sample coordinates are retained in `evidence/main-expansion/reported-flyover-independent-finite-audit-v2.json`. Reproducible audit source is `reported-flyover-independent-finite-audit.ts` in the same evidence directory; build it with esbuild for Node and supply original-model JSON, candidate-model JSON and output path. The large full model exports are kept temporarily under`/tmp/reported-flyover-model-{old,current}.json` rather than added to the release source. This candidate must not be released based on its five local passes.

## Separate d993legacy cylinder finding

Root's broader legacy run found a re-emitted cylinder at the previous `d99323ba-b75_0`site`(-19726.85870127643,-8116.333397178416)`. Independent old/new model inspection identifies why: that tertiary road previously had a1.22769mmaximum inferred hump, which triggers the renderer's8.4mminimum whole-edge width. The candidate makes it flat, returning to its6.1msource width. The unchanged closest centerline vertex is`(-19730.3,-8119.6)`,4.744811mfrom the column center. A.75mradius column overlaps the old width envelope by.205189m, but is.944811mclear of the narrower new centerline-width envelope.

This explains the changed draw decision; it is **not yet independent actual finite-ribbon/cap/full-car clearance proof**. Do not remove or weaken the old absence assertion merely because a source profile changed. Recheck the final guarded model first; if the cylinder still legitimately remains, replace the hardcoded historical absence assumption only with stronger checks of the actual emitted column/cap against the actual new pavement and traffic/body envelope. No such test waiver or production collider change has been made by this reviewer.
