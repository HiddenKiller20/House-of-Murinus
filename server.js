import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import api from './api.js';
const root=dirname(fileURLToPath(import.meta.url));
export function createApp({dataDir=process.env.DATA_DIR||resolve(root,'data'),password=process.env.STAFF_PASSWORD,origin=process.env.APP_ORIGIN,production=process.env.NODE_ENV==='production'}={}){
 if(!password||password.length<16)throw Error('Set STAFF_PASSWORD to a unique password of at least 16 characters.');
 mkdirSync(dataDir,{recursive:true});const db=new DatabaseSync(resolve(dataDir,'murinus.sqlite'));db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires INTEGER NOT NULL)');
 const salt=randomBytes(16),passwordHash=scryptSync(password,salt,64),digest=v=>createHash('sha256').update(v).digest('hex');
 db.exec('CREATE TABLE IF NOT EXISTS auth_config (id INTEGER PRIMARY KEY, salt TEXT NOT NULL, fingerprint TEXT NOT NULL)');
 const prior=db.prepare('SELECT * FROM auth_config WHERE id=1').get();const versionSalt=prior?.salt||randomBytes(32).toString('hex');const fingerprint=scryptSync(password,versionSalt,64).toString('hex');if(prior&&prior.fingerprint!==fingerprint)db.exec('DELETE FROM sessions');db.prepare('INSERT OR REPLACE INTO auth_config VALUES (1,?,?)').run(versionSalt,fingerprint);
 const attempts=new Map(),reports=new Map();
 const limited=(map,id,max,window)=>{const now=Date.now();let r=map.get(id);if(!r||r.until<now){r={count:0,until:now+window};map.set(id,r)}if(map.size>10000)for(const [k,v] of map)if(v.until<now)map.delete(k);return ++r.count>max};
 const assets=new Map();for(const [file,type] of [['index.html','text/html; charset=utf-8'],['style.css','text/css; charset=utf-8'],['app.js','text/javascript; charset=utf-8']])assets.set('/'+file,{body:readFileSync(resolve(root,'public',file)),type});assets.set('/spider.png',{body:Buffer.from(readFileSync(resolve(root,'public/spider.base64'),'utf8'),'base64'),type:'image/png'});
 const isStaff=async req=>{const token=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('hm_session='))?.slice(11);if(!token||!/^[a-f0-9]{64}$/.test(token))return false;return !!db.prepare('SELECT 1 FROM sessions WHERE token_hash=? AND expires>?').get(digest(token),Date.now())};
 const env={isStaff,DB:{prepare(sql){let args=[];return {bind(...values){args=values;return this},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}},async all(){return {results:db.prepare(sql).all(...args)}}}}},ASSETS:{async fetch(req){const p=new URL(req.url).pathname,a=assets.get(p==='/'?'/index.html':p);return a?new Response(a.body,{headers:{'Content-Type':a.type}}):new Response('Not found',{status:404})}}};
 const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
 const server=createServer(async (incoming,out)=>{try{
  const base=origin||(process.env.RAILWAY_PUBLIC_DOMAIN?'https://'+process.env.RAILWAY_PUBLIC_DOMAIN:(production?'https://':'http://')+incoming.headers.host);
  const url=new URL(incoming.url,base),ip=incoming.socket.remoteAddress||'unknown';
  let body;let size=0;const chunks=[];for await(const chunk of incoming){size+=chunk.length;if(size>25000){out.writeHead(413,{'Content-Type':'application/json'});out.end(JSON.stringify({error:'Submission exceeds 25 KB.'}));return}chunks.push(chunk)}if(chunks.length)body=Buffer.concat(chunks);
  const headers=new Headers();for(const [k,v] of Object.entries(incoming.headers))if(v&&!['host','connection','content-length','authorization'].includes(k)&&!k.startsWith('oai-'))headers.set(k,Array.isArray(v)?v.join(','):v);
  const req=new Request(url,{method:incoming.method,headers,...(body?{body}: {})});let result;
  if(url.pathname==='/health')result=json({ok:true});
  else if(incoming.method==='POST'&&headers.get('origin')!==url.origin)result=json({error:'Invalid request origin.'},403);
  else if(url.pathname==='/api/login'&&incoming.method==='POST'){
   if(limited(attempts,ip,10,15*60*1000))result=json({error:'Too many sign-in attempts. Try again in 15 minutes.'},429);
   else {const input=await req.json();if(typeof input.password!=='string'||input.password.length>1024||!timingSafeEqual(scryptSync(input.password,salt,64),passwordHash))result=json({error:'Incorrect staff password.'},401);
   else{const token=randomBytes(32).toString('hex');db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('INSERT INTO sessions VALUES (?,?)').run(digest(token),Date.now()+8*60*60*1000);result=json({staff:true},200,{'Set-Cookie':`hm_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${production?'; Secure':''}`});}}
  }else if(url.pathname==='/api/logout'&&incoming.method==='POST'){
   const token=(headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('hm_session='))?.slice(11);if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));result=json({ok:true},200,{'Set-Cookie':`hm_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${production?'; Secure':''}`});
  }else if(url.pathname==='/api/cases'&&incoming.method==='POST'&&limited(reports,ip,30,60*60*1000))result=json({error:'Report limit reached. Please try again later.'},429);
  else result=await api.fetch(req,env);
  out.writeHead(result.status,{...Object.fromEntries(result.headers),'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY','Cache-Control':'no-store'});out.end(Buffer.from(await result.arrayBuffer()));
 }catch(e){out.writeHead(e instanceof SyntaxError?400:500,{'Content-Type':'application/json'});out.end(JSON.stringify({error:e instanceof SyntaxError?'Invalid request data.':'The request could not be completed.'}));}});
 server.on('close',()=>db.close());return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const server=createApp();server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('House of Murinus is listening.'));}
