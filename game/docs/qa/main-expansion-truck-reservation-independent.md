# Independent truck rear reservation review — November 3

The independent probe instantiates the actual production `Traffic`
constructor, vehicle prototypes, directed `RoadGraph`, `TruckInterior` and
ordinary updates. It does not replace traffic movement, vehicle sizes,
braking or spawning. The bus is the complete eleven-metre production model.

## Two discovered defects

The original NPC-only rear reservation copied the container's full 5.82m
height. Although its XZ footprint was appropriate, it stopped buses on
unrelated roads 3.3m and 4.5m above the bay. After six seconds the normal bus
was at X140/speed10; the reserved-layer bus had stopped near X108.876/speed0.225.
The producer's old twelve-metre-height negative control missed this case.

The reservation now uses 3.1m clearance. Exact undeployed Roadster visible
geometry measures 1.334330692m from tyre plane to top; the actual 1.55m truck
bed plus that height and 0.2m buffer fit inside 3.1m. The real container
geometry/collision roof remains 5.82m. Ground traffic still queues outside
the complete ramp/parking footprint, while buses on Y3.3, Y4.5 and Y6.1 and
the opposing carriageway retain bit-identical ordinary motion and clocks.

An eight-metre finite route with an already occupied bay also demonstrated
a direct-module deadlock: neither the truck nor an existing stopped bus
could establish the rear gap. Normal runtime rejects occupied starts, but
its previous trimming could select only a few clear final route metres.
It now requires at least thirty metres of actual mapped route after the
selected clear start. Blocked/short tails retain the order and retry a real
earlier clear placement; no synthetic road, vehicle teleport or despawn is
introduced. The direct invalid eight-metre module probe remains in the
evidence as an explicit boundary witness, not a passing gameplay scenario.

## Verification

- Four new independent tests pass: real bus full-length clearance, immutable
  identity/body geometry and continuous motion, retry/resumption, exact raised
  and opposing-road negatives, actual Roadster height proof, no player support,
  hit-test or push-out collider, and teardown of planning records.
- Forty runtime tests pass, including the new short-tail rejection/retry and
  existing independent body/reservation forwarding and cleanup.
- Thirteen traffic, four production-player ramp, fifteen immersive-module and
  two packed-city campaign/spawn tests pass (78 tests total).
- Typecheck and scoped whitespace checks pass.
- Packed-city opening route remains 1,356.840677m. Three lane draws each
  checked 1,950 whole-body samples with zero blocked samples.

Before and after diagnostic records are kept separately under
`docs/qa/evidence/main-expansion/truck-reservation-independent-*-20261103.json`.
The reproducer is `truck-reservation-independent-probe.ts` in that folder.

Native normal pickup, stopped blue arrival, automatic entry and handover must
still be verified against the new source fingerprint. These tests do not
establish physical-phone FPS, player acceptance of the artwork, or global
road-profile correctness. No actor-performance or face-annotation files were
modified by this review.
