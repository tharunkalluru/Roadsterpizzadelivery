// Standalone actual-WebGL capture probe. Run baseline then candidate serially.
// Virtual mood time reproduces the production 0.5 s update schedule; these are
// capture timings, never whole-game frame rates. finish() is probe-only.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { writeFile } from 'node:fs/promises';
const out = new URL('.', import.meta.url).pathname;
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--ignore-gpu-blocklist']});
try {
 for (const [label,port] of [['baseline',4401],['candidate',4402]]) {
  const page=await browser.newPage({viewport:{width:800,height:450},deviceScaleFactor:1});
  await page.route('**/__envprobe',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><div id="stage" style="width:800px;height:450px"></div></body>'}));
  await page.goto(`http://127.0.0.1:${port}/__envprobe`);
  await page.evaluate(async()=>{
   const [{Engine},{moodAt},THREE]=await Promise.all([import('/src/core/engine.ts'),import('/src/core/sky.ts'),import('/node_modules/.vite/deps/three.js')]);
   const e=new Engine(document.querySelector('#stage'),{lowQ:false}); e.camera.position.set(0,3,9);e.camera.lookAt(0,1,0);
   const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,100),e.mats.ground);ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;e.scene.add(ground);
   for(const [i,rough] of [.15,.42,.85].entries()){const m=new THREE.Mesh(new THREE.SphereGeometry(1,48,24),new THREE.MeshStandardMaterial({color:'#bbbbbb',roughness:rough,metalness:.3}));m.position.set((i-1)*2.5,1,0);m.castShadow=true;e.scene.add(m);}
   const captures=[],original=e.pmrem.fromScene.bind(e.pmrem),gl=e.renderer.getContext();
   e.pmrem.fromScene=(...args)=>{gl.finish();const start=performance.now(),result=original(...args),submitted=performance.now();gl.finish();captures.push({submitMs:submitted-start,completeMs:performance.now()-start});return result;};
   Object.assign(window,{probe:{e,moodAt,captures,gl}});
   e.applyMood(moodAt(16.8),{},0);e.placeSun(new THREE.Vector3());e.render(true);gl.finish();
   captures.length=0;
  });
  for(const t of [500,1000,1500,2000,2500]) await page.evaluate(t=>{const p=window.probe;p.e.applyMood(p.moodAt(16.8+t/25000),{},t);p.e.render(true);p.gl.finish();},t);
  await page.screenshot({path:out+`env-${label}-dusk-2_5s.png`});
  for(let t=3000;t<=70000;t+=500) await page.evaluate(t=>{const p=window.probe;p.e.applyMood(p.moodAt(16.8+t/25000),{},t);p.e.render(true);p.gl.finish();},t);
  const result=await page.evaluate(()=>{const p=window.probe,ext=p.gl.getExtension('WEBGL_debug_renderer_info');return {captureSamples:p.captures,renderer:ext?p.gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):p.gl.getParameter(p.gl.RENDERER),geometry:p.e.renderer.info.memory,programs:p.e.renderer.info.programs.length};});
  const summary=values=>{const s=[...values].sort((a,b)=>a-b);return {count:s.length,total:s.reduce((a,b)=>a+b,0),p50:s[Math.ceil(s.length*.5)-1],p95:s[Math.ceil(s.length*.95)-1],p99:s[Math.ceil(s.length*.99)-1],max:Math.max(...s)};};
  result.submit=summary(result.captureSamples.map(x=>x.submitMs));result.complete=summary(result.captureSamples.map(x=>x.completeMs));
  await writeFile(out+`env-${label}.json`,JSON.stringify({...result,label,width:800,height:450,pixelRatio:1,quality:'High',simulatedTransitionSeconds:70,scope:'Standalone real WebGL PMREM probe, one cold capture excluded; finish GPU synchronization only in probe.'},null,2)+'\n');
  console.log(label,result.submit,result.complete,result.renderer); await page.close();
 }
} finally {await browser.close();}
