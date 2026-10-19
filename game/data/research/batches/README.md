# Reviewed block batches

Research agents author independent JSON records here. Only the importer writes the active survey, using a lock and atomic rename. A recorded observation is not a verified storefront or completed road side.

Each batch needs `schemaVersion: 1`, a unique stable `id`, world `hyd-metro` / `2.0.0`, `reviewedAt`, `reviewer` and explanatory `notes`. It may contain `sources`, `observations`, `storefrontOverrides`, `corrections`, `suppressions` and explicit `roadReviews`. These arrays use the canonical survey types in `src/world/streetSurveyTypes.ts`. Sources distinguish capture month from research date; use unknown capture date for an undated listing or satellite layer. Reference-only imagery must not become redistributed textures.

Validate a preview, then import:

```sh
node --experimental-strip-types scripts/survey-import-batch.mjs data/research/batches/<block>.json --check
node --experimental-strip-types scripts/survey-import-batch.mjs data/research/batches/<block>.json
npm run survey:network
node --experimental-strip-types scripts/survey-queue.mjs
```

The receipt records SHA-256 of canonical batch content. An identical repeated import is a no-op. Reusing the same batch ID with different content is rejected; author a new correction batch instead. Changing an existing record requires `expectedPrevious["collection:id"]` to equal `surveyRecordHash(previousRecord)`. This prevents a stale agent from overwriting newer work silently.

To retract a mistaken assignment, supply `retractions` with collection, ID, exact previous hash, reason and corroborating source IDs. The previous record is preserved under `retractionHistory` and removed only from the active layer. Road-side ranges can be withdrawn/replaced using `roadReviews[].replace`, the exact `expectedPrevious["roadReviews:roadId:side"]`, notes and source IDs. A correction must not preserve coverage known to belong to the wrong side or building.

`building_profile.profile` describes independently authored wall/glazing bands, normalized bays, piers, access and building-name fascia. Business names stay in storefront records or a separate building anchor; dated advertisements can use appearance-only `signPanels` without inventing another tenancy. Appearance can be observed while every metric dimension remains provisional. Authored access uses a shared, road-cleared plan for rendering and matching solid collision. It does not rewrite the canonical building footprint, but it can change the physical world and therefore requires calibration against the final frozen data.

For a continuous visual inventory, walk the actual endpoint/intermediate panoramas and inspect reverse angles. Account for every visible named unit/floor, unmarked glazing, unresolved or hidden operator, and non-shop gap. Only then set `allFrontagesRecorded: true` for that bounded range; keep `completeness` and side `status` partial while geometry is provisional. A full-network queue is a work plan, and a pending distant observation is not a completed frontage. Repeated or co-located boards must not be described as separate premises.

The importer validates against all real chunks, IDs and facade edges before committing. It never marks a side reviewed because a listing exists, nor marks geometry verified because a business sign is legible.
