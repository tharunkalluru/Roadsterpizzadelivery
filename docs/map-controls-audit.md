# Map control audit — 2026-10-23

Based on main `14671a5`, with fixes on `codex/shopfronts-map-roadster`.

| ID | Finding | Resolution and evidence |
| --- | --- | --- |
| M01 | Close map during “Deliver from here” only cancelled the picker, leaving the map open. | Close always dismisses the map; Cancel returns to the overview. Both lifecycle paths have regression checks. Chrome confirmed Close removes the map and returns to driving. |
| M02 | Map picker controls appeared in ordinary overview despite `hidden`, because their explicit CSS display overrode it. | Scoped hidden styling restores the intended visibility. Chrome overview exposes only map/zoom/location controls. |
| M03 | Escape/M were ignored in initial area selection, while repeated map keys and driving keys leaked into gameplay in other map modes. | Map receives keys before area/gameplay handlers; close toggles ignore repeats, driving actions stay suppressed. Chrome confirmed first-run map Escape returns to the area picker. |
| M04 | Opening the map could retain held driving or queued flight input. | Reset inputs on map opening. Keyboard activation of the minimap also handles Enter/Space without requesting flight. |
| M05 | A failed map download permanently cached a rejected promise and kept showing a loading message. | Clear failed request/loading state and show a retry explanation; reopening retries. Regression verifies second load succeeds. |
| M06 | Closing the map while a pointer was captured could retain drag/pinch state for the next opening. | Closing releases capture and clears pointer/pinch state. Regression passed. |
| M08 | Space on focused map buttons was suppressed while blocking gameplay flight. | Keyboard button activation remains native; Space outside controls is consumed. Regression covers both cases. |
| M07 | Escape closed the pause overlay without clearing pause. | Resume simulation and reset the clock on dismissal. Chrome confirmed time advanced and driving reached 38 km/h after Escape. |

Validation: `node tools/map-regressions.mjs` passed. Integrated Chrome checks covered normal close, location-selection close, initial selection Escape, pause Escape, and resumed driving, with no console errors. The general gameplay audit is in `gameplay-audit.md`.

This is a focused control audit. It does not certify every road geometry, touch gesture, or delivery route.
