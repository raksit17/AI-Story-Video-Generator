const base=(process.argv[2]??'http://127.0.0.1:8188').replace(/\/$/,'');
const checkpoint=process.argv[3]??'sd_xl_base_1.0.safetensors';
try {
 const get=async(path)=>{const r=await fetch(base+path,{signal:AbortSignal.timeout(10000),redirect:'error'});if(!r.ok)throw new Error(`HTTP ${r.status}: ${path}`);return r.json();};
 const [info,queue]=await Promise.all([get('/object_info/CheckpointLoaderSimple'),get('/queue')]);
 const names=info.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0]??[];
 const available=names.includes(checkpoint);
 console.log(JSON.stringify({connected:true,checkpoint,checkpointAvailable:available,running:queue.queue_running?.length,pending:queue.queue_pending?.length},null,2));
 if(!available){console.error('Put the checkpoint in ComfyUI/models/checkpoints, restart ComfyUI and match COMFYUI_CHECKPOINT.');process.exitCode=2;}
} catch(error){console.error('ComfyUI check failed:',error.message);process.exitCode=1;}
