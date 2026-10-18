import {groqAssist} from './groq-assist.js';
import {geminiAssist} from './gemini-assist.js';
import {ollamaAssist,ollamaStatus} from './ollama-assist.js';
import {assist} from './local-assist.js';
const recoverable=new Set(['QUOTA_EXCEEDED','CONNECTION_FAILED','PROVIDER_ERROR','MODEL_UNAVAILABLE','INVALID_RESPONSE']);
export async function aiAssist(input,{mode='auto',ollamaModel='gemma3:4b',apiKey,geminiModel,ollamaBaseUrl,gemini=geminiAssist,ollama=ollamaAssist,local=assist,signal,groqKey,groqModel='openai/gpt-oss-120b',groq=groqAssist}={}){
 if(input.task==='transcribe'&&(input.textReady===true||input.ocrTextReady===true)&&input.text?.trim())return {data:{text:input.text},mode:input.ocrTextReady?'local-ocr':'native-text',warnings:[input.ocrTextReady?'画像全体をローカルOCRで読み込みました。誤字を原本と照合してください。':'資料全体のテキストを原文のまま読み込みました。AI転記・API呼出しは行っていません。']};
 if(mode==='groq')return groq(input,{apiKey:groqKey,model:groqModel,signal});
 if(mode==='gemini-groq'){
  const runGemini=()=>{if(!apiKey)throw Object.assign(Error('画像の読取にはGeminiキーを設定してください。'),{code:'MISSING_API_KEY'});return gemini(input,{apiKey,model:geminiModel||'gemini-2.5-flash',signal});};
  const runGroq=()=>groq(input,{apiKey:groqKey,model:groqModel,signal});
  const textCapable=!input.pages?.length||input.textReady===true||input.ocrTextReady===true;
  if(!apiKey&&textCapable)return runGroq();
  try{return await runGemini();}catch(e){
   if(signal?.aborted)throw e;
   if(!groqKey||(!recoverable.has(e.code)&&!['INVALID_API_KEY','KEY_BLOCKED','ACCESS_DENIED','REGION_UNAVAILABLE','REQUEST_REJECTED','DOCUMENT_REJECTED','OUTPUT_LIMIT','INVALID_EVIDENCE','INVALID_DRAFT','INVALID_VERIFICATION','EMPTY_DRAFT','NO_VERIFIABLE_FACTS','UNSUPPORTED_CLAIMS'].includes(e.code)))throw e;
   if(!textCapable)throw Object.assign(Error(e.message+'\nこの資料は画像の読取が必要です。選択したGroqモデルは画像を読めないため、切り替えて部分的に反映することはしません。'),{code:'VISION_UNAVAILABLE'});
   try{const result=await runGroq();return {...result,warnings:[e.message+(input.task==='write'?' Groqで原文から抽出・作成・事実確認を最初から実施しました。':' Groqで資料テキストを最初から読み取りました。'),...result.warnings]};}catch(other){throw Object.assign(Error(e.message+'\nGroqも完了しませんでした：'+other.message),{code:other.code||'AI_FAILED'});}
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
