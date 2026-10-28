# Roadster mobile performance release

This release brings the tested standalone delivery game and mobile-performance work into GitHub main. GitHub previously contained the Version 12 application; the hosted Site had advanced to Version 21. The release imports the later Site fixes and the optimized application together, preserving the repository's pipeline, tools, original review pages and existing evidence.

The source snapshot is `7a2596a9f872520d8a1a1024e14426f01349469d` from the Site checkout. The optimized runtime source is `200af62af70dc4b682d601e11ff51db04d2f67d9`; later commits add evidence only. The release's `game/src`, `game/worker` and every public asset match that tested snapshot byte for byte. The obsolete `cinema.ts` and `cinema-front.ts` modules are removed to match the standalone delivery game.

The release includes bounded city streaming and readiness protection, cooperative route searches, nearby collision queries, traffic/resource reuse, minimap/sign caching, fixed simulation with interpolated presentation, 60/90/120 FPS requests with sustainable pacing, optional adaptive scene resolution, and compatible Roadster batching. It retains the current Roadster, city/shopfront data, mobile controls, opaque Samsung-safe panels, jump behavior, and road/flight speed limits.

## Validation

- Client and Worker TypeScript checks pass.
- All 98 behavioral tests pass; the filtered six spatial and 23 simulation tests also pass.
- The production build passes. Its `index-Dtm1sKiN.js` is byte-identical to the bundle used for the final performance comparison. Build fingerprint: `d178c429fa808a6845ded32aef78011288d4d03df898c80b3d9455fe4996fe3e`.
- [Release check log](playtests/2026-10-28-main-release-check.log).
- [Previous/new browser comparison and original evidence](../game/docs/performance/version-comparison.md).

Three stationary RTC X Roads pairs under calibrated 4.04× desktop CPU slowdown measured median FPS of 52.44 before and 59.76 after, with median Game-callback CPU of 17.8 ms and 8.4 ms. Three High static-view pairs have byte-identical screenshots, fewer draw calls and unchanged 60 FPS. These do not certify physical-phone performance. Long tasks remain; the earlier moving-delivery p95 miss and real-device testing remain open.

The production target is the existing public Site at https://hyderabad-pizza-picture-hall.blithe-okapi-0017.chatgpt.site/. Publication preserves its audience, logical database binding and existing data. The live release is confirmed separately by the Sites deployment result and the served build fingerprint.

## Confirmed publication

**Version 22** was published successfully on 2026-10-28 at the same URL. GitHub's application release is `c194a728f88786c7e76c23a499e437f6b453e8be`; Site source is `496eee3fe82576e960c0c15f201a67b05c84d3b8`. A fresh browser fetched `index-Dtm1sKiN.js` with SHA256 `4fc6cd25ed8e79334ec7dca62a99030927c538d29e4625418aa00a947235f61d`, exactly matching the tested local bundle. The title, area picker, RTC X Roads loading, order acceptance, acceleration, braking/reverse and pause were exercised on the live release. Held input was released and zero application errors were recorded during the controls check. This short smoke does not claim a new completed delivery or physical-phone performance result.

[Deployment provenance and saved version](playtests/2026-10-28-v22/deployment.json) · [Original live controls result](playtests/2026-10-28-v22/live-controls.json) · [Ready scene screenshot](playtests/2026-10-28-v22/live-ready.png).
