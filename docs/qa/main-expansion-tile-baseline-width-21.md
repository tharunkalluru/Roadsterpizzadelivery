# Literal pavement preservation for 21 raised tile streets

The joint input incorrectly stored the old 8.4 m pavement as originalWidth while retaining a smaller scalar source width inside its full-road interval. The profile evaluator therefore narrowed these already-raised streets to 4.5–6 m. Restoring only the scalar width on the densified path was also insufficient: inserting controls changes the renderer's averaged normals, shifting one boundary by as much as 3.081 m.

The bounded correction adds an explicit optional joinedPavement.physicalWidth target and preserves the exact historical coarse controls for these 21 streets. Source w, lane count, topology and original source elevations remain unchanged. A source-bound artifact stores the exact IDs, source records, literal historical L/R coordinates and their hashes from the strict a679 historical export. It is tied to source generation 9413 and the immutable raw packs.

The builder rejects changed inputs, wrong pack hashes, an incomplete 21-road inventory or any mismatch against the literal historical ribbons. Its preHeightWidths records explicitly identify the coarse-control exception; they are not silently treated as streets resampled to 2 m. Joint grade, smoothness, actual vehicle and terrain checks still decide whether those controls are sufficient.

The physical-width consumer is shared by asphalt, support ribbons, caps and conservative roadside clearance. Tile transports, worker/core patch metadata and cache/overlay validation retain the field; malformed targets reject before installation. Source widths and NPC lane capacity remain unchanged. Existing profiles without the field retain their prior behavior.

Checks pass for all 21 historical L/R arrays and all 182 unique actual emitted Float32 road-strip triangles, with zero missing or additional triangles. All 52,411 core be04 ribbons and the prior 13 prepared tile arrays/ribbons remain exact. Restoring the genuine old footprint adds eight nearby fixed-context roads; all eight are present in the historical inventory. The new joint input has 487 owners, 130 context copies, 814 fixed-context roads, 482 boundary roads, 756 nodes and zero unverified all-arm source connections.

Nine tile-profile groups, eight overlay groups and five independent cache/overlay groups pass, including invalid physical-width targets and unchanged source capacity. Full typecheck was blocked by an independently owned actor-meal-geometry Mesh.bindMatrix error at the time of this check.

The immutable binding is /tmp/roadster-road-freezes/source-9413-af5-pjr-capacity-v1/jointBindingBaseline21-d3256b22a8a923b862f0e0e86bd95269eba9938dfd7528062f53df633f14f128.json. It binds joint input e866b9f8 to ordinary core be04. No solved heights, source/profile/cache activation or overall road acceptance is implied.
