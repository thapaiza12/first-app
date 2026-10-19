import {setTimeout as delay} from 'node:timers/promises';

// One process-wide queue shared by Gemini and Groq, including connection checks.
export function createRateLimitedFetch({fetchImpl=globalThis.fetch,sleep=(ms,signal)=>delay(ms,undefined,{signal}),now=Date.now,batchSize=3,batchDelayMs=1000,retryDelays=[15000,30000,60000]}={}){
 const queue=[];let running=false;
 async function drain(){
  if(running)return;running=true;
  try{
   while(queue.length){
    const batch=queue.splice(0,batchSize);
    await Promise.all(batch.map(async({url,options,resolve,reject})=>{
     try{
      options.signal?.throwIfAborted();
      const response=await fetchImpl(url,options);
      // Keep the slot until the response body has finished arriving.
      const body=await response.arrayBuffer();
      resolve(new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers}));
     }catch(error){reject(error);}
    }));
    // Cool down even when the next request arrives after this batch completes.
    await sleep(batchDelayMs);
   }
  }finally{running=false;}
 }
 const enqueue=(url,options)=>new Promise((resolve,reject)=>{
  options.signal?.throwIfAborted();queue.push({url,options,resolve,reject});void drain();
 });
 return async function limitedFetch(url,options={}){
  for(let attempt=0;;attempt++){
   const response=await enqueue(url,options);
   if(response.status!==429||attempt===retryDelays.length)return response;
   const header=response.headers.get('retry-after');
   const seconds=header&&/^\d+(?:\.\d+)?$/.test(header)?Number(header):null;
   const date=header&&seconds===null?Date.parse(header):NaN;
   const serverWait=seconds!==null?seconds*1000:Number.isFinite(date)?Math.max(0,date-now()):0;
   await sleep(Math.max(retryDelays[attempt],serverWait),options.signal);
  }
 };
}
export const rateLimitedFetch=createRateLimitedFetch();
