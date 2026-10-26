Landmark source and placement repair, 26 October 2026
===================================================

The 191 catalogue IDs remain intact. This pass repairs seven application
identities/placements and two building plans. It does **not** complete 191
photo-verified landmark reconstructions.

| Place | Repair in the application | Evidence and limit |
| --- | --- | --- |
| NALSAR | Move 1,526m north to the midpoint of the paired mapped vehicle gates; orient the entrance along the mapped access approach. | OSM campus w275252288 and gate nodes n10829445473/n10829445474, each with retained versions/timestamps. Gate architecture is still stylised. |
| Osman Sagar Dam | Move 1,469m east from a reservoir-centre fallback to the actual named dam POI. Remove the invented 205m spillway bays; preserve mapped water and roads. | OSM n8987811327 establishes a dam point. A small visitor marker is used; the real dam's crest/architecture has not been reconstructed. |
| Purana Pul Darwaza | Correct the catalogue name/category/icon to the heritage gate already represented by the model. | OSM w971139858 explicitly identifies a city gate. The nearby bridge is a different object. |
| TCS Deccan Park | Correct the wrong Synergy Park branch label and replace the generic rectangle with the source building's concave outline. | OSM w68883415. Stable game ID `tcs_synergy` is preserved for compatibility. Height and facade materials remain illustrative. |
| DLF Cyber City | Move 1,514m to the named DLF building within the Gachibowli campus; replace three invented towers with the exact mapped outline. | OSM w413274269 and developer [DLF](https://www.dlf.in/offices/hyderabad/cybercity). Height and facade materials remain illustrative. |
| Gandhi Bhavan | Move 339m to its civic site and remove dimensions inherited from a metro-station match. | OSM w281519624. Site identity does not establish the main facade's dimensions. |
| Sanjeevaiah Park | Move 415m from the railway station footprint into the named park polygon; discard station-building dimensions. | OSM w29124107, [India Cine Hub](https://indiacinehub.gov.in/index.php/location/sanjeevaiah-park-hyderabad), and HMDA. Exact flagmast position inside the park remains approximate. |

The two mapped office plans use geographic vertices without automatic nearest-road
rotation. Their clearance follows the actual polygon, including concavities, so
the old broad bounding rectangle cannot remove neighbouring buildings. Collision
and roof geometry follow those rendered plans.

Evidence and reproducibility
----------------------------

`pipeline/landmark_source_audit.py` queried 189 bounded cells through the official
OSM map API using verified TLS. All cells completed. The retained snapshot contains
7,368 named/review-specific source elements; exact request URLs and SHA256 values
are retained. It omits mapper usernames. The earlier shipped-feature recovery is
also retained as evidence, with its older capture/version limitations explicit.

`pipeline/landmark_source_decisions.py` records a decision for every catalogue ID:
148 named map identities are bound and 43 have an explicit refusal/review reason
(including Char Kaman's fountain/one-arch context, which does not verify the
four-arch scene).
It selects only explicit reviewed source IDs, checks name/class/radius, and cannot
fall back to an arbitrary nearest building, pond, station or distant branch. It
never imports game data. Source rectangles have an undirected plan axis, not an
asserted front-facing bearing. Site polygons are not treated as building footprints.

`docs/landmark-audit.json` merges these decisions with existing official/photo
references and the separate Ambedkar original-photo feature review. It retains
exact before/after changes, source versions, timestamps, snapshot hash, rejected
alternatives, and per-place limits. Seven models have bounded photo-reviewed
features; zero are certified as complete photo/survey reconstructions.

Validation
----------

- TypeScript typecheck passed.
- Six conservative source-resolution tests passed, including distant same-name
  branch, bus-stop/station, pond, no-footprint and forbidden-nearest-fallback cases.
- The source-plan regression passed for all 191 catalogue decisions, the seven
  shared map/model changes, vertex-for-vertex office plans, finite rendering, and
  concavity-safe clearance.
- The existing landmark suite passed all 191 geometry/identity/ownership checks,
  cultural-symbol checks, production contact checks and Ambedkar checks.
- Root additionally rendered the production office plans without console errors;
  evidence is `docs/playtests/evidence/2026-10-26-repair-mapped-office-plans.png`.

Remaining work
--------------

The 43 unbound map identities remain in the ledger. Some have independent photo
or official references already, including Begumpet Airport, Telangana Thalli and
the Gurdwara; absence of an accepted source in this particular snapshot does not
erase that evidence. Other inherited anchors still differ from a site polygon or
may represent a gate; they are not moved automatically. Full current facade,
entrance, floor, height, inscription and symbol verification remains a per-place
task across the catalogue. Map source coverage is not street verification.
