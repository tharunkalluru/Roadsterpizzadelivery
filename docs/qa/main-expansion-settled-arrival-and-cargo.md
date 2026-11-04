# Settled arrivals, cargo and local traffic — November 3

Implemented against the promoted 14-scene checkout. This is an implementation
record, not a final native-play or physical-phone acceptance certificate.

## Story capture

`StoryLandingGate` requires a continuous 0.4 seconds with speed at most 0.35m/s,
vertical speed at most 0.15m/s, no flight/descent/jump/glide, and tyre support
within 0.2m of the actual current physical surface. Ordinary entry uses the
3.15m blue marker and at most 0.65m root-height difference. Flying over the
same XZ coordinate or stopping on a different deck cannot start the story.

Train and metro retain their explicit manual marked-rake roof contact gate;
player speed there is relative to the moving support. Any permitted real coach
remains a valid manual boarding surface. The director cannot land the player.
Relocation, hidden UI and invalid/blocked entry clear the settling timer. Story
assisted movement and automatic module interaction remain disabled until this
gate, preventing a nearby flying car from being pulled into a container/lake.

## Collected pizza

The camera-facing slice is an offer above traffic, never a carried billboard.
Collection detaches all offers and preserves the short pooled catch feedback.
The existing compact trunk carton, lid and two straps now share one visibility
group: initially hidden, shown on assignment, hidden when the physical handoff
starts or the order is completed/restarted/cleared. The original jump envelope,
flight equipment, wheel transforms and decals remain unchanged. A visibility
change invalidates the current jump collision bounds once.

## Traffic and auto canopy

Nearby traffic budgets scale with existing shop/road activity: low quality
22–48, high quality 34–86. Quieter colonies remain quieter. The existing
per-frame movement, spatial collision checks, service bus routes and retention
rules are unchanged. More vehicles have a cost; actual frame pacing and local
population need native checks and cannot establish physical-phone FPS.

The auto's open-ended half-cylinder roof is replaced by a finite canopy shell
with inner fabric, front hem and curved rear closure. Real passenger doorways
remain open, not filled with false panels. The outer roof was raised 25mm to
preserve the prior inner passenger clearance; the model stays within its
existing 1.85m traffic height. Reference: [Bajaj RE manufacturer page](https://www.bajajauto.com/three-wheelers/re).

Focused verification covers settled/airborne/wrong-deck/relocation arrivals,
no pre-entry assistance, manual roof behavior, marker pooling, compact cargo,
bounded population, canopy closure and all existing vehicle/occupant-clearance
checks. Final native visual acceptance, denser-traffic frame pacing and the
separate city-wide road profile/marking release gates remain open.
