import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import worker from './api.js';
const db=new DatabaseSync(':memory:');const env={isStaff:async req=>req.headers.get('x-test-staff')==='yes',DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this},async run(){const r=db.prepare(sql).run(...args);return{meta:{changes:Number(r.changes)}}},async all(){return{results:db.prepare(sql).all(...args)}}}}}};
const origin='https://murinus.test';const req=(path,method='GET',body,staff=false)=>new Request(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(staff?{'x-test-staff':'yes'}:{})},...(body?{body:JSON.stringify(body)}:{})});
const report={subject:'Test Subject',profile:'https://vrchat.com/home/user/usr_test-123',reporter:'Test Reporter',contact:'private-contact',offense:'Targeted harassment & threats',incident:'2026-09-30T10:00',summary:'Private evidence context',evidence:'https://example.test/evidence',consent:true};
test('private intake, staff authorization, approval and revocation',async()=>{
 assert.equal((await worker.fetch(req('cases?status=staff'),env)).status,401);
 let r=await worker.fetch(req('cases','POST',report),env);assert.equal(r.status,201);const {id}=await r.json();
 assert.deepEqual((await (await worker.fetch(req('cases'),env)).json()).cases,[]);
 r=await worker.fetch(req('cases/'+id,'POST',{status:'active',decision:'Reviewed'},true),env);assert.equal(r.status,400);
 r=await worker.fetch(req('cases/'+id,'POST',{status:'active',decision:'Reviewed source',public_summary:'Approved summary',scope:'Test Group'},true),env);assert.equal(r.status,200);
 const published=(await (await worker.fetch(req('cases'),env)).json()).cases;assert.equal(published.length,1);assert.equal(published[0].subject,report.subject);for(const k of ['reporter','contact','summary','evidence','decision'])assert.equal(k in published[0],false);
 r=await worker.fetch(req('cases/'+id,'POST',{status:'revoked',decision:'Appeal accepted'},true),env);assert.equal(r.status,200);assert.equal((await (await worker.fetch(req('cases'),env)).json()).cases.length,0);
 assert.equal((await (await worker.fetch(req('cases?status=staff','GET',null,true),env)).json()).cases[0].status,'revoked');
});
test('reject invalid evidence, missing consent and foreign origins',async()=>{assert.equal((await worker.fetch(req('cases','POST',{...report,evidence:'javascript:alert(1)'}),env)).status,400);assert.equal((await worker.fetch(req('cases','POST',{...report,consent:false}),env)).status,400);const r=req('cases','POST',report);r.headers.set('Origin','https://other.test');assert.equal((await worker.fetch(r,env)).status,403)});
test('only staff can edit persisted site content, unsafe settings are rejected',async()=>{
 const settings={name:'Updated House',accent:'#bb99dd',logo:'',blacklistTitle:'Rules',blacklistIntro:'',infoTitle:'Info',infoIntro:'Context',blacklistRules:['1.1 Example'],infoRules:['2.1 Example'],texts:{'One community.':'Together.'}};
 assert.equal((await worker.fetch(req('content','POST',settings),env)).status,401);
 assert.equal((await worker.fetch(req('content','POST',settings,true),env)).status,200);
 assert.deepEqual((await (await worker.fetch(req('content'),env)).json()).content,settings);
 assert.equal((await worker.fetch(req('content','POST',{...settings,logo:'javascript:alert(1)'},true),env)).status,400);
 const foreign=req('content','POST',settings,true);foreign.headers.set('Origin','https://elsewhere.test');assert.equal((await worker.fetch(foreign,env)).status,403);
});
test('staff can edit all case details and archive; unsafe evidence edits are rejected',async()=>{
 const created=await (await worker.fetch(req('cases','POST',report),env)).json();
 const change={...report,edit:true,subject:'Corrected Subject',status:'info',decision:'Verified correction',public_summary:'New public summary',scope:'Example group'};
 assert.equal((await worker.fetch(req('cases/'+created.id,'POST',change),env)).status,401);
 assert.equal((await worker.fetch(req('cases/'+created.id,'POST',{...change,evidence:'javascript:alert(1)'},true),env)).status,400);
 assert.equal((await worker.fetch(req('cases/'+created.id,'POST',change,true),env)).status,200);
 const published=(await (await worker.fetch(req('cases?status=info'),env)).json()).cases;assert.equal(published.find(x=>x.id===created.id).subject,'Corrected Subject');
 assert.equal((await worker.fetch(req('cases/'+created.id,'POST',{status:'archived',decision:'Archived by staff'},true),env)).status,200);
 assert.equal((await (await worker.fetch(req('cases?status=info'),env)).json()).cases.some(x=>x.id===created.id),false);
});
