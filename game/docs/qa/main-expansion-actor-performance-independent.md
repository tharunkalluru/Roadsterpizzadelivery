# Independent received-pizza review — November 3

This review found and corrected a physical bite defect in the first animation
leaf. A palm/slice-origin distance of approximately 20mm did not certify eating:
the slice's actual edible tip pointed 13cm away from the lips, while its rear
half extended behind the face plane. The corrected motion rotates the point
toward the recipient and computes the palm target from that transformed,
scaled tip. The palm and crust remain outside the face. Shrinking after a bite
also updates the offset, rather than pulling the pizza away from the mouth.

The independent numeric reproduction parses all 17 exact manifest GLBs, retaining
the original BIN, mesh topology, skinning, skeleton and animation clips. Texture
bindings are removed only in the audit's in-memory copy; no asset is rewritten.
It samples the actual slice geometry and actual skinned vertices during the
meal. Eleven suitable recipients receive the meal. Across those actors:

- Maximum edible-tip-to-mouth-anchor distance: **20.91mm**.
- All held pizza vertices stay at least **2.57mm** in front of the root-local
  mouth-anchor plane during the sampled bite window.
- No sampled skin position is non-finite; all sampled positions remain inside
  their clone-owned bounds. Special neck-grip/ghost/gate/supporting poses do not eat.
- All 17 original source GLB SHA256 values match the approved manifest before
  and after the audit.

Receipt: `evidence/main-expansion/actor-performance-independent-tip-20261103-v1.json`,
SHA256 `1b72b657f9c5961436b32a9eea3f8767dc1e524469f26e05b27364f4a8ada4d6`.
Reproducer: bundle `scripts/qa/audit-actor-performance-independent.ts` for Node
with esbuild, then invoke it from the checkout with a new output JSON path.
The output refuses to overwrite an existing receipt.

Five performance tests (including actual-tip geometry and the rejected
origin-only negative control), fourteen released-registry ownership/revocation
tests and TypeScript checking pass. Existing completed-scene update branches
continue to call each eligible recipient's `animate`, so the short meal and
silent-default mouth layer continue while Next remains available. Root retains
the real game interaction review; these CPU tests are not that review.

## Required native appearance review

The mouth mask remains a bounded front-face geometry heuristic. A numerical
anchor or lip-plane bound does **not** establish that it animates the correct
anatomical lip region, preserves visual likeness, gives convincing wrists or
clears the exact costume surface. Those remain native close-up acceptance gates.
The mouth has no sound or phoneme timing until an audio player explicitly drives
`setSpeechEnvelope`; chewing supplies the temporary local motion only.

`tests/browser/character-performance.html` now provides an isolated view of the
same production registry and exact approved GLB. Visible controls select the
actor, start/reset a meal, pause animation, frame face/hands or full body and
set speech amplitude. Drag orbits and the wheel zooms. It includes no hidden
game mutation, no substitute model and no physical-phone performance claim.
Add this page to a new immutable native QA freeze before reviewing the fix;
the earlier freeze 22 predates this bite correction and viewer.

## Native wrist defect and second correction

Root's freeze-23 screenshot at Arjun's 3.03-second bite exposed an upright
palm whose fingers covered the nose and eye. The previous edible-tip/plane
checks had passed and did **not** detect this visual defect. That native
rejection supersedes any impression that the first numerical pass accepted
the visible grip.

Four exact rigs independently confirmed that hand-local +Y follows the fingers
and +Z is the palm normal. The solver now retains a world wrist orientation
through each CCD parent rotation: fingers point toward the actor beneath the
slice and the palm faces upward. The palm supports the transformed crust,
rather than intersecting the pizza centre. The piece remains aimed by its tip.

The second all-17-asset audit includes actual finger joints and weighted,
skinned right-hand surface vertices, not just the palm anchor. Across eleven
eaters during the bite window:

- Fingertips stay at least **90.36mm in front** of the mouth plane and
  **63.39mm below** the mouth anchor.
- All sampled right-hand surfaces stay at least **2.02mm below** the pizza's
  crust support plane; no sampled hand surface pierces that plane.
- The edible tip remains within **22.87mm** of the mouth anchor and all pizza
  vertices stay at least **3.09mm in front** of its root-local plane.
- Source hashes, finite skinned positions and expanded motion bounds pass.

Receipt: `evidence/main-expansion/actor-performance-independent-wrist-20261103-v2.json`,
SHA256 `d252f7b49b07688c32312f80b03ecd3b05b16aa6b3fa18a7a8ca404d8fd4fc5d`.
Six focused tests now include wrist orientation during CCD. The viewer adds
visible phase inspection and a Hide Controls button, restored with H, so a
paused face can be inspected without panels obscuring it. A fresh native review
must still check the corrected grip, costume and lip region; this receipt does
not overrule the native appearance gate.

## Arundhati static asset limitation

The exact static GLB has a `Head` empty at `(0, 1.6201923, 0)`, but its face,
hair and body are one unskinned `ArundhatiStaticBody` sibling mesh. There are no
jaw bones, morphs, semantic lip vertices or head-child geometry. The generic
bone-based mask correctly leaves it unsupported. Applying the same height
heuristic to this different anchor would guess a mouth at Y=1.6285 without
evidence that it is a lip surface.

A safe extension needs an external, exact-GLB-SHA-bound facial annotation:
reviewed lip anchor plus selected surface/vertex mask from a native close-up
or its authored UV/texture landmarks. Clone-owned deformation can then use
that annotation without rewriting the approved GLB. No guessed overlay,
unreviewed facial deformation or static asset change was introduced here.
