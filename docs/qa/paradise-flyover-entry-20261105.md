# Paradise / Sardar Patel flyover entry repair

Reported entrance: eastern Sardar Patel Flyover beside Mahatma Gandhi Road,
near game coordinates (486, -4038). Retains the existing mapped alignment,
road elevations and connected-road geometry.

## Reproduced fault

Assisted browser setup placed the actual Roadster at (555, -4034), facing the
entrance, at 120 km/h. Driving then used the normal W key and live game loop.
Before the endpoint-continuity repair, the sampled car support changed from
Sardar Patel Road `5ad84346-6af_0` to the descending surface branch
`ed4c97de-0f2_0`, instead of flyover `c74bed09-107_0`:

| x | support height | road |
| --- | --- | --- |
| 511.94 | 0.806 | approach |
| 478.78 | 2.097 | descending ground branch |
| 445.49 | 0.008 | descending ground branch |
| 412.21 | 0 | ground branch |

This reproduced the visible drive-through/under-the-ramp failure. Matching
only the nearest previous height favors the lower road; requiring the ramp's
first triangle to contain the previous point also fails across a real seam.

## Change

Grounded driving supplies its preceding road to the surface query. Continuous
finite road triangles, and immediately adjacent shared endpoints with matching
reachable heights, retain contact across the ramp join. An endpoint shared far
away is insufficient; separate overhead decks remain excluded. Stationary,
jumping and flying queries retain their separate contact behavior.

No source roads, flyover elevations, metro lines or raw city packs changed.

## Verification

The same browser approach after repair, using the normal W key:

| x | support height | road |
| --- | --- | --- |
| 511.65 | 0.828 | approach |
| 478.50 | 2.815 | c74bed09-107_0 |
| 445.22 | 4.981 | c74bed09-107_0 |
| 423.72 | 5.850 | c74bed09-107_0 |
| 349.30 | 6.800 | c74bed09-107_0 |

Actual packed-map regression covers the four Paradise/Sardar Patel flyover
roads, their entrances in both directions, and the eastern connected approach.
The actual Player constructor and update run at 30/60/120 Hz with a 120 km/h
initial speed. The eastern approach reaches the 6.8 m deck at all three rates
without falling below its supporting pavement. These are simulation-step
checks, not physical-phone FPS claims.

Additional negative cases cover an unrelated overhead bridge, descending ramps,
an overlapping ground road, the exact shared-endpoint fork, and a node shared
far away. Legacy flyover grade/render/support regressions also pass.
