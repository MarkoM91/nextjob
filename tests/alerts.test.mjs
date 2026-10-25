import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { defaultAlertConfig, saveAlertSettings, getAlertSettings, alertStatus, requestEmailVerification, confirmAlertEmail, deliverAlerts, EmailSendError, decryptContact, encryptContact, queueDigest, unsubscribeAlertEmail, inQuietHours, readAlertToken } from '../lib/alerts.ts';
import { checkOwnerAlerts, alertCountryCodes, alertMatches } from '../lib/alert-checker.ts';
import { signPayload } from '../lib/auth-session.ts';
import { candidate, jobs } from '../lib/demo-data.ts';
const NOW = Date.now();
process.env.AUTH_SECRET = 'test-alerts-private-secret-abcdefghijklmnopqrstuvwxyz';
process.env.NEXT_PUBLIC_APP_URL = 'https://nextjob.example';
Object.assign(process.env, { NOTIFICATION_EMAIL_ENABLED: 'true', EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'test-only', EMAIL_FROM: 'NextJOB <alerts@example.invalid>', RESEND_WEBHOOK_SECRET: 'whsec_dGVzdA==' });
function database() {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec(readFileSync('drizzle/0003_far_ares.sql','utf8').replaceAll('--> statement-breakpoint',''));sqlite.exec(readFileSync('drizzle/0004_loose_mauler.sql','utf8').replaceAll('--> statement-breakpoint',''));
  const db = {
    prepare(sql) {
      let params=[];
      const statement={ bind(...values) { params=values; return statement; },
        async run() { const result=sqlite.prepare(sql).run(...params); return { success:true, meta:{changes:Number(result.changes)} }; },
        async first() { return sqlite.prepare(sql).get(...params) ?? null; },
        async all() { return { success:true,results:sqlite.prepare(sql).all(...params) }; }
      };return statement;
    },
    async batch(statements) { sqlite.exec('BEGIN'); try { const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result; } catch(error) { sqlite.exec('ROLLBACK');throw error; } }
  }; return {db,sqlite};
}
const profile = { ...candidate, preferences: { ...candidate.preferences, countries: ['Italy'], minimumAnnualSalaryEur:0 }, skills: [...candidate.skills, 'Active Directory', 'Intune'] };
const job = id => ({ ...jobs[0], id, fictional:false, company:`Support Employer ${id}`, canonicalUrl:`https://employer.example/jobs/${id}`, externalId:id, description:'We need an IT Support Specialist to maintain Windows 11 workstations and Microsoft 365 services. Responsibilities include resolving IT support tickets, troubleshooting networking issues, managing hardware replacements and helping colleagues use software safely. Our service desk supports office employees in Milano with hands-on technical assistance and documented troubleshooting procedures.', providerName:'Employer board', country:'Italy', countryCode:'IT', city:'Milano', locationText:'Milano', workplace:'On-site', publishedAt:new Date(NOW).toISOString(), expiresAt:undefined, salary:undefined });
const deps = postings => ({ profile:async()=>({profile, verifiedAt:new Date(NOW).toISOString()}), search:async()=>({jobs:postings,failures:[],sourceCounts:{}}), persist:async()=>{},cache:async()=>{} });
async function verified(db, owner='owner-a') {
  await saveAlertSettings(db,owner,{...defaultAlertConfig,inApp:true,quietStart:'00:00',quietEnd:'00:00'},NOW);
  await requestEmailVerification(db,owner,'person@example.invalid','en',NOW);
  const delivery=await db.prepare("SELECT * FROM alert_deliveries WHERE owner_id = ? ORDER BY created_at DESC LIMIT 1").bind(owner).first();
  const message=JSON.parse(await decryptContact(delivery.payload_encrypted));
  const token=new URL(message.text.match(/https:\/\/[^\s]+/)[0]).searchParams.get('token');
  await confirmAlertEmail(db,token,NOW+1);return {token,delivery,message};
}
test('settings survive reload, default off, email encrypted, inbox isolated by workspace',async()=>{
  const {db,sqlite}=database();
  assert.equal((await alertStatus(db,null)).config.inApp,false);
  await verified(db);
  const row=await getAlertSettings(db,'owner-a'); assert.equal(row.email_encrypted.includes('person@'),false);
  assert.equal((await alertStatus(db,'owner-a')).email,'person@example.invalid');
  assert.equal((await alertStatus(db,'owner-b')).email,'');
  assert.equal((await getAlertSettings(db,'owner-a')).email_enabled,1); sqlite.close();
});
test('verification expiry, purpose, replay and superseded address cannot enable email',async()=>{
  const {db,sqlite}=database(); const {token}=await verified(db);
  await assert.rejects(confirmAlertEmail(db,token,NOW+2),/INVALID_EMAIL_LINK/);
  await assert.rejects(readAlertToken(token,'unsubscribe-alert-email',NOW),/INVALID_EMAIL_LINK/);
  await assert.rejects(readAlertToken(token,'verify-alert-email',NOW+25*3600000),/INVALID_EMAIL_LINK/);
  await requestEmailVerification(db,'owner-a','new@example.invalid','en',NOW+61000);
  await assert.rejects(confirmAlertEmail(db,token,NOW+62000),/INVALID_EMAIL_LINK/);
  assert.equal((await getAlertSettings(db,'owner-a')).email_enabled,0); sqlite.close();
});
test('saving in-app preferences preserves a pending verification and durable resend limits',async()=>{
  const {db,sqlite}=database();
  await saveAlertSettings(db,'a',defaultAlertConfig,NOW);
  await requestEmailVerification(db,'a','person@example.invalid','en',NOW);
  await saveAlertSettings(db,'a',{...defaultAlertConfig,inApp:true},NOW+1);
  assert.ok((await getAlertSettings(db,'a')).verification_hash);
  await assert.rejects(requestEmailVerification(db,'a','person@example.invalid','en',NOW+100),/EMAIL_RATE_LIMIT/);
  for(let i=1;i<5;i++) await requestEmailVerification(db,'a','person@example.invalid','en',NOW+i*61000);
  await assert.rejects(requestEmailVerification(db,'a','person@example.invalid','en',NOW+6*61000),/EMAIL_RATE_LIMIT/); sqlite.close();
});
test('baseline creates no backlog, later relevant new jobs deduplicate even across concurrent runs',async()=>{
  const {db,sqlite}=database(); const postings=[job('old')];
  await saveAlertSettings(db,'a',{...defaultAlertConfig,inApp:true},NOW);
  assert.equal(alertMatches(profile,postings,72).length,1,'fixture is a real, strong role match');
  assert.equal((await checkOwnerAlerts(db,undefined,'a',NOW,deps(postings))).baseline,true);
  assert.equal((await alertStatus(db,'a')).unread,0);
  postings.push(job('new'), {...job('lawyer'),title:'Senior Legal Counsel',normalizedTitle:'senior legal counsel'}, {...job('us'),countryCode:'US',country:'United States'});
  const results=await Promise.all([checkOwnerAlerts(db,undefined,'a',NOW+3600001,deps(postings)),checkOwnerAlerts(db,undefined,'a',NOW+3600001,deps(postings))]);
  assert.equal(results.filter(result=>result.checked).length,1);
  const status=await alertStatus(db,'a');assert.equal(status.unread,1);assert.equal(status.inbox[0].job_id,'new');
  assert.equal((await alertStatus(db,'b')).unread,0);
  await checkOwnerAlerts(db,undefined,'a',NOW+7200002,deps(postings));assert.equal((await alertStatus(db,'a')).unread,1);
  assert.deepEqual(alertCountryCodes(profile),['IT']);sqlite.close();
});
test('failed source check does not establish a baseline or invent alerts',async()=>{
  const {db,sqlite}=database();await saveAlertSettings(db,'a',{...defaultAlertConfig,inApp:true},NOW);
  const result=await checkOwnerAlerts(db,undefined,'a',NOW,{...deps([]),search:async()=>({jobs:[],failures:[{providerId:'x',message:'offline'}]})});
  assert.equal(result.error,'JOB_SOURCES_UNAVAILABLE');assert.equal((await getAlertSettings(db,'a')).baseline_revision,null);assert.equal((await alertStatus(db,'a')).unread,0);sqlite.close();
});
test('delivery retries transient failures with the same idempotency key and cancels stale contact',async()=>{
  const {db,sqlite}=database();await saveAlertSettings(db,'a',defaultAlertConfig,NOW);await requestEmailVerification(db,'a','person@example.invalid','en',NOW);
  const keys=[];
  await deliverAlerts(db,NOW,async(message,id)=>{keys.push(id);throw new EmailSendError('EMAIL_HTTP_503',true);});
  assert.equal((await db.prepare('SELECT status FROM alert_deliveries').first()).status,'retry');
  assert.equal((await deliverAlerts(db,NOW+1000,async()=>{throw new Error('should not retry early');})).accepted,0);
  await deliverAlerts(db,NOW+120001,async(message,id)=>{keys.push(id);return 'resend-1';});
  assert.equal(keys[0],keys[1]);assert.equal((await db.prepare('SELECT attempts FROM alert_deliveries').first()).attempts,2);
  await requestEmailVerification(db,'a','other@example.invalid','en',NOW+180000);
  await db.prepare('UPDATE alert_settings SET email_revision = email_revision + 1 WHERE owner_id = ?').bind('a').run();
  const result=await deliverAlerts(db,NOW+180001,async()=>{throw new Error('stale email was sent');});assert.equal(result.accepted,0);sqlite.close();
});
test('digest respects quiet hours and frequency; unsubscribe blocks queued delivery and stale links',async()=>{
  const {db,sqlite}=database();await verified(db);
  const add=async(id,at)=>db.prepare('INSERT INTO alert_inbox (id,owner_id,job_id,title,company,location,created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id,'owner-a',id,'Support','Employer','Milano',at).run();
  await add('new-1',NOW);
  await queueDigest(db,await getAlertSettings(db,'owner-a'),NOW+2);
  await add('new-2',NOW+10);await queueDigest(db,await getAlertSettings(db,'owner-a'),NOW+20);
  const count=await db.prepare("SELECT count(*) AS n FROM alert_deliveries WHERE kind = 'digest'").first();assert.equal(count.n,1);
  const row=await db.prepare("SELECT * FROM alert_deliveries WHERE kind = 'digest'").first();
  const message=JSON.parse(await decryptContact(row.payload_encrypted));const token=new URL(message.unsubscribe).searchParams.get('token');
  await unsubscribeAlertEmail(db,token,NOW+21);await unsubscribeAlertEmail(db,token,NOW+22);
  assert.equal((await getAlertSettings(db,'owner-a')).email_enabled,0);assert.equal((await getAlertSettings(db,'owner-a')).in_app,1);
  assert.equal((await db.prepare("SELECT status FROM alert_deliveries WHERE kind = 'digest'").first()).status,'cancelled');
  await saveAlertSettings(db,'owner-a',{...defaultAlertConfig,inApp:true,emailEnabled:true},NOW+25);
  await assert.rejects(unsubscribeAlertEmail(db,token,NOW+26),/INVALID_EMAIL_LINK/);
  assert.equal(inQuietHours({...defaultAlertConfig,timeZone:'Europe/Rome'},Date.parse('2026-10-25T22:00:00Z')),true);
  assert.equal(inQuietHours({...defaultAlertConfig,timeZone:'Europe/Rome'},Date.parse('2026-10-25T12:00:00Z')),false);sqlite.close();
});
test('email credentials disabled means no provider call or fake delivery',async()=>{
  const {db,sqlite}=database();process.env.NOTIFICATION_EMAIL_ENABLED='false';
  try { await assert.rejects(requestEmailVerification(db,'a','person@example.invalid','en',NOW),/EMAIL_NOT_CONFIGURED/);assert.deepEqual(await deliverAlerts(db,NOW,async()=>{throw new Error('must not send');}),{accepted:0,failed:0}); }
  finally {process.env.NOTIFICATION_EMAIL_ENABLED='true';sqlite.close();}
});
test('durable global daily budget defers excess sends without consuming retry attempts',async()=>{
  const {db,sqlite}=database();process.env.NOTIFICATION_DAILY_SEND_LIMIT='1';
  try {
    await requestEmailVerification(db,'a','a@example.invalid','en',NOW);
    await requestEmailVerification(db,'b','b@example.invalid','en',NOW);
    let calls=0;const result=await deliverAlerts(db,NOW,async()=>{calls++;return 'provider-id';});
    assert.equal(calls,1);assert.equal(result.accepted,1);
    const pending=await db.prepare("SELECT attempts, failure_code FROM alert_deliveries WHERE status = 'retry'").first();assert.equal(pending.attempts,0);assert.equal(pending.failure_code,'EMAIL_DAILY_LIMIT');
  } finally {delete process.env.NOTIFICATION_DAILY_SEND_LIMIT;sqlite.close();}
});
test('permanent provider failures are not retried and expired queued messages never send',async()=>{
  const {db,sqlite}=database();await requestEmailVerification(db,'a','a@example.invalid','en',NOW);
  await deliverAlerts(db,NOW,async()=>{throw new EmailSendError('EMAIL_HTTP_422',false);});
  assert.equal((await db.prepare('SELECT status FROM alert_deliveries').first()).status,'failed');
  await requestEmailVerification(db,'b','b@example.invalid','en',NOW);
  let calls=0;await deliverAlerts(db,NOW+23.5*3600000,async()=>{calls++;return 'unexpected';});
  assert.equal(calls,0);assert.equal((await db.prepare("SELECT status FROM alert_deliveries WHERE owner_id = 'b'").first()).status,'failed');sqlite.close();
});
