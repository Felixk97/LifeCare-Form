import {test} from 'node:test';import assert from 'node:assert/strict';import {createHmac} from 'node:crypto';
import {handler,reset} from './harness.mjs';
process.env.ADMIN_CODE='test-only-master-Secret-2026';const master=process.env.ADMIN_CODE;
const call=async(action,body,headers={})=>{const r=await handler(new Request('https://example.test/api?action='+action,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)}));return {status:r.status,data:await r.json().catch(()=>null)}};
const ipH=ip=>({'x-nf-client-connection-ip':ip});
const login=(pw,ip,user='')=>call('login',{username:user,password:pw},ipH(ip));

test('correct login still works and the session is accepted',async()=>{reset();const l=await login(master,'1.1.1.1');assert.equal(l.status,200);const r=await call('company_put',{name:'Form'},{'x-admin-session':l.data.session});assert.equal(r.status,200,JSON.stringify(r.data))});

test('a session forged with the admin password as the key is rejected',async()=>{reset();const forge=pw=>{const p=Buffer.from(JSON.stringify({role:'master',exp:Date.now()+3600000})).toString('base64url');return p+'.'+createHmac('sha256',pw).update(p).digest('base64url')};
 const r=await call('company_put',{name:'Evil'},{'x-admin-session':forge(master)});assert.equal(r.status,401);
 await login(master,'1.1.1.1');const r2=await call('company_put',{name:'Evil'},{'x-admin-session':forge(master)});assert.equal(r2.status,401,'still rejected after the real key exists')});

test('SESSION_SECRET (32+ chars) is used when provided',async()=>{reset();process.env.SESSION_SECRET='x'.repeat(40);try{const l=await login(master,'1.1.1.1');assert.equal(l.status,200);const p=l.data.session.split('.')[0];assert.equal(l.data.session.split('.')[1],createHmac('sha256','x'.repeat(40)).update(p).digest('base64url'))}finally{delete process.env.SESSION_SECRET}});

test('8 wrong passwords lock that address, even for the right password; other addresses are unaffected',async()=>{reset();
 for(let i=0;i<8;i++){const r=await login('wrong-'+i,'9.9.9.9');assert.equal(r.status,401,'attempt '+i)}
 assert.equal((await login(master,'9.9.9.9')).status,429);
 assert.equal((await login(master,'8.8.8.8')).status,200)});

test('the per-request credential header path is throttled too',async()=>{reset();
 const bad=()=>call('company_put',{name:'x'},{...ipH('7.7.7.7'),'x-admin-code':'nope-nope-nope'});
 for(let i=0;i<8;i++)assert.equal((await bad()).status,401);
 const locked=await call('company_put',{name:'x'},{...ipH('7.7.7.7'),'x-admin-code':master});assert.equal(locked.status,429)});

test('40 simultaneous guesses: at most 8 are ever evaluated, the rest are refused (fail closed)',async()=>{reset();
 const rs=await Promise.all(Array.from({length:40},(_,i)=>login('guess-'+i,'6.6.6.6')));
 const evaluated=rs.filter(r=>r.status===401).length,refused=rs.filter(r=>r.status===429).length;
 assert.ok(evaluated<=8,'evaluated '+evaluated);assert.equal(evaluated+refused,40);
 assert.equal((await login(master,'6.6.6.6')).status,429)});

test('successful logins give their slot back: 20 staff logins from one address are never locked out',async()=>{reset();
 for(let i=0;i<20;i++)assert.equal((await login(master,'5.5.5.5')).status,200,'login '+i);
 for(let i=0;i<7;i++)assert.equal((await login('bad'+i,'5.5.5.5')).status,401);
 assert.equal((await login(master,'5.5.5.5')).status,200,'7 failures are still under the limit')});

test('30 failures against one account from many addresses lock that account for everyone',async()=>{reset();
 for(let i=0;i<30;i++)await login('guess-'+i,'10.0.0.'+(i%250),'alice');
 const r=await login('anything','11.11.11.11','alice');assert.equal(r.status,429);
 assert.equal((await login(master,'12.12.12.12')).status,200,'master account is a different key, unaffected')});
