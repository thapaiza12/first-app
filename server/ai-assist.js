import {geminiAssist} from './gemini-assist.js';
import {ollamaAssist,ollamaStatus} from './ollama-assist.js';
import {assist} from './local-assist.js';
const recoverable=new Set(['QUOTA_EXCEEDED','CONNECTION_FAILED','PROVIDER_ERROR','MODEL_UNAVAILABLE']);
export async function aiAssist(input,{mode='auto',ollamaModel='gemma3:4b',apiKey,geminiModel,ollamaBaseUrl,gemini=geminiAssist,ollama=ollamaAssist,local=assist}={}){
 const runLocalModel=()=>ollama(input,{model:ollamaModel,baseUrl:ollamaBaseUrl});
 if(mode==='local')return local(input);
 if(mode==='ollama')return runLocalModel(); // Never send local-only requests to the cloud.
 if(!apiKey){if(mode==='gemini')throw Object.assign(Error('Geminiキーを設定してください。'),{code:'MISSING_API_KEY'});const health=await ollamaStatus({model:ollamaModel,baseUrl:ollamaBaseUrl});if(!health.available)return local(input);return runLocalModel();}
 try{return await gemini(input,{apiKey,model:geminiModel||'gemini-2.5-flash'});}catch(error){
  if(mode!=='auto'||!recoverable.has(error.code))throw error;
  try{const result=await runLocalModel();return {...result,warnings:[`${error.message} このMacのOllamaに切り替え、同じ資料を最初から処理しました。`,...result.warnings]};}catch(localError){throw Object.assign(Error(`${error.message}\nOllamaへの切替も完了しませんでした：${localError.message}`),{code:localError.code||'OLLAMA_FAILED'});}
 }
}
