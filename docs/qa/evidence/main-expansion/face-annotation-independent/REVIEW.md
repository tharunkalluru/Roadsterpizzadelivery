# Independent native mouth annotation review

All 17 released actor mouth points have been independently reviewed against their native closed-face, picked-mask and speech-envelope 1.0 images. The marker is at the visible lip seam, the sparse mask stays away from eyes and nose, and the speech preview changes the mouth without visible eye or nose deformation.

The machine-readable visual-review.json binds each verdict to the exact GLB SHA, mesh path/count, canonical anatomy annotation hash and immutable screenshot hashes. The all17-exact-source-receipt-20261103.json additionally verifies actual drawn source triangles, Idle0 barycentric anchors, sparse local weights, unchanged raw GLB bytes and the current hardened runtime guard. Maximum anchor residual was 2.63e-16 metres.

The source export was /Users/tharun/Downloads/roadster-face-annotations-2026-11-03T17-40-28-073Z.json. It contained 2 UI-approved and 15 UI-picked records. This review does not mutate that status; Root must perform the explicit approval/import step.

Scope is mouth anatomy and bounded speech deformation only. Celebrity likeness, meal hand grips, carton/costume intersection, voice synchronization and physical-phone performance are not accepted by this review. Bhanumathi's existing head-to-neck source geometry discontinuity is explicitly excluded.
