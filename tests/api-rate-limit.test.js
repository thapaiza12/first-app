import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRateLimitedFetch} from '../server/api-rate-limit.js';

test('global batches never exceed three and wait one second between batches',async()=>{
 let active=0,max=0,calls=0;const sleeps=[];
 const limited=createRateLimitedFetch({sleep:async ms=>{sleeps.push(ms);},fetchImpl:async()=>{active++;max=Math.max(max,active);calls++;await new Promise(resolve=>setImmediate(resolve));active--;return new Response('ok');}});
 await Promise.all(Array.from({length:10},()=>limited('https://example.test')));
 assert.equal(calls,10);assert.equal(max,3);assert.ok(sleeps.filter(ms=>ms===1000).length>=3);
});
test('429 retries use 15, 30, 60 seconds then return the exhausted response for fallback',async()=>{
 const waits=[];let calls=0;
 const limited=createRateLimitedFetch({sleep:async ms=>{waits.push(ms);},fetchImpl:async()=>{calls++;return new Response('{}',{status:429});}});
 assert.equal((await limited('https://example.test')).status,429);
 assert.equal(calls,4);assert.deepEqual(waits.filter(ms=>ms!==1000),[15000,30000,60000]);
});
test('Retry-After is respected and successful retries preserve response body',async()=>{
 const waits=[];let calls=0;
 const limited=createRateLimitedFetch({sleep:async ms=>{waits.push(ms);},fetchImpl:async()=>++calls===1?new Response('{}',{status:429,headers:{'retry-after':'20'}}):new Response('{"ok":true}')});
 assert.deepEqual(await (await limited('https://example.test')).json(),{ok:true});assert.ok(waits.includes(20000));assert.equal(calls,2);
});
test('cancel during backoff prevents any further requests',async()=>{
 const controller=new AbortController();let calls=0;
 const limited=createRateLimitedFetch({sleep:async(ms,signal)=>{if(ms!==1000){controller.abort();signal.throwIfAborted();}},fetchImpl:async()=>{calls++;return new Response('{}',{status:429});}});
 await assert.rejects(limited('https://example.test',{signal:controller.signal}),{name:'AbortError'});assert.equal(calls,1);
});
test('non-429 errors are not blindly retried',async()=>{
 let calls=0;const limited=createRateLimitedFetch({sleep:async()=>{},fetchImpl:async()=>{calls++;return new Response('{}',{status:401});}});
 assert.equal((await limited('https://example.test')).status,401);assert.equal(calls,1);
});
