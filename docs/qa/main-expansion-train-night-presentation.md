# Train-roof night presentation fix

The actual frozen 17 night screenshot (`evidence/main-expansion/native-rail-final/train-night-held-before-v17.png`) showed Ram's face poorly lit after a successful manual rear-coach landing, traversal, physical handoff and retained viewing. The four coach worklights were only 0.9 m above the roof and used the 2.5-intensity reading preset. Their source sat below the face and beside the Roadster cabin.

## Bounded source change

Only `MatchAndLand`'s `trainRoof` presentation changed. The same four merged worklight fixtures now have lenses at 2.4 m above the actual coach roof, with their existing stems extended to the housings. Shared dimensions place the pooled-light request exactly at the selected visible lens center (local X ±1.62 m, Y 2.4 m, Z ±1.49 m). The request borrows the existing `porch` preset (intensity 8, distance 7 m), rather than the reading preset. There are no added engine lights, shadows, draw batches or collision bodies.

Actor bytes, camera framing, real train geometry/route, moving support, strict manual landing evidence, handoff gates, speeds and timing are unchanged. Truck/other-scene lighting presets are unchanged. This producer did not use the browser or edit a release registry.

## Verification

New `train-story-lighting.test.ts`: 3/3 passes.

- Extracts the actual warm lens vertices from the merged visible geometry and checks all four fixture heights and exact source alignment.
- Checks the source is in front of/above the actual actor transform and the light-to-face ray clears the full Roadster cabin volume.
- Uses actual `Game.placeLampLights` to verify the same pooled light identities/count follow the moving coach and release back to ordinary street calibration.
- Completes the physical handoff, retains the customer, turns/moves the real coach and verifies the same bounded request stays aligned with its visible fixture and retains the prior camera/contact gates.

The previous matched-roof regression was updated only for the new requested porch calibration and exact visible lens offset. Additional focused passes: immersive module 15, Ram landing 1, automatic story 17, independent physical contacts 10, scene-lamp pool 9 and actual scene-light borrowing 1. Total: **56 tests pass**, plus TypeScript and `git diff --check`.

These source/geometry/state checks do not prove final face pixels or likeness. Root owns an independent frozen 18 night replay and comparison with the preserved frozen 17 screenshot before visual acceptance. The original evidence was not changed.

## Held fingerprints

```json
{
  "src/delivery/modules/match-and-land.ts": "d996732942f361c6f43598e1e5867411007cfcd364e1374e449fa6c87ac26750",
  "tests/v21-fixes/train-story-lighting.test.ts": "6193bf13dc908dfeea54d1a60c2a1d35483c80a1a740839114d2f9a6e2d60b0e",
  "tests/v21-fixes/delivery-module-immersive.test.ts": "74de795877e692ff20763aa38ce20d995f6780cf2817544faeaba16753656b3d"
}
```

Source is held for Root's independent native replay. No further presentation changes are planned unless that replay finds a concrete defect.
