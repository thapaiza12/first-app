import {groqAssist} from './groq-assist.js';
import {geminiAssist} from './gemini-assist.js';
import {ollamaAssist,ollamaStatus} from './ollama-assist.js';
import {assist} from './local-assist.js';
const recoverable=new Set(['QUOTA_EXCEEDED','CONNECTION_FAILED','PROVIDER_ERROR','MODEL_UNAVAILABLE']);
export async function aiAssist(input,{mode='auto',ollamaModel='gemma3:4b',apiKey,geminiModel,ollamaBaseUrl,gemini=geminiAssist,ollama=ollamaAssist,local=assist,signal,groqKey,groqModel='llama-3.3-70b-versatile',groq=groqAssist}={}){
 if(mode==='groq')return groq(input,{apiKey:groqKey,model:groqModel,signal});
 if(mode==='gemini-groq'){
  const runGemini=()=>{if(!apiKey)throw Object.assign(Error('画像の読取にはGeminiキーを設定してください。'),{code:'MISSING_API_KEY'});return gemini(input,{apiKey,model:geminiModel||'gemini-2.5-flash',signal});};
  const runGroq=()=>groq(input,{apiKey:groqKey,model:groqModel,signal});
  const textCapable=!input.pages?.length||input.textReady===true;
  const writing=input.task==='write';
  if(writing){
   try{return await runGroq();}catch(e){
    if(!apiKey||!['GROQ_QUOTA_EXCEEDED','GROQ_CONNECTION_FAILED','GROQ_PROVIDER_ERROR','GROQ_MODEL_UNAVAILABLE'].includes(e.code))throw e;
    try{const result=await runGemini();return {...result,warnings:[e.message+' Geminiで最初から照合・作成しました。',...result.warnings]};}catch(other){throw Object.assign(Error(e.message+'\nGeminiも完了しませんでした：'+other.message),{code:other.code||'AI_FAILED'});}
   }
  }
  if(!apiKey&&textCapable)return runGroq();
  try{return await runGemini();}catch(e){
   if(!recoverable.has(e.code)||!groqKey)throw e;
   if(!textCapable)throw Object.assign(Error(e.message+'\nこの資料は画像の読取が必要です。選択したGroqモデルは画像を読めないため、切り替えて部分的に反映することはしません。'),{code:'VISION_UNAVAILABLE'});
   try{const result=await runGroq();return {...result,warnings:[e.message+' PDFの埋め込みテキストからGroqで読み取りました。',...result.warnings]};}catch(other){throw Object.assign(Error(e.message+'\nGroqも完了しませんでした：'+other.message),{code:other.code||'AI_FAILED'});}
  }
 }
 const runLocalModel=()=>ollama(input,{model:ollamaModel,baseUrl:ollamaBaseUrl,signal});
 if(mode==='local')return local(input);
 if(mode==='ollama')return runLocalModel(); // Never send local-only requests to the cloud.
 if(!apiKey){if(mode==='gemini')throw Object.assign(Error('Geminiキーを設定してください。'),{code:'MISSING_API_KEY'});const health=await ollamaStatus({model:ollamaModel,baseUrl:ollamaBaseUrl,signal});if(!health.available)return local(input);return runLocalModel();}
 try{return await gemini(input,{apiKey,model:geminiModel||'gemini-2.5-flash',signal});}catch(error){
  if(mode!=='auto'||!recoverable.has(error.code))throw error;
  try{const result=await runLocalModel();return {...result,warnings:[`${error.message} このMacのOllamaに切り替え、同じ資料を最初から処理しました。`,...result.warnings]};}catch(localError){throw Object.assign(Error(`${error.message}\nOllamaへの切替も完了しませんでした：${localError.message}`),{code:localError.code||'OLLAMA_FAILED'});}
 }
}
