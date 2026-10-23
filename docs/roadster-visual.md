# Roadster visual rebuild

The playable car is now a procedural interpretation of Tesla's current October 2026 Roadster coupe. It is not a licensed CAD model or a reproduction of the earlier 2017 concept. No Tesla photographs are shipped as game textures. The insulated pizza case is a game accessory.

## Reference evidence

Inspected Tesla's Roadster page in Chrome and the following official images on 2026-10-23:

- Product page: https://www.tesla.com/roadster
- Side profile: https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/Roadster-02-Pilot-Desktop.jpg
- Front details: https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/Roadster-03-Carousel-Slide-1-Desktop.jpg
- Rear wing and cold-gas outlets: https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/Roadster-06-Gravity-Desktop.jpg

## Implemented

- Wedge-shaped faceted body, open wheel arches, enclosed fastback, dark copper glass, titanium trim and door seams.
- Thin split-spoke wheels, machined rim lips, fixed calipers, narrow front lights and red rear light bar.
- Active rear wing, four rear thrust outlets and four downward lift outlets, smooth deployment and stow, white cold-gas jets and expanding condensate.
- Separate steering and wheel-rolling groups keep brake calipers fixed. Normal and rescue flight share the same thruster visual lifecycle.

Changes are restricted to vehicle geometry and animation in `game/src/world/vehicles.ts` and `game/src/game/player.ts`. Driving, collision and flight-charge constants were preserved. Geometry uses the existing arcade footprint rather than claiming manufacturer dimensions.

## Verification

- `npm run typecheck --prefix game` passed.
- `git diff --check` passed.
- Chrome WebGL review of the actual Player model: front, rear and side; deployed thrusters and raised wing; subsequent stow. No console errors were logged.
- The temporary isolated review page and its development server were removed after inspection. Final integration verification belongs to the complete game build.

Remaining fidelity limits: procedural meshes, simplified aero and cabin details, no animated door opening, and no claim that the arcade flight simulation matches real thruster performance.
