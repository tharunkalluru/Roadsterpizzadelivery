# Candidate ordinary-train rider safety stop

This is a read-only integration proposal. No runtime, source geometry, clearance
bound, numerical policy, or activation flag changes are implemented here.

## Physical contract

The actual compiled ordinary train needs the separately established 5.7 m road
input height above the flat running datum. A stationary Roadster carried on its
coach instead requires at least 6.5193306779861455 m, before dynamic pitch or
takeoff margins. These are different tests. The actual two ordinary CDM routes
are occupied by moving NPC trains, even though the Ram story route excludes CDM.

If a source-correct, driveable bridge profile cannot provide the rider envelope,
the candidate may implement an explicit **rider passage safely blocked/handled**
result: an occupied ordinary train stops before the rider or its intended launch
envelope reaches the actual soffit. The player can deliberately fly away or
pause. The bare train must still pass its physical clearance test. A safety stop
must never be recorded as a 6.519 m headroom pass, and no thinner slab, invented
underpass, steeper road, or altered source altitude follows from this proposal.

## Current architecture and missing behavior

* `RailTrains.update` in `src/game/rail.ts` advances trains in <=50 ms substeps.
  It already combines terminal stopping and conflict reservations; ordinary
  stopping uses `END_BRAKE = 1.5`. There is no overhead rider check.
* `Game.frame` updates trains first, then calls `railContacts.beforePlayer`,
  `player.update`, and `railContacts.afterPlayer`. Stopping the train alone cannot
  stop GO from moving the Roadster forward into a bridge during `player.update`.
* `MovingRailInteraction.supportId` is actual previous-frame roof contact, and
  each body has `roofGroup`, `roofIndex`, a previous pose and current pose. These
  provide an actual occupancy identity rather than a proximity guess.
* `beforePlayer` detaches on Fly/Jump. Releasing a clearance stop immediately on
  this detach would restart the train while the Roadster is still in its takeoff
  envelope. The guard needs its own short-lived occupancy/departure latch.
* `queueFlight` and Pause remain available during normal play. Entering a
  cinematic/story `blocking` state would disable the intended escape control;
  this guard must not do that.
* City emits the actual road soffit at input height minus 0.9 m. Existing
  `jumpCeiling` subtracts 0.35 m, and is a point query with different semantics.
  It is not a valid source of clearance authority for this feature.

## Minimal proposed integration

1. Add a separate ordinary-train rider-clearance controller, inactive unless its
   explicit candidate policy and fitted-geometry identity are supplied. Its input
   is actual native overhead geometry, real coach poses/run direction, confirmed
   rider contact, actual car geometry and current input. Its output is an ordinary
   train advance limit plus a player motion/launch constraint. It grants no road
   or rail height changes.
2. Build an immutable spatial/run corridor index of actual fitted slab soffits
   and any lower structure. Include both train directions and route extensions.
   Rebuild only when the geometry identity changes. Required lookahead includes
   `v*v/(2*1.5)`, the rider's coach-relative offset, the car's entire footprint,
   one maximum simulation step and its measured safe launch envelope. Check
   load completeness; missing upcoming geometry is a stop/prepare condition,
   not evidence of clear space. Local streamed surface absence must not mean
   there is no bridge.
3. Before `RailTrains.update`, resolve the last actual `supportId` to its exact
   ordinary `roofGroup`. Compute distance from the **rider**, not the leading
   locomotive, to the first incompatible finite soffit. Feed the stop distance
   into the existing per-substep remaining-distance minimum. Preserve current
   conflict reservations and railway crossing behavior. Account for formation
   direction versus current travel direction, terminal reversal and curved
   coach poses.
4. Retain a final swept-clearance commit check on train movement and on the
   subsequent player-relative movement. A rider can land close to a bridge in
   the same frame that the train advances, or walk/drive between coaches. A
   previous support check alone misses these cases. Clamp the hazardous relative
   forward motion/speed before committing the new player pose; do not merely
   clear the throttle, teleport, hide a train, or rely on visual overlap.
5. Stop far enough upstream that a manual Fly has room for the actual 0.82 s
   kickflip and climb envelope. On a Fly request, permit flight, keep the train
   stopped, and constrain horizontal motion only while needed to preserve that
   measured safe launch corridor. Do not release the hold just because
   `supportId` becomes null or `flying` becomes true. Release only when the whole
   car is clear of the protected train/soffit corridor. Jump must pass its own
   full envelope test; it must not bypass the stop. Reverse, brake, steering and
   safe side departure must not be accidentally converted into forward motion.
6. Show one small contextual message such as “Low bridge ahead · Fly to continue.”
   Preserve the existing Fly and Pause controls and camera interaction. Do not
   create an order/call/action modal, story capture, automatic takeoff, mandatory
   character action, or hidden controls. The game clock naturally stops through
   the existing Pause/visibility path.
7. Ordinary train resumption occurs after actual safe departure. Keep the latch
   stable across camera movement, coach gap support transitions, delayed asset
   loading, pause/resume and low frame rates. Geometry generation changes discard
   stale clearance certificates before movement, never after it.

## Required verification before wiring or acceptance

* Prove both CDM ordinary directions and actual spawn routes are considered.
  Keep the Ram story route exclusion as a separate exact route assertion, so a
  story never waits behind an ordinary rider-only stop.
* Test coach front, middle and rear occupancy; player orientation both ways;
  stationary/maximum relative GO; reversing train; entry immediately after
  landing; travel across a roof coupling; simultaneous Fly+GO; and repeated Jump.
* Exercise <=50 ms train steps, larger application dt subdivision, paused and
  hidden-tab resume. Every committed whole-car sweep must stay clear.
* Measure actual transformed Roadster mesh through the entire kickflip and
  ascent, including pizza cargo state and wheels. Static 6.519 m alone is not a
  dynamic launch certificate. No generic unexplained margin substitutes for it.
* Delete or delay the next tile in a test. The train must stop/prepare without
  treating missing geometry as clear. Confirm the train remains visible and
  collision/support identities remain unchanged.
* Verify a safe bridge does not stop an occupied train, and an unoccupied train
  still passes only when the separate bare-train clearance test succeeds.
* Real desktop and mobile play must show a useful warning, accessible Fly/Pause,
  a safe manual escape and natural train resumption. Mark the route outcome
  `riderPassage: safely-blocked-and-manually-exited`, not `riderHeadroom: passed`.

## Current exact evidence

* Mesh: `/tmp/roadster-actual-current-rail-bridge-envelope-v1.json`, SHA-256
  `2fd33acfb809be2db7b32dd960025b9b77c371501a77c7f957934f01949cbc10`.
* Ordinary CDM trains: `/tmp/roadster-CDM-ordinary-train-route-replay-v1.json`,
  SHA-256 `54122bc50dde7338bfa77e2bb8dde002e8ca5cf05749f93a48b3c742bbef8307`.
* Ram route: `/tmp/roadster-source385-bridge-marked-train-route-v1.json`, SHA-256
  `6421cabdd0c72a9e13934c517f7b1073b96fd457b06bd62a124bae90d8173947`.

The evidence and this proposal are not a fitted-profile or release acceptance.
