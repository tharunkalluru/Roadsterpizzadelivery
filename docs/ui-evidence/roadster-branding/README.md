# Roadster branding — 2026-10-30

Added exact lowercase `tfigames.com` to both doors and `pizzadeliveryboy` across the rear fascia. Cream italic lettering, dark plum cutout vinyl, gold leading slash and teal underline share the game palette. Both doors share one static canvas texture/material, with independent outward UV orientation and geometry conforming to the door skin. The rear sticker fits between the red light bar and the license plate/reverse lamps. Alpha-tested opaque decals avoid transparent sorting. Three small static meshes, two textures; cosmetic meshes are excluded from jump/collision bounds.

Observed both sides and rear by orbiting the camera in Low graphics at 1280x720, then checked landscape 800x360. Side text is not mirrored, rear text is exact, lights and number plate remain clear. Screenshots: side-left.png, side-right.png, rear.png. TypeScript, production build and existing driving-tuning regressions passed. No new tests added for this cosmetic change.
