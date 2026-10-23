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

## Browser playtesting — 2026-10-23

Three AI testers exercised the rendered game in Chrome in Charminar, HITEC City and Uppal, using visible buttons and native driving controls. This is browser interaction testing, not a study with human participants. The tested game commit is `7723f8cf66a4bc5ba1a81f2e74224b3f6693f1c5`, served at `http://127.0.0.1:4189/`. Shared Chrome input was serialized: one agent drove while the others inspected evidence. No hidden game-state injection, teleporting or simulation stepping was used to obtain gameplay results.

The resumable [coverage index](playtests/index.json) tracks areas, incomplete scenarios and deduplicated findings. Native recurring playtest rounds are enabled every 30 minutes, with a target duration of about 20 minutes per round. They require the Mac to be awake and Codex running. The first round is limited coverage, not a full-map or continuous soak-test certification.

| Area | Observed interactions | Delivery coverage | Detailed record |
| --- | --- | --- | --- |
| Charminar | Accept order; accelerate, brake and steer; divider and auto contact; earn/use flight; recover near Mecca Masjid; map Close; pause | Pickup and handover not reached. Closest visible pickup distance 838 m. | [Old City report](playtests/2026-10-23-old-city.json) |
| HITEC City | Two separate order sessions; drive/reverse; building/median contact; flight and return to ground level; ground and roof recovery; map Close; pause | Neither session reached pickup. Closest pickup distance was 152 m in the first; the second ended at 764 m. | [West report](playtests/2026-10-23-west.json) |
| Uppal | Accept order; drive; earn/use flight; recover twice; map zoom and Close; pause/Escape resume; active-delivery area-change guard | Pickup and handover not reached. Closest visible pickup distance 208 m. | [East report](playtests/2026-10-23-east.json) |

The actual **Close map button worked in all three areas**. The captured warning/error queries were empty. Those results do not establish that delivery, every collision, or every map control is correct.

### Findings from visible play

| ID | Priority | Confidence | Finding and evidence | Next action |
| --- | --- | --- | --- | --- |
| PT-001 | P2 | Confirmed in two areas; related compact-layout overlap in HITEC City | At 594×466 with a non-coarse pointer, the tutorial becomes an approximately 355 px tall panel over the road and offer. [Charminar screenshot](playtests/evidence/2026-10-23-charminar-overlay-8c5d49.jpg), [Uppal screenshot](playtests/evidence/2026-10-23-uppal-tip-obstruction-f898cd.jpg). At 594×522, a compact persistent tip still overlaps the car: [HITEC City screenshot](playtests/evidence/2026-10-23-hitec-stopping-state-716fc8.jpg). | Clear the conflicting vertical CSS inset, then check both sides of the 520 px height breakpoint and verify that the compact tip leaves the car visible. |
| PT-002 | P3 | Confirmed wording ambiguity in two areas | A Charminar offer advertised a 285 m route; accepting it showed 917 m just to reach the kitchen. A second HITEC City session advertised 636 m but required 1,082 m to reach pickup. Source inspection confirms the offer distance is pickup → customer, and the delivery timer resets at collection. This does not prove an incorrect GPS distance. | Label the delivery leg and post-pickup time explicitly; show the approach to the pickup separately. |
| PT-003 | P2 | Unusable view confirmed; underlying cause unproven | Flying near Mecca Masjid, pressing R, then driving left the car/camera apparently within landmark geometry. The scene became a gray wall/floor while the HUD reported movement. [Saved stopping-state screenshot](playtests/evidence/2026-10-23-charminar-landmark-recovery-6847a8.jpg). | Reproduce from a fresh visible start; check recovery destination clearance, front-arch pier coverage and camera fallback. Hall/minaret collision footprints do exist, but source review found front arch piers extending beyond them. The captured car position is not known precisely enough to attribute this failure to that gap. |
| PT-004 | P2 | Observed once; repeat needed | A nearby large blue traffic vehicle obscured nearly the entire chase view in HITEC City. The transient frame exists in the test trace, but no standalone screenshot was saved. | Repeat a slow approach/reverse alongside large traffic and save the occlusion sequence before choosing a fix. |
| PT-005 | P2 | Suspected | The route ribbon appeared to meet/cross the HITEC City median during repeated blocked approaches. Steering errors were a confounding factor; the test does not prove an unreachable pickup. | Follow the intended ground-level turn carefully and compare the visible ribbon to the legal lane transition. |
| PT-006 | P2 | Suspected, low confidence | The first 3-second forward input in Uppal ended against a yellow building. A nearby bend/intersection may explain it; incorrect starting yaw is not established. | Capture a fresh, unobstructed pre-drive view and repeat with short inputs. |

These IDs group agent-local aliases in the coverage index. No game behavior was changed in this playtest round; the older G01–G10 entries above describe earlier fixes.

### Remaining acceptance work

- Capture an explicit collected state and an explicit delivered result on a complete route. Distance, pressing E, or an order state alone is insufficient proof.
- Repeat landmark recovery, traffic camera occlusion and the suspected median/spawn issues before attributing precise causes.
- Continue into Nagaram, Gachibowli, Mehdipatnam and the remaining areas in the index. Expand from area starts to actual street coverage; selecting an area does not test its whole region.
- Exercise longer traffic-heavy routes, bridge barriers, curbs, settled flight landings, picker cancellation, and physical touch controls. The short desktop windows in this round are not phone tests.
- Keep street/shop accuracy separate: these gameplay sessions did not compare frontage order against street imagery.

Each agent report records held-input duration separately from wall time and coasting. The first round totals approximately 151.3 seconds of held driving input across the three areas, including the additional eight-minute HITEC City observation session; it is not 151.3 seconds of uninterrupted driving. Model/tool round trips, paused inspections and browser ownership waits must not be reported as uninterrupted driving. Five original local-game screenshots are stored in `docs/playtests/evidence/`, including the [extended HITEC City stopping state](playtests/evidence/2026-10-23-hitec-extended-stop-0836f5.jpg). `tools/playtest-evidence-server.py` provides a localhost-only upload form when the browser tool has no direct file-save API; start it only when needed and stop it after the evidence is saved.

## Recurring round — 2026-10-23 07:47 UTC

The next three bounded browser sessions covered Nagaram, Gachibowli and Mehdipatnam on the same gameplay revision. Checkout `5c291ae` added documentation only; its game source is unchanged from the served `7723f8c` build. Five more screenshots were saved. No collection or handover was completed; these are partial route attempts.

| Area | Evidence and outcome | Report |
| --- | --- | --- |
| Nagaram | Pista House offer repeated PT-002: 487 m advertised versus 1,607 m pickup. Closest approach 1,523 m. Map Close, recovery, flight exhaustion and a visible return to ground passed. | [Nagaram](playtests/2026-10-23T0747Z/nagaram.json) |
| Gachibowli | Yellow Deli pickup decreased from 1,143 m to 760 m before an off-road turn. Map Close passed. PT-005 was not reproduced: the observed on-road ribbon lay in a drivable carriageway beside the divider. | [Gachibowli](playtests/2026-10-23T0747Z/gachibowli.json) |
| Mehdipatnam | Both G10 cancellation paths restored the same Mak's Kitchen offer: 731 m, 149 s and 86 coins. The exposed minimap opened normally. Pickup approach reached 75 m, but collection was not completed. | [Mehdipatnam](playtests/2026-10-23T0747Z/mehdipatnam.json) |

- **PT-007, P3, confirmed visual overlap:** the pending offer covers part of the minimap at 594×522 in Nagaram. Pointer failure in the covered region was not tested. This repeats a previously noted responsive-layout concern. At 594×466 in Mehdipatnam the offer and minimap did not overlap; the exposed minimap click worked. [Initial offer](playtests/evidence/2026-10-23T0747Z-mehdipatnam-pending-offer-dbeee3.jpg) and [restored offer](playtests/evidence/2026-10-23T0747Z-mehdipatnam-restored-offer-b56c04.jpg) document the smaller-height layout and G10 pass, not the Nagaram overlap.
- **PT-008, P3, suspected:** after leaving the main road in Gachibowli, the route connector appeared to point into a compound wall. [Stopping frame](playtests/evidence/2026-10-23T0747Z-gachibowli-stop-65fbca.jpg). This is a separate off-road guidance observation, not confirmation of the median issue or an unreachable pickup.

No captured console warning/error query returned entries. No new hard gameplay blocker was established. The next round should give one driver a longer uninterrupted turn on a single order while other agents review evidence, rather than repeatedly restarting long pickup approaches to maximize the area count. Other areas and every-tile coverage remain outstanding.
