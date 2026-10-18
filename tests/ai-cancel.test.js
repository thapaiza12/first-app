import {test} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {spawn} from 'node:child_process';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';
test('disconnecting the browser aborts the real backend-to-model request',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'ma-cancel-'));let started,closed;const began=new Promise(r=>started=r),ended=new Promise(r=>closed=r);
 const model=http.createServer(async(req,res)=>{for await(const chunk of req){}res.setHeader('Content-Type','application/json');if(req.url==='/api/tags')return res.end(JSON.stringify({models:[{name:'gemma3:4b'}]}));if(req.url==='/api/show')return res.end(JSON.stringify({capabilities:['completion','vision']}));res.on('close',closed);started();});await new Promise(r=>model.listen(0,'127.0.0.1',r));
 const child=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:'3093',DATA_DIR:dir,GEMINI_API_KEY:'',OLLAMA_BASE_URL:`http://127.0.0.1:${model.address().port}`},stdio:'pipe'});
 try{
  const base='http://127.0.0.1:3093/api';let ready=false;for(let i=0;i<60;i++){try{if((await fetch(base+'/status')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,50));}assert.ok(ready);
  const controller=new AbortController();const pending=fetch(base+'/assist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task:'extract',text:'氏名：テスト'}),signal:controller.signal});const rejected=assert.rejects(pending,e=>e.name==='AbortError');await began;controller.abort();await rejected;let timer;try{await Promise.race([ended,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('model request did not cancel')),2000);})]);}finally{clearTimeout(timer);}
 }finally{const exit=new Promise(r=>child.once('exit',r));child.kill();await exit;model.closeAllConnections();await new Promise(r=>model.close(r));rmSync(dir,{recursive:true,force:true});}
});
