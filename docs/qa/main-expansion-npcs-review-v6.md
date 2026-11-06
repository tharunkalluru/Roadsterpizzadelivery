# Independent NPC review — iteration 6

Reviewer: `npc_people_independent_review`, separate from the producer. **Verdict: FAIL — native animated walkers block acceptance.** Static anatomical people and the inspected seated vehicle contacts are substantially improved and do not need another wholesale anatomy replacement. The current native walking output is not acceptable.

This review actually opened all six producer CPU/Blender renders, all nine native Chrome NPC captures, and twelve native production-vehicle side/cabin contact captures listed below. Native evidence identifies frozen feature build **`4764eb0d07abc4d6dc5d9bb945a54b085d8837d796f8f4fb9e333ed28b47ef70`**, captured at `2026-11-02T21:56:09.557Z`. `npc-captures-v6.json` and `vehicle-captures-v3.json` identify that build. All six source hashes in the producer manifest match the current files at review time. Previous independent FAIL reports remain valid historical records; this report does not change an approval registry, implementation, browser, server or release.

## Blocking native-render finding

**Walking deformation breaks the body and clothing in the actual renderer.** `npc-profile-v6.png`, `npc-driving-v6.png`, `npc-stride-a-v6.png` and `npc-stride-b-v6.png` show extreme airborne splits, bent knees brought above the waist, arms raised far beyond a walking swing, stretched skirt panels and isolated-looking hands/feet. In stride A the broad blue-shirt adult forms an almost horizontal split; in stride B both his knees fold beside his upper body. Burqa and sari panels stretch across implausible poses and some exposed feet appear separated from the rest of the silhouette. This is also plainly visible in the driving-distance capture, so it is not a demand for close-up photorealism.

The static Blender models and static native seated/face views do not show those extreme poses. Preserve the successful native topology, neck, clothing joins, head morphology and seated calibration while investigating the rendered animation path. Do not hide the defect with opaque vehicle panels or disable all walker movement.

The isolated CPU source check at converged held phase `.7` produces ordinary small joint rotations: adult thigh rotation approximately `±0.219` radians and maximum knee flex approximately `0.438` radians. The complete deformed shirt figure has bounds `x [-0.282, 0.281]`, `y [0.023, 1.723]`, `z [-0.349, 0.377]`, with maximum vertex displacement about `0.375m`. That does not resemble the native split pose. The frozen bundle's gait formulas match the current source. These facts narrow the investigation toward native animation state, skinning/bind transforms, skeleton texture/uniform handling or a fixture/runtime interaction; they **do not prove which of those is the cause**.

Required repair/acceptance evidence:

1. Compare one isolated native `SkinnedMesh` against the CPU-transformed same mesh at exactly the same held phase, including zero/idle, `.7` and `.7 + π`. Inspect actual uploaded indices/weights, bone matrices, bind matrices, ancestor scale/rotation and skeleton ownership. Add another differently scaled/rotated figure to catch state shared between people. Numeric finiteness and an arbitrary minimum foot displacement are insufficient tests of a plausible pose.
2. Recheck true native side/front/three-quarter walking output for child, teenage male/female, adult, elder, sari and burqa. Both feet must step modestly below the pelvis, limbs must remain attached, and the garment must follow the stride without long spikes. Inspect motion through the cycle, not only a neutral bind pose or offline static render.
3. Confirm the same repair in actual city walkers and bus/metro boarding/alighting. All three call `makeHumanWalkRig`; a fixture-only fix would not resolve the production risk. Keep existing service counts, route timing, visibility/pinning and density.

## Static/seat findings

**Pass for the inspected static anatomy/wardrobe foundation, subject to the animation blocker above.** Native face and seated renders show closed coherent human forms instead of the earlier cut neck, missing shins/crotch, starfish hands and disconnected hair. Neck/jaw continuity, shoulders, elbows, hands and knee/shin surfaces read as connected. Sleeves have a continuous material boundary rather than the previous unrelated skin/cloth islands. Sari and salwar strips remain attached to the torso. The widened face gallery avoids the former neighbour-arm overlap; I did not count that old overlap as a v6 defect.

Child, teenager, adult and elder silhouettes are visibly distinct; female/male shapes, build, hair, skin tone and regional wardrobe provide useful demographic variety. The implementation remains a simplified untextured anatomical style. Faces and the glossy shared traffic material still look synthetic at portrait distance; accepting these static forms is not a claim of scans, photorealism, or arbitrary `face` IDs creating unique faces. The elder beard and narrow garment creases remain simplified. At ordinary traffic distance the geometry is a clear improvement over the disconnected primitive people.

Actual production contact checks:

| Vehicle | Observed NPC result | Evidence limit |
| --- | --- | --- |
| Auto | Lowered driver fits inside the roof; seated hip and visible foot occupy the seat/floor space; torso/head remain coherent. | Front shell hides the exact handle/sole contacts in the supplied angles. |
| Motorbike | Driver and elder pillion sit on the real saddle, driver hands meet handle grips, feet reach their respective supports; no missing shin surfaces. | Bare elder foot is close to the exhaust/peg region; retain the calibrated passenger peg rather than moving it onto the driver support. |
| Scooter | Driver hips meet the seat, hands reach controls, and shoes visibly meet the floorboard. | Only one driver is present in this fixture; it does not validate every pillion appearance. |
| Bus | Full seated occupants and driver are coherent behind the open windows, heads clear the roof, and the driver reaches the wheel. | Side panels hide most knees/feet. These captures do not prove the entire walking boarding exchange. |
| Hatch | Coherent seated driver remains inside the cabin and below the roof. | Door/windscreen framing obscures exact wrist/sole contacts. |
| Passenger van | Driver/passenger heads and torsos fit within the cabin, with coherent seated forms and roof clearance. | Body panels and mirror obscure detailed controls/floor contacts. |

No additional large static anatomical blocker was found in those twelve views. Minor close-up angular seat/hem intersections should be polished without undoing the native pose or changing existing vehicle budgets. These static checks do not override the visible walking failure.

## Independent numerical checks

The reviewer reran production tests, rather than copying the producer's reported results:

- `node scripts/test-v21-fixes.mjs npc-native-pose`: **6/6 pass**.
- `node scripts/test-v21-fixes.mjs npc-anatomy`: **4/4 pass**.
- `node scripts/test-v21-fixes.mjs traffic-vehicle-realism`: **15/15 pass**.
- `node scripts/test-v21-fixes.mjs pedestrian-geometry-lifetime`: **5/5 pass**.

These establish the current finite/closed source topology, normalized retained influences, selected CPU seat/foot/sleeve checks, bounded geometry lifetime and existing vehicle budgets. They demonstrably do **not** certify the actual native walking output. Update that gap during the animation repair. The fixture reports `47,996` triangles and `10` draws for nine detailed walkers, and `21,142` triangles/`8` draws for seven seated figures; those are fixture counts, not integrated or real-phone FPS. The inspected bus remains `19,920` triangles and below its unchanged `25,000` ceiling. Do not raise established budgets to make a test pass.

## Remaining integration gate

Root still owns actual night driving, ordinary streamed-city demographic distribution, mobile controls, boarding/alighting motion, camera orbit/disappearance checks and integrated CPU/GPU/memory performance. None is certified by these still images or CPU topology checks. Do not infer a physical-phone frame rate or heat/battery result from this review. The next review needs fresh exact-build native animation evidence after the blocker is repaired; the static model need not be rebuilt from scratch.

## Native evidence actually opened

All paths below are relative to `docs/qa/evidence/main-expansion/`.

| PNG | SHA-256 |
| --- | --- |
| `npc-front-v6.png` | `6dd28967d3d7b2a962234ccc1f329dc636dc88a10d61edd93921c8c68dc0e4d3` |
| `npc-profile-v6.png` | `c30d451b7aa5902486844bce6da8ccae61fdf958cd4a012e32e8e8fd58140a44` |
| `npc-faces-v6.png` | `04b75c14536819883bdfa0a54ddadb976bc87230d2026181b20d7fcdaaa7ecba` |
| `npc-seated-v6.png` | `ed706e7d8f70752d35d3907efcf4be0bfc8ea6e0854f4c7ecc62134b3eb0ab80` |
| `npc-seated-side-v6.png` | `83bce65524d02f8d464c9a821f4c62040627e629f02b923fe7d13a794ea5a8c9` |
| `npc-seated-quarter-v6.png` | `f7030473c42321d1805ed3e5dd053b52b624d460017f07ff64ba48a2632786a8` |
| `npc-driving-v6.png` | `9a88ccfbb6341201ccf00fe856befd7b6a84d4b9d2c805b1eed77bcd1d8cabf0` |
| `npc-stride-a-v6.png` | `ba15ee864940f0ff97b99a053b3def3999623cf8f33f32f9e82085810e21f394` |
| `npc-stride-b-v6.png` | `4080a0e211b4f212b89ab9f10869380189b0d63153523443f95eb4b73fa88886` |
| `vehicle-auto-side-v3.png` | `bc4aec7725c9f99419a643420f17c9a8ea73b2348f06d1c2eb070510b12325a2` |
| `vehicle-auto-cabin-v3.png` | `0846b400c05ffed7262d03e7d0e33c108411d74f5a05d5e9fed5e836f97f8c7c` |
| `vehicle-motorbike-side-v3.png` | `4c854eb3624512ef2462737f9450d56549ec6b36dfc6e44532b4d676c721ffd8` |
| `vehicle-motorbike-cabin-v3.png` | `e9b6099195d5347f3071f0f0a70a00907f71b9721caac6e4741abcb45a3f8640` |
| `vehicle-scooter-side-v3.png` | `67ee5271a67a2003deebda03e11e0e5026063e0d20a1aab5d12897f54fd5373b` |
| `vehicle-scooter-cabin-v3.png` | `314b45193f5ce0f4fcdbf2d4de4fdadcbff74777b6100ced67c503fb8bc2fea3` |
| `vehicle-bus-side-v3.png` | `f56ad646f17f94a0b073d27c7f0203a835c69eaaf22f2206a40e15d375f0093a` |
| `vehicle-bus-cabin-v3.png` | `eb76cdbc77b5b24d59cd6cd4cb7355c6e37cc5c906da02a08b2f8c2e501e2a74` |
| `vehicle-hatch-side-v3.png` | `d1b0ae50e1b399ae06320d82c5e1b2993b5cfcf021deeb51a1ec1654ef974ec1` |
| `vehicle-hatch-cabin-v3.png` | `0f6b47a483344b440c8096c702816b8f230b8a77ee214cdf1eca4c83cb3b9378` |
| `vehicle-passenger-van-side-v3.png` | `fc6e38b229f8d66b68773623ca066aca05f332a01ae550e96fa2ba9a3d6cdf68` |
| `vehicle-passenger-van-cabin-v3.png` | `ba2d188cfec897e1aa92aaee812de920d270f90d27090891c96eec4dc46d24ff` |

Producer evidence additionally opened: `npc-producer-v6/front.png`, `profile.png`, `faces.png`, `seated.png`, `seated-side.png`, `seated-quarter.png`; their image/source/geometry hashes remain in `npc-producer-v6/manifest.json`. They are useful structural static checks, not substitutes for native animation acceptance.
