/** Offline CC0 MakeHuman derivative. Keeps a continuous body surface and actual
 * sex/age morphs. No application code or textured celebrity asset is copied. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as THREE from 'three';
const root=path.resolve(import.meta.dirname,'../..'),base='https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/';
async function asset(relative,name){const local=`/tmp/roadster-npc-${name}`;if(!fs.existsSync(local)){const r=await fetch(base+relative);if(!r.ok)throw Error(`${relative}: ${r.status}`);fs.writeFileSync(local,Buffer.from(await r.arrayBuffer()));}return fs.readFileSync(local,'utf8');}
const obj=fs.readFileSync('/tmp/roadster-npc-makehuman-base-20261102.obj','utf8'),vertices=[],groups={};let group='';
for(const line of obj.split('\n')){if(line.startsWith('v '))vertices.push(line.slice(2).trim().split(/\s+/).map(Number));else if(line.startsWith('g '))group=line.slice(2);else if(line.startsWith('f ')){const ids=line.slice(2).trim().split(/\s+/).map(s=>Number(s.split('/')[0])-1);for(let i=1;i<ids.length-1;i++)(groups[group]??=[]).push([ids[0],ids[i],ids[i+1]]);}}
const weightSource=await asset('rigs/default_weights.mhw','default_weights.mhw'),weights=JSON.parse(weightSource).weights,perVertex=Array.from({length:vertices.length},()=>[]);
for(const[name,list]of Object.entries(weights))for(const[i,w]of list)perVertex[i].push([name,w]);
const profiles={},sources=[{path:'3dobjs/base.obj',sha256:crypto.createHash('sha256').update(obj).digest('hex')}];
const average=(positions,key)=>{const ids=[...new Set((groups[key]??[]).flat())];return [0,1,2].map(c=>ids.reduce((s,i)=>s+positions[i][c],0)/ids.length);};
const transforms=new Map();
function between(a,b,c,d){const reflect=p=>new THREE.Vector3(p[0],p[1],-p[2]),from=reflect(a),v=reflect(b).sub(from),to=new THREE.Vector3(...c),u=new THREE.Vector3(...d).sub(to),q=new THREE.Quaternion().setFromUnitVectors(v.clone().normalize(),u.clone().normalize()),scale=u.length()/v.length();return p=>reflect(p).sub(from).multiplyScalar(scale).applyQuaternion(q).add(to).toArray();}
for(const sex of ['male','female'])for(const age of ['young','child','old']){
 const name=`asian-${sex}-${age}.target`,raw=await asset(`targets/macrodetails/${name}`,name);sources.push({path:`targets/macrodetails/${name}`,sha256:crypto.createHash('sha256').update(raw).digest('hex')});
 const morph=vertices.map(v=>v.slice());for(const line of raw.split('\n')){if(!/^\d/.test(line))continue;const[i,x,y,z]=line.trim().split(/\s+/).map(Number);morph[i][0]+=x;morph[i][1]+=y;morph[i][2]+=z;}
 profiles[`${sex}-${age}`]=morph;
}
// Coarse body clustering is performed in the final, arms-down rest pose. The
// mapped surfaces stay continuous across shoulder/elbow/hip/knee boundaries.
function posed(positions,index){const p=positions[index],out=[0,0,0];let total=0;const joints={};const joint=k=>joints[k]??(joints[k]=average(positions,k));
 const pelvis=joint('joint-pelvis'),head=joint('joint-head'),shoulder=joint('joint-l-shoulder');
 const torso=v=>[(v[0]*.19/shoulder[0]),.84+(v[1]-pelvis[1])*(1.33-.84)/(shoulder[1]-pelvis[1]),-(v[2]-.1445)*.10];
 for(const[name,w]of perVertex[index]){let value;const side=name.endsWith('.L')?1:-1,suffix=side===1?'l':'r',key=`${profilesKey}:${name}`;let fn=transforms.get(key);
  if(!fn){const s=joint(`joint-${suffix}-shoulder`),e=joint(`joint-${suffix}-elbow`),h=joint(`joint-${suffix}-hand`),hip=joint(`joint-${suffix}-upper-leg`),knee=joint(`joint-${suffix}-knee`),ankle=joint(`joint-${suffix}-ankle`);
   if(name.startsWith('upperarm'))fn=between(s,e,[side*.19,1.33,0],[side*.245,1.085,-.008]);
   else if(name.startsWith('lowerarm'))fn=between(e,h,[side*.245,1.085,-.008],[side*.255,.845,-.025]);
   else if(name.startsWith('finger')||name.startsWith('metacarpal')||name.startsWith('wrist'))fn=between(h,joint(`joint-${suffix}-finger-3-3`),[side*.255,.845,-.025],[side*.255,.756,-.035]);
   else if(name.startsWith('upperleg'))fn=between(hip,knee,[side*.085,.84,0],[side*.085,.45,0]);
   else if(name.startsWith('lowerleg'))fn=between(knee,ankle,[side*.085,.45,0],[side*.085,.09,0]);
   else if(name.startsWith('foot')||name.startsWith('toe'))fn=v=>[side*.085+(v[0]-ankle[0])*.10,.09+(v[1]-ankle[1])*.10,-(v[2]-ankle[2])*.10];
   else fn=torso;transforms.set(key,fn);
  }
  value=fn(p);if(!value.every(Number.isFinite))continue;for(let c=0;c<3;c++)out[c]+=value[c]*w;total+=w;
 }
 return total?out.map(v=>v/total):torso(p);
}
let profilesKey='';
const bodyVariants={};for(const[key,positions]of Object.entries(profiles)){profilesKey=key;bodyVariants[key]=positions.map((_,i)=>posed(positions,i));}
function cluster(triangles,reference,stepAt,variants,closeMouth=false){const ids=[...new Set(triangles.flat())],map=new Map(),entries=[],remap=new Map();for(const i of ids){const p=reference[i],step=stepAt(p,i),key=p.map(v=>Math.round(v/step)).join(',');let e=map.get(key);if(!e){e={id:entries.length,vertices:[]};map.set(key,e);entries.push(e);}e.vertices.push(i);remap.set(i,e.id);}const indices=[],seen=new Set();for(const t of triangles){const tri=t.map(i=>remap.get(i)),key=[...tri].sort((a,b)=>a-b).join(',');if(new Set(tri).size<3||seen.has(key))continue;seen.add(key);indices.push(tri[0],tri[2],tri[1]);}
 const positions={};for(const[key,variant]of Object.entries(variants))positions[key]=entries.flatMap(e=>[0,1,2].map(c=>Number((e.vertices.reduce((s,i)=>s+variant[i][c],0)/e.vertices.length).toFixed(5))));
 return {vertexCount:entries.length,triangleCount:indices.length/3,indices,positions};}
const bodyTriangles=groups.body.filter(t=>t.every(i=>vertices[i][1]<5.9)),headTriangles=groups.body.filter(t=>t.every(i=>vertices[i][1]>5.8));
const body=cluster(bodyTriangles,bodyVariants['male-young'],p=>Math.abs(p[0])>.21&&p[1]<.9?.012:.043,bodyVariants),bodyLow=cluster(bodyTriangles,bodyVariants['male-young'],p=>Math.abs(p[0])>.21&&p[1]<.9?.03:.085,bodyVariants);
const headVariants={},eyes={},mouths={},mouthDepths={},headAnchors={};
for(const[key,positions]of Object.entries(profiles)){
 const center=average(positions,'joint-head'),mouthCenter=positions.filter((p,i)=>vertices[i][1]>6.5&&vertices[i][1]<6.7&&Math.abs(vertices[i][0])<.2&&vertices[i][2]>1.25),mouthY=mouthCenter.reduce((s,p)=>s+p[1],0)/mouthCenter.length;
 headVariants[key]=positions.map((p,i)=>{const original=vertices[i];let [x,y,z]=p;
  const mouth=Math.exp(-((original[0]/.43)**2+((original[1]-6.64)/.17)**2))*Math.max(0,Math.min(1,(original[2]-.80)/.45));
  y+=(mouthY-y)*mouth*.62;
  // The hidden inner mouth bag is collapsed behind the closed vermilion seam,
  // so polygon reduction cannot turn it into an open dark hole through the jaw.
  if(Math.abs(original[0])<.39&&original[1]>6.4&&original[1]<6.83&&original[2]>.85&&original[2]<1.18){y=mouthY;z=Math.max(z,1.20);}
  return[(x-center[0])*.105,(y-center[1])*.105,-(z-center[2])*.105];});
 eyes[key]=['l','r'].map(side=>average(positions,`joint-${side}-eye`).map((v,c)=>(v-center[c])*(c===2?-.105:.105)));
 mouths[key]=(mouthY-center[1])*.105;
 mouthDepths[key]=-(mouthCenter.reduce((s,p)=>s+p[2],0)/mouthCenter.length-center[2])*.105;
 const sh=average(positions,'joint-l-shoulder'),pel=average(positions,'joint-pelvis');headAnchors[key]=[0,.84+(center[1]-pel[1])*.49/(sh[1]-pel[1]),-(center[2]-.1445)*.10];
}
const head=cluster(headTriangles,vertices,p=>p[2]>.8&&p[1]>6.35&&p[1]<7.6?.065:.23,headVariants),headLow=cluster(headTriangles,vertices,p=>p[2]>.8&&p[1]>6.35&&p[1]<7.6?.19:.44,headVariants);
const out={source:'MakeHuman hm08 body + Asian male/female young/child/old CC0 morph targets + default CC0 weights',license:'CC0-1.0',sources,body,bodyLow,head,headLow,eyes,mouths,mouthDepths,headAnchors};
fs.writeFileSync(path.join(root,'src/world/npc-human.json'),JSON.stringify(out)+'\n');console.log(JSON.stringify({body:body.triangleCount,bodyLow:bodyLow.triangleCount,head:head.triangleCount,headLow:headLow.triangleCount,bytes:fs.statSync(path.join(root,'src/world/npc-human.json')).size}));
// V4 native whole-human input. Keep the anatomical joint influences rather
// than recovering limb membership from x/y thresholds after mesh reduction.
const bodyIds=[...new Set(groups.body.flat())],bodyMap=new Map(bodyIds.map((id,i)=>[id,i])),fullPositions={};
for(const[key,positions]of Object.entries(profiles)){
 const center=average(positions,'joint-head'),closed=positions.map((p,i)=>vertices[i][1]>5.8?[headVariants[key][i][0]/.105+center[0],headVariants[key][i][1]/.105+center[1],-headVariants[key][i][2]/.105+center[2]]:p);
 profilesKey=key;fullPositions[key]=bodyIds.flatMap(i=>posed(closed,i).map(v=>Number(v.toFixed(7))));
}
function boneId(name){const right=name.endsWith('.L')?false:true;if(name.startsWith('upperarm'))return right?5:8;if(name.startsWith('lowerarm'))return right?6:9;if(/^(finger|metacarpal|wrist)/.test(name))return right?7:10;if(name.startsWith('upperleg'))return right?11:14;if(name.startsWith('lowerleg'))return right?12:15;if(/^(foot|toe)/.test(name))return right?13:16;if(name.startsWith('neck'))return 3;if(/^(head|jaw|eye|oculi|oris|orbicularis|risorius|levator|tongue|special)/.test(name))return 4;if(/^(root|pelvis)/.test(name))return 1;return 2;}
const influenceIds=[],influenceWeights=[];
for(const id of bodyIds){const totals=new Map();for(const[n,w]of perVertex[id]){const b=boneId(n);totals.set(b,(totals.get(b)??0)+w);}const entries=[...totals].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=entries.reduce((s,p)=>s+p[1],0)||1;for(let k=0;k<4;k++){influenceIds.push(entries[k]?.[0]??0);influenceWeights.push(Number(((entries[k]?.[1]??0)/sum).toFixed(7)));}}
fs.writeFileSync('/tmp/roadster-npc-native-v4.json',JSON.stringify({license:'CC0-1.0',sources:[...sources,{path:'rigs/default_weights.mhw',sha256:crypto.createHash('sha256').update(weightSource).digest('hex')}],positions:fullPositions,indices:groups.body.flatMap(t=>[bodyMap.get(t[0]),bodyMap.get(t[2]),bodyMap.get(t[1])]),skinIndex:influenceIds,skinWeight:influenceWeights,headAnchors,eyes,mouths,mouthDepths})+'\n');
