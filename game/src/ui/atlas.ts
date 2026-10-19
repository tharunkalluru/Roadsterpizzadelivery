import type { App } from '../app/app';
import type { RoadEdge } from '../world/schema';
import { project, unproject } from '../world/geo';
import type { ReviewStatus } from '../world/streetSurvey';
import type { SourcePlaceListing } from '../world/sourceAccuracy';
import { streetSequence } from './streetSequence';
import { streetViewReference } from './streetReference';
type WorkQueue = ReturnType<typeof import('../world/streetSurveyQueue').buildStreetWorkQueue>;

const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const statusLabel=(s:ReviewStatus|undefined)=>s==='verified'?'Reviewed':s==='partial'?'Partly reviewed':s==='unavailable'?'Imagery unavailable':s==='needs_revisit'?'Needs another look':'Not reviewed';
const floorLabel=(floor:number)=>floor<0?`Basement${floor<-1?' '+Math.abs(floor):''}`:floor===0?'Ground floor':`Upper floor ${floor}`;

/** Search every road and inspect its reference record without presenting listings as verified. */
export class StreetAtlas {
  private root:HTMLElement|null=null;
  private selected:RoadEdge|null=null;
  private search='';
  private area='';
  private filter='all';
  private limit=80;
  private areas=new Map<string,string>();
  private businessNames=new Map<string,string>();
  private listingsByRoad=new Map<string,SourcePlaceListing[]>();
  private resizeObserver:ResizeObserver|null=null;
  private queue:WorkQueue|null=null;
  private queueLoading=false;
  private reverseSequence=false;
  get isOpen(){return this.root!==null;}
  constructor(private app:App){
    for(const sf of app.survey?.data.storefrontOverrides??[])this.businessNames.set(sf.roadId,`${this.businessNames.get(sf.roadId)??''} ${sf.name}`);
    for(const observation of app.survey?.data.observations??[])if(observation.roadId)this.businessNames.set(observation.roadId,`${this.businessNames.get(observation.roadId)??''} ${observation.name}`);
    for(const p of app.loader.listingIndex?.places??[])if(!app.survey||app.survey.allowsSourceListing(p.id,p.frontageId)){this.businessNames.set(p.roadId,`${this.businessNames.get(p.roadId)??''} ${p.name}`);const places=this.listingsByRoad.get(p.roadId)??[];places.push(p);this.listingsByRoad.set(p.roadId,places);}
    for(const r of app.core!.roads){const p=r.points[Math.floor(r.points.length/2)];let best='',distance=Infinity;for(const st of app.core!.stations){const d=Math.hypot(st.x-p[0],st.z-p[1]);if(d<distance){distance=d;best=st.name;}}this.areas.set(r.id,best);}
  }
  open(){
    this.app.screens.clear();this.close();
    const q=this.app.survey?.summary;
    this.root=document.createElement('section');this.root.className='street-atlas';this.root.setAttribute('aria-label','Hyderabad street atlas');
    this.root.innerHTML=`<header class="atlas-header"><div><span class="eyebrow">METRO EXPRESS / HYDERABAD</span><h1>Know the streets.</h1></div><button class="btn atlas-close" data-close>Back to game <span>↗</span></button></header>
      <div class="atlas-body"><aside class="atlas-sidebar"><p class="atlas-intro">Explore the metro corridors. Discover the streets, places and references shaping the rebuild.</p>
      <div class="atlas-stats"><div><b>${q?.totalRoads.toLocaleString()??this.app.core!.roads.length}</b><span>road segments</span></div><div><b>${q?.positionedStorefronts??0}</b><span>researched fronts</span></div><div><b>${q?.verifiedSides??0}</b><span>sides fully checked</span></div></div>
      <p class="small">${q?.visuallyInventoriedSides??0} sides inventoried from imagery. Full verification also requires checked placement and dimensions.</p>
      <p class="atlas-scope" data-scope>${(this.app.core!.roads.reduce((n,r)=>n+r.lengthM,0)/1000).toFixed(1)} km of playable streets · both sides included.</p>
      <label class="atlas-search"><span>Find a road or place</span><input data-search type="search" placeholder="Habsiguda, Raidurg, Main Road…" value="${escape(this.search)}"></label>
      <div class="atlas-filters"><label>Area<select data-area><option value="">All station areas</option>${this.app.core!.stations.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(st=>`<option ${this.area===st.name?'selected':''}>${escape(st.name)}</option>`).join('')}</select></label><label>Street review<select data-filter><option value="all">All streets</option><option value="started">Research started</option><option value="verified">Both sides reviewed</option><option value="unreviewed">Not reviewed</option></select></label></div>
      <div class="atlas-results" data-results></div><p class="atlas-footnote">A listed shop is a starting point. Checked imagery, placement and neighbouring fronts establish street accuracy.</p></aside>
      <div class="atlas-map"><canvas data-atlas-map aria-label="Street research coverage map"></canvas><div class="atlas-map-tools"><button data-zoom-in aria-label="Zoom in">+</button><button data-zoom-out aria-label="Zoom out">−</button><button data-network>All Hyderabad</button></div><div class="atlas-map-key"><i class="partial"></i>Research started <i class="verified"></i>Both sides reviewed <i class="pending"></i>Not reviewed</div><article class="atlas-detail" data-detail><span class="eyebrow">EXPLORE THE NETWORK</span><h2>Choose a street.</h2><p>Search an area or select a road on the map. Every road side has its own review record.</p></article></div></div>`;
    this.app.ui.append(this.root);
    this.loadQueue();
    this.root.querySelector('[data-close]')!.addEventListener('click',()=>{this.close();this.app.toMenu();});
    const search=this.root.querySelector<HTMLInputElement>('[data-search]')!;search.addEventListener('input',()=>{this.search=search.value;this.limit=80;this.renderList();});
    const area=this.root.querySelector<HTMLSelectElement>('[data-area]')!;area.addEventListener('change',()=>{this.area=area.value;this.limit=80;this.renderList();const st=this.app.core!.stations.find(st=>st.name===this.area);if(st){this.app.map!.cx=st.x;this.app.map!.cz=st.z;this.app.map!.scale=.45;this.draw();}});
    const filter=this.root.querySelector<HTMLSelectElement>('[data-filter]')!;filter.value=this.filter;filter.addEventListener('change',()=>{this.filter=filter.value;this.limit=80;this.renderList();});
    const c=this.root.querySelector<HTMLCanvasElement>('[data-atlas-map]')!;
    this.resizeObserver=new ResizeObserver(()=>this.draw());this.resizeObserver.observe(c);
    let drag:{x:number;y:number;travel:number}|null=null;
    c.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,travel:0};c.setPointerCapture(e.pointerId);});
    c.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.travel+=Math.hypot(dx,dy);this.app.map!.cx-=dx/this.app.map!.scale;this.app.map!.cz-=dy/this.app.map!.scale;drag.x=e.clientX;drag.y=e.clientY;this.draw();});
    c.addEventListener('pointerup',e=>{if(drag&&drag.travel<8){const b=c.getBoundingClientRect(),map=this.app.map!;const x=map.cx+(e.clientX-b.left-b.width/2)/map.scale,z=map.cz+(e.clientY-b.top-b.height/2)/map.scale;const road=map.nearestRoad(x,z,25/map.scale);if(road)this.select(road,false);}drag=null;});
    c.addEventListener('pointercancel',()=>drag=null);
    c.addEventListener('wheel',e=>{this.app.map!.scale=Math.max(.015,Math.min(6,this.app.map!.scale*(e.deltaY<0?1.2:1/1.2)));this.draw();e.preventDefault();},{passive:false});
    this.root.querySelector('[data-zoom-in]')!.addEventListener('click',()=>{this.app.map!.scale=Math.min(6,this.app.map!.scale*1.5);this.draw();});
    this.root.querySelector('[data-zoom-out]')!.addEventListener('click',()=>{this.app.map!.scale=Math.max(.015,this.app.map!.scale/1.5);this.draw();});
    this.root.querySelector('[data-network]')!.addEventListener('click',()=>{this.app.map!.fitNetwork(c.clientWidth,c.clientHeight);this.draw();});
    this.renderList();requestAnimationFrame(()=>{this.app.map!.layer='research';this.app.map!.fitNetwork(c.clientWidth,c.clientHeight);this.draw();if(this.selected)this.select(this.selected);});
    search.focus();
  }
  private renderList(){
    if(!this.root)return;const query=this.search.trim().toLocaleLowerCase('en');
    const roads=this.app.core!.roads.filter(r=>{
      if(this.area&&this.areas.get(r.id)!==this.area)return false;
      const observed=this.businessNames.get(r.id)??'';
      if(query&&!`${r.name??''} ${this.areas.get(r.id)} ${observed}`.toLocaleLowerCase('en').includes(query))return false;
      const row=this.app.survey?.segment(r.id),started=row?.left.status==='partial'||row?.right.status==='partial'||row?.left.status==='verified'||row?.right.status==='verified';
      return this.filter==='started'?started:this.filter==='verified'?row?.left.status==='verified'&&row?.right.status==='verified':this.filter==='unreviewed'?!started:true;
    }).sort((a,b)=>{
      const started=(r:RoadEdge)=>{const q=this.app.survey?.segment(r.id);return q&&(q.left.status!=='unreviewed'||q.right.status!=='unreviewed')?1:0;};
      return started(b)-started(a)||(a.name??'zz').localeCompare(b.name??'zz');
    });
    const el=this.root.querySelector<HTMLElement>('[data-results]')!;
    el.innerHTML=`<div class="atlas-result-count">${roads.length.toLocaleString()} streets${this.area?' near '+escape(this.area):''}</div>${roads.slice(0,this.limit).map(r=>{const review=this.app.survey?.segment(r.id),started=Boolean(review&&(review.left.status!=='unreviewed'||review.right.status!=='unreviewed')),matched=query?(this.listingsByRoad.get(r.id)??[]).find(p=>p.name.toLocaleLowerCase('en').includes(query)):null;return `<button class="atlas-road ${this.selected?.id===r.id?'selected':''}" data-road="${escape(r.id)}"><span><strong>${escape(r.name??'Connecting street')}</strong><small>${escape(this.areas.get(r.id)??'Hyderabad')} · ${Math.round(r.lengthM)} m</small>${matched?`<small class="atlas-matched">${escape(matched.name)} · source listing</small>`:''}</span><span class="atlas-review ${started?'started':''}">${started?'In review':'To check'}</span></button>`;}).join('')}${roads.length>this.limit?'<button class="atlas-more" data-more>Show more streets</button>':''}${!roads.length?'<p class="atlas-empty">No streets match. Try an area or a shorter name.</p>':''}`;
    el.querySelectorAll<HTMLButtonElement>('[data-road]').forEach(b=>b.addEventListener('click',()=>this.select(this.app.core!.roads.find(r=>r.id===b.dataset.road)!)));
    el.querySelector('[data-more]')?.addEventListener('click',()=>{this.limit+=80;this.renderList();});
  }
  private select(road:RoadEdge,focus=true){
    this.selected=road;if(!this.root)return;const query=this.search.trim().toLocaleLowerCase('en'),matched=query?(this.listingsByRoad.get(road.id)??[]).filter(p=>p.name.toLocaleLowerCase('en').includes(query)):[];
    this.app.map!.focusedPlaceIds=new Set(matched.map(p=>p.id));
    if(focus){this.app.map!.focusRoad(road);if(matched.length){this.app.map!.cx=matched[0].x;this.app.map!.cz=matched[0].z;this.app.map!.scale=1.2;}}
    this.draw();this.renderList();
    const survey=this.app.survey,review=survey?.segment(road.id),fronts=(survey?.data.storefrontOverrides.filter(s=>s.roadId===road.id)??[]).sort((a,b)=>a.alongRoadM-b.alongRoadM||a.floor-b.floor);
    const observations=survey?.data.observations.filter(o=>o.roadId===road.id)??[];
    const positionedIds=new Set(fronts.map(f=>f.id));
    const awaitingPlacement=observations.filter(o=>!o.storefrontOverrideId||!positionedIds.has(o.storefrontOverrideId));
    const sourceIds=new Set([...fronts.flatMap(s=>s.sourceIds),...observations.flatMap(o=>o.sourceIds),...(review?.left.reviewedRanges??[]).flatMap(r=>r.sourceIds),...(review?.right.reviewedRanges??[]).flatMap(r=>r.sourceIds)]);
    const sources=survey?.data.sources.filter(s=>sourceIds.has(s.id))??[];
    const p=road.points[Math.floor(road.points.length/2)],[lat,lon]=unproject(p[0],p[1]);
    const url=`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat.toFixed(6)},${lon.toFixed(6)}`;
    const referenceUrl=streetViewReference({road,sources,associatedSourceIds:new Set([...fronts.flatMap(f=>f.sourceIds),...observations.flatMap(o=>o.sourceIds)]),project,fallbackUrl:url}).url;
    const sequence=streetSequence(road,fronts,this.reverseSequence);
    this.root.querySelector<HTMLElement>('[data-detail]')!.innerHTML=`<span class="eyebrow">${escape(this.areas.get(road.id)??'HYDERABAD')}</span><h2>${escape(road.name??'Connecting street')}</h2><div class="atlas-sequence-heading"><strong>Facing ${sequence.direction}</strong><button type="button" data-reverse-sequence aria-label="Reverse street viewing direction">Reverse direction ⇄</button></div><div class="atlas-sides">${sequence.sides.map(s=>`<span>On your ${s.side}<b>${statusLabel(review?.[s.canonicalSide].status)}</b></span>`).join('')}</div>
      ${fronts.length?`<section class="atlas-sequence" aria-label="Recorded shop order"><p>Recorded signs in the order you pass them. Unchecked gaps remain.</p>${sequence.sides.map(s=>`<div class="atlas-sequence-side"><h3>On your ${s.side}</h3>${s.fronts.length?`<ol>${s.fronts.map(f=>`<li>${escape(f.name)}<small>${floorLabel(f.floor)} · Imagery ${escape(f.captureDate)} · ${f.placementStatus==='verified'?'placement checked':'placement provisional'}</small></li>`).join('')}</ol>`:`<p>${review?.[s.canonicalSide].status==='unreviewed'?'This side has not been checked.':'No shop fronts positioned on this side. See the street observations below.'}</p>`}</div>`).join('')}</section><details><summary>How these places are positioned</summary>${fronts.map(f=>`<p><strong>${escape(f.name)}</strong><small>${floorLabel(f.floor)} · Imagery ${escape(f.captureDate)}<br>${escape(f.notes)}</small></p>`).join('')}</details>`:'<p>Storefront-by-storefront checking is still pending on this segment.</p>'}
      ${awaitingPlacement.length?`<div class="atlas-observations"><p class="small">Recorded places and street details</p><div class="atlas-fronts">${awaitingPlacement.map(o=>`<span>${escape(o.name)} <small>${o.placementStatus==='exact'?'placement checked':'Observed · placement pending'}</small></span>`).join('')}</div><details><summary>Observation notes · ${awaitingPlacement.length}</summary>${awaitingPlacement.map(o=>`<p><strong>${escape(o.name)}</strong><small>Captured ${escape(o.captureDate??'date unknown')} · ${escape(o.notes)}</small></p>`).join('')}</details></div>`:''}
      <div class="atlas-actions"><button class="btn primary" data-drive>Drive this street ↗</button><a class="btn" href="${escape(referenceUrl)}" target="_blank" rel="noopener noreferrer">Street View ↗</a></div>
      ${sources.length?`<details><summary>Reference notes · ${sources.length}</summary>${sources.map(s=>`<p><a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.title)}</a><small>Captured ${escape(s.captureDate??'date unknown')} · ${escape(s.notes)}</small></p>`).join('')}</details>`:''}`;
    this.root.querySelector('[data-drive]')!.addEventListener('click',()=>{this.close();void this.app.exploreRoad(road);});
    this.root.querySelector('[data-reverse-sequence]')?.addEventListener('click',()=>{this.reverseSequence=!this.reverseSequence;this.select(road,false);});
    const listings=(this.listingsByRoad.get(road.id)??[]).slice().sort((a,b)=>Number(this.app.map!.focusedPlaceIds.has(b.id))-Number(this.app.map!.focusedPlaceIds.has(a.id)));
    if(listings.length){const section=document.createElement('details');section.innerHTML=`<summary>Nearby business listings · ${listings.length}</summary><p class="small">Grey points are source listings; selected search matches are blue. Shop side, floor, entrance and current operation still need checking.</p>${listings.slice(0,60).map(p=>`<p><strong>${escape(p.name)}</strong><small>${escape(p.category.replace(/_/g,' '))} · ${Math.round(p.distanceToRoadM)} m from this road · Source listing</small></p>`).join('')}${listings.length>60?`<p class="small">${listings.length-60} more places are shown on the map.</p>`:''}`;this.root.querySelector('[data-detail]')!.append(section);}
    this.renderBlock(road);
  }
  private loadQueue(){
    if(this.queue){this.renderScope();return;}if(this.queueLoading)return;this.queueLoading=true;
    void fetch('./research/survey-work-queue.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('Unavailable inventory');return r.json();}).then((q:WorkQueue)=>{
      if(q.schemaVersion!==1||q.worldId!==this.app.manifest?.worldId||q.worldVersion!==this.app.manifest.version||q.revision!==this.app.survey?.data.revision)throw new Error('Inventory is being refreshed');
      this.queue=q;this.renderScope();if(this.selected&&this.root)this.select(this.selected,false);
    }).catch(()=>{/* The live road and side review records remain usable without the optional work inventory. */}).finally(()=>this.queueLoading=false);
  }
  private renderScope(){const el=this.root?.querySelector('[data-scope]');if(el&&this.queue)el.textContent=`${(this.queue.summary.inventoriedRoadLengthM/1000).toFixed(1)} km · ${this.queue.summary.blocks.toLocaleString()} connected blocks · ${this.queue.summary.totalSides.toLocaleString()} road sides. All roads are listed; street checking is ongoing.`;}
  private renderBlock(road:RoadEdge){
    const block=this.queue?.blocks.find(b=>b.roadIds.includes(road.id));if(!block||!this.root)return;
    const detail=this.root.querySelector('[data-detail]')!,section=document.createElement('div');section.className='atlas-block';
    const i=block.roadIds.indexOf(road.id),next=block.roadIds[(i+1)%block.roadIds.length],nextBlock=this.queue!.blocks[(block.order)%this.queue!.blocks.length];
    const entry=this.queue!.roads.find(r=>r.roadId===road.id);
    section.innerHTML=`<p class="small">Block ${block.order.toLocaleString()} / ${this.queue!.summary.blocks.toLocaleString()} · ${block.roadIds.length} connected streets · ${Math.round(block.roadLengthM)} m</p><div class="atlas-actions">${next!==road.id?'<button class="btn" data-next-street>Next street →</button>':''}<button class="btn" data-next-block>Next block →</button></div>${entry?`<div class="atlas-actions">${entry.sides.map(s=>`<a class="btn" target="_blank" rel="noopener noreferrer" href="${escape(s.researchUrl)}">Look ${s.side} ↗</a>`).join('')}</div><p class="small">Look links open a research location. Available imagery and capture dates still need checking.</p>`:''}`;
    detail.append(section);
    section.querySelector('[data-next-street]')?.addEventListener('click',()=>{const r=this.app.core!.roads.find(r=>r.id===next);if(r)this.select(r);});
    section.querySelector('[data-next-block]')?.addEventListener('click',()=>{const r=this.app.core!.roads.find(r=>r.id===nextBlock.roadIds[0]);if(r)this.select(r);});
  }
  private close(){this.resizeObserver?.disconnect();this.resizeObserver=null;this.root?.remove();this.root=null;}
  private draw(){if(!this.root)return;const c=this.root.querySelector<HTMLCanvasElement>('[data-atlas-map]')!,b=c.getBoundingClientRect(),d=Math.min(2,devicePixelRatio||1);c.width=b.width*d;c.height=b.height*d;this.app.map!.draw(c,null);}
}
