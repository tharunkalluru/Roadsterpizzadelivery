# Pizza to Picture Hall

A 3D browser game set in Hyderabad. You fly a pizza roadster across the real city, deliver hot pizzas for coins, and spend them leasing a single-screen picture hall.

Built with Three.js, TypeScript and Vite. It runs on desktop (keyboard) and on phones (touch or tilt steering, landscape).

## What's in the city

- **Real streets and buildings** from OpenStreetMap and Overture Maps, laid out at true scale around RTC X Roads. The map covers the city out to the ORR.
- **Roads:**
  - flyovers and their ramps;
  - the ORR and expressways, with lanes, barriers and exits;
  - toll plazas, skywalks (including Uppal), foot overbridges and subways;
  - direction boards and area names.
- **Transport:**
  - **Metro:** twin-track viaducts, umbrella-roof stations with their names, and trains that stop with passengers.
  - **Railways:** lines, stations and moving trains.
  - **Buses:** major bus stands such as MGBS and JBS, plus named bus stops.
  - **Fuel:** petrol bunks under their real names.
- **186 hand-built landmarks.** Each sits at its mapped position and footprint:
  - Charminar and the Char Kaman, Golconda, Birla Mandir;
  - temples, mosques, churches and palaces;
  - stations, hospitals, campuses, IT parks, malls, stadiums, the airport and statues.
- **Storefronts** carry real shop names, taken from OpenStreetMap, Foursquare open places and readings of Mapillary street photos.
- **Parks, lakes and the Musi** come from mapped outlines. Hussain Sagar has Tank Bund and Necklace Road.

## Playing

| Action | Keyboard | Phone |
|---|---|---|
| Drive / brake / reverse | W / S | on-screen pedals |
| Steer | A / D | thumb stick or tilt |
| Fly (uses the flight boost) | Space | FLY button |
| Accept order, collect, hand over | E (hold) | ACT button |
| Map | M | map button |
| Theatres | T | THEATRES |
| Back to the road when stuck | R | rescue chip |
| Pause | P | pause button |

## Run it locally

```bash
cd game
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # production build in game/dist
npm run typecheck
```

The prebuilt city map ships in `game/public/city`:

- `core.pack.wasm` and `map.pack.wasm` hold the metro, the overview map and the manifest.
- `packs/*.pack.wasm` hold 1 km tiles in 3×3 groups. Despite the `.wasm` extension, these are gzip-compressed JSON.

The game builds each tile in a Web Worker as you move.

## Project layout

```
game/
  src/core     engine, geometry templates, utilities
  src/world    city builder (roads, buildings, metro, rail, parks, lakes), landmarks, signs
  src/game     player and physics, traffic, people, metro and rail trains, deliveries, theatres
  src/ui       HUD, title screen, area picker, settings
  public/city  prebuilt map packs
pipeline/      Python scripts that build the map packs from open data
tools/         Playwright scripts for screenshots and play-tests
```

## Rebuilding the map (optional)

The scripts in `pipeline/` download the open data, then merge it and clean it up:

- **Downloads:** OpenStreetMap, Overture buildings and roads, and Foursquare open places.
- **Processing:**
  - place shops on building fronts;
  - fix flyover decks and ramps;
  - resolve landmark positions;
  - export the packs.
- **Street-photo reading:** `mapillary_ocr_fast.py` needs your own key in the `MAPILLARY_TOKEN` environment variable. No keys are stored in this repo.

The raw downloads run to several GB and are not committed.

## Data and credits

- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL)
- [Overture Maps Foundation](https://overturemaps.org/) data (ODbL / CDLA)
- [Foursquare Open Source Places](https://opensource.foursquare.com/os-places/) (Apache 2.0)
- Street-level imagery readings from [Mapillary](https://www.mapillary.com/) (CC BY-SA)

The films, orders and customers in the game are made up.

## Checks and research workflow

Run `cd game && npm run check` for TypeScript, focused map/gameplay regressions and the production build. Run `python3 -m unittest discover -s pipeline/tests -p 'test_*.py'` from the repository root for naming/import checks.

- [Gameplay audit](docs/gameplay-audit.md) and [map control audit](docs/map-controls-audit.md) record fixes and remaining verification gaps.
- [Shopfront workflow](pipeline/README.md) explains evidence batches, parallel OCR workers and serialized imports. Mapped names and inferred facades are kept distinct from street-photo verification.
- [Roadster visual references](docs/roadster-visual.md) record the procedural car's sources and limitations.
