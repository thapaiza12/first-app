// Preserve existing single events; split only explicit events or a dated period.
export function educationEvents(rows=[]){
 return rows.flatMap(row=>{
  const name=(row.name||'').trim(),detail=(row.detail||'').trim();
  const event=/(入学|卒業|修了|中退|退学|在学中)\s*$/;
  const parts=[...name.split(/\r?\n/),...detail.split(/\r?\n/)].filter(Boolean);
  const explicit=parts.filter(p=>event.test(p));
  if(explicit.length){
   const unique=[...new Set(explicit)];
   const extra=parts.filter(p=>!event.test(p)&&!unique.some(e=>e.startsWith(p)));
   return unique.map((p,i)=>({...row,date:i?row.end||'':row.date||'',end:'',name:p,detail:i?'':extra.join('\n')}));
  }
  if(row.end)return [{...row,name:name+'　入学',end:'',detail:''},{...row,date:row.end,end:'',name:name+'　卒業',detail}];
  return [{...row,name,detail}];
 });
}
