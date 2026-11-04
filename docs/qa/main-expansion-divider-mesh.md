# Divider ends and paint joins

The divider renderer now closes all six faces of its existing prism. Its terminal faces use solid light/yellow paint. The existing divider footprint, wall collision, junction openings and railway cuts are unchanged.

Stripe texture distance is physical metres, including sub-metre pieces. Clipped runs retain their source-piece phase, and solid end faces finish partial blocks. Separate source pieces remain explicitly capped paint joints; this does not claim a global source-family phase map.

Continuous road markings use bounded offset-line intersections instead of a chord-normal cross-section. Near reversals or short legs use a bounded bevel. Paint is clipped against the literal two asphalt triangles and inherits each plane plus the existing 12 mm film. It cannot bridge missing corner pavement or interpolate through a twisted asphalt diagonal.

Focused verification: six divider/paint groups pass, including closed outward faces, fixed physical repeat on actual short piece lengths, continuous emitted paint, normal width at right-angle and unequal/acute/reversal joins, plane inheritance and real railway openings in both qualities. The eleven railway/clearance groups and TypeScript check pass. Independent actual Float32 marking review is separate. This renderer change does not activate the pending source/profile data or close final road/body/native gates.
