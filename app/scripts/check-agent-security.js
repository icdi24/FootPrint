const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const { Pool } = require('pg');
const { openDb, tx } = require('../src/db');
const { runTurn, cancelTurn, getTurn } = require('../src/agent/zoowy-turns');
const { acquireModelPermit } = require('../src/agent/model-permits');
const { clearHistory, readDeletionJournal, applyHistoryDeletion } = require('../src/agent/history-privacy');
const { appendMessage, ensureSession } = require('../src/agent/session');
const { pruneAgentData } = require('../src/agent/retention');
const { withRun } = require('../src/agent/runtime-context');
const ai = require('../src/ai');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const url = process.env.SECURITY_TEST_DATABASE_URL;
if (!url || !/^postgres(?:ql)?:\/\/[^/]+\/security_[a-z_]+$/.test(url) || !['127.0.0.1','localhost'].includes(new URL(url).hostname)) {
  throw new Error('SECURITY_TEST_DATABASE_URL must explicitly select an isolated local security_* database');
}
const delay = ms => new Promise(r => setTimeout(r, ms));
async function worker() {
  const db = await openDb(url);
  if (process.argv[2] === 'permit') {
    try {
      const permit = await acquireModelPermit(db);
      process.send({ready:true});
      await once(process,'message');
      await permit.release();
      process.send({released:true});
    } catch(e) { process.send({busy:e.kind==='busy',error:e.message}); }
  } else {
    try {
      const out = await runTurn(db,{userId:Number(process.argv[3]),requestId:'security_cross_cancel',input:{action:'test'}},async ({commit}) => {
        process.send({ready:true});
        await db.get('SELECT pg_sleep(20) /* security_cross_cancel */');
        return commit(async () => ({reply:'should not commit'}));
      });
      process.send({unexpected:out});
    } catch(e) { process.send({cancelled:e.code==='turn_cancelled',kind:e.kind,code:e.code}); }
  }
  await db.pool.end();
  process.exit(0);
}
function child(mode,userId) {
  const cp = fork(__filename,[mode,String(userId || '')],{env:process.env,stdio:['ignore','ignore','inherit','ipc']});
  return cp;
}
async function message(cp) {
  return Promise.race([once(cp,'message').then(([m])=>m),delay(12000).then(()=>{throw new Error('worker timeout');})]);
}
async function main() {
  const address = new URL(url);
  const admin = new Pool({connectionString:new URL('/postgres',address).toString()});
  const name = address.pathname.slice(1);
  if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount) await admin.query('CREATE DATABASE '+name);
  await admin.end();
  const db = await openDb(url);
  const suffix = Date.now().toString(36);
  const user = await db.get("INSERT INTO users(nickname,password_hash,login_name,created_at) VALUES (?,'synthetic',?,?) RETURNING id",
    ['security_'+suffix,'security_'+suffix,new Date().toISOString()]);
  const other = await db.get("INSERT INTO users(nickname,password_hash,login_name,created_at) VALUES (?,'synthetic',?,?) RETURNING id",
    ['other_'+suffix,'other_'+suffix,new Date().toISOString()]);
  const uid=user.id;
  const originalFetch=global.fetch;
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'footprint-security-'));
  const children=[];
  let passed=0;
  const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
  try {
    await test('foreground claim is atomic across connections',async()=>{
      let release;
      let started;
      const ready=new Promise(r=>{started=r;});
      const pending=runTurn(db,{userId:uid,requestId:'security_first_'+suffix,input:{action:'test'}},async({commit})=>{
        started(); await new Promise(r=>{release=r;}); return commit(async()=>({reply:'ok'}));
      });
      await ready;
      await assert.rejects(runTurn(db,{userId:uid,requestId:'security_second_'+suffix,input:{}},()=>{}),e=>e.code==='turn_running');
      release(); const result=await pending;
      assert.equal(result.report.state,'done');
      const replay=await runTurn(db,{userId:uid,requestId:'security_first_'+suffix,input:{action:'test'}},()=>{throw new Error('replayed work');});
      assert.deepEqual(replay,result);
      await assert.rejects(getTurn(db,other.id,'security_first_'+suffix),e=>e.status===404);
    });
    await test('partial unique index is an independent database invariant',async()=>{
      await db.run("INSERT INTO zoowy_turns(user_id,request_id,input,state,kind) VALUES (?,'security_index_one','{}','running','foreground')",[uid]);
      await assert.rejects(db.run("INSERT INTO zoowy_turns(user_id,request_id,input,state,kind) VALUES (?,'security_index_two','{}','running','foreground')",[uid]),e=>e.code==='23505');
      await db.run("UPDATE zoowy_turns SET state='done' WHERE user_id=? AND request_id='security_index_one'",[uid]);
    });
    await test('four provider permits are shared between Node processes',async()=>{
      for(let i=0;i<4;i++){const cp=child('permit');children.push(cp);assert((await message(cp)).ready);}
      const fifth=child('permit');children.push(fifth);assert((await message(fifth)).busy);
      for(const cp of children.slice(0,4)){const done=message(cp);cp.send('release');assert((await done).released);}
      await delay(100);
    });
    await test('cancel in another process cancels PostgreSQL work',async()=>{
      const cp=child('cancel',uid);children.push(cp);assert((await message(cp)).ready);
      await delay(150);
      const final=message(cp);
      const acknowledgement=await cancelTurn(db,uid,'security_cross_cancel');
      assert(acknowledgement.accepted || acknowledgement.cancelled);
      assert((await final).cancelled);
      assert.equal((await getTurn(db,uid,'security_cross_cancel')).state,'cancelled');
      assert.equal((await db.get('SELECT 42 AS value')).value,42);
    });
    await test('server-side statement timeout rolls back all writes',async()=>{
      const before=Number((await db.get('SELECT COUNT(*) n FROM big_goals WHERE owner_id=?',[uid])).n);
      await assert.rejects(tx(db,async c=>{
        await c.run("INSERT INTO big_goals(owner_id,title,created_at,updated_at) VALUES (?,'rollback',?,?)",[uid,new Date().toISOString(),new Date().toISOString()]);
        await c.exec("SET LOCAL statement_timeout='50ms'");
        await c.get('SELECT pg_sleep(1)');
      }),e=>e.code==='57014');
      assert.equal(Number((await db.get('SELECT COUNT(*) n FROM big_goals WHERE owner_id=?',[uid])).n),before);
    });
    await test('clear invalidates old workers, cached inputs and summaries',async()=>{
      const session=await ensureSession(db,uid);
      await appendMessage(db,uid,session.id,'user','private old text');
      await db.run("INSERT INTO zoowy_compactions(session_id,user_id,through_message_id,summary) VALUES (?,?,0,'private summary') ON CONFLICT(session_id) DO UPDATE SET summary=excluded.summary",[session.id,uid]);
      let resume,started;
      const ready=new Promise(r=>{started=r;});
      const pending=runTurn(db,{userId:uid,requestId:'security_clear_'+suffix,input:{message:'private'},sessionId:session.id,sessionGeneration:session.generation},async({commit})=>{
        started();await new Promise(r=>{resume=r;});return commit(async c=>{await appendMessage(c,uid,session.id,'assistant','resurrection');return {reply:'wrong'};});
      }).catch(e=>e);
      await ready;const cleared=await clearHistory(db,uid,folder);resume();await pending;
      assert.equal(cleared.generation,session.generation+1);
      assert.equal(Number((await db.get('SELECT COUNT(*) n FROM zoowy_messages WHERE user_id=?',[uid])).n),0);
      assert.equal(Number((await db.get('SELECT COUNT(*) n FROM zoowy_compactions WHERE user_id=?',[uid])).n),0);
      assert.equal((await db.get("SELECT input,result,cleared FROM zoowy_turns WHERE user_id=? AND request_id=?",[uid,'security_clear_'+suffix])).cleared,true);
      assert.equal(readDeletionJournal(folder).length,1);
    });
    process.env.DEEPSEEK_API_KEY='synthetic-not-a-real-key';
    process.env.DEEPSEEK_MODEL='deepseek-flash';
    let requests=0;
    await test('context limit is checked before any provider request',async()=>{
      global.fetch=async()=>{requests++;throw new Error('must not fetch');};
      await assert.rejects(ai.chat(db,{userId:uid,messages:[{role:'user',content:'x'.repeat(310000)}]}),e=>e.code==='context_budget');
      assert.equal(requests,0);
    });
    await test('oversized provider response is stopped at 2 MiB',async()=>{
      global.fetch=async()=>{requests++;return new Response('x'.repeat(2*1024*1024+1));};
      await assert.rejects(ai.chat(db,{userId:uid,messages:[{role:'user',content:'test'}]}),e=>e.kind==='output_limit');
    });
    await test('JSON retry attempts are individually reported',async()=>{
      requests=0;
      global.fetch=async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:++requests===1?'bad':'{"ok":true}'}}],usage:{prompt_tokens:1,completion_tokens:2,total_tokens:3}}));
      const result=await runTurn(db,{userId:uid,requestId:'security_json_'+suffix,input:{action:'test'}},async({commit})=>{
        const model=await ai.chat(db,{userId:uid,workflow:'security',idempotencyKey:'security_json_'+suffix,json:true,messages:[{role:'user',content:'JSON'}]});
        return commit(async()=>({reply:model.content}));
      });
      assert.equal(result.report.modelCalls,2);
      assert.equal(Number((await db.get('SELECT COUNT(*) n FROM ai_calls WHERE idempotency_key=?',['security_json_'+suffix])).n),2);
    });
    await test('retention clears reports but preserves operation receipts',async()=>{
      const key='security_retention_'+suffix;
      await db.run("INSERT INTO zoowy_turns(user_id,request_id,input,state,result,report,finished_at) VALUES (?,?,'{\"message\":\"old\"}','done','{\"reply\":\"old\"}','{\"tools\":[\"old\"]}',NOW()-INTERVAL '31 days')",[uid,key]);
      await pruneAgentData(db);
      const row=await db.get('SELECT state,input,result,report,cleared FROM zoowy_turns WHERE user_id=? AND request_id=?',[uid,key]);
      assert.equal(row.state,'done');assert.equal(row.cleared,true);assert.equal(row.result,null);assert.deepEqual(row.input,{});assert.deepEqual(row.report,{});
    });
    console.log('Agent runtime security integration passed '+passed+' cases');
  } finally {
    global.fetch=originalFetch;
    for(const cp of children)if(!cp.killed)cp.kill();
    await db.pool.end();
    fs.rmSync(folder,{recursive:true,force:true});
  }
}
(process.argv[2]?worker():main()).catch(e=>{console.error(e);process.exitCode=1;});
