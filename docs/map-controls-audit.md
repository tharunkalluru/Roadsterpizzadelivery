# Map control audit — 2026-10-23

Based on main `14671a5`, with fixes on `codex/shopfronts-map-roadster`.

| ID | Finding | Resolution and evidence |
| --- | --- | --- |
| M01 | Close map during “Deliver from here” only cancelled the picker, leaving the map open. | Close always dismisses the map; Cancel returns to the overview. Both lifecycle paths have regression checks. Actual pointer closing also requires the CSS fix in M09 below. |
| M02 | Map picker controls appeared in ordinary overview despite `hidden`, because their explicit CSS display overrode it. | Scoped hidden styling restores the intended visibility. Chrome overview exposes only map/zoom/location controls. |
| M03 | Escape/M were ignored in initial area selection, while repeated map keys and driving keys leaked into gameplay in other map modes. | Map receives keys before area/gameplay handlers; close toggles ignore repeats, driving actions stay suppressed. Chrome confirmed first-run map Escape returns to the area picker. |
| M04 | Opening the map could retain held driving or queued flight input. | Reset inputs on map opening. Keyboard activation of the minimap also handles Enter/Space without requesting flight. |
| M05 | A failed map download permanently cached a rejected promise and kept showing a loading message. | Clear failed request/loading state and show a retry explanation; reopening retries. Regression verifies second load succeeds. |
| M06 | Closing the map while a pointer was captured could retain drag/pinch state for the next opening. | Closing releases capture and clears pointer/pinch state. Regression passed. |
| M08 | Space on focused map buttons was suppressed while blocking gameplay flight. | Keyboard button activation remains native; Space outside controls is consumed. Regression covers both cases. |
| M07 | Escape closed the pause overlay without clearing pause. | Resume simulation and reset the clock on dismissal. Chrome confirmed time advanced and driving reached 38 km/h after Escape. |
| M09 | Close still ignored pointer clicks because TitleScreen's global `.title` rules also styled the map heading. Its absolute positioning, inset, z-index and pointer events put the heading over the button. | Renamed the map label to `.map-title` with no pointer events and scoped TitleScreen to `.title-screen`. Chrome reproduced the blocked click before the fix: `elementFromPoint()` at the button centre returned the heading. After rebuilding it returns `#map-close`; real pointer clicks dismiss the ordinary map and the in-game location picker, and return the initial picker to area selection. |

Validation: `node tools/map-regressions.mjs` passed. Integrated Chrome checks covered normal close, location-selection close, initial selection Escape, pause Escape, and resumed driving, with no console errors. The general gameplay audit is in `gameplay-audit.md`.

This is a focused control audit. It does not certify every road geometry, touch gesture, or delivery route.

Follow-up pointer verification: the earlier lifecycle tests call `FullMap.close()`
directly and do not exercise browser layout or hit testing. For M09, the same
Chrome tab at `http://127.0.0.1:4189/?area=RTC%20X%20Roads` was tested before and
after rebuilding. The noninteractive map heading now computes to
`position: static; z-index: auto; pointer-events: none`. A real Close click changes
the map's `hidden` property to true in all three entry paths. The game clock
advances again after in-game dismissal, and a fresh first-run title screen still
opens the area picker. No browser errors were recorded. `npm run check` passed
(typecheck, map regressions, 15 gameplay/streaming groups and production build).

Separate responsive finding: at the 594-pixel-wide test viewport, the pending
order card can cover the minimap. The M key still opens the map. This is an
opening-layout issue, separate from the repaired Close button.
