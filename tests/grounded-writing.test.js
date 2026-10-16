import {test} from 'node:test';import assert from 'node:assert/strict';
import {groundedWrite,writingSources} from '../server/grounded-writing.js';
import {geminiAssist} from '../server/gemini-assist.js';
const resume='ソフトウェアエンジニア。Pythonで社内ツールを開発。法人営業は未経験。';
const job='法人営業担当を募集。顧客提案と売上目標の達成経験を重視。';
const fact={id:'F1',claim:'Pythonで社内ツールを開発',sourceId:'career',quote:'Pythonで社内ツールを開発'};
const plan={facts:[fact],matches:[],gaps:['法人営業の実務経験は資料で確認できません。']};
const honest={motivation:[{text:'Pythonで社内ツールを開発してきました。',factIds:['F1']},{text:'今後は応募業務の知識を学び、貢献したいと考えています。',factIds:[]}],strengths:[],additional:[],summary:[{text:'Pythonで社内ツールを開発してきました。',factIds:['F1']}]};
const bad={motivation:[{text:'法人営業として売上目標を達成してきました。',factIds:['F1']}],strengths:[],additional:[],summary:[]};
const check=(sentenceId,verdict='supported',extra={})=>({sentenceId,verdict,classification:'factual',sourceQuotes:[{sourceId:'career',quote:fact.quote}],reason:verdict==='supported'?'原文に記載':'営業経験は求人条件にしかありません。',...extra});
const verified={checks:[check('motivation:0'),check('motivation:1','supported',{classification:'aspirational',sourceQuotes:[]}),check('summary:0')]};
const doc={careerText:resume,jobText:job};
const sequence=(responses,requests=[])=>async(prompt,schema)=>{requests.push({prompt,schema});assert.ok(responses.length,'unexpected extra model call');return structuredClone(responses.shift());};
test('engineer-to-sales bridging uses only actual experience, checks every sentence, and reports the gap',async()=>{
 const requests=[];const r=await groundedWrite(doc,{generate:sequence([plan,honest,verified],requests)});
 assert.equal(requests.length,3);assert.equal(r.grounding.verified,true);assert.match(r.data.motivation,/Python/);assert.doesNotMatch(r.data.motivation,/法人営業として|売上目標を達成/);assert.match(r.warnings.join(' '),/実務経験/);assert.match(requests[2].prompt,/法人営業は未経験/);assert.match(requests[2].prompt,/全sentenceId/);
});
test('unsupported experience is discarded, regenerated, and re-verified before any output is returned',async()=>{
 const requests=[];const r=await groundedWrite(doc,{generate:sequence([plan,bad,{checks:[check('motivation:0','unsupported')]},honest,verified],requests)});
 assert.equal(requests.length,5);assert.equal(r.grounding.attempts,2);assert.doesNotMatch(JSON.stringify(r.data),/売上目標を達成/);assert.match(requests[3].prompt,/営業経験は求人条件/);
});
test('persistent fabrication returns no draft, even if the role changes to a different industry',async()=>{
 for(const title of ['法人営業','経営コンサルタント','看護師','管理職']){
  const draft={...bad,motivation:[{text:`${title}として豊富な経験があります。`,factIds:['F1']}]};
  await assert.rejects(()=>groundedWrite(doc,{generate:sequence([plan,draft,{checks:[check('motivation:0','unsupported')]},draft,{checks:[check('motivation:0','unsupported')]}])}),e=>e.code==='UNSUPPORTED_CLAIMS'&&!e.data);
 }
});
test('literal citations must come from applicant sources, not job requirements or invented quotes',async()=>{
 for(const invalidFact of [{...fact,sourceId:'job',quote:job},{...fact,quote:'法人営業で売上を達成'}])await assert.rejects(()=>groundedWrite(doc,{generate:sequence([{...plan,facts:[invalidFact]}])}),e=>e.code==='NO_VERIFIABLE_FACTS');
});
test('verifier approval cannot bypass missing, duplicate, uncertain, or uncited sentence checks',async()=>{
 for(const checks of [[],[check('motivation:0'),check('motivation:0')],[check('motivation:0','uncertain')],[check('motivation:0','supported',{sourceQuotes:[{sourceId:'job',quote:job}]})],[check('motivation:0','supported',{sourceQuotes:[]})]]){
  await assert.rejects(()=>groundedWrite(doc,{generate:sequence([plan,bad,{checks},bad,{checks}])}),e=>e.code==='UNSUPPORTED_CLAIMS');
 }
});
test('unknown fact IDs and factual sentences with no references are blocked despite verifier approval',async()=>{
 for(const factIds of [[],['unknown']]){
  const draft={...bad,motivation:[{...bad.motivation[0],factIds}]};
  await assert.rejects(()=>groundedWrite(doc,{generate:sequence([plan,draft,{checks:[check('motivation:0')]},draft,{checks:[check('motivation:0')]}])}),e=>e.code==='UNSUPPORTED_CLAIMS');
 }
});
test('previous AI text and job requirements never become applicant evidence; notes cannot supply fabricated careers',async()=>{
 const d={...doc,summary:'過去の生成文：営業部長',strengths:'以前のAI文：売上倍増',additional:'以前のAI文：コンサルタント',motivation:'以前のAI文：管理職',careerNotes:'未確認メモ：営業十年',experience:[{name:'誤った構造化データ'}]};
 const sources=writingSources(d);assert.deepEqual(sources.sources,[{id:'career',text:resume}]);
 const requests=[];const r=await groundedWrite(d,{generate:sequence([plan,honest,verified],requests)});
 for(const {prompt} of requests)for(const excluded of ['営業部長','売上倍増','未確認メモ','誤った構造化データ'])assert.ok(!prompt.includes(excluded));assert.match(r.warnings.join(' '),/補足メモ/);
 let called=false;await assert.rejects(()=>groundedWrite({jobText:job,summary:'営業経験あり',careerNotes:'営業経験あり'},{generate:async()=>{called=true;}}),e=>e.code==='MISSING_APPLICANT_EVIDENCE');assert.equal(called,false);
});
test('each applicant and each job uses fresh request-local sources',()=>{
 const a=writingSources({careerText:'候補者A：プログラマー',jobText:'求人A：営業'});
 const b=writingSources({careerText:'候補者B：看護師',jobText:'求人B：事務'});
 const c=writingSources({careerText:'候補者A：プログラマー',jobText:'求人C：開発'});
 assert.ok(!JSON.stringify(b).includes('候補者A'));assert.ok(!JSON.stringify(b).includes('求人A'));assert.deepEqual(a.sources,c.sources);assert.notEqual(a.job,c.job);
});
test('manual records are an explicit fallback; uploaded original text takes precedence over generated summaries',()=>{
 const r=writingSources({experience:[{name:'エンジニア',detail:'Python開発'}],summary:'営業を捏造'});assert.equal(r.manualOnly,true);assert.match(r.sources[0].text,/Python/);assert.ok(!r.sources[0].text.includes('営業を捏造'));
});
test('Gemini transport runs all three stages without sending structured contact fields or old AI drafts',async()=>{
 const responses=[plan,honest,verified],requests=[];
 const result=await geminiAssist({task:'write',document:{...doc,name:'private name',phone:'private phone',email:'private email',photo:'private photo',summary:'previous generated lie'}},{apiKey:'test-placeholder',fetchImpl:async(url,options)=>{const request=JSON.parse(options.body);requests.push(request);return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(responses.shift())}]}}]}));}});
 assert.equal(requests.length,3);assert.equal(result.grounding.verified,true);assert.equal(requests[2].generationConfig.thinkingConfig.thinkingBudget,2048);for(const request of requests){assert.match(request.systemInstruction.parts[0].text,/ゼロ捏造方針/);const payload=JSON.stringify(request);assert.ok(!payload.includes('private'));assert.ok(!payload.includes('previous generated lie'));}
});
test('unproven outcomes, inflated abilities and numbers are blocked even when the verifier approves them',async()=>{
 for(const text of ['品質向上に貢献しました。','高い分析力があります。','開発効率を50%改善しました。']){
  const draft={...bad,motivation:[{text,factIds:['F1']}]};await assert.rejects(()=>groundedWrite(doc,{generate:sequence([plan,draft,{checks:[check('motivation:0')]},draft,{checks:[check('motivation:0')]}])}),e=>e.code==='UNSUPPORTED_CLAIMS');
 }
});
test('quota failure during corrective regeneration never releases the rejected draft',async()=>{
 let calls=0;const outputs=[plan,bad,{checks:[check('motivation:0','unsupported')]}];await assert.rejects(()=>groundedWrite(doc,{generate:async()=>{calls++;if(calls===4){const e=Error('quota');e.code='QUOTA_EXCEEDED';throw e;}return outputs.shift();}}),e=>e.code==='QUOTA_EXCEEDED'&&!e.data);assert.equal(calls,4);
});
