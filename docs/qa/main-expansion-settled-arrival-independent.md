# Independent settled-arrival and cargo review — November 3

The first review found two real integration defects, corrected within the
approved scope:

1. A module's authored story waypoint was not necessarily its visible blue
   marker. Paradise used a safe bay beside the basket, while the old marker
   remained inside the basket. Salaar's safe approach was outside its closed
   gate, while the old marker remained 25m inside the property. The new
   `ModuleStoryLandingZone` is shared by navigation, the visible ring and the
   settled-arrival gate. Physical handoff targets remain separate. Automatic
   module callbacks cannot alternate navigation back to the handoff before
   capture. Metro continues receiving its live boarding target when no story
   frame exists yet.
2. Street-scene physical transfers did not emit `catchStarted`, so the trunk
   carton duplicated the thrown carton until completion. A successful
   `beginTransfer` now emits that event once; repeated Drop calls cannot
   duplicate it.

All 14 actual module classes were instantiated with current level content.
Sixteen independent tests check safe-ring/navigation agreement, 0.4-second
stationary capture, airborne/rolling/wrong-height/outside negatives, ring
hiding after capture, exterior basket/Salaar bays and the single physical
transfer event. Existing 37 runtime, 8 restart and 13 real railway/metro
physical regressions pass. Typecheck and scoped whitespace checks pass.

The manual any-marked-coach railway and metro requirements remain intact;
the new zone does not land the car for the player. The Devara marker stays
visible on the water surface rather than under the drafted car tyres.

One practical follow-up was reported separately: an 8m/s truck marker moves
3.2m during the 0.4-second settling interval, exceeding its 3.15m radius for
a player who brakes exactly at its centre. The ordinary-road car's speed is
not support-relative there. Root must qualify a short stopped-player truck
waiting behavior (or another explicit design) before calling Level 1's new
stationary approach accepted. No truck timing change was made in this leaf.

Root subsequently added a loading stop for automatic truck deliveries. A real
rear approach requests normal 3m/s² braking; the truck then waits with a stable
blue marker. Flight cannot request this stop. The actual TruckInterior test
passes moving-before-approach, flight-negative, stable stopped marker and locked
ramp checks. Native player-controlled arrival still needs its separate replay.

These checks are source/physics tests, not native visual acceptance or
physical-phone frame-rate evidence. The release road-model gates remain
separate and open.
