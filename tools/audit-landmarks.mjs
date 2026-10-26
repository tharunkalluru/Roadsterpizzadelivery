// Regenerate the catalogue coverage/gap inventory; this audits metadata, not street appearance.
import { build } from '../game/node_modules/esbuild/lib/main.js';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
const temp = mkdtempSync(path.join(tmpdir(), 'roadster-landmark-audit-'));
try {
  const entry = path.join(temp, 'landmarks.mjs');
  await build({ stdin: { contents: "export * from './game/src/world/landmarks.ts'; export * from './game/src/world/landmark_catalog.ts';", resolveDir: new URL('..', import.meta.url).pathname }, outfile: entry, bundle: true, platform: 'node', format: 'esm' });
  const { placeLandmarks, placeCatalogue } = await import(entry);
  const root = new URL('..', import.meta.url), core = JSON.parse(gunzipSync(readFileSync(new URL('game/public/city/core.pack.wasm', root))));
  const tiles = core.packs.flatMap((p) => p.tiles), indexed = new Set(tiles.map(([i,j]) => `${i}_${j}`));
  const model = new Map(placeLandmarks(core.origin, tiles).map((p) => [p.id, p]));
  const entries = placeCatalogue(core.origin).map((p) => {
    const l = model.get(p.id), d = l.d, tile = [Math.floor(p.x / 1000), Math.floor(p.z / 1000)], b = core.bounds;
    return { id: p.id, name: p.name, category: p.category, icon: p.icon, anchor: { lat: p.lat, lon: p.lon, confidence: 'inherited-unverified' },
      inPlayableBounds: p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ,
      sourceTile: tile, sourceTileIndexed: indexed.has(tile.join('_')), renderTile: l.renderTile,
      model: { recipe: l.kind, status: 'stylised-needs-photo-review', dimensions: d ? { width: d.w, depth: d.d, height: d.h, rotation: d.rot } : 'recipe-values-not-surveyed',
        gaps: [...(!d || d.w == null || d.d == null ? ['measured-footprint'] : []), ...(!d || d.h == null ? ['measured-height'] : []), ...(!d || d.rot == null ? ['verified-front-bearing'] : []), 'dated-facade-photo', 'symbol-and-inscription-review'] },
      provenance: { inherited: d ? ['OSM / Overture resolver; original source IDs were not retained in flattened data'] : ['Legacy hand-authored coordinates; no per-anchor evidence ID'], sourceUrls: [], reviewedOn: '2026-10-26', confidence: 'provisional' } };
  });
  const charminar = entries.find((p) => p.id === 'charminar');
  charminar.provenance.sourceUrls = ['https://hyderabad.telangana.gov.in/tourist-place/charminar/', 'https://www.tourism.telangana.gov.in/attractions/charminar'];
  charminar.model.reviewedFeatures = ['Four great openings widened from 10.12m to 11m using the 20m-square / 11m-opening district description.', 'Four upper minaret tiers shortened from inherited 55.8m total height to 48.7m, matching both Hyderabad District and Telangana Tourism descriptions.'];
  charminar.model.unresolved = ['Precise carving, roof mosque and surveyed orientation remain unverified; 48.7m is a published official description, not a new survey.'];
  const jagannath = entries.find((p) => p.id === 'jagannath');
  jagannath.provenance.sourceUrls = ['https://www.shrijagannathtemplehyderabad.com/architecture-devalayams.html','https://commons.wikimedia.org/wiki/File:Jagannath_Temple_Hyderabad.jpg','https://commons.wikimedia.org/wiki/File:Jagannath_Temple_Hyderabad_India.jpg'];
  jagannath.model.reviewedFeatures = ['East-facing front and 72ft main stone/finial target from temple-owner description.', 'Eight-spoke Ashtadhatu Nilachakra replaces filled disk; separate finials on main tower and porch.', 'Stepped pidha porch roof and layered tower courses from dated 2017/2021 original photographs; red/yellow pennants retained without invented symbols.'];
  jagannath.model.unresolved = ['Stone carving, deity figures, exact footprint and ancillary shrine placement remain approximate.', 'Flags extend above the main finial; published height definition does not establish current flagstaff dimensions.'];
  const gurdwara = entries.find((p) => p.id === 'gurudwara');
  gurdwara.provenance.sourceUrls = ['https://commons.wikimedia.org/wiki/File:Central_Gurdwara_Saheb,_Hyderabad.jpg','https://sgpc.net/wp-content/uploads/2025/06/Sikh-Rehat-Maryada-English-n.pdf','https://www.worldsikh.org/what_is_the_flag_outside_the_gurdwara'];
  gurdwara.model.reviewedFeatures = ['Raised front entrance stair flight, stacked three-arch white pavilions and shallow gold domes from original photograph captured 2025-10-14.', 'Nishan Sahib corrected from a broad plain rectangular panel to folded cloth close to its mast and a spearhead finial; no hidden printed Khanda or inscription inferred.'];
  gurdwara.model.unresolved = ['Folded cloth uses an approximate ochre colour from the dated image; current site flag colour, exact cloth dimensions and hidden print remain unverified. SGPC specifies xanthic or greyish blue; no blanket colour substitution is claimed as an on-site observation.', 'Facade dimensions and inherited front bearing remain approximate; no new coordinate placement or inscription added.'];
  const secretariat=entries.find(p=>p.id==='secretariat');
  secretariat.provenance.sourceUrls=['https://tribal.nic.in/writereaddata/News/201902141107219843646State_emblem.pdf','https://www.presentations.gov.in/logos/national-emblem/'];
  secretariat.model.reviewedFeatures=['Replaced four undifferentiated gold boxes on each dome with four outward-facing articulated lion figures on a circular abacus, including vertical24-spoke wheels. Government description supports four back-to-back lions and intervening abacus wheels.'];
  secretariat.model.unresolved=['This is a bounded symbol correction, not a surveyed portrait or certified national-emblem reproduction. Abacus animal reliefs and motto are not fabricated; exact rooftop sculpture dimensions, detail and current appearance remain unverified.', 'Inherited building scale, dome profile, courtyard and façade geometry remain provisional.'];
  const golconda=entries.find(p=>p.id==='golconda');
  golconda.provenance.sourceUrls=['https://hyderabad.telangana.gov.in/tourist-place/golconda-fort/','https://cdn.s3waas.gov.in/s36c524f9d5d7027454a783c841250ba71/uploads/2018/11/2018110292.jpg','https://cdn.s3waas.gov.in/s36c524f9d5d7027454a783c841250ba71/uploads/2018/11/2018110274.jpg','https://commons.wikimedia.org/wiki/File:Golconda_Fort_002_-_Baradari.jpg'];
  golconda.model.reviewedFeatures=['District photographs and ASI visitor map show an elevated rectangular pavilion, broad pointed openings, projecting terraces, flat roof and corner finials. Replaced three stacked solid blocks/tiny repeated arches with open broad arcades, setback hall and an unbroken rendered roof.', 'Visible upper terrace remains at inherited game height91.5m. Production Player regression toggles descent, lands, drives about9m, brakes and stays parked5s using the exact rendered support triangles; open arches have no invented blanket roof.'];
  golconda.model.unresolved=['Summit/base dimensions, anchor/bearing, granite terrain, wall alignment and decorative proportions remain illustrative. District gallery publication dates are not new field surveys.', 'The inherited78m game hill datum is retained; published120m hill descriptions are not a surveyed game roof datum. Normal-game browser flight/landing remains a separate acceptance item.'];
  const thalli = entries.find((p) => p.id === 'thalli');
  thalli.provenance.sourceUrls = ['https://www.telangana.gov.in/gallery/2024/12/chief-minister-sri-a-revanth-reddy-unveiled-telangana-thalli-statue-in-the-secretariat/','https://www.telangana.gov.in/wp-content/uploads/2024/12/Telangana-Talli-Statue.jpg'];
  thalli.model.reviewedFeatures = ['Green sari, red blouse, raised right palm and left hand holding crop bundle replace generic all-gold figure; official unveiling image published 2024-12-09.'];
  thalli.model.unresolved = ['Inherited approximate anchor and scale retained; exact dimensions, pedestal reliefs, jewellery and facial likeness not surveyed or claimed.'];
  const buddha = entries.find((p) => p.id === 'buddha');
  buddha.provenance.sourceUrls = ['https://commons.wikimedia.org/wiki/File:Buddha_Statue_at_the_Hussain_Sagar.jpg'];
  buddha.model.reviewedFeatures = ['Corrected mirrored raised palm to the figure right (viewer-left), raised left hand to robe collar, and replaced red lotus with stone colour; original frontal photograph captured 2025-10-14.'];
  buddha.model.unresolved = ['Existing scale/anchor and island footprint retained; exact facial likeness, drapery, relief carvings and dimensions remain provisional.'];
  const flag = entries.find((p) => p.id === 'sanjeevaiah');
  flag.provenance.sourceUrls = ['https://www.mha.gov.in/sites/default/files/flagcodeofindia_070214.pdf', 'https://knowindia.india.gov.in/my-india-my-pride/indian-tricolor.php'];
  flag.model.reviewedFeatures = ['National flag 3:2 ratio, equal horizontal stripes, centred navy 24-spoke Ashoka Chakra, outward geometry on both faces.'];
  flag.model.unresolved = ['Mast placement and 88m height inherited; no new site survey. Digital sRGB colours are approximations, not a textile/BIS certification.'];
  const osman = entries.find((p) => p.id === 'osman_sagar');
  osman.model.reviewedFeatures = ['Moved reservoir-centre fallback to named OSM dam POI n8987811327; removed the invented205m repeated spillway that had stood in the reservoir.', 'A small dam visitor marker preserves the mapped reservoir and adjoining roads; no architectural dam footprint is inferred from a point.'];
  osman.model.unresolved = ['The dam structure, crest alignment, vertical dimensions and facade have not been reconstructed; a source POI is not an architectural survey.'];
  for (const [id,way,source] of [['rgia','1016464108','https://aim-india.aai.aero/eaip/eaip-v2-04-2026/eAIP/VOHS-ADC.pdf'],['begumpet_airport','251098384','https://aim-india.aai.aero/eaip-v2-05-2025/eAIP/VOHY-ADC.pdf']]) {
    const airport=entries.find(p=>p.id===id);airport.anchor.confidence='mapped-terminal-polygon';
    airport.provenance.sourceUrls=[source,`https://www.openstreetmap.org/way/${way}`];airport.provenance.confidence='high-for-published-runway-dimensions-medium-for-map-outline';
    airport.model.status='mapped-plan-published-runways-stylised-facades';airport.model.reviewedFeatures=['Reanchored catalogue/model to mapped passenger terminal polygon; mapped terminal, apron, taxiway and hangar outlines replace generic airport block.', 'AAI physical runway endpoints, widths, designators and displaced thresholds; per-tile geometry remains visible independently of terminal owner.'];
    airport.model.unresolved=['Facade heights/materials and parked aircraft stand positions remain illustrative; no surveyed reconstruction or ATC simulation claimed.', 'Published airport AMSL elevations are not flat-game terrain height; current terrain datum retained.'];
  }
  const bridge=entries.find(p=>p.id==='cablebridge');bridge.anchor.confidence='mapped-bridge-polygon-centre';bridge.provenance.sourceUrls=['https://www.openstreetmap.org/way/761604461','https://www.larsentoubro.com/media/42542/2020-09-25-lt-built-iconic-durgam-cheruvu-cable-stay-bridge-dedicated-to-the-people-of-hyderbad.pdf','https://ateliervama.com/portfolio/durgam-cheravu-lake-bridge/'];
  bridge.model.reviewedFeatures=['Mapped axis/centre, continuous25.8m deck,233.85m pylon spacing,52single-plane structural cables and1.8m footpaths.', 'Pointed leaf/spear pylon head follows primary designer visualisations; unrelated bulb cap removed.'];bridge.model.unresolved=['Designer images are renders, not dated as-built photographs; decorative proportions remain stylised.', 'Mapped game road altitude retained; absolute water/bed/deck survey and precise lane widths remain open; canonical/context lane fields now use source-supported3lanes per direction and explicit3.2m model lane-width assumption.'];
  const lake=entries.find(p=>p.id==='durgam_lake');lake.provenance.sourceUrls=['https://www.openstreetmap.org/way/28131043'];lake.model.status='existing-mapped-water-polygon';lake.model.reviewedFeatures=['Removed invented concrete slabs at lake centre; retain existing mapped lake shoreline and water geometry.'];
  const sourceLedger=JSON.parse(readFileSync(new URL('pipeline/evidence/landmark-source-decisions-2026-10-26.json',root)));
  for(const decision of sourceLedger.entries){
    const entry=entries.find(p=>p.id===decision.id);
    entry.provenance.mapIdentityDecision=decision.decision;
    entry.provenance.mapSourceRefs=decision.sourceRefs;
    entry.provenance.contextSourceRefs=decision.contextSourceRefs||[];
    entry.provenance.sourceUrls=[...new Set([...entry.provenance.sourceUrls,...decision.sourceRefs.map(s=>s.url),...(decision.contextSourceRefs||[]).map(s=>s.url),...decision.externalIdentitySources])];
    entry.provenance.refusals=decision.refusals;
    entry.provenance.sourceSnapshot=sourceLedger.sourceSnapshot;
    entry.provenance.sourceSnapshotSha256=sourceLedger.sourceSha256;
    if(decision.applicationChange){
      entry.provenance.applicationCorrection=decision.applicationChange;
      entry.anchor.confidence='reviewed-source-plan-or-identity-correction; see per-place limits';
      entry.model.reviewedFeatures=[...(entry.model.reviewedFeatures||[]),decision.applicationChange.reason];
    }
    if(['dlf','tcs_synergy'].includes(entry.id)){
      entry.model.status='mapped-named-building-outline; illustrative-height-and-facade';
      entry.model.dimensions={footprint:decision.sourceRefs[0].footprint,height:entry.id==='dlf'?50:29.4,heightBasis:'inherited illustrative metres, not an OSM surveyed height',rotation:'geographic source vertices; no nearest-road rotation'};
      entry.model.gaps=entry.model.gaps.filter(g=>g!=='measured-footprint');
      entry.model.unresolved=['Named mapped outline is retained vertex-for-vertex. Facade, current glazing, vertical steps and height remain illustrative; site data is not photo verification.'];
    }
    if(entry.id==='sanjeevaiah')entry.model.unresolved=['Park anchor replaces an erroneous railway station footprint. Exact flagmast location within the park and the inherited88m height remain approximate.',...entry.model.unresolved];
  }
  const ambedkarEvidence=JSON.parse(readFileSync(new URL('pipeline/evidence/ambedkar-feature-review-2026-10-26.json',root)));
  const ambedkar=entries.find(p=>p.id==='ambedkar');
  ambedkar.provenance.sourceUrls=[...new Set([...ambedkar.provenance.sourceUrls,ambedkarEvidence.photo.page,ambedkarEvidence.photo.original,ambedkarEvidence.dimensions.source])];
  ambedkar.provenance.originalPhoto={capturedAt:ambedkarEvidence.photo.capturedAt,author:ambedkarEvidence.photo.author,license:ambedkarEvidence.photo.license,sha256:ambedkarEvidence.photo.sha256};
  ambedkar.model.reviewedFeatures=ambedkarEvidence.observedAndImplemented;
  ambedkar.model.unresolved=ambedkarEvidence.limits;
  ambedkar.model.dimensions={statueMetres:38.1,pedestalMetres:15.24,basis:ambedkarEvidence.dimensions.basis};
  const photoFeatureIds=['charminar','golconda','jagannath','gurudwara','thalli','buddha','ambedkar'];
  const audit = { schema: 1, auditedOn: '2026-10-26', scope: 'All 191 catalogue/model IDs checked for uniqueness, finite anchors, playable bounds, source/render tile ownership and missing dimension metadata. This is not 191 photo-verified reconstructions.',
    summary: { total: entries.length, inBounds: entries.filter((p) => p.inPlayableBounds).length, sourceTilesIndexed: entries.filter((p) => p.sourceTileIndexed).length, renderOwnersIndexed: entries.filter((p) => indexed.has(p.renderTile.join('_'))).length, reviewedMapSourceIdentities:sourceLedger.summary.reviewedSourceIdentities, noSafeMapSourceBinding:sourceLedger.summary.noSafeSourceBinding, sourceBackedApplicationCorrections:sourceLedger.summary.applicationCorrections, exactMappedBuildingPlans:sourceLedger.summary.exactMappedBuildingPlans, photoVerifiedReconstructions: 0, modelsWithPhotoReviewedFeatures: photoFeatureIds.length, photoFeatureIds },
    symbolAudit: [
      { id: 'sanjeevaiah-national-flag', status: 'corrected', confidence: 'high-for-construction', notes: 'One national-flag recipe found; uses shared official-specification geometry.' },
      { id: 'secretariat-lion-capital', status: 'corrected-source-backed-basic-form', confidence: 'high-for-four-lions-and-abacus-low-for-exact-sculpture', notes: 'Four articulated back-to-back lions and four outward24-spoke wheels replace gold boxes; primary government description supports the basic form. Exact reliefs, motto and site sculpture details remain open.' },
      { id: 'jagannath-nila-chakra', status: 'corrected-eight-spoke-wheel', confidence: 'high-for-spoke-count', notes: 'Temple owner explicitly specifies eight spokes; dated original photos confirm open-wheel finials. Fine ornament remains approximate.' },
      { id: 'gurudwara-and-temple-flags', status: 'corrected-observed-fold-and-source-backed-finial', confidence: 'medium-for-visible-fold-low-for-current-cloth', notes: 'Gurdwara cloth now hangs folded near its mast and has a spearhead finial supported by Sikh Rehat Maryada. A hidden printed Khanda is not inferred. Current site colour and flag dimensions remain open. Jagannath pennants retain original-photo colours without invented symbols.' },
      { id: 'telangana-thalli', status: 'photo-reviewed-clothing-and-pose', confidence: 'high-for-visible-features', notes: 'Official unveiling photo supports green sari/red blouse, raised right palm and left crop bundle. Exact likeness and inherited scale/anchor remain provisional.' },
      { id: 'buddha-pose-and-stone-lotus', status: 'corrected-photo-reviewed-features', confidence: 'high-for-visible-features', notes: 'Dated frontal photo confirms right palm raised, left hand at collar and stone lotus; exact sculpture/reliefs remain stylised.' },
      { id: 'other-named-statues-and-inscriptions', status: 'pending-reference-review', confidence: 'low', notes: 'Generic human silhouettes do not establish portrait accuracy. No speculative sacred text or inscriptions introduced.' }
    ], entries };
  writeFileSync(new URL('docs/landmark-audit.json', root), JSON.stringify(audit, null, 2) + '\n');
  console.log(`Landmark metadata audit: ${entries.length} unique places; ${audit.summary.inBounds} in bounds; ${audit.summary.sourceTilesIndexed} indexed anchors; ${audit.summary.renderOwnersIndexed} render owners. Photo verification remains open.`);
} finally { rmSync(temp, { recursive: true, force: true }); }
