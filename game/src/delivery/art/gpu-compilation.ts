import * as THREE from 'three';

/** Compile through Three's public API, with our own cancellable readiness wait.
 *
 * The compile invocation is synchronous, before this function returns its
 * promise. A caller can therefore bind a preparation target, invoke this helper
 * and restore the real target in finally, without holding renderer state across
 * an await. Only public renderer.info program handles and WebGL status queries
 * are inspected; Three's uncancellable compileAsync polling is not started.
 *
 * info.programs is renderer-wide, so an unrelated pending program present in
 * the initial snapshot may also delay readiness. KHR_parallel_shader_compile
 * permits nonblocking completion polling. Without it, LINK_STATUS can block in
 * the driver; the timeout bounds our polling, not a synchronous driver call.
 */
export function compileCharacterPrograms(
  renderer:THREE.WebGLRenderer,
  object:THREE.Object3D,
  camera:THREE.Camera,
  targetScene?:THREE.Scene,
  valid:()=>boolean=()=>true,
  timeoutMs=10_000,
):Promise<void>{
  return new Promise<void>((resolve,reject)=>{
    const gl=renderer.getContext(),canvas=renderer.domElement;
    let settled=false,timer:ReturnType<typeof setTimeout>|undefined;
    const deadline=performance.now()+timeoutMs;
    const finish=(error?:unknown)=>{
      if(settled)return;settled=true;
      if(timer!==undefined)clearTimeout(timer);
      canvas.removeEventListener('webglcontextlost',contextChanged);
      canvas.removeEventListener('webglcontextrestored',contextChanged);
      if(error)reject(error instanceof Error?error:new Error(String(error)));else resolve();
    };
    const contextChanged=()=>finish(new Error('Character shader preparation was interrupted by a graphics context change.'));
    const check=()=>{
      if(gl.isContextLost())throw new Error('Graphics context is temporarily unavailable during character shader preparation.');
      if(!valid())throw new Error('Character shader preparation was cancelled.');
      if(performance.now()>=deadline)throw new Error('Character shader preparation timed out.');
    };
    canvas.addEventListener('webglcontextlost',contextChanged);
    canvas.addEventListener('webglcontextrestored',contextChanged);
    try{
      if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new Error('Character shader preparation needs a finite positive timeout.');
      check();
      renderer.compile(object,camera,targetScene);
      if(settled)return;
      check();
      const programs=new Set<WebGLProgram>((renderer.info.programs??[]).map(entry=>entry.program).filter(handle=>handle!=null));
      const extension=renderer.extensions.get('KHR_parallel_shader_compile');
      const completion=typeof extension?.COMPLETION_STATUS_KHR==='number'?extension.COMPLETION_STATUS_KHR:null;
      const pending=new Set(programs);
      const poll=()=>{
        if(settled)return;
        try{
          check();
          // A renderer-wide unrelated material can be retired while waiting.
          // Do not keep querying a deleted handle captured by the snapshot.
          const live=new Set((renderer.info.programs??[]).map(entry=>entry.program));
          for(const program of programs)if(!live.has(program)){programs.delete(program);pending.delete(program);}
          if(completion!==null){
            for(const program of pending)if(gl.getProgramParameter(program,completion))pending.delete(program);
            check();
            if(pending.size){timer=setTimeout(poll,Math.min(10,Math.max(0,deadline-performance.now())));return;}
          }
          // Query link status only after every KHR completion check succeeds.
          for(const program of programs){
            check();
            if(!gl.getProgramParameter(program,gl.LINK_STATUS)){
              const log=gl.getProgramInfoLog(program)?.trim();
              throw new Error('Character shader could not be linked.'+(log?' '+log.slice(0,500):''));
            }
          }
          check();finish();
        }catch(error){finish(error);}
      };
      if(!programs.size)finish();
      else if(completion!==null)poll();
      else timer=setTimeout(poll,0);
    }catch(error){finish(error);}
  });
}
