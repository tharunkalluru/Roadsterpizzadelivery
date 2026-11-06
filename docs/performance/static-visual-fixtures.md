# Matched static visual fixtures

**Latest result:** the final `index--RcFGvLW.js` rerun restored the roof/parapet detail and produced pixel-identical full images to fresh baseline in both day and night. See the final verification section below. Earlier captures and findings are retained as evidence of the issue and fix.

Captured 2026-10-28 in a new **headless-only** Playwright CLI browser, Chrome 156.0.8078.73. The launch process included `--headless --no-startup-window`; no headed window, keyboard input, live game control, or root-session operation was used. Preparation was sequential. The owned browser was closed after comparison.

These are synthetic static views, not gameplay, delivery completion, motion/LOD-transition acceptance or FPS measurements. Source files were not changed.

## Fixture definition

Both builds used the existing public still path, viewport/internal image size 1280 × 592, camera `(30,6,40)` looking at `(0,2,-60)`, radius 650, mood day or night:

`/?still=1&cam=30,6,40,0,2,-60&w=1280&h=592&r=650&mood=day`

Baseline was untouched Version 21 at port 4201, bundle `assets/index-Deiow6w-.js`. Candidate was frozen port 4199, bundle `assets/index-DFaii6VR.js`. Both reached `window.__done=true` with the loading screen removed. No hidden game state was changed. Playwright waited for the public still-completion marker and captured original page screenshots.

| Capture | Preparation/capture UTC | Draw calls / triangles at final frame |
| --- | --- | --- |
| Baseline day | 08:27:25–08:27:33 | 249 / 687,803 |
| Candidate day | 08:27:57–08:28:02 | 272 / 587,691 |
| Baseline night | 08:28:42–08:28:47 | 251 / 687,457 |
| Candidate night | 08:29:02–08:29:07 | 275 / 594,379 |

These draw statistics describe these frames only. Candidate draw calls increased while triangles decreased; neither establishes an FPS change. GPU/CPU work from this isolated browser may have overlapped the root test during the listed preparation intervals and must be labeled as host contention.

Originals and full capture metadata: `output/playwright/static-fixtures/{baseline-day,candidate-day,baseline-night,candidate-night}.png`; corresponding `*-cli.txt`; `comparison-metrics.json`.

## Visual findings

- The large nearby right-hand facade retains recognizable shape, window geometry and lit-window pattern at night. The left road, divider/curbs, flyover pillar and nearby pedestrians remain visible.
- **The pink middle-building roof/parapet strips are visibly absent or altered in the candidate in both day and night.** Changes also affect the adjoining pale-green roof silhouette and a small amount of ground shadow. This is a visible difference, so these fixtures do not support a pixel-identical or unchanged-near-geometry claim. The world agent was sent exact originals and the affected rectangle for investigation.
- No clearly readable shop-name text or bus number appears in this selected camera. Their visual fidelity remains unassessed by this fixture.
- Candidate captures had no console errors/page exceptions. Baseline day requested missing `/favicon.ico` (404); its 3D view still completed. This unrelated baseline icon request was recorded and not treated as a candidate rendering failure.

## Pixel measurements

RGB absolute differences were computed on the original PNGs using Pillow/NumPy. “Changed >5” means at least one RGB channel differs by more than 5 on a 0–255 scale. MAE is the mean absolute channel difference. These metrics do not measure perceived quality or establish that the geometry is correct.

| Region, rectangle x1,y1,x2,y2 | Day MAE / changed >5 | Night MAE / changed >5 |
| --- | --- | --- |
| Full image, 0,0,1280,592 | 1.360 / 5.002% | 0.794 / 2.994% |
| Near right facade, 780,0,1280,545 | 0.829 / 3.854% | 0.018 / 0.098% |
| Left road and curbs, 0,318,327,392 | 0.262 / 0.748% | 0.514 / 2.430% |
| Middle roof geometry, 322,169,780,279 | 10.139 / 32.707% | 7.778 / 25.226% |
| Foreground ground/shadows, 0,400,780,592 | 0.697 / 1.794% | 1.055 / 4.798% |

Full-image PSNR was 29.79 dB day and 32.64 dB night. Exact pixel equality was 81.78% day and 96.52% night. These are descriptive values, not acceptance thresholds.

## Residency limitation

The baseline day had seven active tiles; candidate day had four active, 53.5 MB staged and one reserved pending load at `__done`. Night baseline and candidate each had five active tiles, with no candidate staged bytes, but pending reservations remained. The still path stops its normal loop, so this is not a guaranteed identical fully resident city state. It must not be used to infer a universal visual regression from distant omissions. However, the same near roof/parapet difference was plainly visible in both day and night and warrants source/region inspection. No forced tile installation, hidden rendering step or source edit was used to normalize it.


## Final verification after cosmetic visibility and warmup fix

A new headless-only browser `roadster-static-fixtures-final` repeated the exact public still URLs, same 1280 × 592 viewport, camera and radius, against fresh baseline captures. Each capture waited for `__done` and a further 500 ms of settling. This browser was closed at **08:42:49 UTC** and never opened a headed window or received game input. No source files were changed by this verification.

Candidate: **`assets/index--RcFGvLW.js`**. Baseline remained `assets/index-Deiow6w-.js`.

| Capture | Start → ready → captured UTC | Active tiles | Renderer counter at capture |
| --- | --- | --- | --- |
| Baseline day | 08:41:15.539 → 08:41:20.487 → 08:41:21.048 | 7 | frame 64; 249 calls; 687,803 triangles |
| Candidate day | 08:41:36.483 → 08:41:41.269 → 08:41:41.819 | 7 | frame 1334; 951 calls; 1,249,657 triangles |
| Baseline night | 08:41:47.793 → 08:41:52.331 → 08:41:52.863 | 8 | frame 64; 251 calls; 687,457 triangles |
| Candidate night | 08:42:18.496 → 08:42:23.018 → 08:42:23.556 | 7 | frame 1334; 960 calls; 1,258,643 triangles |

The higher candidate renderer counters are recorded without interpreting them as a live-game FPS result. These frames use the static path and its preparation/warmup; no gameplay performance comparison is claimed.

**Result:** baseline and candidate are exactly equal across every RGB pixel in both moods. Full-image MAE is 0, maximum channel difference is 0, changed pixels are 0%, exact pixel equality is 100%. The roof ROI, facade ROI, road/curb ROI and foreground ROI all also have zero difference. PNG SHA256 independently matches within each pair:

- Day: `7c1446da359c7322e1919f11ce60730644022678c68fb45106e3ef8775375efe`
- Night: `a44689618a8a121ac17a3b732bbdc76a3c7be7437a2ac7a7970699330e5ff969`

Fresh originals are preserved separately in `output/playwright/static-fixtures/final/{baseline-day,candidate-day,baseline-night,candidate-night}.png`. Their capture outputs and complete metrics are in the same folder, including `comparison-metrics.json`. Earlier screenshots were not overwritten.

Day residency matched at seven active tiles. Night baseline had eight versus candidate seven; candidate had no staged/pending work at either capture. Pixel equality confirms that this difference did not affect these captured visible views; it does not prove identical full-city residency. Candidate had zero admission failures and no console errors/page exceptions. The baseline day missing favicon remains unrelated.

This resolves the earlier visible roof/parapet omission **for these two bounded High static views**. It does not establish all-city fidelity, readable shop-name/bus-number fidelity, moving LOD continuity, physical-device quality or FPS. Those require their respective gameplay/device evidence.
