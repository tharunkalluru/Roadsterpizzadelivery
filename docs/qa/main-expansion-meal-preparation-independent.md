# Meal preparation independent review — November 3

The source hashes in `meal-preparation-final-binding-20261103-v1.json` match
the reviewed implementation. No new correctness blocker was found. The earlier
whole-mesh handoff scan has been replaced by immutable, cooperatively prepared
classification and a conservative current-pose query. This acceptance is
source/CPU correctness; it does not approve native appearance or phone FPS.

Four independent adversarial cases use literal Three.js posed vertices as an
oracle. They cover detached nontrivial affine bind matrices; changing bones and
nonuniform transformed roots; non-unit and negative weights; large relative
morphs; hidden meshes; rigid hand-attached decoys; source geometry reused with
different bone exclusion semantics; independent clone poses; and cancellation
without source mutation or partial-cache publication. All four pass, together
with the producer's two cases. The fifteen registry cases and typecheck pass.

The conservative hull applies current bone/inverse transforms. Nonnegative
influences fit their transformed hull after the observed weight-sum interval;
negative weights and source position morphs disable that pruning. The approved
small mouth deformation has an explicit conservative expansion. Exact poses
still determine the selected maximum; an idle maximum is not reused.

The cache holds classifications and boxes through weak source-geometry keys,
not actor/scene/bone owners. Registry borrows keep retired templates alive
during asynchronous preparation, cancel before publishing readiness, and allow
retry. Completed per-mesh classification can safely be reused after a later
job is cancelled; incomplete work is never stored. Clone geometry and exact
bone semantic keys remain separate where required. This does not claim a
forced-GC memory measurement.

The receipt and unmodified test logs are in
`evidence/main-expansion/meal-preparation-independent/`. The new independent
test is `tests/v21-fixes/actor-meal-geometry-independent.test.ts`. Runtime source,
approved GLBs and face-annotation data were not changed by this review.
