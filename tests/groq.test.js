import {test} from 'node:test';import assert from 'node:assert/strict';import {groqAssist} from '../server/groq-assist.js';import {aiAssist} from '../server/ai-assist.js';
const ok=(data,usage={prompt_tokens:20,completion_tokens:10})=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(data)}}],usage}),{headers:{'x-ratelimit-remaining-requests':'23','x-ratelimit-remaining-tokens':'4567'}});
test('Groq sends its own key in a header, uses JSON mode, and accepts only text-ready PDFs',async()=>{
 let sent;const result=await groqAssist({task:'extract',text:'氏名：テスト',textReady:true,pages:['data:image/png;base64,YWJj']},{apiKey:'test-placeholder',fetchImpl:async(url,options)=>{sent={url,options,body:JSON.parse(options.body)};return ok({name:'テスト'});}});
 assert.equal(result.mode,'groq');assert.equal(sent.url,'https://api.groq.com/openai/v1/chat/completions');assert.equal(sent.options.headers.Authorization,'Bearer test-placeholder');assert.ok(!sent.url.includes('test-placeholder'));assert.equal(sent.body.model,'llama-3.3-70b-versatile');assert.equal(sent.body.response_format.type,'json_object');assert.ok(!JSON.stringify(sent.body).includes('YWJj'));assert.match(sent.body.messages[0].content,/"type":"object"/);assert.equal(result.providerUsage.rateLimits.requestsRemaining,23);
 let called=false;await assert.rejects(()=>groqAssist({task:'extract',pages:['data:image/png;base64,YWJj']},{apiKey:'test-placeholder',fetchImpl:async()=>{called=true;}}),e=>e.code==='GROQ_TEXT_ONLY');assert.equal(called,false);
});
test('Groq drafts and verifies using the shared three-stage grounded workflow',async()=>{
 const quote='Python開発を担当';const responses=[{facts:[{id:'F1',claim:quote,sourceId:'career',quote}],matches:[],gaps:['営業経験は確認できません。']},{motivation:[{text:'Python開発を担当しました。',factIds:['F1']}],strengths:[],summary:[],additional:[]},{checks:[{sentenceId:'motivation:0',verdict:'supported',classification:'factual',sourceQuotes:[{sourceId:'career',quote}],reason:'原文に一致'}]}];let calls=0;
 const r=await groqAssist({task:'write',document:{careerText:quote,jobText:'法人営業担当を募集'}},{apiKey:'test-placeholder',fetchImpl:async()=>{calls++;return ok(responses.shift());}});assert.equal(calls,3);assert.equal(r.grounding.verified,true);assert.equal(r.mode,'groq');assert.equal(r.providerUsage.inputTokens,60);assert.match(r.warnings.join(' '),/営業経験/);
});
test('Groq quota, credentials, truncation and cancellation fail safely without leaking raw errors',async()=>{
 for(const [status,code] of [[429,'GROQ_QUOTA_EXCEEDED'],[401,'GROQ_KEY_REJECTED'],[403,'GROQ_KEY_REJECTED'],[404,'GROQ_MODEL_UNAVAILABLE'],[500,'GROQ_PROVIDER_ERROR']])await assert.rejects(()=>groqAssist({task:'transcribe',text:'private input'},{apiKey:'test-placeholder',fetchImpl:async()=>new Response('private provider message',{status,headers:{'Retry-After':'12'}})}),e=>e.code===code&&!e.message.includes('private')&&(status!==429||e.retryAfterSeconds===12));
 await assert.rejects(()=>groqAssist({task:'transcribe',text:'fixture'},{apiKey:'test-placeholder',fetchImpl:async()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'{"text":"partial"}'}}]}))}),e=>e.code==='GROQ_INCOMPLETE');
 const controller=new AbortController();await assert.rejects(()=>groqAssist({task:'transcribe',text:'fixture'},{apiKey:'test-placeholder',signal:controller.signal,fetchImpl:async(url,options)=>new Promise((resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true});controller.abort();})}),e=>e.code==='AI_CANCELLED');
});
test('combined mode prefers Gemini for writing and images and never local Ollama',async()=>{
 let g=0,q=0,o=0;const options={mode:'gemini-groq',apiKey:'gemini-placeholder',groqKey:'groq-placeholder',gemini:async()=>{g++;return {mode:'gemini',warnings:[]};},groq:async()=>{q++;return {mode:'groq',warnings:[]};},ollama:async()=>{o++;throw Error('must not call');}};
 assert.equal((await aiAssist({task:'write'},options)).mode,'gemini');assert.equal((await aiAssist({task:'extract',pages:['image']},options)).mode,'gemini');assert.equal(g,2);assert.equal(q,0);assert.equal(o,0);
});
test('quota fallback restarts text work; scanned images and factual failures cannot bypass guards',async()=>{
 let q=0,g=0;const options={mode:'gemini-groq',apiKey:'placeholder',groqKey:'placeholder',gemini:async()=>{g++;throw Object.assign(Error('Gemini quota'),{code:'QUOTA_EXCEEDED'});},groq:async()=>{q++;return {mode:'groq',warnings:[]};}};
 assert.equal((await aiAssist({task:'extract',textReady:true,pages:['image']},options)).mode,'groq');
 await assert.rejects(()=>aiAssist({task:'extract',pages:['image']},options),e=>e.code==='VISION_UNAVAILABLE');assert.equal(q,1);
 await assert.rejects(()=>aiAssist({task:'write'},{...options,groq:async()=>{throw Object.assign(Error('unsupported facts'),{code:'UNSUPPORTED_CLAIMS'});}}),e=>e.code==='UNSUPPORTED_CLAIMS');assert.equal(g,3);
 const result=await aiAssist({task:'write'},{...options,groq:async()=>{throw Object.assign(Error('Groq quota'),{code:'GROQ_QUOTA_EXCEEDED'});},gemini:async()=>({mode:'gemini',warnings:[]})});assert.equal(result.mode,'gemini');
});

test('Gemini output exhaustion can restart complete native text extraction on Groq',async()=>{
 let calls=0;
 const result=await aiAssist({task:'extract',text:'complete source',textReady:true,pages:['data:image/png;base64,YWJj']},{mode:'gemini-groq',apiKey:'placeholder',groqKey:'placeholder',gemini:async()=>{throw Object.assign(Error('output limit'),{code:'OUTPUT_LIMIT'});},groq:async(input)=>{calls++;assert.equal(input.text,'complete source');return {mode:'groq',data:{name:'確認'},warnings:[]};}});
 assert.equal(result.mode,'groq');assert.equal(calls,1);
});

test('writing falls back Gemini then Groq, with full verification and cancellation respected',async()=>{
 const order=[];const input={task:'write',document:{sourceText:'actual resume'}};
 const options={mode:'gemini-groq',apiKey:'placeholder',groqKey:'placeholder',groqModel:'llama-3.3-70b-versatile',gemini:async()=>{order.push('gemini');throw Object.assign(Error('invalid evidence response'),{code:'INVALID_EVIDENCE'});},groq:async(received,config)=>{order.push('groq');assert.equal(received,input);assert.equal(config.model,'llama-3.3-70b-versatile');return {mode:'groq',warnings:[],grounding:{verified:true}};}};
 assert.equal((await aiAssist(input,options)).grounding.verified,true);assert.deepEqual(order,['gemini','groq']);
 await assert.rejects(()=>aiAssist(input,{...options,groq:async()=>{throw Object.assign(Error('unsupported'),{code:'UNSUPPORTED_CLAIMS'});}}),e=>e.code==='UNSUPPORTED_CLAIMS');
 let fallback=false;await assert.rejects(()=>aiAssist(input,{...options,gemini:async()=>{throw Object.assign(Error('cancelled'),{code:'AI_CANCELLED'});},groq:async()=>{fallback=true;}}));assert.equal(fallback,false);
});
