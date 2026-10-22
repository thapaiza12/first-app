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
  if(row.end||row.completion){
   const events=[];if(row.date)events.push({...row,name:name+'　入学',end:'',completion:undefined,detail:row.end?'':detail});
   if(row.end)events.push({...row,date:row.end,end:'',completion:undefined,name:name+'　'+(row.completion||'卒業'),detail});
   return events.length?events:[{...row,name,detail,completion:undefined}];
  }
  return [{...row,name,detail}];
 });
}

// One editable card per school, retaining the original event dates.
export function educationSchools(rows=[]){
 const schools=[];
 for(const event of educationEvents(rows)){
  const match=(event.name||'').match(/^(.*?)[\s　]*(入学|卒業|修了|中退|退学|在学中)\s*$/);
  const name=(match?match[1]:event.name||'').trim(),kind=match?.[2];
  const detail=event.detail||'';
  const previous=schools.at(-1);
  const compatible=previous&&previous.name===name&&!previous.end&&(!detail||!previous.detail||previous.detail===detail);
  if(kind&&kind!=='入学'){
   if(compatible){previous.end=event.date||'';previous.completion=kind;if(detail&&!previous.detail)previous.detail=detail;}
   else schools.push({...event,name,date:'',end:event.date||'',completion:kind});
  }else if(!kind&&compatible&&previous.date&&event.date&&event.date>previous.date){
   previous.end=event.date;previous.completion='卒業';if(detail&&!previous.detail)previous.detail=detail;
  }else schools.push({...event,name,date:event.date||'',end:'',completion:'卒業'});
 }
 return schools;
}
