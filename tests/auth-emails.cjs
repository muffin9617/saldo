const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const vm=require('node:vm');
(async()=>{
  const {authTemplates,renderAuthEmail,authConfigPatch}=await import('../emails/auth-templates.mjs');
  const {auditAuthConfig,changedFields}=await import('../emails/auth-config-audit.mjs');
  const {reminderEmail}=await import('../supabase/functions/saldo-notifications/email-templates.js');
  assert.equal(authTemplates.length,13);
  assert.equal(new Set(authTemplates.map(t=>t.id)).size,13);
  for(const template of authTemplates){
    const mail=renderAuthEmail(template);
    assert.ok(mail.subject.startsWith('Saldo · '));
    assert.ok(mail.preheader && mail.preheader!==template.introduction,'Preheader must add a distinct next-step summary');
    assert.ok(mail.html.includes(mail.preheader));
    const note=mail.html.match(/data-email-section="note"[^>]*>([\s\S]*?)<\/td>/)[1];
    const footer=mail.html.match(/data-email-section="footer"[^>]*>([\s\S]*?)<\/td>/)[1];
    assert.equal((mail.html.match(/mailto:service@saldo\.tobmarket\.ing/g)||[]).length,1,'Support must have one contextual or footer entry');
    if(template.note.includes('联系 Saldo')){
      assert.ok(note.includes('mailto:service@saldo.tobmarket.ing'));
      assert.ok(!footer.includes('mailto:'));
      assert.equal((mail.text.match(/service@saldo\.tobmarket\.ing/g)||[]).length,1);
    }
    if(template.security){
      assert.ok(!mail.html.includes('action-secondary'),'No standalone navigation action duplicated above exception guidance');
      assert.ok(note.includes('contextual-link'));
      assert.ok(!mail.html.includes('mso-padding-alt'),'Informational notices must not use the primary button');
      assert.ok(mail.html.includes('无需进一步处理'));
      assert.ok(template.note.includes('如果这不是你的操作'));
      if(template.id!=='M03')assert.ok(!template.note.includes('重置密码'),'Recovery guidance must match the changed event');
    } else if(template.id==='M08')assert.ok(!mail.html.includes('mso-padding-alt'));
    else assert.ok(mail.html.includes('mso-padding-alt'));
    assert.match(mail.html,/lang="zh-CN"/);
    assert.match(mail.html,/service@saldo\.tobmarket\.ing/);
    assert.match(mail.html,/email-logo\.png/);
    assert.match(mail.html,/prefers-color-scheme:dark/);
    assert.ok(mail.text.includes('service@saldo.tobmarket.ing'));
    assert.ok(!mail.html.includes('管理通知偏好'),'Account mail must not imply security notices can be disabled by reminder preferences');
    assert.ok(!/127\.0\.0\.1|localhost|preview-only/.test(mail.html));
    const stem='emails/auth-'+template.key.replaceAll('_','-');
    assert.equal(await fs.readFile(stem+'.html','utf8'),mail.html+'\n');
    assert.equal(await fs.readFile(stem+'-source.txt','utf8'),mail.html+'\n');
    assert.equal(await fs.readFile(stem+'-subject.txt','utf8'),mail.subject+'\n');
    assert.equal(await fs.readFile(stem+'-text.txt','utf8'),mail.text+'\n');
  }
  for(const [id,type] of [['M01','signup'],['M02','recovery']]){
    const html=renderAuthEmail(id).html;
    assert.ok(html.includes(`{{ .SiteURL }}/?token_hash={{ .TokenHash }}&amp;type=${type}`));
    assert.ok(!html.includes('.Token }}'),'Do not expose a second OTP in link-based current journeys');
  }
  const recovery=renderAuthEmail('M02');
  assert.ok(recovery.html.includes('你的密码不会因此改变'));
  assert.ok(renderAuthEmail('M03').text.includes('立即打开 Saldo'));
  for(const id of ['M01','M02']){
    const note=renderAuthEmail(id).html.match(/data-email-section="note"[^>]*>([\s\S]*?)<\/td>/)[1];
    assert.ok(note.includes('href="https://saldo.tobmarket.ing/"'));
  }
  assert.ok(!renderAuthEmail('M03').html.includes('.Token'));
  assert.ok(renderAuthEmail('M08').html.includes('{{ .Token }}'));
  assert.ok(!renderAuthEmail('M08').html.includes('undefined'));
  assert.throws(()=>renderAuthEmail('unknown'));
  assert.throws(()=>renderAuthEmail('M02',{actionUrl:'javascript:alert(1)'}));
  const reminder=reminderEmail({name:'<img src=x onerror=alert(1)>',expires_on:'2026-12-01'},1);
  assert.ok(!reminder.html.includes('<img src=x'));
  assert.ok(reminder.html.includes('管理通知偏好'));
  assert.ok(reminder.html.includes('service@saldo.tobmarket.ing'));
  assert.ok(reminder.preheader && reminder.subject.startsWith('Saldo · '));
  assert.ok(reminder.html.includes('查看订阅'));
  const reminderNote=reminder.html.match(/data-email-section="note"[^>]*>([\s\S]*?)<\/td>/)[1];
  const reminderFooter=reminder.html.match(/data-email-section="footer"[^>]*>([\s\S]*?)<\/td>/)[1];
  assert.ok(reminderNote.includes('可<a'));
  assert.ok(reminderNote.includes('href="https://saldo.tobmarket.ing/notification-settings.html"'));
  assert.ok(!reminderFooter.includes('管理通知偏好'));
  assert.equal((reminder.html.match(/>管理通知偏好<\/a>/g)||[]).length,1);
  assert.equal((reminder.text.match(/https:\/\/saldo\.tobmarket\.ing\/notification-settings\.html/g)||[]).length,1);
  assert.throws(()=>reminderEmail({},1,{preferencesUrl:'javascript:alert(1)'}));
  const today=reminderEmail({name:'Fixture',expires_on:'2026-12-01'},0);
  assert.ok(today.html.includes('今天到期'));
  assert.ok(today.text.includes('今天到期'));
  assert.ok(!today.text.includes('将于'));
  const account=renderAuthEmail('M06',{previewData:{Provider:'<img src=x onerror=alert(1)>'}});
  assert.ok(account.html.includes('&lt;img'));
  assert.ok(!account.html.includes('<img src=x'));
  assert.ok(!account.html.includes('{{'));
  const noDetails=renderAuthEmail('M05',{previewData:{}});
  assert.ok(!noDetails.html.includes('变更前邮箱'));
  assert.ok(!noDetails.html.includes('border-top:'));
  for(const [id,field] of [['M04','NewEmail'],['M05','OldEmail'],['M06','Provider'],['M07','Provider'],['M11','OldPhone'],['M12','FactorType'],['M13','FactorType']]){
    assert.ok(renderAuthEmail(id).html.includes('{{ .'+field+' }}'));
  }
  const patch=authConfigPatch();
  assert.equal(Object.keys(patch).length,27);
  assert.equal(patch.mailer_notifications_password_changed_enabled,true);
  assert.ok(Object.keys(patch).every(k=>k.startsWith('mailer_templates_')||k.startsWith('mailer_subjects_')||k==='mailer_notifications_password_changed_enabled'));
  assert.deepEqual(JSON.parse(await fs.readFile('emails/auth-config-patch.json','utf8')),patch);
  const config={...patch,site_url:'https://saldo.tobmarket.ing',uri_allow_list:'https://saldo.tobmarket.ing/,https://saldo.tobmarket.ing/?type=recovery',
    mailer_autoconfirm:false,smtp_host:'smtp.resend.com',smtp_user:'resend',smtp_pass:'secret-sentinel',
    smtp_admin_email:'noreply@saldo.tobmarket.ing',smtp_sender_name:'Saldo',hook_send_email_enabled:false};
  assert.equal(auditAuthConfig(config).configurationMatches,true);
  assert.deepEqual(changedFields(config),[]);
  const report=auditAuthConfig({...config,mailer_templates_recovery_content:'old',hook_send_email_enabled:true});
  assert.equal(report.configurationMatches,false);
  assert.equal(report.checks.noSendEmailHookOverride,false);
  assert.equal(report.templates.find(t=>t.id==='M02').htmlMatches,false);
  assert.ok(!JSON.stringify(report).includes('secret-sentinel'));
  assert.deepEqual(changedFields({...config,mailer_subjects_recovery:'old'}),['mailer_subjects_recovery']);

  // Run the actual browser callback code in isolated contexts: no live account,
  // stored verifier, network request, or email token is used.
  const source=(await fs.readFile('dist/auth.js','utf8')).replace(/^import .*;\n/gm,'').replace(/export /g,'');
  async function callback(url,{error=null,throwNetwork=false}={}){
    const calls=[];
    const auth={verifyOtp:async args=>{calls.push(['otp',args]);if(throwNetwork)throw new Error('offline');return {data:{session:{user:{id:'fixture'}}},error}},
      exchangeCodeForSession:async code=>{calls.push(['pkce',code]);return {data:{redirectType:'recovery'},error}}};
    const ctx=vm.createContext({URL,URLSearchParams,location:{href:url,origin:'https://saldo.tobmarket.ing'},history:{replaceState:(...args)=>calls.push(['clean',args[2]])},
      window:{supabase:{createClient:()=>({auth})}},supabaseUrl:'https://fixture.supabase.co',supabaseKey:'fixture',termsVersion:'fixture',sessionStorage:{}});
    vm.runInContext(source+'\nglobalThis.complete=completeAuthCallback;',ctx);
    return {result:await ctx.complete(),calls};
  }
  for(const type of ['signup','recovery']){
    const {result,calls}=await callback(`https://saldo.tobmarket.ing/?token_hash=fixture-hash&type=${type}`);
    assert.equal(result.recovery,type==='recovery');
    assert.equal(calls[0][0],'clean');
    assert.equal(calls[1][1].type,type);
  }
  for(const code of ['otp_expired','access_denied']){
    const {result}=await callback('https://saldo.tobmarket.ing/?token_hash=fixture-hash&type=recovery',{error:{code}});
    assert.ok(!result.recovery);assert.match(result.message,/失效/);
  }
  for(const tail of ['?error=access_denied','#error=access_denied']){
    const {result,calls}=await callback('https://saldo.tobmarket.ing/'+tail);
    assert.match(result.message,/失效|取消/);assert.equal(calls.length,1);
  }
  let outcome=await callback('https://saldo.tobmarket.ing/?token_hash=fixture&type=invalid');
  assert.equal(outcome.calls.length,1);assert.match(outcome.result.message,/无效/);
  outcome=await callback('https://saldo.tobmarket.ing/?code=fixture&type=recovery');
  assert.equal(outcome.result.recovery,true);assert.equal(outcome.calls[1][0],'pkce');
  outcome=await callback('https://saldo.tobmarket.ing/');assert.equal(outcome.calls.length,0);
  console.log('PASS: 13 branded templates/artifacts; current signup/recovery variables; security copy; config patch scope, drift and secret redaction; callback success/expired/reused/cancelled/invalid/PKCE/isolation. Real SMTP and delivered email journeys remain separate acceptance.');
})().catch(error=>{console.error(error);process.exitCode=1});
