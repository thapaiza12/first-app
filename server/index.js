import express from 'express';
import multer from 'multer';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {assist} from './local-assist.js';
import {geminiAssist} from './gemini-assist.js';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dataDir=process.env.DATA_DIR||path.join(root,'.data');fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
const production=process.env.NODE_ENV==='production';
const db=new DatabaseSync(path.join(dataDir,'workspace.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,payload TEXT NOT NULL,updated TEXT NOT NULL); CREATE TABLE IF NOT EXISTS history(id TEXT PRIMARY KEY,document_id TEXT,payload TEXT NOT NULL,format TEXT NOT NULL,file TEXT NOT NULL,created TEXT NOT NULL);`);
const app=express();app.disable('x-powered-by');app.use(express.json({limit:'16mb'}));
app.use((req,res,next)=>{res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');if(req.path.startsWith('/api'))res.set('Cache-Control','no-store');next();});
// Same-origin writes only. Do not trust forwarded host headers for the origin check.
app.use('/api',(req,res,next)=>{const origin=req.get('origin');if(!['GET','HEAD','OPTIONS'].includes(req.method)&&origin){try{if(new URL(origin).host!==req.get('host'))return res.status(403).json({error:'別サイトからの操作は許可されていません。'});}catch{return res.sendStatus(403);}}next();});
app.get('/api/font',(req,res)=>{res.set('Cache-Control','public,max-age=86400');res.sendFile(path.join(root,'server/fonts/NotoSerifJP.ttf'));});
app.get('/api/status',(req,res)=>res.json({assistMode:process.env.GEMINI_API_KEY?'gemini':'local',geminiConfigured:!!process.env.GEMINI_API_KEY,desktopInstance:process.env.MA_DESKTOP_INSTANCE||null,desktopMode:!!process.env.MA_DESKTOP_INSTANCE,loginRequired:false,mode:production?'production':'development'}));
// Desktop controls are available only to the loopback-bound Mac background process.
app.post('/api/desktop/settings',(req,res)=>{
 if(!process.env.MA_DESKTOP_INSTANCE||process.env.NODE_ENV==='production')return res.sendStatus(404);
 const child=spawn(process.env.PYTHON||'python3',[path.join(root,'desktop/mac_app.py'),'--settings'],{env:process.env,detached:true,stdio:'ignore'});
 child.on('error',()=>{});child.unref();res.json({ok:true});
});
app.post('/api/desktop/stop',(req,res)=>{
 if(!process.env.MA_DESKTOP_INSTANCE||process.env.NODE_ENV==='production')return res.sendStatus(404);
 res.json({ok:true});setTimeout(()=>process.exit(0),200);
});
const str=z.string().max(25000);const row=z.object({date:str.optional().default(''),end:str.optional().default(''),name:str.optional().default(''),detail:str.optional().default(''),business:str.optional().default(''),employmentType:str.optional().default(''),position:str.optional().default(''),current:z.boolean().optional().default(false)});
const fields=['documentDate','alternateAddress','alternateAddressKana','alternatePostalCode','alternatePhone','title','name','furigana','birthDate','gender','postalCode','address','addressKana','phone','email','motivation','strengths','preferences','summary','skills','techSkills','additional','jobNotes','careerNotes','jobText','careerText','sourceText'];
const shape=Object.fromEntries(fields.map(k=>[k,(k.endsWith('Text')?z.string().max(100000):str).optional().default('')]));
const docSchema=z.object({...shape,type:z.enum(['rirekisho','shokumukeirekisho']),photo:z.string().max(8000000).refine(v=>!v||/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v)).optional().default(''),education:z.array(row).max(100).default([]),experience:z.array(row).max(100).default([]),licenses:z.array(row).max(100).default([]),uploads:z.array(z.object({name:z.string().max(300),role:z.enum(['source','job','career'])})).max(100).default([]),confirmed:z.boolean().default(false)});
const parseDoc=(v)=>docSchema.parse(v);
app.get('/api/documents',(req,res)=>res.json(db.prepare('SELECT id,payload,updated FROM documents ORDER BY updated DESC').all().map(r=>({id:r.id,updated:r.updated,...JSON.parse(r.payload)}))));
app.post('/api/documents',(req,res)=>{const d=parseDoc(req.body);const id=randomUUID();db.prepare('INSERT INTO documents VALUES(?,?,?)').run(id,JSON.stringify(d),new Date().toISOString());res.json({id,...d});});
app.put('/api/documents/:id',(req,res)=>{const d=parseDoc(req.body);const r=db.prepare('UPDATE documents SET payload=?,updated=? WHERE id=?').run(JSON.stringify(d),new Date().toISOString(),req.params.id);if(!r.changes)return res.sendStatus(404);res.json({ok:true});});
app.delete('/api/documents/:id',(req,res)=>{db.prepare('DELETE FROM documents WHERE id=?').run(req.params.id);res.json({ok:true});});
function python(args,input){return new Promise((resolve,reject)=>{const p=spawn(process.env.PYTHON||'python3',[path.join(root,'server/documents.py'),...args],{stdio:['pipe','pipe','pipe']});let out='',err='';let exceeded=false;const timer=setTimeout(()=>{p.kill('SIGKILL');reject(Error('処理がタイムアウトしました。ファイルを小さくしてお試しください。'));},120000);p.stdout.on('data',b=>{out+=b;if(out.length>40000000){exceeded=true;p.kill();}});p.stderr.on('data',b=>{if(err.length<2000)err+=b;});p.on('error',e=>{clearTimeout(timer);reject(e);});p.on('close',code=>{clearTimeout(timer);try{if(exceeded)throw Error('ファイルの画像サイズが大きすぎます。');const data=JSON.parse(out);if(code||data.error)throw Error(data.error||'書類処理に失敗しました。');resolve(data);}catch(e){reject(e.message.startsWith('Unexpected')?Error('書類を処理できませんでした。形式を確認してください。'):e);}});p.stdin.on('error',()=>{});p.stdin.end(input?JSON.stringify(input):'');});}
const upload=multer({dest:dataDir,limits:{fileSize:25*1024*1024,files:1}});
app.post('/api/extract',upload.single('file'),async(req,res,next)=>{if(!req.file)return res.status(400).json({error:'ファイルを選択してください。'});try{const result=await python(['extract',req.file.path,req.file.originalname]);res.json(result);}catch(e){next(e);}finally{fs.rmSync(req.file.path,{force:true});}});
app.post('/api/assist',async(req,res,next)=>{try{
 const input=z.object({task:z.enum(['extract','write','transcribe']),text:z.string().max(100000).optional().default(''),pages:z.array(z.string().max(12000000).regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/)).max(8).optional().default([]),document:docSchema.optional()}).parse(req.body);
 if(input.task==='write'&&!input.document)return res.status(400).json({error:'応募者情報を入力してください。'});
 if(input.task==='write'&&!input.document.jobText.trim()&&!input.document.jobNotes.trim())return res.status(400).json({error:'求人票または求人についてのメモを追加してください。'});
 if(process.env.GEMINI_API_KEY){try{return res.json(await geminiAssist(input,{apiKey:process.env.GEMINI_API_KEY,model:process.env.GEMINI_MODEL||'gemini-2.5-flash'}));}catch(error){const fallback=assist(input);return res.json({...fallback,warnings:[error.message,'今回はローカル処理に切り替えました。生成AIではなく、読取ルール・定型文による結果です。',...fallback.warnings]});}}
 res.json(assist(input));
}catch(e){next(e);}});
app.post('/api/export',async(req,res,next)=>{try{const {id,format,document}=z.object({id:z.string().uuid(),format:z.enum(['pdf','docx']),document:docSchema}).parse(req.body);if(!document.confirmed)return res.status(400).json({error:'内容を確認してチェックを入れてください。'});if(!document.name.trim())return res.status(400).json({error:'氏名を入力してください。'});const historyId=randomUUID();const file=path.join(dataDir,`${historyId}.${format}`);await python(['export',format,file],document);db.prepare('INSERT INTO history VALUES(?,?,?,?,?,?)').run(historyId,id,JSON.stringify(document),format,file,new Date().toISOString());res.json({id:historyId,url:`/api/history/${historyId}/download`});}catch(e){next(e);}});
app.get('/api/history',(req,res)=>res.json(db.prepare('SELECT id,document_id,payload,format,created FROM history ORDER BY created DESC').all().map(r=>({...r,document:JSON.parse(r.payload),payload:undefined}))));
app.get('/api/history/:id/download',(req,res)=>{const r=db.prepare('SELECT * FROM history WHERE id=?').get(req.params.id);if(!r||!fs.existsSync(r.file))return res.sendStatus(404);const d=JSON.parse(r.payload);res.download(r.file,`${d.name||'応募書類'}_${d.type==='rirekisho'?'履歴書':'職務経歴書'}.${r.format}`);});
app.delete('/api/history/:id',(req,res)=>{const r=db.prepare('SELECT file FROM history WHERE id=?').get(req.params.id);if(r){db.prepare('DELETE FROM history WHERE id=?').run(req.params.id);fs.rmSync(r.file,{force:true});}res.json({ok:true});});

if(fs.existsSync(path.join(root,'dist'))){app.use(express.static(path.join(root,'dist')));app.get('/{*path}',(req,res)=>res.sendFile(path.join(root,'dist/index.html')));}
app.use((err,req,res,next)=>{if(err instanceof z.ZodError)return res.status(400).json({error:'入力形式または文字数を確認してください。'});if(err instanceof multer.MulterError)return res.status(400).json({error:'ファイルは25MB以下にしてください。'});res.status(400).json({error:err.message||'処理に失敗しました。'});});
app.listen(Number(process.env.PORT)||3001,production?'0.0.0.0':'127.0.0.1',(error)=>{if(error){console.error(`Unable to start workspace: ${error.code}`);process.exitCode=1;return;}console.log(`M&A workspace running on port ${process.env.PORT||3001} (${production?'production':'local development'}). Assistance: ${process.env.GEMINI_API_KEY?'Gemini configured':'local fallback'}`);});
