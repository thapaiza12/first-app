import {test} from 'node:test';import assert from 'node:assert/strict';import {geminiAssist} from '../server/gemini-assist.js';
const ok=data=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(data)}]}}]}),{status:200});
test('Gemini sends credentials in the header, handles images, and validates extraction',async()=>{let sent;const result=await geminiAssist({task:'extract',text:'氏名 山田',pages:['data:image/png;base64,YWJj']},{apiKey:'test-placeholder',fetchImpl:async(url,options)=>{sent={url,options,body:JSON.parse(options.body)};return ok({name:'山田 太郎',education:[{date:'2013-04',name:'大学 入学'}],warnings:['日付を照合してください。'],unexpected:'ignored'});}});assert.equal(result.mode,'gemini');assert.equal(result.data.name,'山田 太郎');assert.equal(result.data.unexpected,undefined);assert.equal(sent.options.headers['x-goog-api-key'],'test-placeholder');assert.ok(!sent.url.includes('test-placeholder'));assert.equal(sent.body.contents[0].parts[1].inlineData.mimeType,'image/png');assert.match(sent.url,/generativelanguage.googleapis.com/);assert.match(result.warnings.join(' '),/原本/);});
test('quota, invalid credentials, malformed output and timeout produce safe errors',async()=>{for(const status of [429,403])await assert.rejects(()=>geminiAssist({task:'extract',text:''},{apiKey:'test-placeholder',fetchImpl:async()=>new Response('sensitive-provider-error',{status})}),e=>!e.message.includes('sensitive-provider-error')&&/Gemini/.test(e.message));await assert.rejects(()=>geminiAssist({task:'write',document:{jobText:'営業募集',sourceText:'Python開発'}},{apiKey:'test-placeholder',fetchImpl:async()=>ok({motivation:123})}),/根拠を確認/);await assert.rejects(()=>geminiAssist({task:'extract'},{apiKey:'test-placeholder',fetchImpl:async()=>{throw Error('secret in downstream error');}}),e=>!e.message.includes('secret in downstream error'));await assert.rejects(()=>geminiAssist({task:'extract'},{apiKey:'test-placeholder',model:'bad/model'}),/モデル名/);});
test('extraction preserves valid fields and rows when optional values are malformed or null',async()=>{
 const result=await geminiAssist({task:'extract',text:'fixture'},{apiKey:'test-placeholder',fetchImpl:async()=>ok({name:'山田 太郎',phone:null,birthDate:123,alternateAddress:'大阪府',experience:[{name:'会社A',date:'2020-04',end:null},{name:'会社B',date:'2023-04',current:true},null],languages:[{language:'英語',level:'advanced',qualification:'TOEIC 800'}],summary:'営業を担当',warnings:null})});
 assert.equal(result.mode,'gemini');assert.equal(result.data.name,'山田 太郎');assert.equal(result.data.alternateAddress,'大阪府');assert.equal(result.data.birthDate,undefined);assert.equal(result.data.experience.length,2);assert.equal(result.data.experience[1].current,true);assert.equal(result.data.languages[0].qualification,'TOEIC 800');assert.equal(result.data.languages[0].level,undefined);assert.equal(result.data.summary,'営業を担当');assert.match(result.warnings.join(' '),/birthDate/);assert.match(result.warnings.join(' '),/level/);
});
test('Gemini extraction reserves output for complete data and reports token truncation explicitly',async()=>{
 let config,schema;await geminiAssist({task:'extract',text:'fixture'},{apiKey:'test-placeholder',fetchImpl:async(url,options)=>{config=JSON.parse(options.body).generationConfig;schema=config.responseSchema;return ok({address:'東京都',phone:'090-1234-5678',experience:[{name:'会社A',date:'2020-04'}]});}});assert.equal(config.thinkingConfig.thinkingBudget,0);assert.equal(config.maxOutputTokens,16384);for(const field of ['address','phone','education','experience','licenses'])assert.ok(schema.required.includes(field));assert.ok(schema.properties.languages.items.properties.level.enum.every(v=>typeof v==='string'&&v.length>0));
 await assert.rejects(()=>geminiAssist({task:'extract'},{apiKey:'test-placeholder',fetchImpl:async()=>new Response(JSON.stringify({candidates:[{finishReason:'MAX_TOKENS'}]}))}),/長さの上限/);
});
test('400 schema rejection retries compatible JSON mode once without losing any document pages',async()=>{
 const requests=[];const result=await geminiAssist({task:'extract',text:'document fixture',pages:['data:image/png;base64,YWJj']},{apiKey:'test-placeholder',fetchImpl:async(url,options)=>{
  const body=JSON.parse(options.body);requests.push(body);
  if(requests.length===1)return new Response(JSON.stringify({error:{status:'INVALID_ARGUMENT',message:'The response schema has too many states'}}),{status:400});
  return ok({name:'テスト 太郎',address:'東京都千代田区1-1',phone:'090-1234-5678',education:[{date:'2015-04',name:'大学 入学'}],experience:[{date:'2019-04',end:'2024-03',name:'会社A'}],licenses:[{date:'2018-06',name:'資格A'}]});
 }});
 assert.equal(requests.length,2);assert.equal(requests[1].generationConfig.responseSchema,undefined);assert.equal(requests[1].generationConfig.thinkingConfig.thinkingBudget,0);assert.equal(requests[1].contents[0].parts[1].inlineData.data,'YWJj');assert.match(requests[1].contents[0].parts[0].text,/education/);assert.equal(result.mode,'gemini');assert.equal(result.data.phone,'090-1234-5678');assert.equal(result.data.experience.length,1);assert.equal(result.data.licenses.length,1);
});
test('400 invalid or blocked keys are actionable, never retried, and never expose raw provider data',async()=>{
 for(const [error,code] of [[{message:'API key not valid. sensitive-value',details:[{reason:'API_KEY_INVALID'}]},'INVALID_API_KEY'],[{message:'Your API key was reported as leaked. sensitive-value'},'KEY_BLOCKED']]){
  let calls=0;await assert.rejects(()=>geminiAssist({task:'extract',text:'private document'},{apiKey:'test-placeholder',fetchImpl:async()=>{calls++;return new Response(JSON.stringify({error}),{status:400});}}),e=>e.code===code&&!e.message.includes('sensitive-value')&&!e.message.includes('private document'));assert.equal(calls,1);
 }
});
test('a second 400 stops the import rather than returning a local success',async()=>{
 let calls=0;await assert.rejects(()=>geminiAssist({task:'extract',text:'fixture'},{apiKey:'test-placeholder',fetchImpl:async()=>{calls++;return new Response(JSON.stringify({error:{status:'INVALID_ARGUMENT',message:'invalid configuration private value'}}),{status:400});}}),e=>e.code==='REQUEST_REJECTED'&&!e.message.includes('private value'));assert.equal(calls,2);
});
test('truncated extraction retries completely with more output and preserves thinking controls in compatibility mode',async()=>{
 const calls=[];const result=await geminiAssist({task:'extract',text:'氏名：確認 太郎',textReady:true,pages:['data:image/png;base64,YWJj']},{apiKey:'test-placeholder',fetchImpl:async(url,options)=>{
  const request=JSON.parse(options.body);calls.push(request);
  if(calls.length===1)return new Response(JSON.stringify({error:{message:'unsupported schema'}}),{status:400});
  if(calls.length===2)return new Response(JSON.stringify({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{"name":"不完全'}]}}]}));
  return ok({name:'確認 太郎',phone:'090-1234-5678'});
 }});
 assert.equal(calls.length,3);assert.equal(calls[1].generationConfig.thinkingConfig.thinkingBudget,0);assert.equal(calls[2].generationConfig.maxOutputTokens,32768);assert.equal(calls[2].contents[0].parts.length,1);assert.equal(result.data.name,'確認 太郎');assert.equal(result.data.phone,'090-1234-5678');
});
