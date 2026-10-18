# Station landmark research (Hyderabad metro, 57 stations)

Output: `landmarks.json` in this folder. One entry per station in `game/public/world/hyd-uppal-tarnaka/v1/core.json`.

## Method

- Web search snippets only (WebSearch, standard mode; extended for one station). WebFetch was blocked for the L&T Metro aggregator hosts, so no page was opened in full.
- Every landmark carries the URLs of the search results that named it. No URL was invented.
- Confidence: `high` = Wikipedia, official, or newspaper statement of the feature; `medium` = consistent list from one reputable or aggregator source; `low` = single aggregator, conflicting, or unclear.
- Many `ltmetro.com/?p=NNN` links come from search results whose page-to-station mapping was not confirmed. Those entries are `low` or `medium`. Check them against the L&T Metro site before the game relies on them.
- Distances are not field-verified. Several sources disagree on distances and opening years; the JSON description notes the conflicts.
- Not verified: anything from a drive-by check. Treat this as a starting list for a human to confirm.

## Findings to check first

- **No Ameerpet skywalk found.** The search did not confirm any skywalk from the Ameerpet interchange to a mall, so the station-to-mall skywalk idea is unconfirmed.
- **No HITEC City skywalk found.** Cyber Towers is adjacent; the skywalk was not confirmed.
- **Uppal skywalk is confirmed** (HMDA, circular, 660 m per one report). The lift and staircase counts conflict between sources.
- **Nagole flyover:** length is disputed (947 m, 900+ m, 990 m). Opening status after 26 October was not confirmed.
- **Raidurg skywalk:** HMRL reports a skywalk to Mindspace. A separate Telangana Today item covers only a proposed skywalk and underpass.

## Landmarks per line

Counts are station-landmark rows. Interchanges (Ameerpet, Mahatma Gandhi Bus Station, Parade Grounds) are counted on both lines, so the per-line totals add up to more than the 204 total rows.

| Line | Station-landmark rows |
|---|---|
| Blue | 91 |
| Red | 86 |
| Green | 40 |

Total rows: 204. High confidence: 7 (Assembly / Legislative Assembly, Gandhi Bhavan, Cyber Towers at HITEC City, Parade Ground at Parade Grounds, JNTU campus at JNTU College, Uppal skywalk, Peddamma Temple at Peddamma Gudi).

## Stations with no findings

- L. B. Nagar (terminus): no reliable landmark in the results.
- Miyapur (terminus): only locality names (Nadigada Tanda, Hafeezpet), not landmarks.

## Weak findings (one source or a single distance)

- KPHB Colony: only the area name.
- Kukatpally: only a traffic-police-station listing.
- Victoria Memorial: only a playground about 60 m away.
- Musarambagh: only a mall about 60 m away.
- Malakpet: the landmark list may be the same list attributed to New Market.
- Balanagar: conflicting reviews on D-Mart and the Kukatpally wholesale store. Lakeshore Mall was not confirmed.
