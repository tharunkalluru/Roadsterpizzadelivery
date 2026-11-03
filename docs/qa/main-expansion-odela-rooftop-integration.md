# Odela rooftop scene integration repair

The initial actual Chrome scene image, `evidence/main-expansion/odela-actual-held-day-candidate-v7.png`, exposed a pulley brace/pole across the viewing camera and a receiver positioned approximately 0.4m above the mapped roof. The exact independently isolated-reviewed Odela v7 model was not changed.

Changes are limited to the RopeBucket scene and its existing-building placement branch:

- Placement now chooses the receiver relative to the actual facade normal and tangent, rather than adding offsets along arbitrary world axes. A complete 0.85m radius around the receiver must remain inside the mapped building polygon and away from every boundary, including concave notches. The physical lamp base is checked too. If that roof cannot fit the receiver, it is rejected rather than placing a hovering figure.
- The existing roof's world height is carried through the local scene origin. Receiver feet rest on that plane; the existing +0.4m offset remains only for the fictional module's explicitly modelled roof slab.
- The actor faces the facade's outward normal. The completed-scene camera stays in front of the actor on the same tangent side of the winch, avoiding its braces. The real rooftop lamp was moved alongside the actor, away from the camera corridor. Its requested light position coincides with its visible fixture glass.
- Bucket lowering, pizza transfer, raising, completion, retained scene and Next behavior remain in the existing machinery. No replacement actor, overlay, model/material change, registry promotion or publication was performed.

Validation:

- New `odela-rooftop-integration` tests: 12/12 pass. These include concave mapped-roof footprint checks, rejection of a narrow roof, and actual Three.js raycasts through the built winch/lamp/bucket/fascia geometry to nine body-view points for five facade normals and both camera sides.
- Existing `scene-placement`: 12/12 pass.
- Existing `street-scenes`: 27/27 pass.
- Existing `story-mode`: 17/17 pass.
- TypeScript typecheck and `git diff --check` pass.

These are geometry and behavior checks. Root must capture and inspect the fresh exact candidate's actual Chrome day/night and mobile scene, including the handoff and indefinite Next hold, before approving integrated appearance. The previous obstructed capture is retained as development evidence, not acceptance.
