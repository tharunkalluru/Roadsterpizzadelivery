# Independent bounded road-wheel contact review

**Scoped pass after the placement follow-up.** The unchanged actual-Player drive harness passes all 22 local road cases, and focused missing-road/layer/step/seam controls pass. The earlier eight contact failures and the initial placement defect remain preserved in their original evidence. This does not accept a final bank/XY road model or publish a release.

Production review: `src/game/road-wheel-contact.ts` intersects the actual YXZ wheel-up ray with finite road triangles. It accepts only reachable road quads within .3 m of the selected centre road level and at most .18 m local wheel travel; it rejects missing finite road, distant layers and excess travel. A seam re-query evaluates another finite quad rather than extending the old plane. Player applies only wheel-child local Y after ordinary road posture easing, and now also during `place()`. The physical root, steering, speed, grade-following, time and camera code are not changed. Failed/partial outputs are reset before they can be displayed.

## Unchanged drive gate

`docs/qa/evidence/main-expansion/reported-road-actual-player-after-wheel-suspension.json` records the held harness run after the update-time change and before the placement-only follow-up:

- 22/22 ordinary drives complete at 30/60 Hz; 24,446 updates and 269,539,488 actual visible mesh-vertex evaluations.
- Zero legacy .02 m slab-gate failures, zero additional 1 cm wheel-contact failures, no unexpected flight/rescue/relocation, zero changed bundle sources during the run.
- All recorded root matrices, positions, speeds, yaws, progress, input counts and other drive snapshots match the pre-edit baseline **exactly** across all 22 cases.
- Maximum wheel-bottom support gap improves from +18.496 mm to +9.901 mm; minimum from -12.779 mm to -0.009 mm. Minimum actual tyre support gap improves from -12.581 mm to -5.264 mm. Minimum non-tyre mesh clearance remains positive at +58.928 mm.
- The original two-road negative control still detects the documented real body/slab overlap in all 31 calibration frames. The legacy slab tolerance and old negative geometry were not altered.

The exact reported shoulder retains its observed missing-road wheel frames. Required road continuations retain finite wheel support. Final geometry still requires a new full harness run; the one-time placement patch below was checked separately as requested by Root.

## Focused controls and first placement

Reproduce the current focused review:

```sh
node docs/qa/evidence/main-expansion/road-wheel-contact-review.mjs --focused-only
```

`road-wheel-contact-placement-review.json` in that evidence directory records all eight controls passing: ordinary flat road, 10% longitudinal grade, missing front-left pavement, another lower layer, another upper layer, a real 20 cm step, travel beyond 18 cm, and a finite seam. Normal contact uses exactly four local support queries; the constructed seam requires six (two wheels each need the bounded second query). Rejection controls do not create fictitious wheel support.

The first version still reset `place()` wheels flat: a 6.5% synthetic ramp showed nominal contact errors of +/-91 mm until the first update. That failure is preserved in `road-wheel-contact-independent-review.json`. Root then added the same bounded visual contact to `place()`. Current placement and first-update gaps are within about 0.000071 mm of the independently emitted support plane; the first-frame tyre/body checks pass.

For both revisions, the reviewer bundles an exact helper-disabled Player source. Removing only the reviewed import/update/placement additions must SHA-256 match the preserved pre-edit Player source (`6e69d1c6f6b1bae6b6a87cb2633ba12fc638f126e324d00cf0424826662d7bfe`) before any comparison runs. Current placed root and subsequent 180/360 actual frames at 30/60 Hz, including throttle, braking, steering, flight and descent, are bit-identical to that exact reference. Wheel visuals are the intended difference. Source identities for the update-time and placement revisions are recorded separately; the helper itself is unchanged between them.

## Paired CPU measurement

The original `road-wheel-contact-independent-review.json` retains the update-time source identity and all timing samples. The placement-only change does not modify the timed update path, so timing was not repeated. The reproducible runner without `--focused-only` performs the CPU comparison.

Each mode uses ten order-balanced paired samples after discarded warm pairs, the same actual packed/emitted road fixture and real Player constructor. Stationary samples time 2,000 updates per side; forward samples time ten 100-update chunks per side. Setup, placement, warming, emission/oracle scans and comparisons are outside each timed loop. Only actual `Player.update` calls are timed.

| Mode | Helper on median | Exact pre-edit reference median | Median paired added cost | Paired added-cost range |
| --- | ---: | ---: | ---: | ---: |
| Stationary grounded road | 82.031 us/update | 49.172 us/update | +33.012 us/update | +30.725..43.379 us/update |
| Forward grounded road | 82.799 us/update | 49.227 us/update | +33.440 us/update | +31.503..35.595 us/update |

These are local warmed Node CPU measurements per update, not FPS or device performance. The run demonstrates bounded per-Player overhead and the expected one support query per wheel in ordinary contact; it does not change frame cadence or simulation delta time.

Only test/evidence files were written by this reviewer. `npm run typecheck` was run after the focused follow-up; its result is recorded in the parent handoff. Production edits belong to Root. The final combined road/node transport model remains a separate review.
