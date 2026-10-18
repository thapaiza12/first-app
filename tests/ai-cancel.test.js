import {test} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {spawn} from 'node:child_process';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';
test('cloud-only defaults fail promptly without credentials instead of starting Ollama',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'ma-cancel-'));let started,closed;const began=new Promise(r=>started=r),ended=new Promise(r=>closed=r);
 const model=http.createServer(async(req,res)=>{for await(const chunk of req){}res.setHeader('Content-Type','application/json');if(req.url==='/api/tags')return res.end(JSON.stringify({models:[{name:'gemma3:4b'}]}));if(req.url==='/api/show')return res.end(JSON.stringify({capabilities:['completion','vision']}));res.on('close',closed);started();});await new Promise(r=>model.listen(0,'127.0.0.1',r));
 const child=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:'3093',DATA_DIR:dir,GEMINI_API_KEY:'',GROQ_API_KEY:'',OLLAMA_BASE_URL:`http://127.0.0.1:${model.address().port}`},stdio:'pipe'});
 try{
  const base='http://127.0.0.1:3093/api';let ready=false;for(let i=0;i<60;i++){try{if((await fetch(base+'/status')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,50));}assert.ok(ready);
  const result=await fetch(base+'/assist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task:'extract',text:'氏名：テスト'})});assert.equal(result.status,502);const error=await result.json();assert.ok(error.code);
 }finally{const exit=new Promise(r=>child.once('exit',r));child.kill();await exit;model.closeAllConnections();await new Promise(r=>model.close(r));rmSync(dir,{recursive:true,force:true});}
});
