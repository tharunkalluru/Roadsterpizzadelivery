# Independent baseline audit — 87e9 mixed session

**Baseline duration and rail mechanics are established; memory acceptance fails.** This is an immutable problem-characterization record, not final release acceptance.

[Final export](final-baseline-export.json) records run `campaign-qa-mvx7u2w8`, started `2026-11-01T02:33:27.080Z`, build `87e9f21b86ac8d14a27acfcdee7118d3b689741c98ba2c132a3f81a8ad98dbd6`. Safari High used a 1264×505 drawing buffer at DPR1, with no `qaArt` override. The exact results, scope and hashes are in [baseline-independent-audit.json](baseline-independent-audit.json).

The final observer total is **2,477,456 ms active (41.291 minutes)**. Subtracting the already supported **43,250 ms baseline** leaves **2,434,206 ms (40.5701 minutes)**. This exceeds 40 active minutes after baseline by 34.206 seconds. Map, pause, hidden, unfocused, loading and blocking-dialog intervals are excluded by the observer.

This is a **mixed run of normal driving/flight and assisted scene setup**. The recorder preserves QA order preparation, initial rear-coach landing assistance, and a second landing assistance/relocation around game 1182 seconds. Normal movement reached coach 6 from 7; a later forward attempt on a curve fell off. Normal Q flight/chase and missed landing followed before the explicit reboard. It does not establish 40 uninterrupted minutes of train support, a natural pickup, completed delivery, unassisted campaign, true touch, or physical-phone performance. Campaign acceptance flags remain false.

All five earlier exports are exact prefixes of the final resource timeline. The 2,471 resource samples are finite and strictly ordered; the largest active gap is 1.085 seconds. Loaded tiles remain 9–14, pending tiles 0–2, and no zero-tile sample occurs. The stopped health log contains 83 polls (82 after this run began), all sampled requests returning 200. This samples three paths; it is not a continuous trace of every asset request.

**Retained geometry grows materially:** 402 at start, 11,297 at end, 11,440 peak. The geometry median during active seconds 60–300 is 1,593; the median during the last 300 seconds is 11,215 while tile counts remain bounded. Different streamed areas and flight coverage prevent a leak-rate estimate from matching views, but these data do not support stable bounded memory use. Safari reports no JS heap values. Cleanup work reported by the parent agent is separate and is not validated by this baseline.

Callback cadence is 58.8689 callbacks/second, with histogram p50/p95/p99 of 17.125/18.125/33.125 ms, longest 188 ms and no eligible interval ≥1,000 ms. These are callbacks after advancing simulation, **not presented FPS, GPU completion, input latency, device refresh, phone, thermal or battery evidence**. Submitted render counts also do not measure GPU completion.

Native saved evidence establishes these bounded rail results:

- [Former junction cleared](03-earlier-junction-cleared.png): the saved UI reads game 150 seconds, story 8/8 coaches on 49 ways with 32,876 m remaining, and ordinary 10/10 on 35 ways with 9,005 m remaining. Both moved beyond the former blocked section. Other rake-size coverage belongs to separate regression tests.
- [Natural terminal reversal](13-natural-terminal-reversal-same-coach.png): the checkpoint 4 snapshots include approach, an observed 2.267-second stationary plateau, then movement back. All 229 snapshots preserve `rail:story:1:7`, placement revision 3, y 4.835 and no flight/descent/jump. The largest sampled step is 4.688 m over 0.293 seconds, consistent with the train's 16 m/s motion. Direction is inferred from positions and native readouts; no train-direction field is exported. The saved approach image actually reads 2181 seconds/395 m; its filename preserves the earlier operator estimate. The saved return image reads 2241 seconds/34,300 m.
- [Final return journey](14-final-baseline-return-journey.png): 8/8 story coaches on 49 ways, coach 7 support retained. The final 218 snapshots cover 54.482 seconds and move 871.7 m with unchanged support, revision and height. Snapshot retention is bounded; it cannot independently prove 40-minute continuous contact.

The older `campaign-qa-mvx6tjbi` server-outage run, the approximately 02:27 wrong-train setup and the stalled 7344 run are excluded. Final export SHA-256: `860791e5a522ba2d191a6783ec8e5a0b9d1923f886d4c27a13c17980da417a9d`.

Only this README and the independent audit JSON were written by this audit. No UI, product source, main acceptance documents, tests, builds, Git or publication actions were performed. Preserve this baseline; review the cleanup, freeze a new runtime, and obtain matched resource comparisons plus fresh validation before memory acceptance.
