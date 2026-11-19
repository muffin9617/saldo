const assert = require('node:assert/strict');
const fs = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');

(async () => {
  const reminders = await import('file://' + process.cwd() + '/supabase/functions/saldo-notifications/reminders.js');
  const { reminderEmail } = await import('file://' + process.cwd() + '/supabase/functions/saldo-notifications/email-templates.js');
  const sub = {id:'sub', user_id:'user', name:'Fixture',expires_on:'2026-11-19',archived_at:null,cycle_months:1,reminder_days:null};
  const prefs = {time_zone:'Asia/Hong_Kong',push_enabled:true,email_enabled:true,user_id:'user',id:'prefs'};
  assert.equal(reminders.reminderOffset(sub,prefs,new Date('2026-11-18T10:00Z')),1);
  assert.equal(reminders.reminderOffset({...sub,reminder_days:[]},prefs,new Date('2026-11-18T10:00Z')),null);
  assert.equal(reminders.reminderOffset({...sub,archived_at:'now'},prefs,new Date('2026-11-18T10:00Z')),null);
  assert.equal(reminders.reminderOffset({...sub,expires_on:'2026-11-18'}, {...prefs,time_zone:'America/Los_Angeles'},new Date('2026-11-18T01:00Z')),1);
  const checkAt = new Date('2026-11-19T01:00:00Z');
  for (const day of [0,1,3,7,14,30]) {
    const date = new Date('2026-11-19T00:00:00Z');
    date.setUTCDate(date.getUTCDate()+day);
    assert.equal(reminders.reminderOffset({...sub,expires_on:date.toISOString().slice(0,10),reminder_days:[day]},prefs,checkAt),day);
  }
  assert.equal(reminders.reminderOffset({...sub,expires_on:'2026-11-22'},prefs,checkAt),3);
  assert.equal(reminders.reminderOffset({...sub,expires_on:'2026-12-19',cycle_months:12},prefs,checkAt),30);
  assert.equal(reminders.reminderOffset({...sub,expires_on:'2026-11-26',cycle_months:3},prefs,checkAt),7);
  assert.equal(reminders.reminderOffset({...sub,expires_on:'2026-11-21'},prefs,checkAt),null);
  assert.equal(reminders.reminderOffset({...sub,expires_on:null},prefs,checkAt),null);
  assert.equal(reminders.reminderOffset({...sub,expires_on:'2026-11-18'},prefs,checkAt),null);
  assert.equal(reminders.reminderOffset({...sub,expires_on:'2026-11-20'},prefs,new Date('2026-11-19T15:59:59Z')),1);
  assert.equal(reminders.reminderOffset({...sub,expires_on:'2026-11-20'},prefs,new Date('2026-11-19T16:00:00Z')),null);
  assert.ok(reminders.pushEndpointAllowed('https://web.push.apple.com/push'));
  assert.equal(reminders.pushEndpointAllowed('https://webXpushXappleXcom/push'),false);
  assert.equal(reminders.pushEndpointAllowed('https://127.0.0.1/push'),false);
  assert.equal(reminders.pushEndpointAllowed('https://fcm.googleapis.com:8443/push'),false);

  const settings = {
    SUPABASE_URL:'https://local.example',SUPABASE_SERVICE_ROLE_KEY:'test-only',
    SALDO_NOTIFICATIONS_SCHEDULED:'true',VAPID_PUBLIC_KEY:'public-test',
    VAPID_PRIVATE_KEY:'private-test',VAPID_SUBJECT:'https://example.test',
    RESEND_API_KEY:'test-only',SALDO_FROM_EMAIL:'Saldo <noreply@example.test>',
    SALDO_REMINDER_TOKEN:'cron-test',
  };
  const offsetDate = new Date();
  offsetDate.setUTCDate(offsetDate.getUTCDate()+1);
  sub.expires_on = offsetDate.toISOString().slice(0,10);
  prefs.time_zone = 'UTC';
  const device={id:'device',user_id:'user',endpoint:'https://web.push.apple.com/push',p256dh:'key',auth:'key'};
  const tables={saldo_subscriptions:[sub],saldo_notification_preferences:[prefs],saldo_push_devices:[device]};
  const leases=new Map();
  let sentEmails=0,sentPush=0,handler;
  const pushOptions=[];
  function from(table) {
    const filters=[];
    let change;
    const query={
      select:()=>query,
      order:key=>{assert.equal(key,table==='saldo_notification_preferences'?'user_id':'id');return query},
      is:()=>query,
      not:()=>query,
      or:()=>query,
      eq(k,v){filters.push([k,v]);return query},
      update(v){change=v;return query},
      delete(){return query},
      range:async()=>({data:tables[table]??[]}),
      single:async()=>({data:tables[table][0]}),
      maybeSingle:async()=>({data:(tables[table]??[]).find(row=>filters.every(([key,value])=>row[key]===value))??null}),
      then(resolve,reject) {
        const id=filters.find(([k])=>k==='id')?.[1];
        if(change&&table==='saldo_notification_deliveries') for(const row of leases.values()) if(row.id===id) Object.assign(row,change);
        return Promise.resolve({data:null}).then(resolve,reject);
      },
    };
    return query;
  }
  const client={from,auth:{
    getUser:async token=>token==='user-test'?{data:{user:{id:'user'}}}:{data:{user:null},error:true},
    admin:{getUserById:async()=>({data:{user:{email_confirmed_at:'now',email:'fixture@example.test'}}})},
  },rpc:async(name,args)=>{
    if(!prefs[args.p_channel+'_enabled']) return {data:null};
    const key=JSON.stringify([args.p_subscription_id,args.p_expires_on,args.p_reminder_day,args.p_channel,args.p_destination]);
    if(leases.has(key)) return {data:null};
    const row={id:crypto.randomUUID()};
    leases.set(key,row);
    return {data:row.id};
  }};
  const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/saldo-notifications/index.ts','utf8')
    .replace(/^import .*;$/gm,''),{mode:'strip'});
  new Function('createClient','webpush','pushEndpointAllowed','reminderOffset','reminderText','reminderEmail','Deno','fetch',source)(
    ()=>client,{sendNotification:async(subscription,payload,options)=>{sentPush++;pushOptions.push(options);return {statusCode:201}}},
    reminders.pushEndpointAllowed,reminders.reminderOffset,reminders.reminderText,
    reminderEmail,
    {env:{get:name=>settings[name]},serve:fn=>{handler=fn}},
    async(url,options)=>{const mail=JSON.parse(options.body);assert.match(mail.html,/<!doctype html>/);assert.match(mail.html,/email-logo\.png/);assert.ok(mail.text);sentEmails++;return new Response('{}',{status:200})},
  );
  const invoke=(action,token)=>handler(new Request('https://local.example',{method:'POST',headers:{authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(typeof action==='string'?{action}:action)}));
  assert.equal((await invoke('status','bad')).status,401);
  assert.equal((await invoke('diagnostics','bad')).status,401);
  const diagnosis = await (await invoke('diagnostics','cron-test')).json();
  assert.equal(diagnosis.email_configured,true);
  assert.equal(diagnosis.push_configured,true);
  assert.equal(sentEmails,0);assert.equal(sentPush,0);
  assert.deepEqual(await (await invoke('status','user-test')).json(),{push_ready:true,email_ready:true,scheduled:true,vapid_public_key:'public-test'});
  assert.equal((await invoke('dispatch','user-test')).status,401);
  assert.deepEqual(await (await invoke('dispatch','cron-test')).json(),{sent:2,failed:0});
  assert.deepEqual(await (await invoke('dispatch','cron-test')).json(),{sent:0,failed:0});
  assert.equal(sentEmails,1);assert.equal(sentPush,1);
  prefs.email_enabled=false;prefs.push_enabled=false;
  leases.clear();
  assert.deepEqual(await (await invoke('dispatch','cron-test')).json(),{sent:0,failed:0});
  assert.equal(sentEmails,1);assert.equal(sentPush,1);
  settings.SALDO_NOTIFICATIONS_SCHEDULED='false';
  assert.deepEqual(await (await invoke('status','user-test')).json(),{push_ready:true,email_ready:true,scheduled:false,vapid_public_key:'public-test'});
  assert.equal((await invoke('dispatch','cron-test')).status,503);
  const testPush={action:'test-push',user_id:'00000000-0000-0000-0000-000000000001',device_id:'00000000-0000-0000-0000-000000000002'};
  device.id=testPush.device_id; device.user_id=testPush.user_id; prefs.user_id=testPush.user_id;
  assert.equal((await invoke(testPush,'user-test')).status,401);
  assert.equal((await invoke({...testPush,user_id:'00000000-0000-0000-0000-000000000003'},'cron-test')).status,404);
  assert.equal((await invoke({action:'test-push'},'cron-test')).status,400);
  assert.equal((await invoke(testPush,'cron-test')).status,409);
  prefs.push_enabled=true;
  const pushBefore=sentPush,emailBefore=sentEmails;
  assert.deepEqual(await (await invoke(testPush,'cron-test')).json(),{accepted:true,channel:'push',provider_status:201});
  assert.equal(pushOptions[0].urgency,'normal');
  assert.equal(pushOptions.at(-1).urgency,'high');
  assert.equal(sentPush,pushBefore+1);assert.equal(sentEmails,emailBefore);
  assert.equal((await invoke('dispatch','cron-test')).status,503);
  tables.saldo_push_devices=[];
  assert.equal((await invoke(testPush,'cron-test')).status,404);
  console.log('Passed local reminder date/time-zone rules, closed/archived reminders, endpoint security, status auth, cron auth, email/push selection, repeated delivery suppression and full opt-out.');
})().catch(error=>{console.error(error);process.exitCode=1;});
