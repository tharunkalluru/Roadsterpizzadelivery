# Received pizza performance — implementation awaiting native visual review

Suitable recipients now retain a physical 40cm carton after handover. Its lid
opens, the full pizza becomes a pizza with a missing wedge, the existing right
hand raises a slice to the mouth, a short chewing movement plays, and the open
carton remains in the left hand throughout the completion viewing phase. The
player's control, delivery-completion event and Next timing are unchanged.

The eligible identities are Pushpa, Ram, Jessie, Hasini, Bhanumathi, Sukumar,
Nani, Arjun Reddy, Maruthi, Vakeel Saab and Odela. The Devara skeleton grip,
Arundhati, Salaar's gate scene and the three supporting metro passengers never
receive an eating prop. Bhanumathi settles from dance to the authored idle when
eating; Jessie's existing walking path and gait continue.

The approved GLBs and their release/likeness fingerprints remain unchanged.
Existing skeletal arm chains use a bounded CCD target rather than detached
replacement hands. New reachable-volume bounds expand clone-owned skin spheres;
normal culling remains enabled. The exact-instance GPU preparation traverses
the initially hidden carton and pizza meshes, which are built before handover.

The GLBs do not contain jaw bones or lip morphs. A narrow front-face region gets
an instance-owned position buffer; all unrelated positions, skin attributes,
materials, textures and source buffers retain their original data. Mouth motion
is at most 8mm and is silent/closed by default. `setSpeechEnvelope(0..1)` supplies
an explicit future audio amplitude; no imaginary dialogue or continuous idle
talking is added. Chewing uses this same bounded face region. Static Arundhati
does not have a usable region and receives no fake overlay mouth.

Checks completed:

- TypeScript typecheck.
- Four new actor-performance tests: sparse immutable mouth ownership/reset,
  reachable hand targeting without limb stretch, complete prop/chew lifecycle,
  and special-scene exclusions.
- Existing 14 released-GLB ownership/revocation tests and three authored-motion
  tests remain green.
- CPU audit loads all 17 actual GLBs with texture bindings stripped **in memory
  only**. It retains the original BIN, skin, geometry, nodes and animation clips.
  Eleven recipients perform; sampled slice-to-mouth anchors are 19.7–22.7mm
  apart. All sampled deformed skin vertices fit their clone-owned spheres
  (maximum radius fraction below .989), with zero non-finite positions. Original
  GLB fingerprints match. Receipt:
  `evidence/main-expansion/actor-performance-real-assets-20261103.json`.

Still required before appearance acceptance: native close-up review of each
mouth region, wrist orientation, lid/hand contact, costume clearance, and the
visible full sequence on desktop and touch. The mouth-region location is a
bounded geometry heuristic, not a facial scan or phoneme rig. CPU tests alone
do not establish visual quality, exact likeness, GPU cost or physical-phone FPS.

Suggested first integrated checks: Level 13 Arjun or Level 11 Maruthi (stationary
recipients), then Pushpa's seated reader, Jessie's moving handover, Nani in the
stadium and Vakeel Saab at the real metro platform. Watch for the red hinged lid,
the pizza remaining inside, the raised slice, a brief chew, and the retained box
while Next remains available. Devara must retain both hands on the skeleton.
