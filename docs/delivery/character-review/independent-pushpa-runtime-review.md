# Independent Pushpa actual-runtime visual review

Reviewer: `/root/container_underwater_scenes`. Date:2026-10-31. Actual local game captures were produced by the gameplay QA operator with manual controls. The independent reviewer opened the captured images, did not operate QA's browser, and did not create the art. The preview visibly labels the character UNREVIEWED; production approval remains withheld.

Exact staged model metadata: `candidates/pushpa-reader-in-container-v1.json` identifies GLB SHA-256 `fa7e75946bfbe675561660e22a14997f80ce147d52f8445cac86f7a512ad121d`. These first three actual captures were independently inspected:

| Actual runtime capture | SHA-256 |
| --- | --- |
| `docs/delivery/gameplay-review/pushpa-local-art-2026-10-31/03-desktop-actual-entry.png` | `3bad70546c40dbcb1b0fa6738ed0e9c5a143f1f7ed2c6f3474ce6d507f2cac94` |
| `docs/delivery/gameplay-review/pushpa-local-art-2026-10-31/04-desktop-reader-normal-camera.png` | `a9a5ae8ebc4265b1b52ee98abd5384028b9377da0ac4ffe4209f1e064cebda9e` |
| `docs/delivery/gameplay-review/pushpa-local-art-2026-10-31/05-desktop-reader-orbit.png` | `9c4f59b822f0199dea36eb916b886b7789a8c3fec665d76c229fbea0283f5dd3` |

## First actual entry/read observations

The actor and an opened book are physically present in the container at runtime, rather than an empty gated group. The player car and camera are inside a closed roof/wall volume with logs to one side. Scale is not obviously gigantic, and the ordinary third-person camera can remain inside the truck. The manual orbit capture supplies another actual game angle rather than just a Blender studio view.

**Unresolved runtime blocker:** large cyan navigation ribbons cross the car and the reader's book/waist/handoff region. The orbit capture shows the ribbon hiding almost the entire interaction boundary. These images cannot establish actual pizza-to-hand contact, clear seated legs/chair contact or final handoff readability. Root and QA were notified. Retain global road guidance, but suppress/clip this interior's close final guidance segment when it would obscure the active scene.

The reader's face is small and partially occluded by the car in the ordinary camera. That may be acceptable during entrance, but a post-fix parked/orbit/interaction view is needed to evaluate film identity and visible hands. Do not claim the character is clearly recognizable from these obstructed distant frames alone.

Actual transfer, completion, departure with preserved truck/supports, small touch layout and night visibility are not yet supplied at this review point. Offline hand/pose/proxy acceptance remains separate and does not fill those gaps. No production manifest or character approval was changed.

## Post-fix actual scene views

Both actual new captures below were independently opened. The cyan world-route strips no longer cross the reader/car/handoff region. The minimap and fixed top navigation still remain; global road navigation was not removed. This resolves the concrete obstruction shown in the first capture set.

| Actual post-fix capture | SHA-256 |
| --- | --- |
| `docs/delivery/gameplay-review/pushpa-local-art-2026-10-31/09-desktop-reader-guidance-cleared.png` | `23d762f303f288b06de0d94be70c11533ab5e74aa89948cea776c5091317fb4d` |
| `docs/delivery/gameplay-review/pushpa-local-art-2026-10-31/10-desktop-reader-orbit-cleared.png` | `b748d3b02a2dcb086b02916d17cda3638c0288106e9028fc014fbe183be9743f` |

The unobstructed manual-orbit image shows the reader seated on the actual scene chair, opened book in front, feet meeting the truck-floor region and a complete body beside the car. Scale reads plausible under perspective; no obvious floating or severed limb is visible. The normal chase view keeps the character present but small and partly behind the car. A closer ordinary manual orbit/interaction capture has been requested to assess recognizable face/hair/costume and actual transfer, rather than inferring them from this small distant silhouette.

Actual pizza transfer, completion/retained scene/exit, touch-sized layout and night captures remain outstanding at this point. The review is progressing; production approval remains unchanged.

## Actual handoff, completion, retained scene and exit

The four captures below were independently opened, and the QA evidence JSON was read. Its metadata explicitly identifies an isolated assisted-start local art preview, exact model SHA `fa7e75946bfbe675561660e22a14997f80ce147d52f8445cac86f7a512ad121d`, mouse input, no verified physical-phone hardware/touch, and no natural carrier pickup in this run. Those limits remain part of the evidence. This is one scene, not full-campaign playthrough or physical-phone/FPS proof.

| Actual capture | SHA-256 |
| --- | --- |
| `docs/delivery/gameplay-review/pushpa-local-art-2026-10-31/11-desktop-actual-catch-cleared.png` | `1e38f57a0b088b6b512622705a83c753863793b72e496ae7f659cb2d44147d85` |
| `docs/delivery/gameplay-review/pushpa-local-art-2026-10-31/12-desktop-completion-after-catch.png` | `69329db0b67b1f2293b869df58a3c7efc4085d33efd4a88f3132d9aee11462d7` |
| `docs/delivery/gameplay-review/pushpa-local-art-2026-10-31/13-desktop-retained-reader-before-exit.png` | `a23f25c88a854baea550d1a3cbe1ca07674b0ca210d7b6871fa6f3cab73c3380` |
| `docs/delivery/gameplay-review/pushpa-local-art-2026-10-31/14-desktop-clear-ramp-exit.png` | `49087861e99bc75e720a65dabd0e52d3eadb5d029ee629402dc67f10666c5646` |

The actual Passing the pizza image contains the moving box beside the reader's receiving hand with the book retained; the unobstructed ordinary orbit allows the interaction to be seen. The completion card follows. After Next, the reader/chair/actual truck remain present while the player is still inside. The final image shows the Roadster on the road behind the open ramp with the truck/reader still visible, rather than a vanished floor or immediate teleport. The operator reports a manual reverse exit; the evidence explicitly retains its assisted initial staging. These images establish visible delivery progression and scene retention better than synthetic test assertions alone. Fine palm contact is more directly established by the exact offline close probes; the gameplay figure remains small, so do not claim high-resolution in-game finger detail from these images.

**Retained-reader presentation issue:** image13 shows the receiving arm still extended after the pizza disappears. Read-only inspection confirms TruckInterior.updateExit advances physical truck/ramp/surfaces but does not return catchPose to reading or advance its authored Read animation. Thus the retained character can remain frozen in the catch pose. Root was notified to blend/restore reading in the bounded retirement path without altering support physics or re-emitting completion. This issue is separate from the already corrected claw/forearm anatomy.

Small touch-layout and night visibility still await actual captures; the normal-frame face remains small, so a closer ordinary-camera/orbit view remains requested for recognizability. No production approval was changed by observing this mechanical progression.

## Compact night check — visual failure found

Actual capture `docs/delivery/gameplay-review/pushpa-local-art-2026-10-31/15-compact-night-touch-buttons-entry.png`, SHA-256 `9a5b3112acbdcad7bc5da3e2f27ca4074ba74210baa8e7542f38201c91e70980`, was independently opened. The closed container walls are visible but the reader's face/body are effectively a dark silhouette. **Night recognizability fails in this capture.** It is not acceptable to infer night quality from the daytime studio model or the completion-card portrait. Root was notified to supply a localized believable reading/ceiling light and retest ordinary game-camera readability, retaining the authored material treatment.

This is a very small desktop browser layout using the game's touch-style on-screen buttons through mouse events. The filename does not establish a physical phone or trusted touch input; the operator explicitly records that limitation. The actor is also small at this distance/viewport, so scene-local parked handoff framing deserves a post-fix check. No production approval was granted.

### Compact orbit framing and exit

The following actual files were also independently opened. The compact orbit shows a second problem beyond lighting: the reader is largely behind the left steering-button row. This is world-scene framing, not a claim that the controls overlap each other. A localized parked/handoff frame should protect the reader's face/book/hands in the central safe region between controls, without changing the user's chosen control positions or global V21 road/flight camera. Lighting alone may leave this specific628×240stress view unreadable. Root and QA were notified.

The actual night exit image shows the Roadster on the road and the retained open truck ahead. It supports successful compact on-screen-button exit, while retaining the mouse-only/assisted-start limitations.

| Actual capture | SHA-256 |
| --- | --- |
| `docs/delivery/gameplay-review/pushpa-local-art-2026-10-31/17-compact-night-reader-orbit.png` | `7aa280c8c9d42065befbe5954d81ee98bfa1dc38a75185470b22a0b77d1fa368` |
| `docs/delivery/gameplay-review/pushpa-local-art-2026-10-31/20-compact-night-on-screen-reverse-exit.png` | `eac411700701b422bff0bbb5dd5a3a24cff04d86bf0a88fb04bc3e7d083d0c8a` |

### Compact transfer frames do not show the receiver

All three native transfer frames below were subsequently independently opened. Frames0/1 show the small moving pizza at the left, near the steering controls, while the actual receiver is outside the visible view. Frame2 shows the completion modal. These support mechanical progression, but they do **not** visually establish compact hand-to-box contact or a readable receiving character. A fresh post-fix natural in-container camera view must keep the face, book and receiving hand in the free central region during the transfer. The completion portrait cannot substitute for the missing actual scene view.

| Actual transfer capture | SHA-256 |
| --- | --- |
| `docs/delivery/gameplay-review/pushpa-local-art-2026-10-31/18-compact-night-transfer-frame-0.png` | `1c5c06fe64aa914a7c53525b63befbdcfec1bf441f8ca05cb47f4a1da749a6a8` |
| `docs/delivery/gameplay-review/pushpa-local-art-2026-10-31/18-compact-night-transfer-frame-1.png` | `fd7e7fb31aa62468009812344777e50d3656965976b48f3fff6fe3c31c73c80f` |
| `docs/delivery/gameplay-review/pushpa-local-art-2026-10-31/18-compact-night-transfer-frame-2.png` | `aee6827d1189ec38d792bb48245d25d42d961003e33b99a727060bb80a6f9826` |

## Independent manual post-fix compact run

I personally operated the sole assigned Safari QA window through CUA after the root agent released exclusive input. I used the visible Prepare/Stage controls, then ordinary keyboard driving and real coordinate holds on the on-screen GO/BRAKE buttons, the on-screen handover action and Next. The actual scene remained explicitly labelled UNREVIEWED. Night was verified in the visible diagnostic text before preparation; it was not inferred solely from the URL.

New native window captures and exact hashes: `docs/delivery/gameplay-review/pushpa-independent-postfix-2026-10-31/capture-manifest.json`. Exported actual recorder output: `compact-night-independent-evidence.json` in the same folder. Model SHA remains `fa7e75946bfbe675561660e22a14997f80ce147d52f8445cac86f7a512ad121d`; the new motion-bounds rig descriptor SHA is `872545e260e144a621d40c685cec82050b009b49598b38d017fd1fcdbf5dd5b8`.

**Observed improvements:** the ordinary parked camera now places the reader centrally above the steering/button rows, and the bounded lamp makes the brown costume, head, book and hands visible at night. Actual screenshot06 shows that ready view;07 shows a moving pizza approaching the visible receiving hand with the book retained;09 shows completion. After Next, the reader and real truck remain. The arms return to the book-held reading pose instead of staying in the old extended reach. Actual screenshot11 shows the car fully clear of the rear ramp, stopped on the road, with the open truck/reader still ahead. I used the actual on-screen brake/reverse hold to exit; there was no exit teleport.

**New remaining overlap:** screenshot10 shows the persistent “Pizza delivered — reverse down the open ramp” hint directly across the reader's head/upper book at this stress-small layout. Move that hint into the established safe navigation/instruction region rather than over the focused subject. It prevented a clear retained face view after Next. Manual orbit remains possible; an off-center orbit can naturally place the actor behind the steering row, while returning the yaw to the ordinary orientation restores the protected focused view. No angle-dependent actor disappearance was observed in those sampled angles.

**Evidence limits:** native game area was approximately628×240; hardware was a desktop Safari window with mouse input, not a physical phone or trusted touch. The recorder confirms mouse only, assisted pickup/staging, manual handoff, six physical facts, and one observed delivery. A first attempted run (frames01–05) was interrupted after completion by a parent-confirmed Vite reload; only the fresh frozen run (frames06–11) supplies continuous Next/retention/exit evidence. A CUA accessibility-index “hold” initially activated the drive button only momentarily; repeating with true coordinate mouse holds worked. This is a test-input distinction, not an established gameplay defect.

The captured moving-box frame is not a high-resolution fingertip/contact close-up; its filename cannot establish more than its pixels show. Exact palm support is better documented in the separately reviewed offline probes. The face is visible but only a few pixels wide in this stress view, so it does not by itself establish the user's close film-likeness requirement. A closer ordinary larger-window game view is still needed. No production appearance approval, physical-phone performance claim or full-campaign acceptance is issued.

## Larger calibrated-night actual capture

Independently opened `docs/delivery/gameplay-review/pushpa-large-postfix-2026-10-31/07-fixed-night-calibrated-reader.png`, SHA-256 `4629a602583a46f0ac7c7a4501e28e67df766f63f119c704e3bf5cb90aa70ca3`, supplied by the root's actual Safari gameplay run. This phase was file-only review; the root retained browser input. The root identifies this capture as the new fixed23:00 QA-night configuration with lamp2.5 and cargo-only closer focus. Earlier01–04 views naturally advanced to dusk and05–06 used the overexposing lamp8; they are not substitutes for this exact capture.

The reader is now a substantially larger, clearly seated full body in the actual container. The brown fabric, face region, opened book, hands, legs and shoes are readable without the previous severe trouser glare. The fixed top guidance and moved bottom-left UNREVIEWED badge do not cross the subject. **Ordinary parked scene readability is a meaningful improvement and passes in this image.**

I compared the actual frame with the primary Mythri139s film profile and the film promotional brown-outfit/red-glasses poster. The brown outfit/red glasses and beard are coherent role cues. However, he is looking down at the book; hair and glasses hide much of the face/eyes, so this view cannot establish close facial identity. The poster's front quiff is taller and more swept than the rounded down-view hair mass. A natural head-lift during handoff and an ordinary eye-level orbit are the next relevant checks, rather than another brightness adjustment or replacing the face with a portrait card. No complete appearance approval is issued from this one improved reading view.
