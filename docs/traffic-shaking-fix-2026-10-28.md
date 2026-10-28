# Version 23: traffic shaking correction

Published to the existing public game URL on 2026-10-28. This corrects a moving-traffic regression introduced by Version 22's render interpolation. Restoring a quaternion changed a vehicle's Euler representation; the next yaw-only traffic update retained unintended half-turns and visibly flipped buses/autos. The fix preserves authoritative angles and order, sets full traffic orientations, handles pooled generations and uses the displayed pose for camera hiding.

All five new regression tests fail before the fix and pass afterward. All 103 behavioral tests, both TypeScript checks and the production build pass. The local night-driving check recorded zero inconsistent headings in 113,638 vehicle poses; the deployed Version 23 check recorded zero in 113,676, including buses and autos. Both used external visible keyboard controls with read-only diagnostics. No new completed delivery or physical-phone certification is claimed.

The public bundle's SHA256 matches the tested fixed bundle: `62bbc83486f8491445b29079bb5521516c2535f1f873922d37767b5b684d493e`. The updated game is https://hyderabad-pizza-picture-hall.blithe-okapi-0017.chatgpt.site/. Existing tabs must reload to receive the corrected JavaScript.

[Diagnosis and before/after evidence](../game/docs/performance/traffic-shaking-fix.md) · [Publication record](playtests/2026-10-28-traffic-shaking-fix/publication.json) · [Live verification](playtests/2026-10-28-traffic-shaking-fix/live-summary.json).
