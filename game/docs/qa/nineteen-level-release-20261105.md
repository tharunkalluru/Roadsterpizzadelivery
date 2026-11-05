# Nineteen-level campaign expansion

Source branch: `codex/campaign-levels-15-19-20261105`, based on the shipped fourteen-scene source `7c9a9efe8826e49fefcd5e517abaa5e50869ae1b`. The first fourteen level IDs and earned progress are preserved. The count comes from content data. The restaurant opening now follows level nineteen.

| Level | Implemented scene | Completion |
| --- | --- | --- |
| 15 | Chennakesava Reddy Balayya inside Q by Tonique, Film Nagar, with an authored phone and Mansion House bottle | Grounded, stationary arrival; fixed subtitles; walk to the doorway; receive, open and eat pizza |
| 16 | Shankar Dada MBBS in an Arts College corridor at Osmania University, with stethoscope and hand-held X-ray | Grounded, stationary arrival; fixed subtitles; receive, open and eat pizza |
| 17 | Athadu Mahesh at a telephone booth inside the mapped Prasads lobby | Fixed subtitles; visible carton placement on the actual side steps; Mahesh remains in the booth |
| 18 | Raja driving an actual traffic auto, with the duplicate generic driver removed from that instance only | Right-side grounded speed match; both vehicles move; actual handoff and supported dashboard carton; no eating while driving |
| 19 | Indu at the right window of an actual RTC bus in the left lane | Grounded, behind-right speed match; scarf lands and stays on the windshield; wave and fixed subtitles; car overtakes with pizza retained; no handoff |

Calls and voiced dialogue remain deferred. The supplied scripts are automatic subtitles. The player retains the existing jump-grab pickup. Scenes hold until the actual Next button is selected; the next loading transition places the player on a mapped road near the following destination.

## Boundaries and accuracy

- Q by Tonique's selected Film Nagar address is verified from the retailer. Its frontage and shelving are an authored interpretation, not a surveyed reproduction.
- Osmania University uses its real campus boundary, mapped roads/building footprints, source-bound academic identities, and researched Arts College and library architecture. Some campus facades remain approximations. The interior corridor bay arrangement is informed by published photographs, not a measured interior survey. It is not Osmania Medical College.
- Prasads uses its mapped concave footprint. The interior film telephone booth is an authored scene adaptation, not a claim that the booth currently exists there.
- The independent reviewer compared exact compact model views and actual scenes. Rejected generated sheets, elbow gaps, oversized elbow transitions and faulty hand/prop placements were not registered for release. The five public appearances and their SHA256 values are recorded in `src/delivery/art/character-assets.json` and the review records.
- Indu's turned head requires a native-picked, explicitly tagged head-local lip annotation. The same physical bounds, actual triangle, exact source SHA and sparse-mask verification apply. The preceding twenty-one annotations are unchanged.

## Runtime changes

New stationary venues share a module. New moving scenes lease a real NPC, keep its identity and route, and recycle an unavailable pre-entry carrier. They do not create a second visible copy. The normal traffic tick remains single and in its existing order. A narrow post-traffic carry keeps new cinematic actors and the Roadster in the same rendered traffic frame. Ordinary driving, flight, jump and earlier scene timing are retained.

Capture now hides the driving HUD synchronously, fixing an independently observed one-frame control flash. Native touch pickup, flight, landing and Next were exercised on desktop touch emulation; this is not physical-phone or mobile-FPS evidence. Night fixtures reuse existing pooled light slots. No resolution reduction or additional dynamic-light pool was introduced.

## Evidence and verification

- Level 15: real one-finger GO/BRAKE after a documented mapped-road starting position; grounded capture, continuous night speech/meal, held view and actual Next. The clean later run also sampled twenty captured frames with no driving HUD visible.
- Level 16: the initial position 4.5 metres behind an existing marked auto was assisted. Thereafter, actual GO/Jump input collected the order, native flight controls covered roughly 1.4 km, manual landing entered the marker, the automatic delivery/meal completed, and actual Next returned to a road about 1.5 km from Prasads. The raw observer incorrectly attributes the initial placement to the preceding completed attempt; the retained sidecar explicitly discloses it. This is not an unassisted campaign claim.
- Independent night 16/17 exports have healthy observers, no story-control violations, completed scene facts and actual Next/loading/road-ready evidence. Earlier exports showing the control flash are retained as pre-fix diagnostics.
- Raja's independent night scene shows readable cabin lighting, a supported carton above the side panel and continuing movement. A separate 240-native-frame sample records 26.69 m of actual carrier movement and zero relative pose error; it is host-browser evidence, not phone performance.
- Final independent level 19 replay observed the same bus travel about 186 m, the actual right-side pass finish 12.5 m ahead, windshield scarf retention, retained pizza, and actual Next/restaurant opening. Its raw observer row has no missing physical/visual facts or control violations. The unchanged raw report and hashes are retained in `docs/qa/level19-independent-night-campaign-evidence-20261105.json.gz`. These assisted scene starts are not unassisted full-campaign or physical-device acceptance.

The legacy suite has a pre-existing manifest-byte mismatch: `expressway-regressions.mjs` expects 705238 bytes for an unchanged packed map tile whose actual size is 697698. It was reproduced before this expansion. The other thirty-seven portable legacy suites passed. No unrelated road-data experiment is included to hide this discrepancy.

## Release completion

Implementation and all five scoped scene reviews are complete. The frozen game source passed 1,242 runtime regression tests (zero failures). The later development-only scarf-observer coordinate correction passed all 61 focused story-QA tests, including correct translated/rotated car attachment and rejection of an offset scarf. TypeScript and Worker checks pass, as do the 22-appearance gate and existing-road-profile audit.

The packaged preflight booted and exercised native desktop driving, Space braking, clickable flight and Jump, Q landing, map and pause. It reported nineteen levels and zero browser errors. With real browser touch emulation held active, portrait blocked play and landscape restored it; actual GO/BRAKE touch input accelerated and stopped the car. No physical phone was used.

All five packaged GLBs returned HTTP 200 with the expected binary MIME type and exact approved SHA256; all five portraits returned 200. The preflight expanded package is 263,033,422 bytes, under the 268,435,456-byte host limit. Its uncommitted source marker is explicitly a preflight; only a clean committed rebuild is eligible for publication. The deployed `build-info.json` binds the final source commit and fingerprint. Publication receipts are retained outside the source tree, so this report does not invent a future deployment result.
