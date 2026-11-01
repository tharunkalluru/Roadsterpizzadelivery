# Independent final desktop soak — fe81

**PASS within scope:** more than 40 active minutes after baseline, bounded retained geometry/texture counters, sampled world loading, former-junction clearance and continuous recorded return travel. This is not total-memory/VRAM, presented-FPS, physical-phone or campaign acceptance.

The exact results, limitations and hashes are in [final-independent-audit.json](final-independent-audit.json). [Final export](final-export.json) records `campaign-qa-mvxahbjx`, started `2026-11-01T03:47:30.621Z`, build `fe8101e59186535fbe59cc16e742218af2409a625628f305943b404934a6d36a`. Safari used High, DPR1 and a 1264×543 drawing buffer, without `qaArt` overrides.

Total observer time is **2,574,706 ms active (42.9118 minutes)**. Subtracting the already supported **121,572 ms baseline** leaves **2,453,134 ms (40.88557 minutes)**, exceeding the 40-minute target by 53.134 seconds. Hidden, unfocused, loading, map, pause and blocking-dialog intervals are excluded. The clock is not based on elapsed wall time alone.

All six earlier exports are exact prefixes of the final resource history. Its **2,565 finite, ordered samples** have a largest active gap of 1.416 seconds. Loaded tiles stay 9–14 with no zero-tile samples; pending tiles stay 0–2. All 83 health polls returned 200 for their three sampled paths. This is not a trace of every asset request.

**Retained counters remain bounded on this run.** Post-baseline geometry ranges 639–1,354 and ends at 850, compared with 840 at baseline. The first 300 post-baseline seconds have median 925; the last 300 seconds have median 988, range 833–1,153. Counts rise and fall across scenes rather than showing sustained accumulation. Textures peak at 93 and remain at 88 throughout the last 300 seconds. These are object counts, not byte measurements of full CPU/process memory or GPU VRAM; Safari reports no JS heap values.

The 13-coach train retains `rail:1:12` rear support. Initial QA order preparation and one landing/relocation stage remain explicit. The only later recorded input is opening the map; there are no later recorded drive, flight or stage actions and no airborne resource sample after baseline. This is an assisted isolated scenario. Natural pickup, manual handoff and campaign completion are absent, and campaign acceptance flags remain false.

[The former-junction capture](02-thirteen-coach-junction-cleared.png) shows both 13-coach rakes beyond the former blocked section. [The orbit](04-orbit-keeps-car-and-coaches-visible.png) shows the car and train roofs; [the map](05-map-streets-and-railways.png) preserves street/railway alignment. [The final saved frame](08-final-same-coach-support.png) reads game 2546 seconds, 13/13 coaches, 49 source ways and the same rear-coach support. Its final 220 snapshots cover 55.174 seconds, moving 880.0 m with unchanged support, revision 2 and y 4.835. Snapshot history is bounded; it does not preserve every frame of all 40 minutes.

**Main-soak endpoint limitation:** the operator witnessed approach and natural reversal, but the retained files miss the approach/dwell. Image 06 actually reads 2244 seconds/34,718 m remaining and image 07 reads 2303 seconds/33,867 m; both are already returning. The checkpoint 5 tail is also entirely returning. No direction field or dwell duration is fabricated. The preserved checkpoint 5 and final tails show continuous return motion. A separate short native sequence with its own RunID is planned to preserve the complete transition; it is not part of this soak clock.

Raw callback cadence is **58.8494 callbacks/second**, histogram p50/p95/p99 **17.125/18.125/44.125 ms**, longest **518 ms**, with no eligible interval ≥1,000 ms. The 518 ms interval remains unexplained and unadjusted. Source review confirms exports/captures do not explicitly break cadence: prior diagnostic work can affect a later interval unless a normal gate or focus event breaks it. The report summary precedes its own later JSON/Blob work. Its contribution is unknown and has not been subtracted. These instrumented callback timings are **not GPU-completed presented FPS, device refresh, input latency, phone, thermal or battery evidence**.

Earlier candidates used 8/11 story coaches, a 1264×505 render area, different browser-context counts and different driving/flight coverage. This 13-coach/1264×543 run is not a controlled FPS A/B experiment. Planned High/Low delivery checks and the terminal supplement need separate evidence and RunIDs; this report does not accept them in advance.

Final export SHA-256: `09b7a8842ffe813b61211395053ce8e9cdfe6aedc5ec654513bd09d0889e13bc`.

Only this README and the independent audit JSON were written. No live UI, product source, main acceptance documents, tests, builds, Git or publication actions were performed by this audit. Earlier failed/stopped candidates remain preserved separately.
