import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
test('production starts and permits document access without a password or session',async()=>{const dir=mkdtempSync(path.join(tmpdir(),'ma-access-'));const proc=spawn(process.execPath,['server/index.js'],{env:{...process.env,GEMINI_API_KEY:'',NODE_ENV:'production',DATA_DIR:dir,PORT:'3097'},stdio:'pipe'});try{const base='http://127.0.0.1:3097/api';let ready=false;for(let i=0;i<50;i++){try{await fetch(base+'/status');ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}assert.ok(ready);let r=await fetch(base+'/status');const status=await r.json();assert.equal(status.loginRequired,false);assert.equal(status.assistMode,'local');r=await fetch(base+'/documents');assert.equal(r.status,200);assert.equal(r.headers.get('set-cookie'),null);}finally{proc.kill();rmSync(dir,{recursive:true,force:true});}});
