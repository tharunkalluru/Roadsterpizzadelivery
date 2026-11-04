# Independent divider/marking review — interim November 3

Reviewed producer HOLD `road-divider-mesh.ts` SHA256
`b801395a63c8dcf0247ba35ecb92f9556f4dfb786850fd936d4845bdf66d70bd`
and `city.ts` SHA256
`d0be3d45e71e516a9d6a3b642f6a3da5e7aa6c62aa93e2b0e3ad8b28594d73b2`.
No runtime source was edited by this reviewer.

Two new independent tests pass: outward FrontSide rays see the exact two
finite divider ends on three orientations/grades, while a historical open
three-face negative has no end hit; differential UV checks prove a fixed
metre repeat on 0.07m, 0.7071m, 1.063m, 9.91m and 250.25m source pieces,
including clipped starts. The rejected ceil(length) compression is detected.

Producer suite replay passes 4/4. Railway clearance suite replay passes 11/11,
including actual geometry/collider openings, both qualities and genuine core
crossings. These do not certify every city road or the still-disabled final
road profile data.

**Concrete defect remains:** shared continuous paint corners are connected but
not uniform width. The existing chord-normal `offsetLine` narrows a requested
0.12m line to 0.0843785m perpendicular width at the actual emitted 90-degree
fixture `[[200,200],[500,200],[500,500]]`. An unequal 300m/3m corner is also in
the retained witness. The new independent actual-`buildTile` width test fails
on this defect; producer confirmed and is implementing a paint-only bounded
miter/bevel correction. No pavement, grade or collision change is authorized
by this review. The modified paint leaf needs a fresh held-source replay,
sharp/U-turn controls, own-asphalt clipping checks and native review.

Reproducer: `node scripts/test-v21-fixes.mjs divider-marking-independent`.
Evidence logs and exact probe source are retained under
`docs/qa/evidence/main-expansion/divider-independent/`.

## Final bounded paint leaf review

The producer corrected the reported thinning without changing the asphalt,
road paths, height model or collider definitions. Final held source:

- `city.ts`: `a5803ceedfbfd66b6cb4b8bfaeb503e3951ab06286fb6658669547c078979557`
- `road-divider-mesh.ts`: `b801395a63c8dcf0247ba35ecb92f9556f4dfb786850fd936d4845bdf66d70bd`
- `road-paint-mesh.ts`: `28c779d254f07da883ff7e63ea1c517dfd03568bc873e96139926f26476c8a42`

The independent test now intersects a section line with every literal emitted
triangle, unions the resulting intervals and measures the containing stroke.
It does not infer quads from triangle order: clipping to asphalt legitimately
changes triangulation. Thirty-six straight sections across the original
90-degree and unequal 300m/3m fixtures measure 0.1199745–0.1200103m.
The same oracle rejects the literal previous chord-normal geometry. The small
bounded bevel at a sharp corner may locally widen a joined stroke; full-width
tests exclude only its explicit four-half-width (0.24m) join influence.

All four independent groups pass, including the retained finite-end/open-end
and fixed-UV/compression negatives. Acute, exact-reversal, short and duplicate
point cases are finite, miters stay within four half-widths, and bevel vertices
stay within one half-width. Independent barycentric samples at every emitted
clipped vertex and triangle centroid follow their own nonplanar asphalt
triangle plus 0.012m; no paint is supported beyond that finite quad.

The producer's six groups and existing eight road-opening groups were replayed
successfully against this hold. Genuine railway geometry/collider opening
replay is retained separately. This accepts this bounded divider/paint leaf;
it does not certify the separate global road-profile solve, all city topology,
native appearance, phone frame pacing or source-map accuracy.
