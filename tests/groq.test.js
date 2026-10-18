import {test} from 'node:test';import assert from 'node:assert/strict';import {groqAssist,groqRequestSize} from '../server/groq-assist.js';import {aiAssist} from '../server/ai-assist.js';
const ok=(data,usage={prompt_tokens:20,completion_tokens:10})=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(data)}}],usage}),{headers:{'x-ratelimit-remaining-requests':'23','x-ratelimit-remaining-tokens':'4567'}});
test('Groq sends its own key in a header, uses JSON mode, and accepts only text-ready PDFs',async()=>{
 let sent;const result=await groqAssist({task:'extract',text:'氏名：テスト',textReady:true,pages:['data:image/png;base64,YWJj']},{apiKey:'test-placeholder',fetchImpl:async(url,options)=>{sent={url,options,body:JSON.parse(options.body)};return ok({name:'テスト'});}});
 assert.equal(result.mode,'groq');assert.equal(sent.url,'https://api.groq.com/openai/v1/chat/completions');assert.equal(sent.options.headers.Authorization,'Bearer test-placeholder');assert.ok(!sent.url.includes('test-placeholder'));assert.equal(sent.body.model,'openai/gpt-oss-120b');assert.equal(sent.body.response_format.type,'json_object');assert.ok(!JSON.stringify(sent.body).includes('YWJj'));assert.match(sent.body.messages[0].content,/"type":"object"/);assert.equal(result.providerUsage.rateLimits.requestsRemaining,23);
 let called=false;await assert.rejects(()=>groqAssist({task:'extract',pages:['data:image/png;base64,YWJj']},{apiKey:'test-placeholder',fetchImpl:async()=>{called=true;}}),e=>e.code==='GROQ_TEXT_ONLY');assert.equal(called,false);
});
test('Groq drafts and verifies using the shared three-stage grounded workflow',async()=>{
 const quote='Python開発を担当';const responses=[{facts:[{id:'F1',claim:quote,sourceId:'career',quote}],matches:[],gaps:['営業経験は確認できません。']},{motivation:[{text:'Python開発を担当しました。',factIds:['F1']}],strengths:[],summary:[],additional:[]},{checks:[{sentenceId:'motivation:0',verdict:'supported',classification:'factual',sourceQuotes:[{sourceId:'career',quote}],reason:'原文に一致'}]}];let calls=0;
 const r=await groqAssist({task:'write',document:{careerText:quote,jobText:'法人営業担当を募集'}},{apiKey:'test-placeholder',fetchImpl:async()=>{calls++;return ok(responses.shift());}});assert.equal(calls,3);assert.equal(r.grounding.verified,true);assert.equal(r.mode,'groq');assert.equal(r.providerUsage.inputTokens,60);assert.match(r.warnings.join(' '),/営業経験/);
});
test('Groq quota, credentials, truncation and cancellation fail safely without leaking raw errors',async()=>{
 for(const [status,code] of [[429,'GROQ_QUOTA_EXCEEDED'],[401,'GROQ_KEY_REJECTED'],[403,'GROQ_KEY_REJECTED'],[404,'GROQ_MODEL_UNAVAILABLE'],[500,'GROQ_PROVIDER_ERROR']])await assert.rejects(()=>groqAssist({task:'transcribe',text:'private input'},{apiKey:'test-placeholder',fetchImpl:async()=>new Response('private provider message',{status,headers:{'Retry-After':'12'}})}),e=>e.code===code&&!e.message.includes('private')&&(status!==429||e.retryAfterSeconds===12));
 await assert.rejects(()=>groqAssist({task:'transcribe',text:'fixture'},{apiKey:'test-placeholder',fetchImpl:async()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'{"text":"partial"}'}}]}))}),e=>e.code==='GROQ_OUTPUT_LIMIT');
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
 const options={mode:'gemini-groq',apiKey:'placeholder',groqKey:'placeholder',groqModel:'openai/gpt-oss-120b',gemini:async()=>{order.push('gemini');throw Object.assign(Error('invalid evidence response'),{code:'INVALID_EVIDENCE'});},groq:async(received,config)=>{order.push('groq');assert.equal(received,input);assert.equal(config.model,'openai/gpt-oss-120b');return {mode:'groq',warnings:[],grounding:{verified:true}};}};
 assert.equal((await aiAssist(input,options)).grounding.verified,true);assert.deepEqual(order,['gemini','groq']);
 await assert.rejects(()=>aiAssist(input,{...options,groq:async()=>{throw Object.assign(Error('unsupported'),{code:'UNSUPPORTED_CLAIMS'});}}),e=>e.code==='UNSUPPORTED_CLAIMS');
 let fallback=false;await assert.rejects(()=>aiAssist(input,{...options,gemini:async()=>{throw Object.assign(Error('cancelled'),{code:'AI_CANCELLED'});},groq:async()=>{fallback=true;}}));assert.equal(fallback,false);
});
test('Groq budgets output against complete Japanese input and retains original sources in every verification batch',async()=>{
 const source='【原文】'+('海外への物流調整を担当。\n'.repeat(150))+'【末尾】';
 const quote='海外への物流調整を担当。';const sentence={text:'海外への物流調整を担当しました。',factIds:['F1']};const fields=['motivation','strengths','additional','summary'];
 const responses=[{facts:[{id:'F1',claim:quote,sourceId:'career',quote}],matches:[],gaps:[]},Object.fromEntries(fields.map(k=>[k,[sentence]])),...[[0,1],[2,3]].map(ids=>({checks:ids.map(i=>({sentenceId:fields[i]+':0',verdict:'supported',classification:'factual',sourceQuotes:[{sourceId:'career',quote}],reason:'原文と一致'}))}))];
 const calls=[];const result=await groqAssist({task:'write',document:{careerText:source,jobText:'海外物流の担当者募集'}},{apiKey:'test-placeholder',model:'openai/gpt-oss-120b',fetchImpl:async(url,options)=>{
  const body=JSON.parse(options.body);calls.push(body);assert.equal(body.reasoning_effort,'low');assert.ok(body.max_completion_tokens<=4096);assert.ok(groqRequestSize(body.messages).inputTokens+body.max_completion_tokens<=7872);
  if(calls.length!==2){assert.ok(body.messages[1].content.includes('【原文】'));assert.ok(body.messages[1].content.includes('【末尾】'));}
  return ok(responses.shift());
 }});
 assert.equal(result.grounding.verified,true);assert.equal(calls.length,4);
 for(const call of calls.slice(2)){assert.ok(!call.messages[1].content.includes('"evidence":'));}
});
test('413 is classified as request size without exposing provider contents',async()=>{
 await assert.rejects(()=>groqAssist({task:'transcribe',text:'fixture'},{apiKey:'test-placeholder',fetchImpl:async()=>new Response('private provider text',{status:413})}),e=>e.code==='GROQ_REQUEST_TOO_LARGE'&&!e.message.includes('private provider text'));
});
test('complete native job text bypasses both providers even when no key or quota is available',async()=>{
 const text='求人票の1ページ目\n\n求人票の2ページ目\n輸出入業務・英語・EXCEL';let calls=0;
 const result=await aiAssist({task:'transcribe',text,textReady:true,pageCount:2,pages:['image']},{mode:'gemini-groq',gemini:async()=>{calls++;throw Error('quota');},groq:async()=>{calls++;throw Error('length');}});
 assert.equal(result.mode,'native-text');assert.equal(result.data.text,text);assert.equal(calls,0);
});
test('Groq truncated extraction retries disjoint field groups and never applies partial JSON',async()=>{
 const source='先頭の原文。氏名：原文 太郎。電話090-1234-5678。学歴と職歴。最後の原文。';const completed=[];let truncated=0;
 const result=await groqAssist({task:'extract',text:source,textReady:true},{apiKey:'test-placeholder',fetchImpl:async(url,options)=>{
  const request=JSON.parse(options.body);assert.ok(request.messages[1].content.includes(source));
  const schema=JSON.parse(request.messages[0].content.split('\n次のJSONスキーマに従うJSONオブジェクトだけを返してください。\n')[1]);
  if(schema.required.length>4){truncated++;return new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'{"name":"切断された誤った名前"'}}]}));}
  const values={name:'原文 太郎',phone:'090-1234-5678',education:[{date:'2010-04',name:'原文大学 入学'}],experience:[{date:'2020-04',name:'原文会社',position:'担当者'}]};
  const data=Object.fromEntries(schema.required.map(k=>[k,values[k]??(schema.properties[k].type==='array'?[]:'')]));completed.push(...schema.required);return ok(data);
 }});
 assert.ok(truncated>0);assert.equal(result.data.name,'原文 太郎');assert.equal(result.data.phone,'090-1234-5678');assert.equal(result.data.experience[0].name,'原文会社');assert.equal(new Set(completed).size,completed.length);assert.ok(!JSON.stringify(result.data).includes('切断された'));assert.match(result.warnings.join(' '),/全項目/);
});
test('complete JPEG OCR can load a job without cloud calls and can reach Groq extraction after Gemini quota',async()=>{
 let gemini=0,groq=0;const input={text:'画像の先頭から末尾までOCRで読み取った原文',ocrTextReady:true,textReady:false,pages:['data:image/jpeg;base64,YWJj'],pageCount:1};
 const options={mode:'gemini-groq',apiKey:'placeholder',groqKey:'placeholder',gemini:async()=>{gemini++;throw Object.assign(Error('quota'),{code:'QUOTA_EXCEEDED'});},groq:async(received)=>{groq++;assert.equal(received.text,input.text);assert.equal(received.ocrTextReady,true);return {mode:'groq',warnings:[]};}};
 const job=await aiAssist({...input,task:'transcribe'},options);assert.equal(job.mode,'local-ocr');assert.equal(job.data.text,input.text);assert.equal(gemini,0);assert.equal(groq,0);
 assert.equal((await aiAssist({...input,task:'extract'},options)).mode,'groq');assert.equal(gemini,1);assert.equal(groq,1);
});
