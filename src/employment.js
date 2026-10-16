export function normalizeExperience(rows=[]){
 const result=[];
 for(const item of rows){const r={...item};const match=(r.name||'').match(/^(.*?)[\s　]*(入社|退社|退職)\s*$/);const base=match?match[1].trim():r.name||'';
  if(match&&['退社','退職'].includes(match[2])){const last=result.at(-1);if(last&&last.name===base&&!last.end){last.end=r.date||'';last.current=false;if(r.detail)last.detail=[last.detail,r.detail].filter(Boolean).join('\n');continue;}result.push({...r,name:base,date:'',end:r.date||'',current:false});}
  else result.push({...r,name:base});
 }return result;
}
export function employmentEvents(rows=[]){return normalizeExperience(rows).flatMap(r=>[{...r,name:r.name+'　入社',detail:'',end:'',current:false},{...r,date:r.current?'':r.end||'',name:r.current?'現在に至る':r.name+'　退社',detail:'',end:'',current:false}]);}
