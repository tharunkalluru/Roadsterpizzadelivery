# L6/L8 story camera fixes

The native level-06 walking screenshot left Jessie small and back-facing in an ordinary Roadster chase view. The level-08 held screenshot showed only Bhanumathi's head above the Roadster: the inherited automatic story pose parked the car directly on the actor.

## Minimal changes held for integration

- `WalkingHandoff.cameraFocus` now supplies an actor-relative front/road-side shot only while story capture is active. It follows Jessie's live position and facing direction through the outward and return walks, handoff, and completed moving hold. Her path, speed, gait, lights and the normal driving camera are unchanged.
- `WeddingHandoff` now uses a bounded automatic-only alongside position: local X3.3m, Z0.5m ahead of the actor, aligned with the street. The target, handoff radius, timing and actor/crowd dance remain unchanged. The cinematic shot views her full body from the actor's opposite/front side, clear of the Roadster. The prior ordinary stopped-handoff camera retains its original gates.
- The actual host `Game.updateCamera` now honors a captured story's requested shot even if the player previously dragged the camera sideways. The original expression also applied the manual-orbit gate to cinematic capture, preventing a locked player from seeing the authored shot. Ordinary driving, interior, underwater and parked handoff retain their prior orbit gates.

The Wedding crowd appearance is a separate NPC producer task. After the camera sections were held, that producer received ownership of only the crowd construction/update/disposal integration. Existing approved named-character bytes are unchanged.

## Regression evidence

`tests/v21-fixes/story-actor-camera.test.ts` contains10 passing cases. These check actual module facing and motion at three street rotations, full standing-body projection in a 932×430 landscape camera, an actor-to-camera ray outside the full Roadster volume, actual physical handoff and retained viewing, eligibility/release, and unchanged target/dance timing. The actual `Game.updateCamera` test failed before the host fix with a1.4rad manual orbit and stale dragging state, then passed with the fix. It also verifies that the ordinary dragged orbit regains authority after capture ends and camera clearance uses the actor sightline.

Focused verification:90 tests pass across actor-camera10, street-scenes27, story-mode17, scene-placement12, driving-camera8, camera-look10, camera-underwater5 and camera-delivery-solids1. TypeScript and `git diff --check` pass. The structured command-result log is `docs/qa/evidence/main-expansion/story-camera-checks.json`.

These geometry/state fixtures do not establish approved-asset pixel visibility, likeness or a native pass. Independent native reviewer feedback identified both blockers; Root/native QA must now replay L6 and L8 on the newly frozen integrated build, including a sideways-orbit arrival. Root is responsible for the final camera/actual-art verdict and release. No browser was used by this producer.

## Camera patch snapshot before the separate crowd integration

```json
{
  "src/delivery/modules/street-scenes.ts": "b5faba263c3f7af115e39946de0446041c4f155306fe7ad0368f74000e4bc39d",
  "src/game/game.ts": "2f334cf53add4efb8813f189ef7b93ed680c8f86f31a17813b8369a57f453150",
  "tests/v21-fixes/story-actor-camera.test.ts": "03e7e00d2be8efa38f88b7e79fcef55e30a23fcbc23f883368ed9b9716879a5b"
}
```

The crowd producer will change the complete `street-scenes.ts` hash; the new frozen integration must record its final hash separately. No further camera changes are planned pending independent native feedback.
