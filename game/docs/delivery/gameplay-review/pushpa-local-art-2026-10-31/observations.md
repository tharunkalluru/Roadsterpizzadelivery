# Actual container comparison — unpublished art

The candidate was loaded into the actual local game through its developer-only comparison adapter. The original production approval/asset manifests were unchanged. Every frame carries the unreviewed-art warning and each run records `metadata.artPreview`; none qualifies as approved campaign evidence.

- GLB SHA256: `fa7e75946bfbe675561660e22a14997f80ce147d52f8445cac86f7a512ad121d`.
- Raw rig SHA256: `5ae15a775e55df2d1ea0b43a09263d88318d9f012f2ad8523540b3406f5ce701`.
- Browser: native Safari, real keyboard/mouse inputs, local development server4201. Chrome had a separately documented disabled-WebGL test-environment failure.
- Initial day window:1280×599 including Safari toolbar. Compact night window:approximately628×292 including toolbar, approximately628×240 game area. This is an extreme small landscape stress case, not a claimed915×412 simulation or a physical phone.

## Observed gameplay

The visible Prepare/Stage controls assisted the initial order/rear approach. Normal driving then climbed the ramp into the moving container. Normal braking/reverse correction positioned the car beside the actual authored reader. His authored Read clip, book and figure rendered inside the existing physical set. A real manual handover ran the catch animation and completed the delivery. Normal reverse driving left the retained floor/ramp; the complete truck and reader stayed visible afterwards. No player teleport or direct completion action was used after setup.

The first day run exposed large cyan world rings/ribbons cutting across the reader and car. The narrow repair suppresses those world-space guides only inside the physical cargo volume and after completion. The ordinary outside approach, minimap route and small top instruction remain. Files09/10 show the repaired ordinary and manually orbited camera views. File11 shows the actual passing pizza,12 is the completion screen,13 the retained reader before exiting, and14 the successful normal ramp exit.

The early post-completion reverse key was sent before the modal controls visibly resumed; it did not drive the car. The attempt was repeated after observing the resumed game state and succeeded normally. File13 is therefore a retained-reader view, not an exit proof. The final desktop JSON records the actual successful exit.

The compact night run used the actual on-screen GO, Brake/reverse and HAND OVER controls sequentially with a mouse. Physical entry, handover, completion and reverse exit succeeded. Its JSON reports `pointerTypes:["mouse"]` and no true touch input. Files15–20 preserve that run; the18-frame sequence can include completion as the short handoff finishes.

## Remaining visual defects/review

1. Night lighting leaves the reader very dark inside the enclosed container. A real bounded interior reading light is pending. Do not use the night run as readability approval.
2. The completed reader freezes with his catching arm extended. A return to the authored reading motion is pending. This did not remove the floor/ramp or prevent the later physical exit.
3. The figure and book are visible at plausible game scale, but his face is small from the ordinary chase camera. Independent film-reference comparison and the requested close/manual-orbit views remain distinct from mechanical completion. No exact likeness approval is claimed here.

`desktop-after-guidance-fix-evidence.json` and `compact-night-before-lighting-fix-evidence.json` both report manual handoff and no missing physical facts. They deliberately retain missing art/visual checks and full campaign acceptance=false. The earlier desktop-before-guidance-fix JSON is preserved without retroactive edits.

The observer now uses active gameplay time (`Game.t`) for input attribution, so pausing a live catch for visual inspection does not make its deliberate manual action look stale. These timestamps are not wall-clock performance measurements. Natural jump pickup, a full campaign, true touch, a physical device and sustained FPS were not established by these assisted art-comparison runs.

## Repair readiness before the next native comparison

The bounded reading lamp, completed-reader return to Read, and parked in-container camera focus have now been implemented. The actual-container preparation gate also holds its reader hidden and handover unavailable until the fully constructed scene's graphics are ready. Delayed preparation, failure/retry, stale scene cancellation, and private template/GPU-borrow ownership pass their focused checks (graphics gate4/4, local private review9/9; typecheck passed). This paragraph records implementation/check status, not a replacement for the outstanding visual captures above.

A separate native fixture at `/tests/browser/character-gpu-readiness.html` is ready to count real WebGL shared-buffer uploads for the exact candidate outside the city. Its result is still pending while the graphics helper is being finalized and offline character generation is being kept separate from interactive capture. The night lamp, reader focus and completed Read motion still require a fresh actual-game review after that preparation work is frozen.
