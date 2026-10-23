# Gameplay and map audit — 2026-10-23

Inspected current `main` (`14671a5`) before changes. This is a code-driven audit with focused deterministic regression reproductions; it is not a claim that every street, shop, or vehicle interaction has been manually verified.

| ID | Severity | Reproduction / evidence | Status |
| --- | --- | --- | --- |
| G01 | High | Pause with P, then Escape. The modal closes, but `paused` stays true, so driving never resumes. | Fixed by root agent alongside map close. |
| G02 | High | A tile's pack request fails once. `World.onMessage(error)` adds the key to `empty`; future streaming and `ensure()` skip it forever. Worker also caches the rejected pack promise, poisoning neighboring requests. | Fixed: exponential retry, retryable failed pack cache, three-attempt area failure and 90-second deadline; regression passed. |
| G03 | High | Route between positions on a long curved road. GPS chooses the nearest destination junction and draws a straight final leg, crossing blocks and sometimes routing beyond the actual destination. | Fixed for loaded destination roads: partial-segment routing and same-edge routes; five routing regression groups passed, including one-way and median restrictions. |
| G04 | Medium | `makeOffer()` independently rolls pizza preference for the chosen pool and its array length. Selecting a short pizza pool with the full-pool index can return undefined and fall back to the same first restaurant. | Fixed: select one pool, then sample its length; regression passed. |
| G05 | Medium | Delivery checks `playerY - targetY < 3`, not absolute height separation. A player below an elevated target can hand over. Theatre gates have no grounded/height requirement at all. | Fixed: shared grounded interaction check excludes flight, descent, rescue glides and vertical separation; regression passed. |
| G06 | Medium | Hold W/E, then switch windows before keyup. No blur/visibility handler clears held controls; returning can drive or interact without pressing again. | Fixed: clear held, queued and touch input on focus loss / hidden document; reset regression passed. |
| G07 | Medium | `actProgress` from a theatre persists after releasing ACT or leaving the gate; a later tap can finish the old hold. Delivery and theatre share this value. | Fixed: reset theatre hold on release or leaving interaction range; code-reviewed, rendered manual check outstanding. |
| G08 | Medium | Failed relocation logs an error but still places the player, saves the target area, and says welcome. | Fixed: return to area selection with an error toast and preserve the current location; regression passed. |
| G09 | Low | Unloading tiles never removes their `rails` from the world registry, so repeated travel retains stale rail geometry for train spawning. | Fixed: remove unloaded rail records while preserving a shared copy in a loaded neighbor; regression passed. |
| G10 | Medium | With a pending order: Pause → Change area → Stay here. The picker hides the offer card but retains `order.state=offer`, so cancellation never restores the Accept/Another buttons. Delayed offer callbacks can also appear during area selection. | Fixed: restore the same pending offer on cancellation and ignore delayed offers during relocation, selection or an active delivery; two focused regression groups passed. |

## Validation

- `node tools/gameplay-regressions.mjs`: **15 regression groups passed** using the actual bundled game, graph, world and worker code. No WebGL or network is needed for these deterministic cases.
- `cd game && npm run typecheck`: **passed** after the gameplay changes.
- Root agent owns live map-close / Escape verification and the final integrated build.

## Further coverage still needed

- Manual long-distance delivery, intentional curb / bridge impact, flight-to-roof landing, touch controls and recovery checks in the rendered game.
- Routes to distant residential streets that are not streamed yet still use the permanent main-road network plus an approximate final link. Once the destination tile is loaded, partial-road routing replaces that approximation.
- Exact street and shop sequence remains a data/evidence task; passing these gameplay tests does not establish real-world frontage accuracy.
