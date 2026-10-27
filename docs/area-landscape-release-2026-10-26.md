# Area selection and landscape controls

This pass addresses the four new requests. It preserves the Roadster, shopfronts, world geometry and private report storage.

| Before | After | Why |
| --- | --- | --- |
| Failed move drops the chosen destination into the generic chooser | Exact-destination retry, nearby-map correction and explicit Stay here | Preserve intent and progress through a loading or placement failure |
| Road rejected when any remote vertex is elevated; saved bounds read as array | Local support checks, safe elevated fallback, real object bounds | Accept valid locations without placing into unloaded or obstructed geometry |
| BRAKE grew in both dimensions | Width 150%; height equals GO | Match the requested pedal proportions |
| Speed at right; FLY/CRUISE offset left | Bottom-center speed; FLY/CRUISE directly above GO | Stable driving layout across landscape sizes |
| Portrait has a Play anyway bypass | Mandatory rotate gate and Enter Full Screen Mode | Keep gameplay in landscape |

Loading now has request ownership and abortable waiters. An obsolete response cannot move the car, reset the chosen area or replace a newer loading result. Failed attempts retain the previous area, coins, pending offer and saved location; only safe placement commits the new area. Accepted deliveries still prevent changing area.

The source review confirmed defects in the failure branches, elevation filtering and saved bounds. The exact intermittent screenshot incident was **not** reproduced. Baseline physical-source probes around the screenshot already found safe streets, so elevation is a demonstrated failure class rather than a conclusive diagnosis of that particular incident.

Full checks/build passed. New integration coverage includes rejected loads, blocked placement, exact retry, nearby-map cancellation, stale success/error, same-coordinate loading, unsupported fullscreen/orientation, and accepted-order/off-map guards. Geometry checks cover six landscape sizes and two safe-inset variants. Original visible-browser captures cover four landscape sizes, two portrait gates, native fullscreen and a map-selected Telecom Nagar start. The game loaded Gachibowli, restored it after reload, then placed the car at the map-selected Telecom Nagar pin and offered a delivery there. No collection or handover was completed in this pass.

Fullscreen requests landscape where the browser allows it. A browser that cannot rotate automatically keeps the prompt until the user turns the device. Nothing Phone hardware remains untested. The existing menu remained covered by the gate when its viewport became portrait.

Machine-readable results, source hashes, original screenshots, limitations and publication receipts: [validation record](playtests/2026-10-26-area-landscape.json).

Version 12 is live at https://hyderabad-pizza-picture-hall.blithe-okapi-0017.chatgpt.site . Implementation commit: `4a57d4029619d4e44c722cd4809e1a3aa8a24d66`; Site source: `c92a4511b8f1ac2a41eb66568784d16056974457`. The live JavaScript hash matches the tested build. A live existing saved game restored 631 coins, 1/3 progress and requests OFF; map relocation from Eastend Colony to Gachibowli and picker relocation from Gachibowli to Charminar both completed with those values preserved and no captured console warnings/errors. The retained live game is paused; owned local tabs and server were closed.
