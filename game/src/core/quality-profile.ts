const KEY = 'roadster-measured-quality-v1';
export function measuredQuality(): boolean {
  try {
    const p=JSON.parse(localStorage.getItem(KEY)||'null');
    const age=Date.now()-p?.time;
    if(p?.version===3 && typeof p.low==='boolean' && (p.low || p.measuredPreset==='high') && Number.isFinite(age) && age>=0 && age<86400000 && p.pixelRatio===(devicePixelRatio||1))return p.low;
  }catch{/* Storage is optional. */}
  // Conservative first session, independent of touch or user-agent guessing.
  return true;
}
export function rememberQuality(frameCPU95:number, frameInterval95:number, gpu95:number|null, currentLow=true) {
  if(!Number.isFinite(frameCPU95)||!Number.isFinite(frameInterval95))return;
  // A fast Low frame does not measure High's extra pixels, shadows and traffic.
  // Only an actual successful High session can certify that preset for Auto.
  const low=currentLow || gpu95===null || !Number.isFinite(gpu95) || frameCPU95>10 || frameInterval95>21 || (gpu95!==null&&gpu95>13);
  try{localStorage.setItem(KEY,JSON.stringify({version:3,time:Date.now(),pixelRatio:devicePixelRatio||1,low,measuredPreset:currentLow?'low':'high',frameCPU95,frameInterval95,gpu95}));}catch{/* Storage is optional. */}
}
