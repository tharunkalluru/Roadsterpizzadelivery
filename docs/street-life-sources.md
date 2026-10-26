# Bus services, auto sayings and pedestrian clothing

Reviewed 26 October 2026. These changes preserve existing shopfront names, source
boards and the upgraded player model.

## Published bus services

[TGSRTC Open Data](https://www.tgsrtc.telangana.gov.in/open-data) publishes static
GTFS route/stop data and permits attributed application use. The exact statement
“Contains data provided by TGSRTC” is included in the application attribution.
No official logos or endorsement are implied.

The [Government of Telangana dataset mirrored by OpenCity](https://www.data.opencity.in/dataset/hyderabad-bus-stops)
links the [8 February 2026 archive](https://data.opencity.in/dataset/88e2d145-7ec6-4666-88dd-6cf18b18312e/resource/1b0d18bb-b2fb-4a79-8ed0-1e071da5790c/download/telangana_opendata_gtfs_tgsrtc_08_february_2026.zip).
Its publisher is Open Data Telangana, feed version `20260201`, agency TGSRTC.
The downloaded archive SHA-256 is
`e0a90bca1b9490a5cf92a805fecba7aca2c011527b2269904d54c5cc553be4d6`.
It contains 1,031 route IDs, 44,892 trips and 5,028 stop records.

`pipeline/import_tgsrtc.py` selects the most frequent useful full stop pattern in
each published route/direction and projects the original coordinates using the
city's existing projection. The runtime pack contains 897 distinct route IDs across 1,511 patterns and 4,098
referenced stops. It excludes 7,044 depot/other trips whose displayed trip-number
prefix disagrees with their parent route ID, rather than silently displaying the
wrong number. These are representative patterns, not every scheduled variation.

```sh
pipeline/.venv/bin/python pipeline/import_tgsrtc.py \
  --feed pipeline/build/transit/tgsrtc-2026-02-08.zip
```

The feed has **no route shapes**. A reproducible offline builder now constrains
each consecutive published stop pair to a persistent sequence on the complete
shipped directed road graph. It records the GTFS archive hash, all 305 road-source
file hashes and a combined network hash. Of 36,457 legs whose two stops fall in
the playable bounds, 34,912 have a continuous legal alignment and 1,545 remain
explicitly unresolved. Across the complete published sequences, 34,912 of 39,070
legs resolve and 649 of 1,511 representative patterns resolve end to end.

These are inferred legal road paths, not agency-supplied or surveyed turn-by-turn
shapes, live bus locations, or proof of current diversions. A bus follows the
stored edge/direction sequence; if a required road is unavailable it stops the
service rather than switching to a nearby parallel street. The complete per-leg
status and hashes are in
`pipeline/evidence/tgsrtc-alignment-audit-2026-10-26.json`.

Naturally spawned buses acquire a published service before appearing. The same
route number and actual destination are drawn on large front and rear boards.
Their junction choices follow that service, and only its ordered stops trigger
dwell. Unmatched roads receive other traffic instead of buses with invented
routes. The earlier unrelated random number/destination list was removed.
Per-bus route textures are released on despawn and area changes.

## Ten auto sayings

Each of ten auto model variants receives exactly one Telugu saying on its rear
black canvas, with the number plate retained. The font is the application's
existing Noto Sans Telugu; short lines keep the writing readable at driving
distance. A quote stays attached to that vehicle for its lifetime.

This is a curated mix of funny, family and regular roadside sayings. There is no
reliable measured citywide popularity ranking, and these are not claimed to be
the statistically most popular ten. Spelling/punctuation is normalized; no
publisher graphics or photographs are packaged as decals.

| IDs in the catalogue | Evidence and treatment |
| --- | --- |
| `amma`, `nanna` | [Disha's 30 March 2025 report](https://www.dishadaily.com/telangana/quotation-on-the-back-of-an-auto-with-cm-revanth-reddys-photo-goes-viral-426325) describes the familiar parental-blessing slogans. Only these short family sayings are used; the political photograph/quotation in that report is not used. |
| `slow`, `youth`, `envy` | [A Telugu-speaking observer's 18 October 2016 firsthand report](https://www.indiastudychannel.com/forum/148869-Thought-provoking-road-safety-slogans-quotes-and-sayings.aspx) records two safety sayings and an auto seen that day. Romanized text is rendered in Telugu script. This is anecdotal observation, not a recent street survey. |
| `fare`, `speed`, `hospital` | [ChaiBisket's 29 December 2018 auto-saying collection](https://www.chaibisket.com/blogs/blog/autowala-quotes), contributed by Krishna Prasad; original cards 12, 9 and 14 were visually inspected. The publisher's illustrations were not copied into game assets. These are reported street sayings, not independent contemporary Hyderabad photographs. |
| `tree` | [Disha's 10 April 2024 report](https://www.dishadaily.com/telangana/autowalas-quote-on-environment-is-going-viral-317345), quoting Sudhakar Udumula's original Hyderabad auto photograph. A short excerpt preserves the tree/rain sentiment; it is a driver's saying, not a scientific weather model. |
| `story` | [Andhra Jyothy's 21 October 2024 report](https://www.andhrajyothy.com/2024/prathyekam/if-you-want-to-tell-a-sad-story-then-it-is-rs-1000-if-you-want-to-cry-along-with-it-then-it-is-rs-2000-sgr-spl-1324651.html), tracing the original `swathi_siara` video. The two humorous fee lines are an abbreviated Telugu rendering of the reported advertisement. No handle or personal contact details are reproduced. |

The quote catalogue records the source URL per entry. Political slogans,
religious antagonism and demeaning long-form viral quotations were not needed for
this mix. The cultural references do not verify a particular current driver's
vehicle, route or identity.

## Clothing

Pedestrians retain the existing varied mix of casual trousers/shirts/tees, jeans,
saris, salwar-kameez/dupatta, kurtas, lungis, modest covered garments, schoolwear and
elder clothing. Garment construction now distinguishes blouse, pleats, pallu and
border; kameez hem and trousers; shirt collars, plackets and cuffs; and checked or
striped cloth. Long/short sleeves and facial details vary instead of being
identical on every person. Static crowds and walking figures use the same builder.

These are stylised clothing improvements, not measurements of Hyderabad's
demographic composition or exact reconstructions of individual people. No face
photographs or inferred identities are used. Visual component checks and actual
gameplay checks are recorded separately in the follow-up acceptance report.
