import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createApp} from './server.js';
test('independent login, forged header rejection, session logout and persisted reports',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'murinus-test-'));const password='test-only-password-123456';let app,base;
 async function start(){app=createApp({dataDir:dir,password,production:false});await new Promise(r=>app.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.address().port}
 const stop=()=>new Promise(r=>{app.close(r);app.closeAllConnections()});
 try{await start();const request=(path,body,cookie='',extra={})=>fetch(base+path,{method:body?'POST':'GET',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie,...extra},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await request('/health')).status,200);
 assert.equal((await request('/api/cases?status=staff',null,'',{'oai-authenticated-user-email':'owner@example.test',Authorization:'Bearer arbitrary'})).status,401);
 assert.equal((await request('/api/login',{password:'wrong'})).status,401);
 const login=await request('/api/login',{password});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly/);
 assert.equal((await (await request('/api/session',null,cookie)).json()).staff,true);
 const submitted=await request('/api/cases',{subject:'Local Test',profile:'https://vrchat.com/home/user/usr_local-test',reporter:'Reporter',contact:'test',offense:'Other',incident:'2026-09-30T10:00',summary:'Synthetic local test',evidence:'https://example.com/test',consent:true});assert.equal(submitted.status,201);
 await stop();await start();
 const queue=await request('/api/cases?status=staff',null,cookie);assert.equal(queue.status,200);assert.equal((await queue.json()).cases[0].subject,'Local Test');
 assert.equal((await request('/api/logout',{},cookie)).status,200);assert.equal((await request('/api/cases?status=staff',null,cookie)).status,401);
 assert.equal((await request('/api/login',{password},'',{Origin:'https://foreign.example'})).status,403);
 }finally{if(app?.listening)await stop();rmSync(dir,{recursive:true,force:true})}
});
