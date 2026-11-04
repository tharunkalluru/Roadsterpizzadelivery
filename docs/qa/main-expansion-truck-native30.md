# Actual truck camera follow-up — November 3, 2026

Frozen QA30 fingerprint: `811734c3bc148d98b0b8c1322829f20ce53f2713fbda4aca181f5f6c44dd905c`.
Native Chrome, desktop mouse/keyboard with the touch-layout flag, 1579×1180
canvas. This is not a physical-phone or true-touch result.

This isolated test used **Prepare order** and **Stage at scene approach**.
The car was then driven and braked into the real blue marker. Controls stayed
available outside the marker and disappeared only after the grounded stop.
The closed container opened, the car entered, and the physical handoff ran.
The held camera now shows the face, mouth/slice, open carton and supporting
hand from the front, rather than the obstructed profile in QA28. The face stays
above the lid. The character remains stylized; this check does not establish
photorealism or independently reapprove every character likeness.

Pause and Resume retained the completed scene and its explicit Next button.
Next produced the opaque Wellington Road loading screen, followed by the next
road with controls restored and an empty trunk. The pause menu confirmed Level
2 / 14, one completed. No drop button or automatic advancement was needed.

Evidence is in `evidence/main-expansion/truck-native30/`:

- `held-actual-reader.png`: actual scene, bite/face/carton framing.
- `resumed-held-reader.png`: completed scene after Pause/Resume.
- `next-transition.png`: opaque loading screen.
- `next-road-empty-trunk.png`: restored driving, no carried carton.
- `native-scene-evidence.json`: SHA256
  `82c8ceb220d8975618a1cd7bc12d1bbc460eebf6034a8d42f6e58724e81a01a4`.

The recorder reports the truck's physical scene mechanics observed, no missing
physical facts, no observer failures and no story violations. It correctly
records assistance and does not accept the whole campaign. The earlier QA28
normal pickup-to-delivery run remains separate evidence; its old camera frame
is not used to approve this camera change.
