import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {layoutExplicitLines} from '../../src/art/signTextLayout';
import {buildStorefronts,disposeStorefronts} from '../../src/art/storefronts';
import {StreetSurvey} from '../../src/world/streetSurvey';
import {SourceAccuracyLayer} from '../../src/world/sourceAccuracy';
import type {Storefront,WorldChunkV2,WorldCore} from '../../src/world/schema';
import type {StreetSurveyData} from '../../src/world/streetSurveyTypes';
vi.mock('../../src/art/frontAtlas',async importOriginal=>{const actual=await importOriginal<typeof import('../../src/art/frontAtlas')>();const three=await import('three');return{...actual,getFrontAtlas:()=>new three.Texture()};});
vi.mock('../../src/art/sign',async()=>({TELUGU_FAMILY:'Test',ensureTeluguFont:async()=>{}}));
interface PaintedLine {text:string;size:number;x:number;y:number;width:number;cellW:number;cellH:number}
const fontSize=(font:string)=>Number(/([\d.]+)px/.exec(font)?.[1]??0);
function canvas(){
 const painted:PaintedLine[]=[];
 vi.stubGlobal('document',{createElement:()=>{
  let cellW=0,cellH=0;
  const ctx={font:'',measureText:(text:string)=>({width:Array.from(text).length*fontSize(ctx.font)*.62}),rect:(_x:number,_y:number,w:number,h:number)=>{cellW=w;cellH=h;},fillText:(text:string,x:number,y:number)=>painted.push({text,size:fontSize(ctx.font),x,y,width:ctx.measureText(text).width,cellW,cellH})};
  return{width:0,height:0,getContext:()=>new Proxy(ctx,{get:(o,k)=>k in o?o[k as keyof typeof o]:()=>{}})};
 }});
 return painted;
}
afterEach(()=>vi.unstubAllGlobals());
const read=<T>(p:string)=>JSON.parse(readFileSync(p,'utf8'))as T;
const assertInside=(rows:PaintedLine[])=>{for(const row of rows){expect(row.size).toBeGreaterThan(0);expect(row.x-row.width/2).toBeGreaterThanOrEqual(-.01);expect(row.x+row.width/2).toBeLessThanOrEqual(row.cellW+.01);expect(row.y-row.size/2).toBeGreaterThan(0);expect(row.y+row.size/2).toBeLessThan(row.cellH);}};

describe('source-authored hard sign lines',()=>{
 it('retains every explicit row, including CRLF/blank rows, and fits complete text without ellipsis',()=>{
  const measure=(text:string,size:number)=>text.length*size*.62;
  const text='A\r\n\r\nLONG AUTHORED LINE\nEND\n',layout=layoutExplicitLines(text,35,120,measure)!;
  expect(layout.lines).toEqual(['A','','LONG AUTHORED LINE','END','']);
  expect(layout.size*layout.lines.length).toBeLessThanOrEqual(120*.8);
  for(const line of layout.lines)expect(measure(line,layout.size)).toBeLessThanOrEqual(35+.00001);
  expect(layoutExplicitLines('Ordinary single line',35,120,measure)).toBeNull();
 });
 it('paints every actual Village Taste letter and the authored La Excellence/CLAT rows at low and standard quality',()=>{
  const painted=canvas(),base='public/world/hyd-metro/v2/',manifest=read<{sourceAccuracy:{file:string}}>(base+'manifest.json');
  const accuracy=new SourceAccuracyLayer(read(base+manifest.sourceAccuracy.file)),rawCore=accuracy.applyCore(read<WorldCore>(base+'core.json'));
  const survey=new StreetSurvey(read<StreetSurveyData>('public/research/street-survey.json'),rawCore),core=survey.applyCoreCorrections(rawCore);
  const chunk=survey.applyChunk(accuracy.applyChunk(read<WorldChunkV2>(base+'chunks/c_-83_-15.json'))),building=chunk.buildings.find(b=>b.id==='b_09c40f224f')!;
  const profile=building.researchedProfile!,panels=[profile.signPanels!.find(p=>p.text.startsWith('V\nI\n'))!,profile.signPanels!.find(p=>p.text.startsWith('La Excellence\n'))!];
  for(const quality of ['low','standard']as const)for(const panel of panels){
   painted.length=0;
   const selected={...chunk,buildings:[{...building,researchedProfile:{...profile,nameBand:undefined,signPanels:[panel]}}],storefronts:[]};
   const scene=buildStorefronts(selected,core,quality),rows=painted.slice();
   expect(rows.map(r=>r.text)).toEqual(panel.text.split('\n'));assertInside(rows);
   if(panel===panels[0]){expect(rows).toHaveLength(22);expect(Math.min(...rows.map(r=>r.size))).toBeGreaterThan(8);for(let i=1;i<rows.length;i++)expect(rows[i].y).toBeGreaterThan(rows[i-1].y);}
   else expect(rows.map(r=>r.text)).toEqual(['La Excellence','CLAT / IPMAT']);
   disposeStorefronts(scene);
  }
 });
 it('keeps automatic two-line wrapping and the existing bilingual split while allowing hard breaks in either language',()=>{
  const painted=canvas(),core={roads:[],structures:[]}as unknown as WorldCore;
  const front:Storefront={id:'source',placeId:'survey:source',name:'Hyderabad Traditional Grocery and General Store',nameTe:null,category:'office_signage',group:'office_service',confidence:1,sources:['dated-source'],license:'test',x:0,z:0,buildingId:null,roadId:'test',side:'left',facade:[[-3,0],[3,0]],facingHeading:Math.PI,floor:1,status:'provisional',appearance:{signWidthM:2.2,signBaseM:4,signHeightM:1.2,categoryProps:false}};
  const render=(store:Storefront)=>{painted.length=0;const scene=buildStorefronts({id:'test',buildings:[],storefronts:[store],pois:[],landmarks:[]}as unknown as WorldChunkV2,core,'standard'),rows=painted.slice();assertInside(rows);disposeStorefronts(scene);return rows.map(r=>r.text);};
  const ordinary=render(front);expect(ordinary).toHaveLength(2);expect(ordinary.join(' ')).toBe(front.name);
  expect(render({...front,name:'PUBLIC SERVICE',nameTe:'తెలుగు సేవ',appearance:{...front.appearance,signWidthM:4.5}})).toEqual(['PUBLIC SERVICE','తెలుగు సేవ']);
  expect(render({...front,name:'PUBLIC\nSERVICE\nOFFICE',nameTe:'తెలుగు\nవిభాగం',appearance:{...front.appearance,signWidthM:4.5}})).toEqual(['PUBLIC','SERVICE','OFFICE','తెలుగు','విభాగం']);
 });
});
