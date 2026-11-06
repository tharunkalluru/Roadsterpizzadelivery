import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Batch,initTemplates,rng} from '../../src/core/util';
import {drawSeatedPerson,type PersonSpec} from '../../src/world/people';
import * as M from '../../src/world/traffic_models';
import {TRAFFIC_VEHICLE_SPECS as S} from '../../src/world/traffic-vehicle-specs';
import {Traffic} from '../../src/game/traffic';
import {RoadGraph} from '../../src/game/roadgraph';
import {CarrierMarker} from '../../src/delivery/systems/carrier-marker';
import {PICKUP_CONFIG} from '../../src/delivery/core/pickup-config';
import {BusPassengerExchange} from '../../src/game/bus-passengers';

function init(){
  const gradient={addColorStop(){}};
  const context=new Proxy({measureText:(s:string)=>({width:s.length*12}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(o:any,k)=>k in o?o[k]:()=>{}});
  (globalThis as any).document={createElement:()=>({width:256,height:128,getContext:()=>context})};
  initTemplates({rbox:new THREE.BoxGeometry(1,1,1)});
}
const road={id:'r',seg:'r',name:'Prototype review',cls:'primary',w:40,lanes:4,oneway:null,from:'a',to:'b',pts:[[0,0],[0,-1000]],elev:null,maxspeed:null}as any;
function colorMesh(model:M.Model,color:string,minY=-Infinity){
  const c=new THREE.Color(color),p=model.body.pos,col=model.body.col,out:number[]=[];
  for(let i=0;i<p.length;i+=9)if([0,3,6].every(j=>p[i+j+1]>=minY&&Math.abs(col[i+j]-c.r)<1e-5&&Math.abs(col[i+j+1]-c.g)<1e-5&&Math.abs(col[i+j+2]-c.b)<1e-5))out.push(...p.slice(i,i+9));
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(out,3));g.computeVertexNormals();const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld(true);return mesh;
}

test('new passenger/compact goods silhouettes use sourced dimensions, full seated occupants and finite bounded buffers',()=>{
  init();const models=[M.miniTruck(rng(1)),M.passengerVan(rng(2))];
  for(const [i,m]of models.entries()){
    const spec=i?S.van:S.miniTruck;
    assert.deepEqual(m.size,[spec.width,spec.height,spec.length]);
    assert.equal(m.occupants?.filter(o=>o.role==='driver').length,1);
    assert.ok(m.occupants!.every(o=>o.hipY-.56*o.scale>=-.02&&o.hipY+.9*o.scale<m.size[1]));
    const g=m.body.geometry();assert.ok(g.getAttribute('position').count/3<20000,'the shape and complete occupants stay bounded');
    for(const n of g.getAttribute('position').array)assert.ok(Number.isFinite(n));
    assert.ok(m.decals?.some(d=>(d.mat as THREE.MeshStandardMaterial).transparent&&d.mat.side===THREE.DoubleSide));
    assert.ok(m.headlights?.length===2&&m.tailLights&&!m.tailLights.empty&&m.reverseLights&&!m.reverseLights.empty);g.dispose();
  }
});

test('car body has a real open window/cabin instead of an opaque volume around the driver',()=>{
  init();
  for(const kind of ['hatch','sedan','suv','cab']as const){
    const model=M.car(kind,'#e8e7df',rng(13)),o=model.occupants!.find(o=>o.role==='driver')!,g=model.body.geometry(),body=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));body.updateMatrixWorld(true);
    // The ray can reach the occupant. An opaque glasshouse intersected it at
    // the window skin, before reaching any human geometry or seat.
    const hits=new THREE.Raycaster(new THREE.Vector3(3,o.hipY+.72*o.scale,o.z-.04),new THREE.Vector3(-1,0,0),0,6).intersectObject(body);
    assert.ok(hits.length,`${kind}: full head must actually be present`);
    assert.ok(hits[0].point.x<model.size[0]*.40,`${kind}: exterior opaque skin hides its seated driver`);
    assert.ok(model.body.pos.length/9<15000);g.dispose();
  }
});

test('bus replaces detached heads with seated bodies and leaves both real left entrance apertures open',()=>{
  init();const model=M.bus(rng(1)),g=model.body.geometry(),body=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));body.updateMatrixWorld(true);
  assert.equal(model.occupants?.length,5);assert.equal(model.occupants!.filter(o=>o.role==='driver').length,1);
  for(const z of [-4.7,4.4])for(const y of [.65,1.20,1.78]){
    const ray=new THREE.Raycaster(new THREE.Vector3(-2,y,z),new THREE.Vector3(1,0,0),0,.70);
    assert.equal(ray.intersectObject(body).length,0,`left door ${z} / height ${y} cannot be a painted panel across the walking route`);
  }
  assert.ok(model.body.pos.length/9<25000);g.dispose();
});

test('bus and compact-truck fenders expose the real upper tyre instead of hiding it behind a painted slab',()=>{
  init();for(const [model,axles,y]of [[M.bus(rng(1)),[-3.6,2.1],.75],[M.miniTruck(rng(2)),[-1.05],.43]]as const){
    const body=new THREE.Mesh(model.body.geometry(),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));body.updateMatrixWorld(true);
    for(const side of [-1,1])for(const z of axles){
      const hits=new THREE.Raycaster(new THREE.Vector3(side*3,y,z),new THREE.Vector3(-side,0,0),0,6).intersectObject(body);
      assert.ok(hits.length);assert.ok(Math.abs(hits[0].point.x)<model.size[0]/2-.008,`${model.archetype}: arch must expose tyre at axle ${z}`);
    }
  }
});

test('headlight lenses have physical backing instead of floating ahead of the vehicle',()=>{
  init();const models=[...(['hatch','sedan','suv','cab']as const).map(k=>M.car(k,'#e9e5df',rng(71))),M.auto(rng(72)),M.motorbike(rng(73)),M.scooter(rng(74)),M.bus(rng(75)),M.lorry(rng(76)),M.tanker(rng(77)),M.miniTruck(rng(78)),M.passengerVan(rng(79))];
  for(const model of models){
    const geometry=model.body.geometry(),body=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));body.updateMatrixWorld(true);
    assert.ok(geometry.boundingBox!.max.y<=model.size[1]+.012,`${model.archetype}: physical roof/occupant envelope must not exceed the registered collision and pickup height`);
    assert.ok(model.headlights?.length);
    for(const p of model.headlights!){
      const hits=new THREE.Raycaster(new THREE.Vector3(p.x,p.y,p.z),new THREE.Vector3(0,0,1),.001,.055).intersectObject(body);
      assert.ok(hits.length,`${model.archetype}: headlight at ${JSON.stringify(p)} needs a connected casing within 5.5 cm, not a visibly detached cube`);
    }
    geometry.dispose();
  }
});

test('passenger van rear glazing is an actual opening in the opaque rear doors',()=>{
  init();const model=M.passengerVan(rng(71)),geometry=model.body.geometry(),body=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));body.updateMatrixWorld(true);
  for(const side of [-1,1]){
    const hits=new THREE.Raycaster(new THREE.Vector3(side*.45,1.80,model.size[2]/2+.15),new THREE.Vector3(0,0,-1),0,.20).intersectObject(body);
    assert.equal(hits.length,0,'rear glass must not be drawn on top of an opaque van door');
  }
  geometry.dispose();
});

test('hatch has high upright rear glass and car lamp surrounds are supported by painted metal at their corners',()=>{
  init();const paint='#e9e5df';
  for(const kind of ['hatch','sedan','suv','cab']as const){
    const model=M.car(kind,paint,rng(73)),metal=colorMesh(model,paint),L=model.size[2];
    for(const lamp of model.headlights!)for(const x of [-.115,.115])for(const y of [-.035,.035]){
      const hits=new THREE.Raycaster(new THREE.Vector3(lamp.x+x,lamp.y+y,-L/2-.07),new THREE.Vector3(0,0,1),0,.085).intersectObject(metal);
      assert.ok(hits.length,`${kind}: lamp surround corner must sit over real painted nose, not above/outside it`);
    }
    for(const [hex,front]of [['#263139',true],['#28292b',false]]as const){const c=new THREE.Color(hex),seen=new Set<string>();
      for(let i=0;i<model.body.pos.length;i+=3){const[x,y,z]=model.body.pos.slice(i,i+3),col=model.body.col;if((front?z>=-L/2:z<=L/2)||Math.abs(col[i]-c.r)>1e-5||Math.abs(col[i+1]-c.g)>1e-5||Math.abs(col[i+2]-c.b)>1e-5)continue;const key=[x,y,z].join(',');if(seen.has(key))continue;seen.add(key);
        const direction=front?1:-1;
        assert.ok(new THREE.Raycaster(new THREE.Vector3(x,y,z-direction*.005),new THREE.Vector3(0,0,direction),0,.06).intersectObject(metal).length,`${kind}: every exposed ${front?'front':'rear'} casing corner needs underlying metal, not a fin`);
      }
    }
    if(kind==='hatch'){
      const glazing=new THREE.Mesh(model.decals![0].geo,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));glazing.updateMatrixWorld(true);
      const hit=new THREE.Raycaster(new THREE.Vector3(0,1.30,L),new THREE.Vector3(0,0,-1),0,L).intersectObject(glazing)[0];
      assert.ok(hit&&hit.point.z>L*.38,'hatch rear screen must be upright near the tail, rather than leaving a sedan boot');
    }
    metal.geometry.dispose();
  }
});

test('SUV upper lamps are backed by nose sheet and roof rails have real mounting feet',()=>{
  init();const paint='#e9e5df',model=M.car('suv',paint,rng(2)),W=model.size[0],H=model.size[1],L=model.size[2],metal=colorMesh(model,paint),hardware=colorMesh(model,'#34383c');
  for(let i=0;i<model.lights.pos.length;i+=3){const[x,y,z]=model.lights.pos.slice(i,i+3);if(y<.85||z>-L/2)continue;
    assert.ok(new THREE.Raycaster(new THREE.Vector3(x,y,z-.005),new THREE.Vector3(0,0,1),0,.06).intersectObject(metal).length,'upper DRL vertex must have painted backing, not hang above the hood');
  }
  for(const side of [-1,1])for(const z of [-L*.10+.18,L*.30-.18]){
    assert.ok(new THREE.Raycaster(new THREE.Vector3(side*W*.20,H-.06,z),new THREE.Vector3(side,0,0),0,W*.2).intersectObject(hardware).length,'each rail needs an actual foot between the crown and rod');
  }
  metal.geometry.dispose();hardware.geometry.dispose();
});

test('auto supported age/scale head geometry clears the real curved roof after seats are lowered',()=>{
  init();const model=M.auto(rng(1)),roof=colorMesh(model,'#17161b',1.53);
  const looks:[PersonSpec['kind'],number][]=[['shirt',1.08],['kurta_cap',1.08],['elder_m',1.048],['teen_m',1],['sari',1],['salwar',1],['burqa',1],['schoolboy',.78],['schoolgirl',.78]];
  for(const[kind,s]of looks)for(const x of [-.4,0,.4]){
    const p:PersonSpec={kind,s,skin:'#8d5a3b',hair:'#141216',a:'#d48a4b',b:'#314958',c:'#e3bf71',walk:1,hairstyle:2};
    const person=new Batch();drawSeatedPerson(person,p,x,.78,.82,'rickshawPassenger');
    const seen=new Set<string>();
    for(let i=0;i<person.pos.length;i+=3){const[px,py,pz]=person.pos.slice(i,i+3);if(py<1.30)continue;const key=`${px.toFixed(3)},${py.toFixed(3)},${pz.toFixed(3)}`;if(seen.has(key))continue;seen.add(key);
      const hit=new THREE.Raycaster(new THREE.Vector3(px,1.45,pz),new THREE.Vector3(0,1,0),0,.60).intersectObject(roof)[0];
      assert.ok(hit&&py+.007<hit.point.y,`${kind} s=${s} x=${x}: head/hair must clear the actual canopy with margin`);
    }
  }
  assert.equal(model.occupants![0].hipY,.76);assert.equal(model.occupants![0].control?.y,1.05);
  const floor=colorMesh(model,'#2a2930');
  for(const side of [-1,1]){const hit=new THREE.Raycaster(new THREE.Vector3(side*.115,.45,-.88),new THREE.Vector3(0,-1,0),0,.2).intersectObject(floor)[0];assert.ok(hit&&Math.abs(hit.point.y-.33)<.002,'lowered driver needs a real toe pan under the soles, not only matching height');}
  roof.geometry.dispose();floor.geometry.dispose();
});

test('scooter nacelle joins its apron and bus/van mirrors have physical support across the gap',()=>{
  init();const scooter=M.scooter(rng(1)),body=new THREE.Mesh(scooter.body.geometry(),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));body.updateMatrixWorld(true);
  assert.ok(new THREE.Raycaster(new THREE.Vector3(0,1.085,-.8),new THREE.Vector3(0,0,1),0,.5).intersectObject(body).length,'steering neck must fill the actual apron-to-nacelle gap');body.geometry.dispose();
  const bus=M.bus(rng(2)),busHardware=colorMesh(bus,'#303b41'),van=M.passengerVan(rng(3)),vanHardware=colorMesh(van,'#3c4346');
  for(const side of [-1,1]){
    assert.ok(new THREE.Raycaster(new THREE.Vector3(side*1.33,2.66,-5.60),new THREE.Vector3(0,0,1),0,.30).intersectObject(busHardware).length,'bus mirror cannot be a suspended block');
    assert.ok(new THREE.Raycaster(new THREE.Vector3(side*(van.size[0]/2+.01),1.80,-2.061),new THREE.Vector3(0,-1,0),0,.14).intersectObject(vanHardware).length,'van mirror needs a stalk spanning its body gap');
  }
  busHardware.geometry.dispose();vanHardware.geometry.dispose();
});

test('van bonnet is closed in front and side projection and steering assembly stays behind the windscreen',()=>{
  init();const model=M.passengerVan(rng(31)),W=model.size[0],L=model.size[2];
  // Opaque production surfaces must close the assembly without a decal mask.
  const body=new THREE.Mesh(model.body.geometry(),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));body.updateMatrixWorld(true);
  for(const x of [-.4,0,.4]){const y=1.39+.035*(1-(x/(W*.47))**2)-.003;
    assert.ok(new THREE.Raycaster(new THREE.Vector3(x,y,-L/2-.10),new THREE.Vector3(0,0,1),0,.12).intersectObject(body).length,'crowned bonnet front return cannot leave a horizontal slit');
  }
  for(const side of [-1,1])assert.ok(new THREE.Raycaster(new THREE.Vector3(side*W*.49,1.50,-L/2+.20),new THREE.Vector3(0,-1,0),0,.14).intersectObject(body).length,'narrow bonnet needs a closed horizontal shoulder to the body');
  const driver=model.occupants!.find(o=>o.role==='driver')!,c=driver.control!,frontOfWheel=c.z-.265*driver.scale*Math.sin(.22),top=c.y+.265*driver.scale;
  const screenAtTop=-2.015+(top-1.50)/.77*.115;
  assert.ok(frontOfWheel>screenAtTop+.04,'wheel and hands must remain behind the external windscreen, with clearance');body.geometry.dispose();
});

test('tanker ladder rungs stay outside the vessel and compact truck plate is in front of its crossmember',()=>{
  init();const tanker=M.tanker(rng(1)),body=new THREE.Mesh(tanker.body.geometry(),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));body.updateMatrixWorld(true);
  for(let y=1.08;y<2.95;y+=.24){const hit=new THREE.Raycaster(new THREE.Vector3(.55,y,4.50),new THREE.Vector3(0,0,-1),0,1).intersectObject(body)[0];assert.ok(hit&&hit.point.z>4.055,'a rung cannot be hidden inside the curved end-cap');}
  body.geometry.dispose();const mini=M.miniTruck(rng(2)),metal=new THREE.Mesh(mini.body.geometry(),new THREE.MeshBasicMaterial({side:THREE.DoubleSide})),plate=new THREE.Mesh(mini.decals![2].geo,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));metal.updateMatrixWorld(true);plate.updateMatrixWorld(true);
  for(const x of [-.16,0,.16])for(const y of [.56,.62]){const ray=new THREE.Raycaster(new THREE.Vector3(x,y,3),new THREE.Vector3(0,0,-1),0,2),p=ray.intersectObject(plate)[0],m=ray.intersectObject(metal)[0];assert.ok(p&&m&&p.distance<m.distance,'rear plate must be visible over its crossmember across its printed face');}
  metal.geometry.dispose();
});

test('passenger exchange reaches the actual bus door/floor and preserves its existing four-person dwell schedule',()=>{
  init();const exchange=new BusPassengerExchange({x:0,y:0,z:0,hx:0,hz:-1},6,new THREE.MeshBasicMaterial());
  assert.equal(exchange.people.length,4);assert.deepEqual(exchange.people.map(p=>p.mode),['alight','alight','board','board']);
  exchange.update(.12);const alight=exchange.people[0].group;
  assert.ok(Math.abs(alight.position.z-4.4)<.05);assert.ok(Math.abs(alight.position.y-.94)<.05);
  exchange.update(6);assert.equal(exchange.people.filter(p=>p.mode==='board'&&p.group.visible).length,0);
  exchange.group.dispatchEvent({type:'removed'});
});

test('boarding and alighting paths clear door jambs throughout the exchange, not only at their endpoints',()=>{
  init();const exchange=new BusPassengerExchange({x:0,y:0,z:0,hx:0,hz:-1},6,new THREE.MeshBasicMaterial());
  const crossing=new Set<number>();
  for(let frame=0;frame<41;frame++){
    exchange.update(.15);
    exchange.people.forEach((person,i)=>{
      if(!person.group.visible)return;
      const {x,z}=person.group.position;
      // Include a shoulder's worth of outside clearance, so a diagonal cannot
      // clip a jamb while the figure's centre happens to enter the opening.
      if(x> -1.60&&x< -.90){
        crossing.add(i);const centre=person.mode==='alight'?4.4:-4.7;
        assert.ok(Math.abs(z-centre)<.21,`${person.mode} ${i}: the full figure must cross at the door, not through the side panel`);
      }
    });
  }
  assert.equal(crossing.size,4);exchange.group.dispatchEvent({type:'removed'});
});

test('vans and minitrucks retain their body heights and leave order pickups to autos',()=>{
  init();const graph=new RoadGraph([road]),scene=new THREE.Scene(),traffic=new Traffic(graph,scene,{vBody:new THREE.MeshStandardMaterial(),vLight:new THREE.MeshBasicMaterial()},0);
  for(const [group,spec]of [['car',S.van],['truck',S.miniTruck]]as const){
    const proto=traffic.byGroup[group].find(p=>Math.abs(p.size[2]-spec.length)<1e-6)!;assert.ok(proto,`${group} prototype is registered`);
    // Force this production prototype without changing update/routing code.
    const old=traffic.byGroup[group];traffic.byGroup[group]=[proto];const car=traffic.spawnAt(group,graph.edges[0],1,100,0);traffic.byGroup[group]=old;
    const marker=new CarrierMarker(scene,{...PICKUP_CONFIG,maxCarriersNearby:1});
    marker.update(.016,[car],{x:car.x,y:car.y,z:car.z+8},true);
    assert.equal(marker.activeCount,0);
    // Exterior camera/orbit remains independent of both simulation lifetime
    // and the taller actual roof used by jumping/collision calculations.
    traffic.hideNear(new THREE.Vector3(car.x+3,car.y+spec.height+.2,car.z));assert.equal(car.g.visible,true);
    assert.equal(traffic.hitTest(car.x,car.y+spec.height-.05,car.z,.1),car);
    marker.dispose();traffic.clear();
  }
});
