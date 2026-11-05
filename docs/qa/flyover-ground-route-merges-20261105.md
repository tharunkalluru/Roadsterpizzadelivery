# Flyover / through-road fork geometry

Scope: the four Paradise/Sardar Patel flyover carriageways and their eight
mapped entrance/exit nodes. Existing source XY, graph nodes, directions, lane
counts and all raw packs remain unchanged. No fictional bypass was added.
Other flyovers, expressways and surveyed profiles are excluded from this repair.

The previous contact fix prevented choosing the wrong supporting sheet. The
remaining visible defect was structural: inherited grade preparation raised
the shared fork node and its ground-road branches, while oversized two-lane
pavement aprons overlapped the ramp soffit.

The reviewed correction keeps the source ground routes at zero height around
these forks, brings every ramp tip to the common road level, and delays rising
until the finite ramp and through-road pavements separate. The affected two-lane
one-way carriageways retain two 3.4 m lanes; original wider exclusion corridors
still protect their furniture/building clearance. This is a game geometry
estimate, not a surveyed lane-width claim.

The final grade is bounded at 6.5% with an eased start, while the legacy crossing
clearance regressions continue to require the existing safe upper/lower levels.
Core, streamed tile geometry, painted boundaries, support, graph lane placement,
and traffic receive the same width/profile metadata. The baseline manifest
explicitly records this scoped exception; the unfinished global road model
remains excluded.

Validation:
- All eight mouths meet their existing ground-road connections.
- Ground-road samples include both the approaching and continuing branches.
- Ground-traffic footprint checks reject low ramp slabs across the lane width.
- Actual Player drives the through road and flyover approaches at 120 km/h,
  using 30/60/120 Hz simulation updates.
- Legacy flyover grade, real crossing clearance and joined-endpoint contracts.
- Browser keyboard and landscape touch-control checks on the production build.

Browser placement at each reported approach is assisted test setup; subsequent
movement uses ordinary game controls. Browser mobile emulation does not measure
physical-phone FPS.
