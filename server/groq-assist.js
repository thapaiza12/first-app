import {geminiAssist} from './gemini-assist.js';
import {writingPolicy} from './grounded-writing.js';
import {getEncoding} from 'js-tiktoken';
let tokenizer;
export function groqRequestSize(messages,budget=8000){
 tokenizer??=getEncoding('o200k_base');
 const inputTokens=messages.reduce((n,m)=>n+tokenizer.encode(m.content).length+8,8);
 return {inputTokens,outputTokens:Math.min(4096,budget-inputTokens-128)};
}
export class GroqError extends Error{constructor(code,message,retryAfterSeconds){super(message);this.code=code;if(retryAfterSeconds!==undefined)this.retryAfterSeconds=retryAfterSeconds;}}
function standardSchema(value){if(Array.isArray(value))return value.map(standardSchema);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='type'&&typeof v==='string'?v.toLowerCase():standardSchema(v)]));}
export async function groqAssist(input,{apiKey,model='openai/gpt-oss-120b',fetchImpl=fetch,timeoutMs=180000,signal,requestTokenBudget=8000}={}){
 if(!apiKey)throw new GroqError('MISSING_GROQ_API_KEY','Groq APIキーを設定してください。');
 if(!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/.test(model))throw new GroqError('GROQ_MODEL_INVALID','Groqモデル名を確認してください。');
 if(input.pages?.length&&!input.textReady&&!input.ocrTextReady)throw new GroqError('GROQ_TEXT_ONLY','このGroqモデルは画像を読めません。スキャンPDF・写真はGeminiで読み取ってください。PDFに十分な埋め込みテキストがあればGroqを使用できます。');
 const combined=signal?AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs);
 let providerError,requests=0,inputTokens=0,outputTokens=0,limits={};
 const adapter=async(_url,options)=>{
  const original=JSON.parse(options.body);const prompt=original.contents[0].parts.map(p=>p.text||'').join('\n').replace(writingPolicy,'');
  const system=original.systemInstruction.parts.map(p=>p.text).join('\n')+'\n次のJSONスキーマに従うJSONオブジェクトだけを返してください。\n'+JSON.stringify(standardSchema(original.generationConfig.responseSchema));
  const messages=[{role:'system',content:system},{role:'user',content:prompt}];
  const size=groqRequestSize(messages,requestTokenBudget);
  if(size.outputTokens<512)throw new GroqError('GROQ_REQUEST_TOO_LARGE',`Groqへ送る文章が処理枠を超えています（推定入力${size.inputTokens}トークン）。原文は省略せず保持しています。`);
  let response;try{combined.throwIfAborted();requests++;response=await fetchImpl('https://api.groq.com/openai/v1/chat/completions',{method:'POST',redirect:'error',signal:combined,headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify({model,messages,temperature:0,response_format:{type:'json_object'},max_completion_tokens:size.outputTokens,...(model.startsWith('openai/gpt-oss-')?{reasoning_effort:'low'}:{}),stream:false})});}catch{throw new GroqError(signal?.aborted?'AI_CANCELLED':'GROQ_CONNECTION_FAILED',signal?.aborted?'処理をキャンセルしました。':'Groqに接続できないか、処理時間の上限に達しました。');}
  for(const [key,header] of Object.entries({requestLimit:'x-ratelimit-limit-requests',requestsRemaining:'x-ratelimit-remaining-requests',tokenLimit:'x-ratelimit-limit-tokens',tokensRemaining:'x-ratelimit-remaining-tokens'})){const value=response.headers.get(header);if(value!==null&&/^\d+$/.test(value))limits[key]=Number(value);}
  if(!response.ok){
   if(response.status===413)throw new GroqError('GROQ_REQUEST_TOO_LARGE',`Groqが文章量を受け付けませんでした（413）。推定入力${size.inputTokens}・出力上限${size.outputTokens}トークンです。ファイル容量ではなく、APIの文章量・利用枠の制限です。原文は省略していません。`);
   if(response.status===429){const header=response.headers.get('retry-after');const retry=header&&/^\d+(?:\.\d+)?$/.test(header)?Math.min(86400,Math.ceil(Number(header))):undefined;throw new GroqError('GROQ_QUOTA_EXCEEDED',`Groqの利用上限に達しました（429）。${retry!==undefined?`${retry}秒以上待ってから再試行してください。`:'Groqコンソールで利用枠を確認し、時間を置いて再試行してください。'}`,retry);}
   if([401,403].includes(response.status))throw new GroqError('GROQ_KEY_REJECTED','Groq APIキーまたはAPI利用権限を確認してください。');
   if(response.status===404)throw new GroqError('GROQ_MODEL_UNAVAILABLE','選択したGroqモデルが利用できません。Groqコンソールでモデルの利用可否を確認してください。');
   throw new GroqError(response.status>=500?'GROQ_PROVIDER_ERROR':'GROQ_REQUEST_REJECTED',`Groqがリクエストを受け付けませんでした（${response.status}）。モデルの入力・出力上限を確認してください。`);
  }
  let body;try{body=await response.json();}catch{throw new GroqError('GROQ_INVALID_RESPONSE','Groqの応答を安全に読み取れませんでした。');}
  const choice=body.choices?.[0];if(choice?.finish_reason==='length')throw new GroqError('GROQ_OUTPUT_LIMIT','Groqの応答が出力上限で中断されました。不完全な内容は反映していません。');if(choice?.finish_reason!=='stop'||typeof choice.message?.content!=='string')throw new GroqError('GROQ_INCOMPLETE','Groqの応答を安全に確認できませんでした。不完全な内容は反映していません。');
  if(Number.isSafeInteger(body.usage?.prompt_tokens))inputTokens+=body.usage.prompt_tokens;
  if(Number.isSafeInteger(body.usage?.completion_tokens))outputTokens+=body.usage.completion_tokens;
  return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:choice.message.content}]}}]}));
 };
 // The same source citations, every-sentence verification and bounded regeneration apply.
 const result=await geminiAssist({...input,pages:[]},{apiKey:'groq-adapter-no-gemini-key',model:'groq-adapter',signal:combined,timeoutMs,writingOptions:{verificationBatchSize:2},fetchImpl:async(...args)=>{try{const response=await adapter(...args);providerError=undefined;return response;}catch(e){providerError=e instanceof GroqError?e:new GroqError('GROQ_INVALID_RESPONSE','Groqの応答を安全に確認できませんでした。');throw providerError;}}}).catch(e=>{throw providerError||e;});
 return {...result,mode:'groq',warnings:[...(input.ocrTextReady?['画像のOCRテキストを使いました。Groqは画像自体を確認していません。原本と照合してください。']:[]),...result.warnings].map(w=>w.replaceAll('Gemini','Groq')),providerUsage:{requests,inputTokens,outputTokens,rateLimits:limits}};
}
