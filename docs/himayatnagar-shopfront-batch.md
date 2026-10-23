# Himayatnagar / Narayanguda shopfront batch — 2026-10-23

Prepared independently of the RTC Cross Roads batch. Bounds: south 17.393, west 78.478, north 17.405, east 78.488. This covers the western Himayatnagar / Narayanguda corridor; it is not a survey of every road in either neighborhood.

## Evidence and reconciliation

- Retrieved live from the [OpenStreetMap map API](https://api.openstreetmap.org/api/0.6/map.json?bbox=78.478,17.393,78.488,17.405) at `2026-10-23T06:25:31.252718+00:00`.
- Examined 14,703 returned map elements; selected 42 named shops, restaurants, cafes, fast-food outlets, pharmacies and banks within the bounds (39 points, 3 building ways).
- Preserved original source IDs, names, tags, edit versions and timestamps. Way outlines use the original ordered node coordinates from the same response.
- 30 names matched existing game boards by original OSM ID or a unique exact name within 25 m.
- 12 candidates require street-photo review. No new label had sufficient building/frontage evidence for automatic placement.
- The successful building matches include Naveen's pet shop, Pai and Dmart. Other existing matches include Almond House, Cafe Bahar, Ratnadeep supermarket, Neeru's and La Milano Pizzeria.
- Source license: ODbL-1.0. Current opening status and visible signage have not been established by this map-data pass.

## Pending street-photo review

| OSM business name | Primary source | Next evidence needed |
| --- | --- | --- |
| Minerva Coffee House | [node/613410619](https://www.openstreetmap.org/node/613410619) | Readable frontage, building association, road side, neighboring shop order and imagery date |
| Blue Fox Restaurant | [node/726709518](https://www.openstreetmap.org/node/726709518) | Readable frontage, building association, road side, neighboring shop order and imagery date |
| Vasu Medical Store | [node/726720120](https://www.openstreetmap.org/node/726720120) | Readable frontage, building association, road side, neighboring shop order and imagery date |
| Medical Store | [node/727282352](https://www.openstreetmap.org/node/727282352) | Readable frontage, building association, road side, neighboring shop order and imagery date |
| paradise | [node/4369845292](https://www.openstreetmap.org/node/4369845292) | Readable frontage, building association, road side, neighboring shop order and imagery date |
| Brand Factory | [node/4415331904](https://www.openstreetmap.org/node/4415331904) | Readable frontage, building association, road side, neighboring shop order and imagery date |
| Telugu academy | [node/4431132190](https://www.openstreetmap.org/node/4431132190) | Readable frontage, building association, road side, neighboring shop order and imagery date |
| brown bear | [node/7244264220](https://www.openstreetmap.org/node/7244264220) | Readable frontage, building association, road side, neighboring shop order and imagery date |
| Domino's | [node/7244264222](https://www.openstreetmap.org/node/7244264222) | Readable frontage, building association, road side, neighboring shop order and imagery date |
| westside | [node/7244264232](https://www.openstreetmap.org/node/7244264232) | Readable frontage, building association, road side, neighboring shop order and imagery date |
| Malabar Gold and Daimonds | [node/7244264233](https://www.openstreetmap.org/node/7244264233) | Readable frontage, building association, road side, neighboring shop order and imagery date |
| Classique Communication | [node/8093205737](https://www.openstreetmap.org/node/8093205737) | Readable frontage, building association, road side, neighboring shop order and imagery date |

The list includes source spellings, which may be historical or incorrect. A map point alone does not establish a storefront slot; none of these pending names were guessed onto adjacent buildings.

## Reproduce

```bash
python3 pipeline/shopfront_batch.py \
  --evidence pipeline/evidence/himayatnagar-2026-10-23.json \
  --output pipeline/evidence/himayatnagar-2026-10-23.report.json
```

Evidence SHA-256: `4797e636a98d0942d843598245bf148ac5ac99fddfc0ce7dd9287b8a9c15e6f8`.

Application was serialized by the shopfront pipeline coordinator: **30 primary-source links added in 1 city pack; 0 new labels**. Reapplying the combined RTC and Himayatnagar reports returned no changes, confirming no duplicate insertion. This research worker did not modify city packs. The coordinator's 14 pipeline regression tests passed.

Exact Street View shop order remains unverified for this batch. The useful change here is auditable primary-source linkage and an explicit next-review queue.
