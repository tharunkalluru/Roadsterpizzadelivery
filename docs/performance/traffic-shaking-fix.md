# Traffic shaking after Version 22

The user reported severe apparent lag and shaking buses/autos after the Version 22 publication. This was a real moving-traffic regression missed by the stationary comparison and short release smoke.

## Cause and fix

Render interpolation restored vehicle quaternions, which also rewrote their Euler angles. For the default XYZ order, a heading beyond 90 degrees can decompose into X/Z half-turns and a different Y angle. Traffic's next update changed only Y, retaining those hidden half-turns. A simple 2.4 → 2.42 radian heading update consequently produced about 97 degrees of orientation error. The route/collision tangent and visible vehicle could disagree on alternating ticks. Camera hiding also incorrectly used that decomposed Y value, making visibility unstable.

The fix restores the exact authoritative Euler representation and order after presentation, writes each complete traffic orientation in yaw-friendly YXZ order, and derives camera visibility from the rendered position/quaternion. Pooled vehicle generations reset both interpolation endpoints, and inactive frames no longer restore poses that were never interpolated. No graphics/detail reduction, source-map change or speed/jump change is involved.

## Verification

Five new behavioral regressions failed on Version 22 and pass after the fix. They cover Euler restoration across heading quadrants, real bus/auto movement around curves through repeated render cycles, pooled respawns, camera hiding and inactive frames. The complete client/Worker type checks, 103 behavioral tests and production build pass.

Actual production Game observations used a 915 × 412 landscape touch layout, Low graphics, the same RTC X Roads night fixture, 20-second warm-up and roughly 56 seconds of external visible-keyboard driving/steering/braking/jump input at calibrated 4.04× desktop CPU slowdown. Diagnostics only observe authoritative-versus-rendered vehicle headings after frames. An isolated synthetic save enables orders OFF; it is not a completed delivery. Traffic schedules/populations were not locked, and these are not physical-phone results.

| Heading consistency | Live Version 22 | Patched local build |
| --- | ---: | ---: |
| Vehicle pose observations | 113,673 | 113,638 |
| Heading errors above 0.25° | 47,893 | **0** |
| Bus errors / observations | 3,268 / 6,687 | **0 / 1,185** |
| Auto errors / observations | 7,836 / 19,719 | **0 / 30,900** |
| Maximum error | 179.854° | 0.00000171° |
| Observed FPS | 59.47 | 59.61 |
| p95 presented-frame interval | 19.0 ms | 19.1 ms |

Both observed windows had zero application errors. This establishes a substantial animation/heading regression even when FPS was near 60; frame rate alone missed the problem. It does not certify all physical-phone GPU/thermal performance or every city route.

The fixed bundle is `index-DQKWabtU.js`, SHA256 `62bbc83486f8491445b29079bb5521516c2535f1f873922d37767b5b684d493e`, source fingerprint `c743c97fa8221cfd7f2a39861061cafe91144d2980e85db531f665716866dd12`.

[Full comparison and scope](evidence/traffic-shaking-fix/comparison.json) · [Before failing regressions](evidence/traffic-shaking-fix/regression-before.log) · [After passing regressions](evidence/traffic-shaking-fix/regression-after.log) · [Full release check](evidence/traffic-shaking-fix/check.log).

Original screenshots and lossless compressed sample archives are preserved beside the comparison. Earlier Version 22 measurements remain historical evidence; this correction supersedes its moving-traffic visual acceptance.
