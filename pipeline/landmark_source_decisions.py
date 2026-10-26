"""Curated source bindings for all catalogue identities, with explicit refusals.

No nearest-object fallback and no game writes. Only the small reviewed patch in
landmark-corrections.ts is applied by the application. This ledger does not turn
an OSM footprint or a dated photo into a measured facade reconstruction.
"""
import hashlib
import json
import math
from pathlib import Path
import re
from landmark_source_audit import ROOT, PATTERNS, geometry, oriented_box, position, project

# Exact reviewed source identities. A source can establish the site without
# establishing the inherited model anchor (e.g. a gate versus campus centroid).
SELECTED = dict(line.split('=') for line in """
charminar=w238186115
charkaman=n4313322315
mecca=w116029938
chowmahalla=w116031164
falaknuma=w435588871
golconda=r9128913
balahisar=w357623189
fateh=n2942982509
tomb_of_muhammad_quli_qutb_shah=w933350838
tomb_of_sultan_muhammad_qutb_shah=w933350843
tomb_of_hayat_bakshi_begum=w253509400
tomb_of_abdullah_qutb_shah=w253509403
tomb_of_ibrahim_quli_qutb_shah=w356420864
tomb_of_sultan_quli_qutb_shah=w933350840
taramati=n4683189592
paigah=w971970307
buddha=r19335391
secretariat=r19418013
ambedkar=n10936819194
martyrs=n13043476521
birla=w105726070
assembly=w318508277
highcourt=w238284084
osmania=w238302531
salarjung=r3373607
ouarts=w121543671
cablebridge=w761604461
thub=w1122214529
stadium=w665330878
clocktower=n321710524
jagannath=n4432377892
peddamma=n11278911369
balkampet=n344619886
chilkur=w225880080
sanghi=w215195250
ujjaini=n2710984727
bhagyalakshmi=w577120414
iskcon_abids=n6255550787
ramalayam=w282201150
ashtalakshmi=n6935427154
ganesh_khairatabad=n4436525397
jain_mandir=w1122033436
spanish=n817353672
khairatabad_mosque=w116016783
moula_ali=w357991201
pahadi=w267200642
st_joseph=w417286609
st_george=w356516954
st_mary=w1177107988
holy_trinity=w346567470
methodist=w170860196
purani_haveli=w238192345
errum_manzil=w361409838
bella_vista=w350097287
hill_fort=w281501992
raj_bhavan=n2052637654
residency=w417169810
jubilee_hall=w280678389
archaeology_museum=w378458224
state_library=n626897420
city_college=w238284086
mozamjahi=w170860198
mahboob_chowk=n626926304
monda_market=n13437156195
badshahi_ashurkhana=w238285564
purana_pul=w971139858
gun_park=w281501996
paradise=w274798850
cafe_bahar=n1932925761
nimrah=n2710929650
shadab=n626897444
clocktower_james=w356556815
nampally_station=w96585495
secunderabad_station=w500394347
kacheguda_station=n307023348
begumpet_station=n2461447890
charlapalli_station=n1974699686
lingampally_station=n1936294138
mgbs=w1454992368
jbs=w1497395092
ghmc=w89583435
rbi=w116012637
ravindra_bharathi=w116018037
nizam_college=w105728936
gandhi_bhavan=w281519624
ou_library=n316636515
nims=w237976870
gandhi_hospital=w319567708
yashoda_sec=w645162358
kims=w274482470
lvpei=w660771331
niloufer=n11936158149
mnj=w170868739
uoh=w277804473
iiit=w31355320
isb=w159299915
jntu=w493740300
iict=w1190545650
nalsar=w275252288
ccmb=w40486935
mindspace=w292816639
dlf=w413274269
microsoft=w159299918
google=n6257475386
amazon=w859668203
tcs_synergy=w68883415
hicc=w95971680
hitex=w1385069790
tworks=w1133460477
inorbit=w68871414
gvk=w202656013
sarath_city=w574673965
ikea=w122796947
forum=w311388388
city_center=w75381630
hyderabad_central=w250927610
prasads=w357057597
sudarshan=w357101987
shilparamam=w29251806
shilpakala=w1113281333
lulu=w880054935
ameerpet_metro_mall=w630918550
ntr_gardens=w29124126
lumbini=w29124134
indira_park=w29124111
sanjeevaiah=w29124107
kbr=w28268610
zoo=w27937605
botanical=w29124485
public_gardens=w116944236
necklace_road=w209064440
eat_street=w116035684
jalavihar=w558535323
snow_world=n726751707
osman_sagar=n8987811327
durgam_lake=w28131043
biodiversity=w543750079
nizam_sagar_chowk=w1413243010
uppal_stadium=w839364278
lb_stadium=w318508279
gachibowli_indoor=w211070668
saroornagar_indoor=w138289630
gymkhana=w29252465
parade=w29252455
race_course=w27955354
hca_fateh=n2935023019
rgia=r13609059
ameerpet_interchange=n6700511122
mgbs_metro=n7206794945
""".strip().splitlines())
ALIASES = {
    'iskcon_abids': r'^iskon$', 'golconda': r'^golconda fort$',
    'ccmb': r'^cent(er|re) for cellular and molecular biology$',
    'nalsar': r'^nalsar university of law$', 'sanjeevaiah': r'^sanjeevaiah park$',
    'gandhi_bhavan': r'^gandhi bhavan$', 'tcs_synergy': r'^tcs deccan park$',
    'mindspace': r'^mindspace technology park$', 'microsoft': r'^microsoft$',
    'kbr': r'kasu brahmananda reddy national park', 'public_gardens': r'^public gardens$',
    'gymkhana': r'^gymkhana grounds$', 'parade': r'^gen krishna rao parade ground$',
}
PARKS = {'sanjeevaiah','kbr','public_gardens','indira_park','ntr_gardens','lumbini','botanical','shilparamam','biodiversity'}
TRANSPORT = {'nampally_station','secunderabad_station','kacheguda_station','begumpet_station','charlapalli_station','lingampally_station','mgbs','jbs','ameerpet_interchange','mgbs_metro'}
CHANGES = {
    'nalsar': dict(after=dict(lat=17.6026889,lon=78.54669785,rot=203), reason='Mapped paired vehicle gates replace a fallback 1.5km south of the university; gate midpoint only, architecture remains approximate.'),
    'osman_sagar': dict(after=dict(lat=17.3759728,lon=78.3169135,rot=0,sw=None,sd=None,srot=None), reason='Named dam POI replaces reservoir-centre fallback. Remove invented 205m spillway and preserve mapped water/roads; dam architecture remains unmodelled.'),
    'purana_pul': dict(after=dict(name='Purana Pul Darwaza',type='city_gate'), reason='Existing model/source depict the heritage gate, not the adjacent bridge; correct map identity and icon.'),
    'tcs_synergy': dict(after=dict(name='TCS Deccan Park',lat=17.444314547874065,lon=78.37795746345546,rot=0), reason='The inherited source footprint is Deccan Park, not TCS Synergy Park. Keep stable ID; render exact Deccan Park outline with illustrative facade/height.'),
    'dlf': dict(after=dict(lat=17.447567430923282,lon=78.35542177112688,rot=0), reason='Named DLF building within DLF Cybercity campus replaces fallback near UoH; developer website confirms Gachibowli identity. Source outline replaces three invented towers.'),
    'gandhi_bhavan': dict(after=dict(lat=17.388124274965815,lon=78.47076234234507,w=None,d=None,rot=238.2,h=None), reason='Civic site replaces wrong-class Gandhi Bhavan metro station anchor and footprint. Main facade footprint/height remain unresolved.'),
    'sanjeevaiah': dict(after=dict(lat=17.432024257971182,lon=78.47526248542427,w=None,d=None,rot=0,h=None,sw=792.31,sd=658.67,srot=97.28), reason='Named park polygon replaces railway station footprint. Flagmast is illustrative within park, exact mast location not established.'),
}
EXTERNAL = {
    'dlf': ['https://www.dlf.in/offices/hyderabad/cybercity'],
    'nalsar': ['https://nalsar.ac.in/contact-us/'],
    'sanjeevaiah': ['https://indiacinehub.gov.in/index.php/location/sanjeevaiah-park-hyderabad','https://www.hmda.gov.in/wp-content/uploads/2020/07/Urban-Forestry-Parks.pdf'],
}


def source_id(e):
    return e['type'][0] + str(e['id'])


def select_source(elements, expected_id, name_pattern, expected_class='poi', anchor=None, radius=3000):
    """Resolve only the reviewed identity. No same-name/nearby fallback exists."""
    source = next((e for e in elements if source_id(e) == expected_id), None)
    if source is None:
        return None, 'reviewed-source-id-not-present; nearest-object-fallback-forbidden'
    tags=source.get('tags',{}); names=[tags.get(k,'') for k in ('name','name:en','official_name','alt_name')]
    if not any(re.search(name_pattern,n,re.I) for n in names):
        return None, 'reviewed-source-name-no-longer-matches'
    if expected_class != 'transport' and (tags.get('railway') or tags.get('building') in ('train_station','transportation') or tags.get('highway')=='bus_stop'):
        return None, 'wrong-feature-class: transport-stop-is-not-named-site'
    if expected_class != 'road' and tags.get('highway'):
        return None, 'wrong-feature-class: road-is-not-named-site'
    if expected_class=='building' and not tags.get('building'):
        return None, 'wrong-feature-class: no-building-footprint'
    if expected_class=='park' and tags.get('leisure') not in ('park','garden','nature_reserve'):
        return None, 'wrong-feature-class: park-required'
    if expected_class=='dam' and tags.get('waterway')!='dam':
        return None, 'wrong-feature-class: dam-required-not-reservoir'
    if expected_class=='campus' and (tags.get('natural')=='water' or tags.get('water') or not (tags.get('amenity') in ('university','college') or tags.get('landuse')=='commercial')):
        return None, 'wrong-feature-class: campus-required-not-pond-or-amenity'
    pos=position(source)
    if anchor and pos and math.dist(project(*anchor),project(*pos))>radius:
        return None, 'outside-reviewed-radius: distant-branch-refused'
    return source, None


def main():
    snapshot=ROOT/'pipeline/evidence/landmark-osm-source-2026-10-26.json'
    source=json.loads(snapshot.read_text()); elements=source['elements']
    candidates=json.loads((ROOT/'pipeline/build/landmark-source-review-2026-10-26.json').read_text())
    current=json.loads((ROOT/'docs/landmark-audit.json').read_text())['entries']
    original_text=(ROOT/'game/src/world/landmarks_data.ts').read_text()
    original={d['key']:d for d in json.loads(re.search(r'export const LM_DATA[^=]*=\s*(\[.*\]);',original_text).group(1))}
    rows=[]
    for row in current:
        key=row['id']; selected=SELECTED.get(key); pattern=ALIASES.get(key,PATTERNS.get(key,''))
        expected='park' if key in PARKS else 'transport' if key in TRANSPORT else 'road' if key=='necklace_road' else 'dam' if key=='osman_sagar' else 'building' if key in ('dlf','tcs_synergy') else 'campus' if key in ('nalsar','uoh','iiit','isb','jntu') else 'poi'
        element,error=select_source(elements,selected,pattern,expected) if selected else (None,'no-reviewed-source-id; automatic-fallback-forbidden')
        record=dict(id=key,name=row['name'],decision='reviewed-map-identity' if element else 'no-safe-source-binding',sourceRefs=[],refusals=[],remaining=['dated facade views and current appearance','surveyed vertical dimensions','front entrance/floor/inscription detail'])
        if element:
            pos=position(element);tag=element['tags'];ring=geometry(element)
            record['sourceRefs'].append(dict(id=source_id(element),url=f"https://www.openstreetmap.org/{element['type']}/{element['id']}",version=element.get('version'),timestamp=element.get('timestamp'),name=tag.get('name:en',tag.get('name')),tags=tag,position=pos,footprint=oriented_box(ring),footprintBasis='named building outline' if ring and tag.get('building') else 'site/context geometry; not a building dimension',axisBearingBasis='minimum-area rectangle, undirected modulo180; not a verified facade/front bearing'))
            anchor=original.get(key,row['anchor']); record['distanceFromInheritedAnchorM']=round(math.dist(project(anchor['lat'],anchor['lon']),project(*pos)),2) if pos else None
            record['anchorAssessment']='source identity only; inherited anchor is not automatically moved'
        else: record['refusals'].append(error)
        offered=next((r for r in candidates['entries'] if r['id']==key),{}).get('candidates',[])
        for c in offered:
            if c['id']!=selected:
                record['refusals'].append(dict(id=c['id'],name=c['names'],distanceM=c['distanceFromInheritedM'],reason='not the explicitly reviewed source identity; no automatic import'))
        if key in CHANGES:
            record['applicationChange']={**CHANGES[key],'before':{k:original[key].get(k) for k in CHANGES[key]['after']}}
            record['anchorAssessment']='explicit reviewed application correction; facade/height limits retained'
        if key=='nalsar':
            for e in elements:
                if source_id(e) in ('n10829445473','n10829445474'):
                    record['sourceRefs'].append(dict(id=source_id(e),url=f"https://www.openstreetmap.org/node/{e['id']}",version=e['version'],timestamp=e['timestamp'],tags=e['tags'],position=position(e),basis='paired one-way vehicle gates inside the named campus; midpoint used, no entrance guessed'))
        record['externalIdentitySources']=EXTERNAL.get(key,[])
        if key=='charkaman':
            # The four-arch scene is centred on Gulzar Houz. A fountain is
            # context, and one mapped arch does not verify all four placements.
            record['decision']='context-anchor-only'
            record['contextSourceRefs']=record['sourceRefs'];record['sourceRefs']=[]
            arch=next(e for e in elements if source_id(e)=='w576023427')
            record['contextSourceRefs'].append(dict(id='w576023427',url='https://www.openstreetmap.org/way/576023427',version=arch['version'],timestamp=arch['timestamp'],name=arch['tags']['name'],tags=arch['tags'],position=position(arch),basis='one mapped Char Kaman arch; does not establish all four scene arches'))
            record['anchorAssessment']='Gulzar Houz fountain is only a context centre; four-arch identity/placements require separate verification'
            record['refusals']=[dict(id=r['id'],reason='single arch context retained, not enough to verify the four-arch scene') if isinstance(r,dict) and r['id']=='w576023427' else r for r in record['refusals']]
            record['remaining'].append('individual source identity, bearings and positions of all four arches')
        rows.append(record)
    output=dict(schema=1,reviewedAt='2026-10-26',scope='All191 catalogue IDs received explicit identity/class/plan decisions. Map source binding is not street/photo verification. Only seven reviewed corrections are applied.',sourceSnapshot=str(snapshot.relative_to(ROOT)),sourceSha256=hashlib.sha256(snapshot.read_bytes()).hexdigest(),attribution=source['attribution'],summary=dict(total=len(rows),reviewedSourceIdentities=sum(r['decision']=='reviewed-map-identity' for r in rows),noSafeSourceBinding=sum(r['decision']!='reviewed-map-identity' for r in rows),contextOnly=sum(r['decision']=='context-anchor-only' for r in rows),applicationCorrections=len(CHANGES),exactMappedBuildingPlans=2,fullyPhotoVerifiedReconstructions=0),entries=rows)
    (ROOT/'pipeline/evidence/landmark-source-decisions-2026-10-26.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(output['summary']))


if __name__=='__main__': main()
