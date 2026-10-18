import {geminiAssist} from './gemini-assist.js';
export class OllamaError extends Error{constructor(code,message){super(message);this.code=code;}}
export function ollamaAddress(value='http://127.0.0.1:11434'){
 const url=new URL(value);
 if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new OllamaError('OLLAMA_ADDRESS','Ollamaはこのコンピューターのlocalhostで実行してください。');
 return url.origin;
}
export async function ollamaStatus({baseUrl,fetchImpl=fetch,model='gemma3:4b'}={}){
 const address=ollamaAddress(baseUrl);
 try{const response=await fetchImpl(address+'/api/tags',{signal:AbortSignal.timeout(1200),redirect:'error'});if(!response.ok)throw Error();const body=await response.json();const models=(body.models||[]).map(m=>m.name).filter(n=>typeof n==='string');return {available:true,ready:models.includes(model)||models.includes(model+':latest'),models,model};}catch{return {available:false,ready:false,models:[],model};}
}
function jsonSchema(value){if(Array.isArray(value))return value.map(jsonSchema);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='type'&&typeof v==='string'?v.toLowerCase():jsonSchema(v)]));}
export async function ollamaAssist(input,{model='gemma3:4b',baseUrl,fetchImpl=fetch,timeoutMs=300000}={}){
 const address=ollamaAddress(baseUrl);let checkedModel=false;
 const adapter=async(_url,options)=>{
  const request=JSON.parse(options.body),parts=request.contents[0].parts;
  const images=parts.filter(p=>p.inlineData).map(p=>p.inlineData.data);
  const system=request.systemInstruction.parts.map(p=>p.text).join('\n');const content=parts.map(p=>p.text||'').join('\n');
  if(system.length+content.length>16000)throw new OllamaError('OLLAMA_CONTEXT','Ollama用の資料が長すぎます。内容は省略していません。資料を分割するかGeminiを選択してください。');
  if(!checkedModel){
   let show;try{show=await fetchImpl(address+'/api/show',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({model}),signal:AbortSignal.timeout(5000)});}catch{throw new OllamaError('OLLAMA_UNAVAILABLE','Ollamaを起動してください。');}
   if(show.status===404)throw new OllamaError('OLLAMA_MODEL_MISSING',`Ollamaで ${model} をインストールしてください。`);
   if(!show.ok)throw new OllamaError('OLLAMA_MODEL_ERROR','Ollamaモデルを確認できませんでした。');
   const info=await show.json();if(info.remote_host||info.remote_model||model.endsWith(':cloud'))throw new OllamaError('OLLAMA_CLOUD_MODEL','Ollamaのみではクラウドモデルを使用できません。gemma3:4bなどのローカルモデルを選択してください。');if(images.length&&!info.capabilities?.includes('vision'))throw new OllamaError('OLLAMA_VISION_REQUIRED','画像・PDFの読取には画像対応モデルが必要です。Ollamaで gemma3:4b を選択してください。');checkedModel=true;
  }
  let response;try{response=await fetchImpl(address+'/api/chat',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(timeoutMs),body:JSON.stringify({model,stream:false,format:jsonSchema(request.generationConfig.responseSchema),messages:[{role:'system',content:system},{role:'user',content,...(images.length?{images}:{})}],options:{temperature:0,num_ctx:32768,num_predict:8192}})});}catch{throw new OllamaError('OLLAMA_UNAVAILABLE','Ollamaが起動していないか、処理がタイムアウトしました。Ollamaを開いて再試行してください。');}
  if(response.status===404)throw new OllamaError('OLLAMA_MODEL_MISSING',`Ollamaで ${model} をインストールしてください。`);
  if(!response.ok)throw new OllamaError('OLLAMA_FAILED','Ollamaが処理を完了できませんでした。モデルとMacの空きメモリを確認してください。');
  const body=await response.json();if(body.prompt_eval_count>=24576)throw new OllamaError('OLLAMA_CONTEXT','Ollamaの入力がコンテキスト上限に近いため、結果を反映していません。資料を分割するかGeminiを選択してください。');if(body.done_reason==='length'||body.done!==true||typeof body.message?.content!=='string')throw new OllamaError('OLLAMA_INCOMPLETE','Ollamaの結果が不完全です。未確認の内容は反映していません。');
  return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:body.message.content}]}}]}));
 };
 // Reuse extraction validation AND the full cited-fact generation/verification workflow.
 // Preserve local errors; the Gemini transport deliberately sanitizes arbitrary fetch errors.
 let localError;const result=await geminiAssist(input,{apiKey:'local-adapter-no-credential',model:'ollama-local',timeoutMs,fetchImpl:async(...args)=>{try{return await adapter(...args);}catch(e){localError=e instanceof OllamaError?e:new OllamaError('OLLAMA_INVALID_RESPONSE','Ollamaの応答を確認できませんでした。未確認の内容は反映していません。');throw localError;}}}).catch(e=>{throw localError||e;});
 return {...result,mode:'ollama',warnings:result.warnings.map(w=>w.replaceAll('Gemini','Ollama'))};
}
