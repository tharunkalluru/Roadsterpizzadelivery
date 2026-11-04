# Actual handoff lifecycle and held-container camera — November 3, 2026

Root completed a normal pickup, flight, wrong-deck negative control, manual blue
bay parking and automatic Pushpa delivery in frozen28. The held scene's profile
shot made the carton support hard to read. That screenshot established a
framing problem; it did not by itself prove that the actual skin lost contact.

The expanded exact-source audit then found genuine lifecycle defects that the
earlier direct-from-Idle meal tests did not cover. Catch still owned the upper
body when receive calibrated the hand surface; fading it afterward could lose
support or penetrate the tray. Entering receive from Dance also measured the
outgoing pose, then the existing received policy switched to Idle afterward.

The fix ends the completed authored catch before measuring and prevents later
host catch-fade callbacks from taking the received hands back. Dancers retain
the existing received Idle policy; its authored 150ms crossfade is settled
before the one-time measurements. This samples only actor pose. Scene time,
story entry, the six-second meal and all unreceived motion remain unchanged.
No original GLB, face annotation, optimized meal-geometry helper or release/GPU
preparation hook changed in this follow-up.

## Exact-source contact evidence

Preserved before-fix receipt:
`evidence/main-expansion/received-pizza-actual-lifecycle-before-20261103.json`.
SHA256: `7da960fc812c343af51bac307262986eace54a7affbd413e0a4df33772313b1c`.

Current passing receipt:
`evidence/main-expansion/received-pizza-actual-lifecycle-native17-20261103-v6.json`.
SHA256: `201505bc8a17a60c0835bad25d698be63756e9a3a4bbd4b972f45cc5893287c6`.

All eleven suitable receivers were tested after four seconds of each original
Idle, Read, Walk and Dance mode, followed by the full authored catch, receive,
the host's .45s catch fade and six seconds of continued requested motion. The
actual seated group transform and a rotated/graded container frame were applied.
There are 44 lifecycles with 180 measured poses each, at 1/30s intervals.

- At least five actual source skin vertices support the tray in every pose;
  maximum underside gap is 2.84mm.
- Zero left/right pizza intrusions, tray penetrations, finite lid-plane crossings
  or intersections with the actual 12mm lid volume, including rigid source props.
- Maximum edible-tip distance is 22.81mm; minimum pizza/face clearance is
  19.72mm and nearby hand/finger clearance is 10.46mm.
- No nonfinite vertices; maximum source-skin culling-bound fraction is 0.9544.

The script now accepts an optional final lifecycle argument:
`idle-direct`, `idle`, `read`, `walk`, `dance`, or `all-handoffs`.
Its existing recipient CSV and frame-count arguments remain unchanged.

## Held-scene camera

The old optical target was inside the physical study-corner player keep-out.
The actual `Game.clearCamera` therefore escaped that volume instead of keeping
the intended frontal shot. The new bounded, cached shot follows the actual
Head/mouth azimuth and frames the face, carton and supporting hand. Its position
is chosen in the real clear strip between the Roadster's nose and the reader's
keep-out, not from downward reading pitch. The checked pivot is collinear with
the actual optical subject and outside the keep-out.

`ModuleCameraFocus.clearanceTarget` is optional. Only this captured truck shot
sets it. `Game` uses that checked pivot for collision and retains the real
face/carton as its optical target. If smoothing would enter the parked hero car,
the existing cut-to-verified-position safety policy applies to this opted-in
captured shot. Other chase, flight, orbit and story shots retain their current
branch. Pending/blocked planning fails safely and retries at most once a second;
valid local plans are cached rather than rescanned every displayed frame.

Camera receipt:
`evidence/main-expansion/truck-reader-camera-actual-lifecycle-20261103.json`.
SHA256: `ab4fdc85d6e053e5484b1d64edb3e8d54db05d8a071a4369f6b5624eaf9af080`.

The exact approved model and actual TruckInterior/Game camera consumer pass at
three headings/grades through opening, bite and held poses. Tests check literal
camera clearance, actual ordinary Roadster geometry, container solids, the
smoothed/cut transition, optical/pivot collinearity, source face/carton/wrist
projection, actual supporting-hand skin visible beside/below the carton, and
rendered roof/lid/carton obstruction of the face. The old blocked target is a
negative control. Pending and blocked queries, cached work, driving and flight
release, and teardown are covered.

Validation: seven actor tests, three actual-source camera tests, ten existing
camera-control tests, three container-exit tests, fifteen immersive-module tests
and fifteen release-registry tests pass. Typecheck and scoped whitespace checks
pass. These source/geometry checks do not establish native appearance, phone FPS
or complete-game acceptance. Root's fresh native held-scene, Pause and Next
review remains required.
