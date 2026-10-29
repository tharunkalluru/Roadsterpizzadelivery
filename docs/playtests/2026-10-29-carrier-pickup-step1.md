# Mystery deliveries: Step 1 pickup preview

## Isolation and scope

Branch: `codex/mystery-deliveries-step1`, based on V28 commit
`02f6abef4946b701ebca6d66d51257e2c5f638be`. No deployment or main-branch push.
The public game is unchanged. No source files were deleted. Existing integration
changes were described to the user before editing.

This milestone implements the approved carrier/pickup step only. It does not yet
contain destinations, calls, celebrity content, setpieces, new level progression
or a collection screen. The HUD deliberately says `Jump grab · Preview`.

## Implementation

- `src/delivery/content/pickup.json`: roof clearance, grab radius, search radius,
  maximum simultaneous carriers and recycling hysteresis. Validated and frozen
  by `core/pickup-config.ts`.
- `core/events.ts`: typed delivery event bus. `orderPicked` includes only an
  anonymous carrier ID and contact position. It carries no celebrity identity.
- `systems/carrier-marker.ts`: three pooled boxes, shared geometry/materials,
  proximity pulse, stable vehicle references, despawn/range reconciliation,
  pooled catch ring and persistent carried box. No new lights or postprocessing.
- `systems/pickup-detector.ts`: Jump-only continuous relative-motion overlap,
  actual rotating hero height bounds, launch/landing-frame eligibility, earliest
  contact selection and one-order latch.
- `systems/pickup-clearance.ts`: interpolated short-reach world clearance using
  finite local surfaces, walls, obstacles and buildings. Called only after a
  possible overlap; rejects grabs through decks and buildings.
- `game.ts`: integrates after traffic simulation without changing Player,
  camera, traffic route timing, Jump height, duration or cooldown. No active
  simulation/pickup advancement behind map/menu/tip/orientation/background gates.
  Empty-carrier recovery uses Traffic's normal collision/gate-aware spawner at
  most once per second, with a maximum temporary budget of `max + 1`.
- Central dispatch/reward guards prevent delayed offers, restored offers,
  accepts and old delivery payouts in the new mode. Legacy implementation stays
  dormant for comparison. Old progress storage is neither read nor written.
- The HUD hides the wallet, old orders toggle and obsolete E instruction. The
  old restaurant pickup markers and their map legend entry are hidden. Existing
  map, roads, railway map layer, controls and opaque interface treatment remain.
- The short tutorial explains Jump grab. `Retry jump grab` in Pause resets only
  the preview pickup; it cannot erase baseline progress. Successful relocation
  also resets preview state; failed relocation does not.

Jump still launches from a supporting road/roof. Ordinary unlimited Fly cannot
collect a box. The user approved preserving this distinction.

## Verification

Run `npm run check` for both TypeScript targets, the focused regression suite,
all 38 portable legacy suites, and production build. The execution log is in
ignored `output/delivery-step1/check.log`.

Final result: both TypeScript checks, **152 focused tests**, all **38 legacy
suites**, and the production build passed. The existing large-bundle and runtime
font-path build warnings remain; neither is a new pickup failure.

The 32 new delivery tests cover pooling/resource release, all five carrier
vehicle groups, despawn/recycling, stable snapshots, one-order latching, misses,
retry, fast-bike sweeps, stacked surfaces, finite occlusion, existing dispatch
and save isolation, safe spawn recovery and overlay gates. Production Player
Jump motion catches a moving 3.3 m bus box at 30/60 Hz in a headless fixture.
That fixture does not establish rendered collision clearance or phone FPS.

### Observed desktop play

Played with ordinary keyboard, camera drag, map and pause controls at RTC X
Roads and HITEC City. No hidden state placement, teleport or autopilot was used.
Several misses left boxes available; normal cooldown remained in effect.
A close auto pickup was then observed during Jump, with accessible status
`Pizza caught`, no offer modal and a persistent cream/orange roof box after
landing. Closing/reopening Pause and opening/closing the full map preserved
the carried pickup. Existing traffic-bump feedback can still appear separately.

Evidence: `output/delivery-step1/desktop-caught.png` (captured before the final
map-legend-only cleanup).

### Mobile compatibility coverage and limits

Observed landscape layouts in Chrome's iPhone 16 profile (852 x 393) and Galaxy
A55 profile (800 x 360). The existing buttons render separately, without the old
wallet/order controls. Jump was activated using keyboard activation of the
mobile Jump button and its Jumping state was observed.

Pointer automation in Chrome device emulation repeatedly timed out and opened
the browser context menu. Native and browser fallback attempts did not produce
a reliable held touch interaction. **A one-thumb touch catch is not signed off.**
No physical phone was used, and no mobile FPS, thermal or battery conclusion is
made. Desktop developer FPS readings are not mobile performance evidence.

## Next approved milestone to propose

NavSystem: consume `orderPicked`, assign only the next destination without
revealing identity, reuse the map/beacon integration, and add a compact top-left
place/distance/direction chip. Calls, reveals and progression follow separately
in the user's requested build order. Keep this branch isolated until the full
new loop has been reviewed and separately published.
