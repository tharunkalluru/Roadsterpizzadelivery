# ORR continuity, ramps and references

The existing mapped ORR alignment is retained. This repair addresses disappearing
carriageways, accidental openings to crossing streets, steep model bridge bumps,
three-lane defaults, and recovery that moved a stuck expressway car onto a service
road. It also corrects the covered Healthway cycle track being drawn as a skywalk.

## Resulting behavior

- Context copies of long ORR sections now build their local physical/rendered
  segments. A source edge can span12km; its distant midpoint tile no longer has to
  be loaded for the carriageway under the player to exist. Adjacent tiles own
  different segments, rather than drawing duplicate roads.
- Four3.5m through lanes per carriageway, white lane divisions, outer white and
  median yellow edge lines, shoulders, continuous grade-aware crash barriers,
  and a gradual3.5m auxiliary taper near connected ramps. Shoulder/taper dimensions
  are model assumptions; these are not surveyed engineering drawings.
- A crossing street or nearby service road never opens an ORR barrier. An opening
  requires a connected mapped ramp at the same height. Existing junction IDs and
  one-way directions remain intact; no ramps or shortcuts were invented.
- Original OSM bridge geometry supplies the model bridge locations. The old
  short~15% spikes are replaced with gradual300m approaches, reaching at most
  3.414% grade. The6.8m deck height is an explicit game approximation. Bridge piers
  use cumulative24m spacing and avoid ground carriageways. Gantry collision starts
  at its deck height, keeping a street below free of invisible posts.
- Advance gantries at500m and250m and an exit board near the diverge follow the
  mapped curved carriageway, including source-edge boundaries. Separate rows show
  exit number, verified area name and arrow/distance. Through boards say Outer Ring
  Road. Unknown remote destinations are not guessed. Ramp chevrons follow mapped
  bends; road positions determine placement, not straight-line offsets.
- Automatic/manual recovery on the ORR retains its current directed carriageway
  and actual grade, checks a loaded clear whole-car footprint and forward exit,
  and waits if no safe spot exists. Ordinary ground-street recovery is retained.
- Healthway's original covered-cycleway features now produce a ground path and
  solar canopy, rather than a6.6m viaduct. Explicit bridges/layers/tunnels keep
  their separate treatment. Roof height and column spacing remain estimates.

## Evidence and provenance

- [HMDA2022 ORR RFP, introduction and Table2](https://www.hmda.gov.in/wp-content/uploads/2020/07/TOT-RFP-2022.pdf):
  158km, eight-lane access-controlled main carriageway, separate service roads,
  interchange numbers/names and forms. The2022 table identifies proposed additions
  as under construction; it is not used as proof they were already open then.
- [Current HMDA origin/destination matrix](https://www.hmda.gov.in/wp-content/uploads/2020/07/ORRDistanceMatrix.pdf):
  all22 named interchanges, including Neopolis, Mallampet, Narsingi and the current
  TGPA label. This supports correcting legacy mapped Exit19/Narsingi to
  Nanakramguda and Exit1/Gandipet to Kokapet.
- [Telangana government,8September2025](https://www.telangana.gov.in/news/news-and-press-releases/2025/09/cm-sri-a-revanth-reddy-participated-in-inauguration-of-trumpet-interchange-at-neopolis-layout-kokapet/):
  the Neopolis/Kokapet trumpet opened at Exit1A. Its existing two mapped connectors
  are retained, with their ramp role recorded explicitly.
- [Akashvani,2October2023](https://newsonair.gov.in/indias-first-solar-roof-cycling-track-inaugurated-in-hyderabad/):
  Healthway between ORR main/service roads,23km,4.5m width and three lanes, solar
  roof, two stretches and five access points.
- `pipeline/evidence/orr-motorways-2026-10-26.json` retains original OSM way/node
  IDs, tags and full geometry. It was fetched26October but the service returned a
  **28July2026 snapshot**. Retrieval is not current street verification. The
  original query did not return per-way versions; that limitation is recorded.
- `pipeline/evidence/orr-neopolis-2026-10-26.json` supplements the Neopolis area
  through the OSM API with original IDs, versions, timestamps, tags and geometry.

The importer matched252 unique bridge ways on the307-edge ORR/ramp network.
Eight other source bridge ways are4.9–8.0km away on unrelated roads and were not
applied. The109 main sections retain a total316.58km of both-direction centerline.
All28,054 original vertices remain in order;30,105 collinear vertices improve
grade sampling without changing alignment. Existing shops, buildings, source
evidence, POIs, road IDs and connectivity are preserved.

## Reproducible update

The importer makes no network requests, acquires the shopfront coordinator lock,
updates only its allowlisted road fields, atomically replaces packs, and refreshes
compressed byte sizes in core. It is safe to repeat after an interruption.

```sh
pipeline/.venv/bin/python pipeline/orr_geometry.py \
  --evidence pipeline/evidence/orr-motorways-2026-10-26.json \
  --supplement pipeline/evidence/orr-neopolis-2026-10-26.json \
  --report pipeline/build/orr/report.json
# Review the report, then repeat with --apply.
```

Shapely2 is required for this geometry-only import. Use the installed pipeline
runtime; no credentials or TLS overrides are involved.

## Verification and limits

The dedicated expressway, covered-path and recovery regression suites check
directed diverges, curve-following signs, grade separation, physical context-tile
support, unique segment ownership, tapers, piers, full-pack consistency and safe
same-carriageway recovery. Existing game/mobile/map/audio/flight suites remain
part of `npm --prefix game run check`.

Original local browser observations and completed interactions are recorded
separately in `docs/playtests/2026-10-26-city-improvements.json`. Flight approach
and recovery are identified as such. A source-network audit, successful build or
short drive does not establish that every exit, the full ring, or a physical phone
has been verified. Exact toll-plaza layouts, surveyed heights and every current
sign face remain outside the evidence available in this batch.
