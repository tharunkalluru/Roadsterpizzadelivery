# Paradise bucket interaction: presentation and physical correction

Source is held for Root's frozen 20 native replay. The producer's122 focused tests, TypeScript and diff checks pass. The separate reviewer reports5/5 focused camera/physical checks passing at the held production hash. These source results do not approve final native pixels, celebrity likeness or phone performance.

## Observed failure

The actual frozen 19 `native-rail-final/odela-bucket-early-v19.png` showed only the car and alley. The basket stayed offscreen during the automatic interaction; `odela-bucket-after-early-v19.png` then showed the approved rooftop actor. RopeBucket requested a camera only after `ended=true`, so the lowering/transfer/raising phases inherited the rear driving camera.

The independent reviewer then confirmed a physical defect exposed by the closer view: the old exact-center automatic position put374 actual rendered Roadster triangles, including the windscreen, inside the basket floor. The original failure is retained in `evidence/main-expansion/odela-bucket-independent-physical-before.json`.

## Bounded source change

Only `src/delivery/modules/street-scenes.ts` changed for this correction.

- During an active, unfinished RopeBucket story, the camera frames the physical basket from the real facade's street side. Its horizontal eye stays1.5 m outward and7.5 m along the facade, avoiding the opposite26.2 m building in the actual narrow alley. Height follows the real basket, with enough top clearance to see its unrotated1.7 m side/back panels, lifting handles and carton. Existing Game camera damping and collision handling remain active.
- The car parks beside the basket on the nearer facade tangent side. The distance includes the basket's actual tangent projection,2.4 m car half-length and0.4 m margin, remaining below the existing6.5 m handoff reach. At the actual Paradise facade the distance is4.723 m. Choosing the nearer side preserves already-lowered approaches without driving across the basket.
- The car aligns to the closer of the two facade-parallel headings. The native 43° start therefore turns toward approximately−0.535°, rather than crossing broadside 90° on its way to179°. The latter initially clipped the actual opposite building and was independently rejected.
- RopeBucket alone uses a2.2 m physical throw arc so its carton clears the tall basket wall from the corrected side bay. The transfer remains0.8 s; all other StreetScene arcs remain1.05 m. Basket dimensions, lowering 3.4 m/s, raising 4.2 m/s, interaction phases and completion gates are unchanged.
- The completed actor close-up retains its exact previous formula. An explicit `ended` lamp guard preserves the approved rooftop porch activation timing; the new earlier camera does not add or activate a light.

Ordinary driving/flight camera behavior, Game/spatial-safety code, actor assets, registries, city buildings, lights and normal input were not changed. No public link or deployment was changed by this producer.

## Actual source and tests

The camera fixture derives the observed frontage from the packed 16.6 m building `5b496a6d-84b`. Its edge yields destination `(-1021.381475,.02,-3917.862537)` and outward normal `(.999956331,.009345386)`, matching the rounded native car position. It uses the two actual neighboring packed tiles and their real rendered buffers/collision grids. It does not claim that rerunning the full neighborhood placement search on a two-tile subset reproduces every runtime correction.

The camera test starts in an ordinary chase/orbit view, then advances the production Game camera at 50 ms steps. After the initial 0.6 s camera transition it checks complete basket/rig bounds, the beside-basket Roadster bounds and carton framing through lowering, transfer and raising at 932×430 phone and 16:9 desktop aspects. Real city/scene raycasts reject all opaque panel/building coverage. At least five of nine carton-top samples remain unobstructed; brief thin A-frame/rope crossings are permitted as natural foreground. Five facade normals and both sides exercise the unrotated panel openings. The first 0.15 s of the carried-to-thrown carton extraction is excluded from the top-sample visibility gate, while separate physical transfer checks retain the full throw.

The independent physical tests use actual Roadster and carton triangles, exact drawn basket panel boxes, retained building footprints and actual StoryDirector poses. Native43° center/high, already-low +6 m and already-low −12 m approaches complete without car/basket or visible-car/building penetration. The previously proposed +12 m positive start was independently found already inside a retained building; it was replaced by the actually clear +6 m start, rather than being declared a new route defect. Physical carton/panel checks pass through the corrected throw.

The existing machinery lowers the basket when a player is within 42 m, before story capture. A slow natural arrival may therefore find it already lowered. The correction preserves that behavior and does not promise every arrival will show the entire lowering motion. Root's fresh actual replay must judge the particular normal entry, handoff, lift and retained character view.

Focused log: `evidence/main-expansion/odela-bucket-camera-focused-final.log` — **122/122 pass**. Separate reviewer log: `evidence/main-expansion/odela-bucket-independent-held-tests.log` — **5/5 pass**. Existing rooftop integration, street scenes, story logic, actor cameras, immersive modules and delivery runtime are included in the producer run.

## Held hashes

```json
{
  "src/delivery/modules/street-scenes.ts": "2d69e6cf618cff849b7b4e309bd129cb954f762b656264392925d6c1ecb20dd5",
  "tests/v21-fixes/odela-bucket-camera.test.ts": "f51650468bc3abb40e26e1d74c0f6b1a26d8eb6963c6294f1f1dbd78f625a6f8",
  "tests/v21-fixes/odela-bucket-physical-independent.test.ts": "e82b100b3dce5b5c457ddb04c654fe0d96043539be22622d0f6cbf20bdab5659"
}
```
