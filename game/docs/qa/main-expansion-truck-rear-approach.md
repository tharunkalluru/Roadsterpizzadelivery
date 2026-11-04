# Truck rear approach reservation — November 3, 2026

Root's normal native pickup/delivery attempt found a bus, bike and hatchback
queued over the blue arrival area. Ordinary following left only 1.6m behind
the closed truck; the walk-in ramp is 8.28m long, so a physically non-overlapping
NPC could still occupy the player's required landing and parking space.

The real truck body and all player support/collision surfaces remain separate.
`truckRearTrafficReservation` creates an NPC-only planning region covering the
actual rear ramp and the Roadster's parked footprint behind its marker. It is
available as soon as the module's real truck envelope exists, including before
the doors open. `DeliveryRuntime` forwards it through `trafficReservations` to
the optional third argument of `Traffic.setKinematicVehicles`; it never joins
`supports`, roof selection or player push-out.

Ordinary traffic spawning and swept entry avoid the reserved area. A vehicle
already caught inside a newly moving reservation brakes on its existing path
while the truck rolls ahead and establishes the required headway. This initial
overlap is not treated as an invisible solid, so no NPC is teleported, retired,
or trapped by that planning region. The truck requests its delivery stop only
after the rear area is clear. Initial truck placement also checks both the
physical body and rear bay against existing traffic and real city geometry.
Adjacent carriageways and other vertical layers retain their ordinary motion.

## Verification

- Typecheck passed.
- `delivery-traffic`: 13 tests passed, including actual TruckInterior + Traffic
  for buses, bikes and cars; retained object/visual identities; continuous
  motion; a clear stationary landing; rejection of flying arrival; an initially
  occupied bay clearing naturally; teardown/resumption; and a regular-spawn
  negative control that crowds the bay under the old body-only behavior.
- `delivery-runtime`: 39 tests passed, including separate reservation forwarding,
  no reservation in player solids, retry cleanup and safe initial placement.
- `delivery-ramp-driving`: 4 tests passed with production player/contact physics.
- `delivery-module-immersive`: 15 tests passed.
- `campaign-spawn-world`: 2 tests passed against the prepared Hyderabad pack.
  The opening truck route remains 1,356.84m; each of three lane draws checked
  1,950 complete-body samples with zero blocked samples.
- Scoped diff whitespace checks passed.

These are source/physics checks. A new native normal jump pickup, blue-bay
parking, automatic container entry and handover remains required before release
acceptance. No actor-performance or face-annotation source was changed in this
traffic follow-up. Meal left-hand support and Pushpa's seated viewing angle are
owned by the separate actor review agent.
