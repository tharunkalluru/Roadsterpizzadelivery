import {buildTile} from '/Users/tharun/Documents/Codex/2026-10-31/fourteen-delivery-private-upload-batches/src/world/city';
import {initTemplates} from '/Users/tharun/Documents/Codex/2026-10-31/fourteen-delivery-private-upload-batches/src/core/util';
initTemplates();
for(const n of [300,3]){
const e:any={id:'independent-paint',cls:'primary',w:12,lanes:4,oneway:null,from:'a',to:'b',pts:[[200,200],[500,200],[500,200+n]],elev:null};
const r=buildTile({i:0,j:0,roads:[e],nodes:{},buildings:[],boards:[],furniture:[],areas:[],osm:[]},{lowQ:true});
const b=r.buffers.find(b=>b.mat==='marks')!;const triangles=[];for(let i=0;i<b.pos.length;i+=9)triangles.push(Array.from(b.pos.slice(i,i+9)));
console.log(JSON.stringify({n,triangles}));}
