# Actual Player contact baseline on a 2.5% planar bank

Measured 2026-11-03 before any bank implementation. Production files and UI were not changed. This diagnoses current contact behavior; it does not approve a road candidate.

Reusable fixture: `tests/fixtures/actual-player.ts` constructs the **production Player**, including its actual Roadster meshes/materials, kickflip parent, wheels, suspension and production update method. Only canvas drawing is stubbed during construction; the previous `document` property is restored. No physics, pose or animation method is replaced. `dispose()` releases the fixture's geometry/materials.

Reproduce from the repository root:

```sh
node docs/qa/evidence/main-expansion/player-bank-contact-probe.mjs docs/qa/evidence/main-expansion/player-bank-contact-rerun.json
```

The preserved result is `docs/qa/evidence/main-expansion/player-bank-contact-baseline.json`. It records source SHA-256 hashes, real group matrices, each wheel's signed gaps, all snapshots and flat-baseline deltas. The runner bundles to a temporary directory and removes the bundle afterward.

The synthetic surface is `y = 10 + bank*x`, bank 0/+.025/-.025. Its broad finite 200 m by 400 m footprint permits the 45/90 degree heading controls without leaving the plane; it is a diagnostic fixture, not proposed city geometry. `Surface.roadQuad` is paired with actual `Batch.quad` -> `Batch.geometry()` Float32 asphalt triangles. An independent barycentric oracle reads those emitted positions. Actual tyre mesh vertices and nominal wheel-bottom points use their **actual `matrixWorld` after Player.update**, including all parent transforms and wheel spin; no pose is reconstructed.

54 scenarios cover stationary/normal forward/normal reverse, 30/60 Hz, headings 0/45/90 degrees, and all three bank values. Each runs 3 seconds stationary settling plus 4 seconds of its motion: 17,010 actual Player frames, zero off-road frames. Tyres are measured every update; the full model's 11,016 visible mesh vertices are scanned at placement, settle .25/.5/1/3 seconds and motion 1/2/4 seconds (432 complete-body snapshots). Full-body minima below are observed snapshot minima, not a continuous collision proof.

Signed clearance is vertical; **negative means penetration**. The renderer's existing .04 m asphalt lift is reported separately: support-relative gap = emitted-asphalt gap + 40 mm. The lift is present in the flat control too and is not credited as a new banking defect.

| Pure cross-bank, heading 0 degrees | Flat settled | +2.5% bank settled, both frame rates |
| --- | ---: | ---: |
| Actual displayed road roll | 0 | **0**, unchanged after settling |
| Left nominal wheel-bottom support gap, front/rear | ~0 mm | +23.625 mm |
| Right nominal wheel-bottom support gap, front/rear | ~0 mm | **-23.625 mm** |
| Left actual tyre mesh minimum support gap | ~0 mm | +20.563 mm |
| Right actual tyre mesh minimum support gap | ~0 mm | **-26.687 mm** |
| Full visible model minimum support gap | ~0 mm | **-26.687 mm**, at tyre |
| Non-wheel body minimum support clearance | 165.000 mm | 145.375 mm |
| Non-wheel body minimum emitted-asphalt clearance | 125.000 mm | 105.375 mm |

The -2.5% case swaps left/right. The real tread width adds ~3.063 mm penetration beyond the high-side nominal wheel-bottom point. Banking reduces body clearance by 19.625 mm but does not bring the non-wheel body into the planar road.

| Pure +2.5% cross-bank motion | Hz | Actual high-side tyre support-gap range over the 4 second motion |
| --- | ---: | ---: |
| Stationary | 30 / 60 | -26.687 mm |
| Forward, ending at 14.4 m/s | 30 | -26.687 to -25.026 mm |
| Forward, ending at 14.4 m/s | 60 | -26.687 to -24.964 mm |
| Reverse, ending at -6 m/s | 30 | -26.687 to -24.970 mm |
| Reverse, ending at -6 m/s | 60 | -26.687 to -24.959 mm |

Wheel spin changes the lowest polygon vertex slightly; flat controls show the corresponding tread-polygon variation. The final bank delta from the matched flat tyre mesh is -26.6875 mm for every heading-0 motion/rate. Nominal wheel-bottom gaps stay +/-23.625 mm. The non-wheel body stays at 145.375 mm support clearance in these cases. On the emitted asphalt the stationary high-side tyre gap is -66.687 mm, comprising the existing -40 mm film offset plus the -26.687 mm bank delta.

Heading controls isolate the missing roll: at 45 degrees, the production nose/tail pitch settles to +/-0.017676 rad but roll remains 0; stationary high-side tyre penetration is 18.957 mm. At 90 degrees the bank becomes a pure longitudinal grade: production pitch reaches +/-0.024995 rad and stationary tyre penetration is only 0.172 mm, from the current centre-height/tilted-origin geometry. The full captured placement/settling transforms remain in the JSON.

Minimum future contact work: resolve road roll as well as pitch from reachable finite road triangles, then correct origin height and actual wheel contact after the existing pose easing and steering lean. A centre-height adjustment alone cannot remove simultaneous left-side floating and right-side penetration. Preserve grounded-layer selection, handling, frame timing, camera and flight/jump behavior. The planar result does not establish transition suspension, merged-surface feasibility, source-city clearance or real-device acceptance.

Validation: the reproducible probe completed all 54 scenarios and `npm run typecheck` passed with the new fixture. No production implementation or thresholds were changed.
