# Independent saved terminal/return supplement — fe81

**Verified within scope:** a saved position near the route endpoint, followed by a consistent returning train sequence. **Sustained dwell and an uninterrupted stop/turnaround are not proven.**

All 26 native images were personally reviewed. Exact readouts and 28 evidence hashes are in [independent-terminal-hash-audit.json](independent-terminal-hash-audit.json). The files have `.png` names but contain **JPEG/JFIF bytes**; originals are preserved without renaming or conversion. [The export](evidence-export.json) identifies separate run `campaign-qa-mvxc3rms`, started `2026-11-01T04:32:57.508Z`, on frozen build `fe8101e59186535fbe59cc16e742218af2409a625628f305943b404934a6d36a`. Safari High used DPR1 and a 1264×543 drawing buffer, without `qaArt`.

[Frame 00](frame-00.png) reads game 58 seconds and **6 m to route end**, with 13/13 story coaches, 49 source ways, support `rail:1:12` and car y 4.83. This establishes near-terminal position, not an exact zero-distance stop. The 0 km/h HUD is the car's own speed; it does not establish train velocity.

There is an explicit **approximately 34.14-second gap before the capture loop**. That estimate compares frame 00's observed file-write time `04:33:58.296373Z` with the [timeline](native-frame-timeline.json) loop start `04:34:32.437Z`; file-write time is not an exact presentation timestamp. The first loop image follows another 1.594 seconds. Rounded game readouts go from 58 seconds in frame 00 to 94 seconds in frame 01, about 36 seconds between saved views. Stop/dwell/turnaround falls inside this missing interval and cannot be measured from these files.

[Frames 01](frame-01.png) through [25](frame-25.png) span a reported 37.448 seconds, with capture spacing 1.549–1.592 seconds. Native readouts progress from game 94 to 131 seconds, with return distance **34,589 → 33,992 m**. All preserve 13/13 coaches, 49 source ways, rear-coach support and y 4.83. Route, scenery and camera progress consistently. This supports sampled continuous return travel; it is not frame-by-frame video or proof against a discontinuity inside the earlier gap.

The export's 208 retained snapshots are later, at game 188–240 seconds. They preserve `rail:1:12`, placement revision 2 and y 4.835, with no flight/descent/jump, while moving 836.8 m. They corroborate later same-coach travel and do not fill the transition gap. Order preparation and one landing/relocation remain explicit assistance. Natural pickup, manual handoff and campaign completion are absent.

This is a separate short run. Its 241,367 ms active total is **not appended** to the [40-minute soak](../final-fe81-reuse-soak-2026-11-01/README.md). Neither image sampling nor this export is accepted as presented FPS, GPU completion, display refresh, input latency, total memory/VRAM, physical-phone, thermal or battery evidence. Prior export/capture work is not explicitly excluded by the cadence observer and may affect later intervals.

Export SHA-256: `5de60995a367927127828bd57127e99698177a000b3ccebc337bb5ae06685e3a`.

Only this README and hash-audit JSON were written. No source, UI, build, test, Git or publication actions were performed by this review.
