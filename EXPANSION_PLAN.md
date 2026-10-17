# Expansion plan v2: whole metro network, real storefronts, new controls

Prepared 2026-10-17 in response to playtest feedback. Feedback items: the scene is not close enough to reality (shop boards, hotels, restaurants and groceries should be visible); the map is limited to Uppal–Tarnaka; the controls are awkward; bridges are wrong; people walk on bridges; some graphics look odd.

## 0. What this environment can and cannot see

| Source | Reachable here? | Legal to use? | Use |
|---|---|---|---|
| **Overture Maps** open data (S3 bucket, release 2026-09-23.1) | **Yes**, tested | Places, buildings, base: **CDLA-Permissive-2.0**. Transportation: **ODbL** (from OSM) | Roads and turn restrictions for all three lines, 893k building footprints, **127,080 named businesses** (76k with confidence ≥ 0.5): shops, restaurants, hotels, groceries, banks, hospitals |
| Bundled OSM snapshots (kit) | Yes (local) | ODbL | Metro alignments, stations, existing Uppal–Tarnaka package |
| Web search (server-side) | Yes | Text facts with citations | Landmark research (e.g. Uppal skywalk: 660 m circular skywalk, opened 2023) |
| Google Street View / Google satellite | **No** (blocked); also **not allowed** — Google Maps Platform terms forbid extracting or copying imagery and content into another product | — | Not used |
| Mapillary / KartaView / Panoramax street imagery | **No** (blocked) | Open licences (CC-BY-SA etc.) | Future verification pass, if the host is allowed and a token is supplied |
| Esri/other satellite tiles, OSM API/Overpass/Geofabrik | **No** (blocked) | Varies | — |

**Honest consequence:** I cannot look at Street View or satellite photos from here, and copying Google imagery would break its terms even if I could. "Every store replicated perfectly from street view" therefore cannot be guaranteed. What *can* be done, and is planned below:
- Use Overture Places, the business listings Meta and Microsoft contributed to Overture, which is the most complete open business dataset. It gives the **real business names, categories and positions** along every road the car drives.
- Render a signboard on the matching building frontage, facing the road, for every listing.
- Model named landmarks (Uppal skywalk, flyovers, malls, stations) from map geometry plus web-researched facts.
- Keep every storefront marked `provisional (listing-based, not street-view verified)`.
- Provide a verification lane (§6) for when street imagery access or local review becomes available.

## 1. World data v2: all three operating lines (data worker)
1. `scripts/overture/fetch.py`: anonymous S3 read with a bbox filter for each corridor, saved to `data/raw/overture/2026-09-23.1/*.parquet`. Each file gets a sha256 and the release id, so the raw snapshot is frozen.
2. **Selection:** for each line (Red Miyapur–LB Nagar, Blue Nagole–Raidurg, Green JBS Parade Ground–MG Bus Station):
   - main roads (motorway–tertiary) within **300 m**, and all classes within **150 m**;
   - expanded to keep the network strongly connected, plus links between lines at interchanges (Ameerpet, MG Bus Station, Parade Ground) **through real roads only**;
   - residential lanes beyond 150 m only where they carry a delivery or reconnect.
3. **Graph:** Overture segments and connectors become directed edges. Use Overture's real `prohibited_transitions` (turn restrictions) and access/one-way rules (the old OSM boxes had none). Build bridges and levels from `road_flags`/`level`, with ramps and elevation continuity (validator checks).
4. **Buildings:** Overture footprints within 120 m of selected roads. Height comes from `height`/`num_floors` where present (1.4k); otherwise a provisional height by land use and footprint size.
5. **Storefronts:** for every place within 40 m of a selected road:
   - attach it to the nearest building whose edge faces that road;
   - store the frontage segment, road side, facing, the name (original spelling) and category, plus the confidence and source dataset;
   - group listings in the same building into one facade with several shop units;
   - drop listings that are permanently closed or below a confidence threshold. They stay in the inventory with reasons, never silently.
6. **Landmarks and structures:** footway/pedestrian segments with `is_bridge` become **skywalks and foot-over-bridges** (Uppal circular skywalk); flyovers come from road bridges; stations and pillars come from the existing metro pipeline, now for all 57 stations.
7. **Package format:** `public/world/hyd-metro/v2/`. A global core holds the road graph, metro, stations and deliveries, quantised and compact. Buildings and storefronts go into 200 m chunks, streamed. Deterministic, hashed and validated (`npm run import:world`, `npm run validate:world`).
8. **Deliveries:** about 6 real named businesses per station area (around 300 in total), on routable carriageways with stop polygons at the kerb.

## 2. Controls (lead)
- **Left thumb:** steering pad (left/right only).
- **Right thumb:** **▲ Accelerate**, **▼ Brake / Reverse**, **FLY/LAND**. Nothing else; the separate Reverse button is removed.
- **No input = the car holds.** Releasing ▲ brakes to a stop and holds there; there is no automatic cruise. Holding ▼ brakes, and once stopped, keeping ▼ held reverses.
- **In the air:** ▲ speeds up, ▼ slows down to a (metered) hover, and steering turns. No input keeps the current flight speed.
- **Keyboard:** W/S/A/D or the arrows, Space for fly/land.
- The delivery hold, tests, the reference agent and the tutorial are all updated to match.

## 3. Bugs and consistency (lead + art)
- Pedestrians spawn only on at-grade footpaths. Never on bridges, flyovers or decks.
- Bridges and flyovers: continuous deck geometry following the ramp profile, piers to the ground, parapets, and no gaps at the joints. Render and collision come from the same profile.
- Remove odd visuals: the flat empty ground (dense real footprints fix most of it), blocky shopfronts, and floating objects.

## 4. Art: make places recognisable (art worker)
- **Shop signboards:**
  - the real name text in the sign band, sized to the frontage;
  - category templates for colour, icon and awning style (pharmacy green cross, grocery fruit crates, restaurant awning, bank panel, jewellery gold band, mobile/electronics glass front);
  - a Telugu sub-line only where the source has a Telugu name;
  - texture atlases baked once per chunk;
  - no copied brand logos: text only, and brand colour only where it is not a trademark copy.
- **Facades:** varied Hyderabad building styles; ground-floor shutters, glass fronts and roller doors chosen by category; first-floor boards for upper-floor businesses.
- **Landmarks:** Uppal circular skywalk (ring deck, lifts and stairs), flyovers, malls and hospitals as tagged; station names on the stations.
- **Performance:**
  - per-chunk merged meshes plus instancing;
  - distance LOD that drops sign text beyond about 120 m but keeps the boards;
  - roughly the same draw-call budget as now.

## 5. Missions and levels (lead)
- **Level 1:** short local deliveries (0.5–1.5 km) within one station area.
- **Level 2:** along a line between neighbouring stations (2–4 km).
- **Level 3:** a full line segment (5–10 km).
- **Level 4:** cross-line deliveries through real interchange roads (Ameerpet, MGBS, Parade Ground).
- **Level 5:** long cross-network contracts (15–25 km) with 25–30 s flight budgets.
- Every level is unlocked by completing the previous one. Each contract is still completable on the ground and calibrated by the reference agent.

## 6. Verification lane
`qa/storefront-inventory.json` lists every frontage interval with: listing-based names, confidence, and status (`provisional_listing` | `verified_imagery` | `verified_field` | `missing`). If you allow `graph.mapillary.com` (and its image CDN) in the environment's Network settings and provide a Mapillary token, an AI-assisted pass can compare listings against open street-level images. A local visit checklist per station area is generated either way.

## 7. Execution with subagents
| Worker | Model | Owns | Starts |
|---|---|---|---|
| Data v2 | Sonnet | `scripts/overture/**`, `scripts/import-world-v2.mjs`, `public/world/hyd-metro/v2/**`, data manifests, CONTENT_GAPS/DATA_SOURCES | now |
| Landmark research | Haiku (web search) | `data/research/landmarks.json` (+ citations) | now |
| Art v2 | Sonnet | `src/art/**` (signboards, bridges, skywalk, facades) | after the storefront schema is fixed (lead, now) |
| Lead | — | schema v2, controls, physics and traffic fixes, streaming for the larger world, missions and levels, integration, tests, review | now |
| Reviewer | Sonnet | `qa/independent-review-v2.md` | at the end |

Order: schema → (data ∥ research ∥ controls) → art on real data → missions and levels → tests, captures, review → ledgers.
