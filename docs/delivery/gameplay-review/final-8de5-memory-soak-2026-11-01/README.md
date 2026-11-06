# Independent stopped-candidate audit — 8de5

**Stopped early and superseded. No 40-minute, final memory, campaign or release acceptance is granted.** The full findings and evidence hashes are in [candidate-independent-audit.json](candidate-independent-audit.json).

[Stopped export](stopped-candidate-export.json) records run `campaign-qa-mvx9gc5j`, started `2026-11-01T03:18:45.127Z`, build `8de505c1a3f4d736e56359df1769cd831a99aeb6d766d69b67c91c429de7d5aa`. Safari used High, DPR1 and a 1264×505 drawing buffer without a `qaArt` override.

The observer recorded **1,242,142 ms active (20.702 minutes)**. Subtracting the supported 111,463 ms baseline leaves **1,130,679 ms (18.845 minutes)**. The required 2,511,463 ms total for 40 post-baseline minutes was missed by **1,269,321 ms (21.155 minutes)**. Active totals exclude hidden, unfocused, loading, map, pause and blocking-dialog intervals.

The [revision reason](candidate-revision-reason.json) records a source-review finding: disposing the private sky material after each PMREM refresh could drop its last shader-program reference and cause relinking. The parent chose to retain one private capture scene/sky/material per Engine and copy existing uniform values. This report verifies the run/reason identity and captured data; it does not independently re-prove that source diagnosis or accept the next implementation. **The observed 595 ms longest interval is not causally attributed to that risk.** A fresh frozen runtime and final run are still required.

All four earlier exports are exact prefixes of the stopped resource history. Its **1,237 finite, ordered samples** have a maximum active gap of 1.199 seconds. Loaded tiles remain 9–14, pending tiles 0–2, and no zero-tile sample occurs. All 38 health polls returned 200 for their sampled paths; this is not a continuous trace of every asset request.

Geometry is **1,160 at stop, with a 1,475 peak**, compared with 869 at the supported baseline. Successive post-baseline window medians are 944, 1,078, 1,021 and 1,126. Counts rise and fall with streamed scenes rather than repeating the earlier baseline's large sustained growth during this observed period. That is bounded-looking interim evidence; the shortened run does not establish a final plateau or full-run memory acceptance. Texture counts span 40–91, ending at 89. Safari exposes no JS heap values, and these counts do not measure full GPU/process/device memory.

The train legitimately adopted an existing **11-coach** formation and retained `rail:1:10` rear-coach contact. Initial QA preparation and landing/relocation assistance remain explicit; there are no new assistance records or recorded drive/flight inputs after setup. No resource sample after baseline is airborne. All 240 retained tail snapshots preserve the same support, placement revision 2 and y 4.835, moving 926.7 m over 60.78 seconds. Snapshot retention is bounded; it cannot independently prove frame-level support across the whole session. Natural pickup, manual handoff and campaign completion are absent.

The [junction capture](02-both-trains-clear-junction.png) confirms both trains moved beyond the former blocked section. The [night city capture](03-city-centre-night-roof-support.png) preserves the same rear-coach readout and visible scenery; the [orbit capture](04-camera-orbit-keeps-car-and-coaches.png) shows the car and train roofs. The earlier 87e9 run used eight story coaches and mixed driving/flight with reboarding. This 11-coach run is a comparable scenario, **not a controlled FPS A/B workload**.

Observed callback cadence is 58.0948 callbacks/second, histogram p50/p95/p99 17.125/20.125/49.125 ms, longest 595 ms, with no eligible interval reaching 1,000 ms. These are callbacks after advancing simulation, **not presented FPS, GPU completion, input latency, display refresh, phone performance, thermal or battery evidence**. Touch layout does not establish true touch or physical hardware.

Stopped export SHA-256: `b60ed8ad2ae37aac03ff029b09e99cd681737ad3efcf7b450fbe360f2b04eabc`.

Only this README and the independent audit JSON were written. No UI, product source, main acceptance documents, tests, builds, Git or publication actions were performed by this audit. Preserve this candidate record while the refined runtime receives fresh validation.
