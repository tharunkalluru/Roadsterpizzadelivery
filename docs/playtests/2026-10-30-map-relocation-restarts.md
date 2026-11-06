# Map relocation and campaign restart — 30 October 2026

## Behavior

The full map again offers **Deliver from here** between deliveries. It has two explicit flows:

1. Pan or zoom, then tap a point or individual place icon. A selected-location pin and compact card appear. **Deliver from here** submits that selected world point rather than the map center or current car position.
2. Press the default **Deliver from here** button first. The centered pin picker opens; dragging or tapping repositions it, and a second **Deliver from here** confirms.

Panning, pinching, pointer cancellation and lost capture cannot count as a tap. A rapid tap after panning cannot snap to a marker cached for the previous view. Submit handlers recheck permission, so an active accepted delivery cannot be overwritten by a stale action. Placement chooses a safe clear road close to the selected pin; map moves can use ordinary streets and are not restricted to the campaign's main-road startup rule.

The Explore places toggle, search, category selector and detail panels are removed. Normal geographic labels and place identities remain on the map.

Pause now shows adjacent **Restart current level** and **Start from level 1** actions. The first retains completed levels. The second explicitly clears the story's levels/customer collection/restaurant progression and active call/module/navigation/pickup state, then uses the normal safe opening spawn. Settings and unrelated legacy saves remain intact. The campaign menu uses two columns so both restart actions fit even at 568×320.

## Failure and return safety

Network/blocked placement failures keep the exact selected destination for retry, plus the old player area and completed progress. **Choose nearby street** opens at that pin; cancellation closes the map and returns to the same failure actions.

Manual QA found that a distant failed ensure could retire the old scene before **Stay here** resumed. The return path now restores the exact old player position's world tiles and prepares its frame under the opaque loading screen before resuming. Return failure stays paused and retains retry actions; stale asynchronous work cannot replace a newer destination.

## Observed browser evidence

Local Vite QA at port4239 used real map gestures/buttons and an isolated Level7 scenario with six completed levels. No production saves were reset.

| Layout | Action | Observed result |
| --- | --- | --- |
| 667×375 touch HUD | Pan, tap Abdullapur, confirm selected card | Welcome to Abdullapur; Level7 retained |
| 667×375 touch HUD | Default button, fixed pin, pan/zoom to Venkateswara colony, confirm | Correct welcome and ordinary road; Level7 retained |
| 667×375 touch HUD | Tap Narsingi near the mapped multi-road junction | Correct welcome and ground-road placement; Level7 retained |
| 667×375 touch HUD | Restart current level | Level7 retained |
| 568×320 touch HUD | Pause menu | Both restart actions visible side by side without scrolling |
| 568×320 touch HUD | Start from level1 | Opening Inner Ring Road, Level1/7, empty customer collection |
| 568×320 touch HUD | Tap Prashanth Nagar on map | Selected card and zoom controls fit without overlapping |
| 1280×720 | Tap MS Makta, confirm | Safely placed near the lake-side road; Level1 retained |
| 1280×720 | Isolated lake point labeled Appoji Guda | Clear no-safe-road failure; retry retained same destination |
| 1280×720 | Nearby picker, cancel, Stay here | Cancellation retained pin; final fixed return displayed loading, then restored original road and Level7 |

[Evidence folder](../delivery/evidence/map-relocation/). Initial success/restart captures predate only the later safe-return barrier correction; the final isolated-pin return was repeated after that correction with source frozen.

## Automated verification

Final `npm run check` passed **422 current tests, 38/38 legacy suites, TypeScript/Worker checks and production build**. New tests cover 10 map gesture/selection cases, 13 Game relocation cases and four pause action cases, plus runtime cleanup/reset coverage. Real controller/storage tests verify that map moves preserve completed prefixes, collection and restaurant progress; actual road-placement queries distinguish ordinary map streets from strict campaign starts. Deferred-load/frame tests prohibit resuming before the old scene is ready.

These are browser-layout, gameplay and deterministic regression results, not physical-phone performance measurements. The retired random-order/coins workflow is not reintroduced.
