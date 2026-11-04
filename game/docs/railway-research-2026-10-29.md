# Hyderabad railway and underpass evidence — 29 October 2026

This report distinguishes official project/route evidence from the retained map snapshot and game-model estimates. It does not certify surveyed heights, current traffic restrictions, or photoreal station architecture. No proposed project is treated as built merely because a sanction exists.

## Railway connectivity and station identities

- The [South Central Railway archived 2019 timetable](https://scr.indianrailways.gov.in/uploads/files/1562224521300-MMTS-TT.2019.pdf) identifies the Falaknuma–Lingampalli spine in this order: Falaknuma, Huppuguda, Yakutpura, Dabirpura, Malakpet, Kacheguda, Vidyanagar, Jamai Osmania, Arts College, Sitafalmandi, Secunderabad, James Street, Sanjeevaiah Park, Begumpet, Nature Cure Hospital, Fatehnagar, Bharatnagar, Borabanda, Hitech City, Hafizpeta, Chandanagar, Lingampalli. Its Hyderabad branch uses Hyderabad Deccan, Lakdi-ka-pul, Khairatabad and Necklace Road. This is topology evidence, not a current timetable. The indexed official PDF was readable through search; direct retrieval returned404 during this audit.
- [PIB/Prime Minister’s Office, 5 March 2024](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2011518&lang=2&reg=48), directly retrieved, confirms commissioned Sanathnagar–Moula Ali doubling/electrification and the Ghatkesar–Lingampalli service through that chord. It identifies six new station buildings: Ferozguda, Suchitra Centre, Bhudevi Nagar, Ammuguda, Neredmet and Moula Ali Housing Board. This establishes a real east–west corridor rather than requiring all services to run through Secunderabad.
- The retained `railway-source.json` has816 railway features,149 station features (including Metro) and129 platforms. Conventional rail must filter Metro/subway and service sidings, retain actual way coordinates/connections, and pair genuine running tracks rather than replace the network with straight lines.
- A concrete identity defect exists in the pre-correction code: same-name stations within500m are merged. Old Ammuguda `n351715591` (AMQ, Bolarum branch) at[3245.7,-8863.7] and new Ammuguda `n12115419835` (Sanathnagar–Moula Ali chord) at[2878.7,-9135.4] are about456m apart on different corridors. The older coded point wins and the newly commissioned station disappears. Deduplication must retain both, while still merging the12m Begumpet identity duplicates.
- Moula Ali Housing Board’s identity is confirmed by PIB but no reliable matching station/platform location was present in the retained snapshot. A current Overpass request failed(TLS/406); no coordinate or platform outline has been invented. This remains an explicit placement-review item.

## Railway underpasses supported by official completed-project records

[GHMC Budget2022–23, printed page20](https://www.ghmc.gov.in/Budget/GHMC%20BUDGET%202022-23.pdf) lists completed RUBs at Uppuguda, Uthamnagar and Anand Bagh(Malkajgiri), and FY2021–22 inaugurated RUBs at Hi-tech City railway bridge215 and Thukaram Gate. The official indexed PDF supplies this status; both browser/document fetching and a direct download were blocked403, so no plan dimensions or photographs were inspected from it.

The following coordinates are **retained map intersections**, matched by road names and railway geometry; they are not official project survey coordinates. IDs allow narrow corrections without converting other crossings in the same neighborhood.

| RUB identity | Core road IDs | Running-rail source ways | World-space anchor X/Z | Confidence / limit |
|---|---|---|---|---|
| Uppuguda | `48792b56-85e_0` | `w27951892`, `w817380189` | −1399,7080 | Strong named-road/project match; source omits bridge tag |
| Uthamnagar / Uttam Nagar | `1f2aa4ac-981_0`, `c8bde66e-7da_0` | `w211237562`, `w374872475` |3811,−5843 | Strong matching road/corridor; source omits bridge tag |
| Anand Bagh | `01ceee91-29b_0`, `28b00d08-4ff_1` | `w1308294359`, `w923054875` |4642,−5812 | Strong EAnandbagh road match; source omits bridge tag |
| Hi-tech City bridge215 | `38d866dd-418_0`, `cabc645e-6e3_0` | `w1422240945`, `w1422240947` |−11931,−7236 | Strong; both rail ways explicitly tagged bridge=yes |
| Thukaram Gate | `6b53a1bb-44d_0` | `w211237562`, `w374872475` |2944,−3789 | Named Marredpally–Tukaram Gate main road; nearby siding crossing is a separate case |

At Thukaram Gate, `56194189-07c_0/1` crosses only `w374852037` at[2771.9,−3854.3]. That is not the paired mainline intersection above; do not silently bundle it into the mainline RUB without evidence.

## Other established road-under-rail links

[GHMC corporation resolutions,25February2012](https://ghmc.gov.in/Documents/GB.pdf) record drainage/approach work associated with two railway underpasses near Rail Nilayam and Alugadda Bavi. This is historical existence/project evidence, not a fresh opening date. [Parliamentary written answer2017](https://eparlib.sansad.in/bitstream/123456789/459185/1/71645.pdf) separately records widening of RUB251 at Rail Nilayam and Secunderabad yard as work in progress at that date.

- Rail Nilayam’s current retained roads `53217cc3-27e_0`, `e8d215e1-31c_0` and parallel `cec9d400-cb3_0` cross multiple explicit bridge-tagged yard tracks around[1640,−3275]. Preserve their grade-separated relationship across the full yard.
- Alugadda Bavi’s approximate source bridge pair `w211237565`, `w817269932` is near[2580,−3650], but no intersecting permanent-core road was found within240m. Streamed road/source matching is required before a specific road correction. Do not fabricate a new road from this anchor.
- Begumpet/Bharat Nagar/Sitaphalmandi/Malakpet/Lakdikapul each have distinct railway and road structures. The station name alone does not establish which crossing is an underpass. Keep source-tagged spans, and use road-specific evidence before adding new separation.

## Established road-under-road underpasses

[GHMC Budget2020–21, printed page22](https://ghmc.gov.in/Budget/Budget-2020-21.pdf), indexed official text, identifies three already opened facilities: Ayyappa Society(2-lane one-way from Kondapur;3January2018), Mindspace(6-lane two-way Biodiversity↔Cyber Towers;28April2018), and Chintalkunta Checkpost(2-lane one-way Bairamalguda→Vijayawada;1May2018). These are road underpasses, not evidence for raising a railway.

| Identity | Retained core roads | Approx geographic source anchor |
|---|---|---|
| Ayyappa Society | `e7f77490-046_0` |17.452749,78.383371 |
| Mindspace | `58b1b917-f10_0`, `a3d55b32-008_0` |17.4396,78.3769 |
| Chintalkunta | `699b4800-f7f_0` |17.341828,78.557322 |

A retained street name containing “underpass” is a review lead, not permission to lower every crossing on that road. LB Nagar, Kothaguda, Lingampally and Inner Ring Road links require an exact source/geometry match before adding a new grade separation. St Johns Road is separately matched to the real Oliphant facility below. Widths, depth and roof construction remain game estimates unless supported by engineering drawings.

## Design implications

1. Conventional running rail should normally remain near local ground. A `bridge=yes` feature is evidence for a short rail span over a river, drain or underpass, not permission to turn hundreds of metres of railway into a raised city flyover. Preserve real short spans and horizontal source alignment.
2. A known RUB means the **road** descends through a trough under the rail. Shared rendering, driving support, wall collision, routing and traffic heights must use that same model. Keep the earth/ground from filling the cut and keep its roof above road users.
3. At a real level crossing, remove road medians/kerbs/lamps throughout both tracks’ corridor, surface the crossing flush, and retain the gate/train priority. A vertical separation must never receive a false crossing gate just because its horizontal lines intersect.
4. Unresolved places belong in a review queue. Historical approval, a similar road name, or a source bridge tag does not supply surveyed dimensions or justify an invented route.


## Follow-up: evidence-gated railway underpasses and rail deck continuity

The user reported getting stuck while driving along a railway at an underpass and explicitly prohibited invented underpasses. A follow-up policy audit of release 26 source `229f40261a46e62f2e2a2d67884ca888b738f9e8` found that the previous implementation was broader than the researched catalog:

- Any railway way tagged `bridge=yes` could trigger a road depression at an overlap. A bridge tag alone does not establish what is beneath that span; it may cross water or a drain.
- A generic road name matching `underpass`, `subway` or `tunnel` also supplied rail-over-road order without an exact facility match.
- If already modeled heights were unequal, fallback ordering could choose rail-over-road without independent evidence.
- Connected approach spreading and the yard-clearance pass could subsequently extend the depression to additional roads or track crossings. This made the number of changed road records much larger than the number of facilities.

The baseline audit counted 63 distinct road records with a direct rail-over-road constraint. Eleven matched the then-existing exact railway-underpass road catalog; **52 direct road records lacked that exact match**. The resulting model had 272 road records with a minimum below −0.55 m, including the four established road-road underpass carriageways and connected approaches; 257 lacked an exact road ID in either catalog. These are road-record counts, **not 257 distinct fabricated facilities**. Some uncatalogued places may be real and need verification. The audit output is retained locally at `output/rail-research/underpass-evidence-audit.json`; it does not serve as geographical evidence by itself.

The correction must authorize a railway underpass using the **facility, exact road IDs, exact local railway IDs and a bounded anchor region together**. A source bridge tag or a street-name substring alone must not create a depression. A real yard underpass can include its adjacent railway strands, but only inside that same evidenced local facility; connected-height propagation must not authorize another crossing elsewhere. Unmatched locations remain at the retained local level or enter an explicit conflict/review queue, rather than having an underpass invented to satisfy a clearance test.

### St Johns Road / Oliphant facility: primary evidence and exact match

The retained map uses the name “St Johns Road Underpass” for `57f51bdc-476_1` and `840f1b5c-8a1_0`. This facility is supported by independent primary records, rather than by that name alone:

- [HMDA's government-order compilation, G.O.Ms.No.766, 18 October 2007](https://www.hmda.gov.in/wp-content/uploads/2020/07/Zoning-Regulations-and-MasterPlan-GOs.pdf) identifies the Sangeet Theatre–Narayanaguda corridor through Keyes High School, **Oliphant Under Bridge** and Musheerabad. The separate Musi/Chaderghat bridge with an Oliphant name must not be conflated with this Secunderabad facility.
- [GHMC EVDM's official waterlogging-location table](https://directorateofevdm.ghmc.telangana.gov.in/cec-api/uploads/downloads/65c7407db97d1_1707556989000.pdf) lists Oliphant bridge near Rethifile bus station at **17.433775, 78.505875**. This is an official hazard-location marker, not an engineering survey of the railway deck.
- [GHMC's critical-waterlogging alternative-route list](https://www.ghmc.gov.in/Monsoon_Action/Critical%20Water%20Logging%20Points%20with%20Alternative%20Routes.pdf) identifies both sides of Oliphant Bridge near Chilkalguda and diversion through Rethifile, Keyes High School, Sangeeth, Rail Nilayam and Alugadda Bavi. [Hyderabad Traffic Police's 2024 vehicle-restriction notification](https://www.htp.gov.in/pdf/Vehicle_Restrictions2024.pdf) independently places St Johns Road, Sangeet, Rethifile and Oliphant Bridge on the same corridor.

Using the game's actual origin and geographic conversion, the GHMC location maps to approximately `[985.50, −3040.76]`. The retained road/rail crossing group is around `[989, −3082]`, **41.4 m away**; the official marker can reasonably represent the approach to the structure. The identity association is supported by the route, landmark and geographic proximity together. It does not supply surveyed depth, exact portals or structural dimensions.

The two retained road centerlines cross the following local railway source ways: `w1187064678`, `w28094793`, `w32066979`, `w374856311`, `w374856315`, `w374872479`, `w817269920`, `w817269928`, `w817723526`, `w826105544`, `w1305179138` and `w32066370`. Their crossing points lie between X 970.5–994.1 and Z −3101.1 to −3063.3. An anchor near `[985, −3082]` with a 60 m radius covers the local yard and finite carriageway envelope. It must not permit arbitrary crossings along the same long railway ways elsewhere.

The official indexed documents supplied these details. The GHMC EVDM PDF's direct web fetch returned a gateway error during this round; no photographs or unpublished engineering drawings were inspected.

### Rail Nilayam: bound the yard rather than granting a whole road permission

The three retained Rail Nilayam road IDs in the earlier table cross ten explicitly bridge-tagged railway ways within the local yard: `w245316327`, `w28094796`, `w28094799`, `w374872468`, `w817269911`, `w817269912`, `w817269913`, `w817269914`, `w817269915` and `w817269930`. On `e8d215e1-31c_0`, two crossings fall immediately beyond the source bridge endpoints on continuations `w28094797` and `w817269933`. Including those two continuations is justified by the **same bounded yard facility**, not a rule that turns every untagged neighboring crossing into an underpass. The centerline crossings are within about 38 m of `[1640, −3275]`; a local region of 60–70 m covers them and the finite roadway widths.

A drivable railway span also needs continuous physical support across its approaches, bridge top and tile boundaries. Retaining a real underpass does not justify a hole, upward step, side-girder collision across the running track, or changing the train's running datum. Source geometry and the player's actual driving/collision behavior need separate checks.

### Precisely mapped road tunnel on the Rail Nilayam approach

A strict at-grade protection check initially limited one verified Rail Nilayam approach to approximately 6.284 m of clearance. An instrumented copy of the height solver traced the limit to retained Krishna Deva Raya Road `16e6f5fa-4ea_0`, at its segment between `[1717.8, −3181.1]` and `[1726.7, −3179.7]`. Treating that crossing as level would have been wrong: this segment has direct, current source evidence for a real tunnel.

The [OpenStreetMap primary API record for way 1188612305](https://api.openstreetmap.org/api/0.6/way/1188612305/full), retrieved successfully on 29 October 2026, explicitly carries `highway=primary`, `tunnel=yes` and `layer=-1`. It is version 3, last edited on 9 July 2025. Its two geographic endpoints, converted using the game's coordinate system, match the two retained segment endpoints within 0.1 m. The [small local source-map extract](https://api.openstreetmap.org/api/0.6/map?bbox=78.5110,17.4330,78.5145,17.4370), also retrieved successfully, confirms that local railway source way `w818582231` crosses it.

The narrow catalog entry therefore authorizes only road `16e6f5fa-4ea_0` against railway `w818582231`, within 25 m of `[1722, −3180]`. It does **not** authorize the different railway bridge `w28094784` and its separate road crossing around `[1722, −3141]`. The exact tunnel-way match supplies the evidence; neither a nearby bridge tag nor a general street name supplies permission. This removes a false level-crossing control while retaining the conservative 6.5 m modeled headroom requirement. The source proves a tunnel and relative order, not a surveyed depth or construction cross-section.

The corrected candidate model was independently scanned at all **433 retained road/rail centerline intersections**, including service and yard strands. No crossing below −0.55 m lacked an exact local catalog match. The direct road-under-rail constraints cover **14 road IDs**, each catalogued; all requested rail/road clearance and retained road/road headroom constraints resolved. The 50 lowered road records include connected approach pieces and are not 50 distinct underpasses. Unmatched source hints remain review items and do not authorize new road cuts. This is source/model validation, separate from manual driving or a physical-device test.
