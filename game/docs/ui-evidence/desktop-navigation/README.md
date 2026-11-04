# Desktop navigation visibility repair

- Ground ribbons keep obstacle checks. The minimap now retains the mapped route overview when the clipped local ribbon is empty, instead of losing both displays together.
- Moving deliveries retain their previous checked geometry during a target refresh until the route update runs; a different delivery still resets its route.
- A disconnected or unstreamed destination can return a reachable mapped street prefix with complete=false. It stops at an actual road node and never draws an invented connection to the destination or includes the unreachable target edge in its identities.
- The dynamic road ribbon is exempt from frustum culling based on stale vertex bounds from an earlier route.

Local desktop Low-graphics test used temporary QA progress and Prepare order (skips only the pickup). Observed an active route with 202 points and a checked 475-point local guide, then saw both road and minimap lines while using W/Space, and the cyan route in the full map. Screenshots document pickup, driving and full-map states. This is not a completed delivery/campaign test. A close delivery-truck encounter also exposed a separate camera obstruction in this scenario; that is not changed by this navigation repair.

Regression coverage checks the grounded cue remains restricted to checked geometry while a blocked ribbon does not erase the map overview, reachable-only partial routes, dynamic ribbon visibility, and moving-target retention. Development-only qaRoute diagnostics are removed from production by the existing DEV import gate.
