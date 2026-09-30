const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const schema=`CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY, created TEXT NOT NULL, subject TEXT NOT NULL, profile TEXT NOT NULL, reporter TEXT NOT NULL, contact TEXT NOT NULL, offense TEXT NOT NULL, incident TEXT NOT NULL, summary TEXT NOT NULL, evidence TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', decision TEXT NOT NULL DEFAULT '', public_summary TEXT NOT NULL DEFAULT '', scope TEXT NOT NULL DEFAULT '', reviewed TEXT);`;
export default {async fetch(req,env){try{
 const url=new URL(req.url),p=url.pathname;
 if(!p.startsWith('/api/'))return env.ASSETS.fetch(req);
 if(!env.DB)return json({error:'Case storage is not configured. Please contact the site owner.'},503);
 await env.DB.prepare(schema).run();
 const staff=await env.isStaff(req);
 if(p==='/api/session')return json({staff});
 if(p==='/api/cases'&&req.method==='GET'){
  const status=url.searchParams.get('status');
  if(status==='staff'){if(!staff)return json({error:'Staff sign-in required.'},401);return json({cases:(await env.DB.prepare('SELECT * FROM cases ORDER BY created DESC LIMIT 500').all()).results});}
  const s=status==='info'?'info':'active';
  return json({cases:(await env.DB.prepare('SELECT id, created, subject, profile, offense, status, public_summary, scope, reviewed FROM cases WHERE status=? ORDER BY reviewed DESC LIMIT 500').bind(s).all()).results});
 }
 if(req.method==='POST'&&req.headers.get('Origin')!==url.origin)return json({error:'Invalid request origin.'},403);
 if(p==='/api/cases'&&req.method==='POST'){
  if(Number(req.headers.get('Content-Length'))>25000)return json({error:'Submission is too large.'},413);
  const b=await req.json();if(b.website)return json({error:'Submission rejected.'},400);
  const required=['subject','profile','reporter','contact','offense','incident','summary','evidence'];
  for(const k of required)if(typeof b[k]!=='string'||!b[k].trim()||b[k].length>10000)return json({error:`Please provide a valid ${k}.`},400);
  if(!/^https:\/\/vrchat\.com\/home\/user\/usr_[a-zA-Z0-9-]+$/.test(b.profile))return json({error:'Use the full VRChat profile URL.'},400);
  const links=b.evidence.split('\n').map(x=>x.trim()).filter(Boolean);if(links.length>15||links.some(x=>{try{return new URL(x).protocol!=='https:'}catch{return true}}))return json({error:'Provide up to 15 valid HTTPS evidence links, one per line.'},400);
  if(!b.consent)return json({error:'Please confirm the submission statement.'},400);
  const id='HM-'+crypto.randomUUID().slice(0,8).toUpperCase();
  await env.DB.prepare('INSERT INTO cases (id,created,subject,profile,reporter,contact,offense,incident,summary,evidence) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id,new Date().toISOString(),...required.map(k=>b[k].trim())).run();
  return json({id,status:'pending'},201);
 }
 if(p.startsWith('/api/cases/')&&req.method==='POST'){
  if(!staff)return json({error:'Staff sign-in required.'},401);
  const id=decodeURIComponent(p.slice(11)),b=await req.json();
  if(!['pending','reviewing','active','info','dismissed','revoked'].includes(b.status)||typeof b.decision!=='string'||!b.decision.trim()||b.decision.length>5000)return json({error:'Choose a status and provide a decision reason.'},400);
  if(['active','info'].includes(b.status)&&(!b.public_summary?.trim()||!b.scope?.trim()))return json({error:'A public summary and group scope are required before publication.'},400);
  for(const k of ['public_summary','scope'])if(b[k]!==undefined&&(typeof b[k]!=='string'||b[k].length>(k==='scope'?500:5000)))return json({error:'Public summary or scope is invalid.'},400);
  const r=await env.DB.prepare('UPDATE cases SET status=?, decision=?, public_summary=?, scope=?, reviewed=? WHERE id=?').bind(b.status,b.decision,b.public_summary||'',b.scope||'',new Date().toISOString(),id).run();
  return r.meta.changes?json({ok:true}):json({error:'Case not found.'},404);
 }
 return json({error:'Not found.'},404);
 }catch(e){console.error('Request failed',e.message);return json({error:'The request could not be completed. Please try again.'},500)}}};
