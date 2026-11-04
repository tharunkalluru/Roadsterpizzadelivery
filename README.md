# Hyderabad Roadster — Pizza Delivery Boy

A browser delivery game set in Hyderabad, built with Three.js, TypeScript and Vite. The current source is the fourteen-scene delivery build in `game/`; it replaces the earlier coins-and-theatres game. Progress comes from completing deliveries and growing the player's restaurant.

## Play and develop

```sh
cd game
npm ci
npm run dev
```

The game supports keyboard controls and landscape touch controls. Desktop controls are **W** to accelerate, **Space** to brake, **S** to reverse, **A/D** to steer, **E** to jump and **Q** to fly or land. Jump and flight also have clickable buttons.

## Current checkpoint

This is the November 4, 2026 progress snapshot. It includes cinematic delivery work, character and traffic improvements, carton/pickup behavior, road-contact and divider fixes, asset delivery, and recorded QA evidence.

The replacement road source/model and startup cache remain disabled while their complete physical and gameplay checks are finished. This commit does not claim a completed whole-city road reconstruction, a new live Site deployment, or measured physical-phone FPS. See [the checkpoint note](game/docs/qa/github-main-checkpoint-20261104.md) and [the release checklist](game/docs/qa/main-expansion-release-checklist.md) for completed scopes and open gates.

## Repository layout

- `game/`: game source, assets, tests, build tools and game-specific documentation.
- `pipeline/`: retained city-map processing tools and source-data research.
- `tools/`: retained repository-level utilities.
- `docs/`: retained repository-level documentation.

The packed city files in `game/public/city/` are gzip-compressed JSON despite their `.wasm` extension. The game prepares city sections in a worker as the player moves. The map-building pipeline and the earlier Git history are preserved.
