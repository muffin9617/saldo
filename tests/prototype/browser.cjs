const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require(process.env.SALDO_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.SALDO_PROTOTYPE_URL||'http://127.0.0.1:4177';
const key='saldo.prototype.a01-a07.v1';
const shots='/private/tmp/saldo-prototype-shots';
let runningBrowser;
(async()=>{
  const browser=await chromium.launch({headless:true});
  runningBrowser=browser;
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Hong_Kong'});
  const errors=[],external=[];
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  await context.route('**/*',r=>{if(new URL(r.request().url()).origin===base)return r.continue();external.push(r.request().url());return r.abort();});
  const page=await context.newPage();
  const state=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  const get=async id=>(await state()).records.find(r=>r.id===id);
  async function open(id){await page.goto(base+'/?view=cards&record='+id);await page.locator('.detail-title h2').waitFor();await page.waitForTimeout(230);}
  async function operation(kind,values){await page.locator(`[data-operation="${kind}"]`).click();await page.locator('#operation-form').waitFor();for(const [name,value]of Object.entries(values))await page.locator(`#operation-form [name="${name}"]`).fill(String(value));}
  async function submitOperation(){await page.locator('#operation-form [type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);await page.waitForTimeout(230);}
  async function confirm(){await page.locator('#modal [data-confirm]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);await page.waitForTimeout(230);}
  async function clickUndo(){await page.locator('[data-undo]').click();}
  async function cancelDirty(){await page.locator('#modal [data-action="close-modal"]').click();await page.locator('[data-discard-dialog] [data-discard]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);}
  await page.goto(base);await page.locator('main .asset-wallet').waitFor();
  assert.deepEqual(await page.locator('.nav button span').allTextContents(),['首页','储值','订阅','我的']);
  assert.ok(!(await page.locator('main').innerText()).includes('最近记录'));
  assert.ok(!(await page.locator('main').innerText()).includes('需要关注'));
  assert.ok((await page.locator('.home-equivalent strong').innerText()).includes('296.67'));
  assert.ok(await page.locator('.home-next-date').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>parseFloat(getComputedStyle(document.querySelector('.home-equivalent strong')).fontSize)),'Home subscription expiry must outrank cost');
  assert.ok((await page.locator('.home-rights').innerText()).includes('10 次'));
  assert.ok((await page.locator('.wallet .balance').innerText()).includes('1,080.00'));
  const legacy=structuredClone((await state()).records.find(r=>r.id==='legacy'));

  // Money stored-value is a brand/date/recharge flow with one amount by default.
  await page.locator('header [data-action=add]').click();
  assert.equal(await page.locator('[data-stored-kind=money]').getAttribute('aria-pressed'),'true');
  assert.ok(!(await page.locator('main').innerText()).includes('从哪里开始记录'));assert.equal(await page.locator('[name=entryMode],[name=legacyStored],[name=unknownCost],[name=ent-current]').count(),0);
  await page.locator('#f-name').fill('演算咖啡 · 充值 200');await page.locator('#f-paid').fill('200');
  assert.equal(await page.locator('[name=ent-amount]').inputValue(),'200');
  await page.locator('#record-form [type=submit]').click();await page.locator('.holdings').waitFor();
  let moneyState=await state(),moneyCard=moneyState.records.find(r=>r.name==='演算咖啡 · 充值 200'),moneyEnt=moneyCard.entitlements[0].id;
  assert.equal(moneyCard.entitlements[0].remaining,20000);assert.equal(moneyState.events.find(e=>e.recordId===moneyCard.id).paid,20000);
  assert.equal(await page.locator('[data-operation=use] > span').innerText(),'记录消费');assert.equal(await page.locator('[data-operation=adjust] > span').innerText(),'手动更新余额');
  await operation('use',{['value-'+moneyEnt]:35});await submitOperation();assert.equal((await get(moneyCard.id)).entitlements[0].remaining,16500);
  await operation('adjust',{['value-'+moneyEnt]:130});await submitOperation();assert.equal((await get(moneyCard.id)).entitlements[0].remaining,13000);assert.match(await page.locator('.record-totals').innerText(),/已记录消费[\s\S]*¥35.00/);
  await operation('topup',{paid:100});assert.equal(await page.locator(`[name="value-${moneyEnt}"]`).inputValue(),'100');await submitOperation();assert.equal((await get(moneyCard.id)).entitlements[0].remaining,23000);assert.match(await page.locator('.cost-line strong').innerText(),/300.00/);
  await page.locator('.nav [data-page="储值卡"]').click();

  // New purchase records money paid and quantity rights simultaneously.
  await page.locator('header [data-action=add]').click();
  await page.locator('[data-stored-kind=quantity]').click();await page.locator('#f-name').fill('演算 SPA · 2000 元 10 次');
  const first=page.locator('[data-entitlement]').first();
  await first.locator('[name=ent-name]').fill('身体护理');await first.locator('[name=ent-amount]').fill('10');
  await page.locator('#record-form [type=submit]').click();
  assert.ok(await page.locator('#record-form .form-error').innerText());
  await page.locator('#f-paid').fill('2000');await page.locator('#record-form [type=submit]').click();await page.locator('.detail-title h2').waitFor();
  let s=await state(),created=s.records.find(r=>r.name==='演算 SPA · 2000 元 10 次'),id=created.id;
  assert.equal(created.entitlements.length,1);assert.equal(created.entitlements[0].kind,'quantity');
  assert.equal(created.entitlements[0].remaining,1000);assert.equal(s.events.find(e=>e.recordId===id).paid,200000);
  assert.equal(await page.locator('.card-profile [data-action=edit]').count(),1);
  assert.equal(await page.locator('.card-profile [data-action=archive]').count(),0);
  assert.equal(await page.locator('.card-profile [data-operation]').count(),0);
  assert.equal(await page.locator('.balance-management [data-action=edit], .balance-management [data-action=archive]').count(),0);
  assert.equal(await page.locator('.balance-management [data-operation]').count(),3);
  assert.deepEqual(await page.locator('.intent-actions [data-operation]').evaluateAll(nodes=>nodes.map(n=>n.dataset.operation)),['use','topup']);
  assert.equal(await page.locator('.result-maintenance [data-operation=adjust]').count(),1);
  assert.equal(await page.locator('.card-profile .detail-head .edit-link[data-action=edit]').count(),1);
  assert.equal(await page.locator('.card-profile details, .record-history details').count(),0);assert.ok(await page.locator('.record-history .event-list').isVisible());
  await operation('use',{['value-'+created.entitlements[0].id]:1});await submitOperation();
  assert.equal((await get(id)).entitlements[0].remaining,900);
  assert.ok((await page.locator('.cost-line strong').innerText()).includes('2,000.00'));
  assert.ok((await page.locator('.record-totals').innerText()).replace(/\s+/g,' ').includes('已记录使用 1 次'));
  await operation('use',{['value-'+created.entitlements[0].id]:99});await page.locator('#operation-form [type=submit]').click();
  assert.match(await page.locator('#operation-form .form-error').innerText(),/不足/);
  assert.equal((await get(id)).entitlements[0].remaining,900);await cancelDirty();
  await clickUndo();await confirm();assert.equal((await get(id)).entitlements[0].remaining,1000);
  assert.ok((await page.locator('.record-totals').innerText()).replace(/\s+/g,' ').includes('已记录使用 0 次'));
  await operation('topup',{paid:500,['value-'+created.entitlements[0].id]:2});await submitOperation();
  assert.equal((await get(id)).entitlements[0].remaining,1200);assert.match(await page.locator('.cost-line strong').innerText(),/2,500/);
  await clickUndo();await confirm();assert.match(await page.locator('.cost-line strong').innerText(),/2,000/);

  // One purchase can include both a money balance and service units.
  await page.locator('.nav [data-page="储值卡"]').click();await page.locator('header [data-action=add]').click();
  await page.locator('[data-stored-kind=quantity]').click();await page.locator('#f-name').fill('新组合套餐');await page.locator('#f-paid').fill('2000');
  await page.locator('[data-entitlement]').first().locator('[name=ent-name]').fill('护理');await page.locator('[data-entitlement]').first().locator('[name=ent-amount]').fill('5');
  await page.locator('.extra-entitlements summary').click();await page.locator('[data-action=add-entitlement]').click();const second=page.locator('[data-entitlement]').last();
  await second.locator('[name=ent-kind]').selectOption('money');await second.locator('[name=ent-name]').fill('门店余额');await second.locator('[name=ent-amount]').fill('500');
  await page.locator('#record-form [type=submit]').click();await page.locator('.holdings').waitFor();
  s=await state();const combo=s.records.find(r=>r.name==='新组合套餐');assert.equal(combo.entitlements.length,2);assert.equal(s.events.find(e=>e.recordId===combo.id).paid,200000);
  await operation('use',{['value-'+combo.entitlements[0].id]:1,['value-'+combo.entitlements[1].id]:50});await submitOperation();
  assert.deepEqual((await get(combo.id)).entitlements.map(e=>e.remaining),[400,45000]);
  await operation('adjust',{['value-'+combo.entitlements[0].id]:6});await submitOperation();assert.equal((await get(combo.id)).entitlements[0].remaining,600);assert.match(await page.locator('.cost-line strong').innerText(),/2,000/);

  // A renewal is explicit; fee estimate and actual paid amounts remain separate.
  await open('cloud');const cloudBefore=await get('cloud');
  await operation('renew',{paid:1000});const nextDate=await page.locator('#f-nextDate').inputValue();
  await page.locator('[name=updateFee]').check();await submitOperation();
  assert.equal((await get('cloud')).expires,nextDate);assert.equal((await get('cloud')).fee,100000);
  await clickUndo();await confirm();assert.equal((await get('cloud')).expires,cloudBefore.expires);assert.equal((await get('cloud')).fee,cloudBefore.fee);
  await open('unclear');await page.locator('[data-action=edit]').click();assert.equal(await page.locator('#f-cycleUnit').inputValue(),'unknown');
  await page.locator('#f-note').fill('保留模糊周期，仅更新备注');await page.locator('#record-form [type=submit]').click();await page.locator('.detail-title h2').waitFor();assert.equal((await get('unclear')).cycle,null);
  assert.deepEqual(await get('legacy'),legacy);

  // Unknown balance is not assumed zero and cannot be spent until calibrated.
  await open('unknown-balance');await operation('use',{'value-unknown-money':1});await page.locator('#operation-form [type=submit]').click();assert.match(await page.locator('#operation-form .form-error').innerText(),/未知/);assert.equal((await get('unknown-balance')).entitlements[0].remaining,null);await cancelDirty();

  // Editing an existing unknown record never creates a purchase or a second card.
  await open('unknown-balance');const beforeEdit=await state();await page.locator('[data-action=edit]').click();
  assert.equal(await page.locator('[name=paid]').count(),0);await page.locator('#f-note').fill('只修改当前记录备注');await page.locator('#record-form [type=submit]').click();await page.locator('.holdings').waitFor();
  const afterEdit=await state();assert.equal(afterEdit.records.length,beforeEdit.records.length);assert.equal(afterEdit.events.length,beforeEdit.events.length);assert.equal((await get('unknown-balance')).entitlements[0].remaining,null);
  await page.locator('.nav [data-page="订阅"]').click();await page.locator('header [data-action=add]').click();await page.locator('#f-name').fill('首购优惠年费会员');await page.locator('#f-paid').fill('1000');await page.locator('#f-fee').fill('1200');await page.locator('#f-cycleUnit').selectOption('year');
  const future=await page.evaluate(async()=>{const m=await import('/model.mjs');return m.addCycle(m.today(),{unit:'year',value:1});});await page.locator('#f-expires').fill(future);await page.locator('#record-form [type=submit]').click();await page.locator('.detail-title h2').waitFor();s=await state();const subscription=s.records.find(r=>r.name==='首购优惠年费会员');assert.equal(subscription.fee,120000);assert.equal(s.events.find(e=>e.recordId===subscription.id).paid,100000);

  // Draft protection is shared by cancel and native Back.
  await open('spa');await page.locator('[data-action=edit]').click();await page.locator('#f-name').fill('未保存的名称');await page.locator('[data-action=cancel-edit]').click();
  await page.locator('[data-discard-dialog] [data-stay]').click();assert.equal(await page.locator('#f-name').inputValue(),'未保存的名称');await page.locator('[data-action=cancel-edit]').click();await page.locator('[data-discard-dialog] [data-discard]').click();await page.locator('.detail-title h2').waitFor();assert.equal((await get('spa')).name,'木间 SPA');
  await operation('use',{'value-spa-body':1});await page.goBack();await page.locator('[data-discard-dialog]').waitFor();await page.locator('[data-discard-dialog] [data-stay]').click();assert.equal(await page.locator('[name="value-spa-body"]').inputValue(),'1');await cancelDirty();

  // Storage failure leaves the draft and state intact.
  await operation('use',{'value-spa-body':1});
  await page.evaluate(()=>{window.originalStorageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new Error('quota test');};});
  await page.locator('#operation-form [type=submit]').click();assert.match(await page.locator('#operation-form .form-error').innerText(),/存储失败/);assert.equal((await get('spa')).entitlements[0].remaining,1000);
  await page.evaluate(()=>{Storage.prototype.setItem=window.originalStorageSet;});await cancelDirty();

  // Reload retains operations, and archival preserves financial history.
  await page.reload();await page.locator('.detail-title h2').waitFor();assert.equal((await get(combo.id)).entitlements[0].remaining,600);
  await page.locator('[data-action=edit]').click();await page.locator('#f-note').fill('删除前未保存的草稿');await page.locator('[data-action=archive]').click();await page.locator('#modal [data-action=close-modal]').click();assert.equal(await page.locator('#f-note').inputValue(),'删除前未保存的草稿');await page.locator('[data-action=archive]').click();assert.match(await page.locator('#modal').innerText(),/未保存的修改将被放弃/);await confirm();assert.equal((await get('spa')).archived,true);
  await page.locator('[data-action=restore]').click();assert.equal((await get('spa')).archived,false);

  // Layouts and strict local-only network boundary.
  await fs.mkdir(shots,{recursive:true});
  for(const width of [320,390,1024]){
    await page.setViewportSize({width,height:900});await page.goto(base);await page.waitForTimeout(250);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'home width '+width);
    if(width===390)await page.screenshot({path:shots+'/home-final.png',fullPage:true});
    await page.locator('.nav [data-page="储值卡"]').click();await page.waitForTimeout(250);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'list width '+width);
    assert.ok(await page.locator('.stored-record .entitlement-summary strong').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>parseFloat(getComputedStyle(el.closest('.record-card').querySelector('.record-card-name strong')).fontSize)),'Stored rights must outrank card name');
    if(width===390)await page.screenshot({path:shots+'/stored-final.png',fullPage:true});
    await page.locator('[data-open="combo"]').click();await page.waitForTimeout(250);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'detail width '+width);
    if(width===390)await page.screenshot({path:shots+'/combo-final.png',fullPage:true});
    await page.locator('[data-operation=topup]').click();await page.waitForTimeout(250);assert.ok(await page.locator('#modal').evaluate(d=>d.scrollWidth<=d.clientWidth+1),'dialog width '+width);
    await page.locator('#modal [data-action=close-modal]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
    await page.locator('.nav [data-page="订阅"]').click();await page.waitForTimeout(250);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'subscription width '+width);
    assert.equal(await page.locator('.subscription-statistics').count(),0);
    assert.ok(await page.locator('.subscription-due-date').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>parseFloat(getComputedStyle(el.closest('.record-card').querySelector('.subscription-fee')).fontSize)),'Subscription due date must outrank fee');
    if(width===390)await page.screenshot({path:shots+'/subscriptions-final.png',fullPage:true});
    await page.locator('[data-open="unclear"]').click();await page.waitForTimeout(230);
    assert.ok(await page.locator('.profile-facts,.profile-note').evaluateAll(rows=>rows.every(row=>Math.abs(row.children[0].getBoundingClientRect().top-row.children[1].getBoundingClientRect().top)<1)),'Icon labels and values must align');assert.equal(await page.locator('.subscription-profile .edit-link').count(),1);assert.equal(await page.locator('main [data-action=archive]').count(),0);
    assert.equal(await page.locator('.subscription-management [data-operation=renew]').count(),1);assert.ok(await page.locator('.display-date').isVisible());
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'subscription detail width '+width);
    if(width===390)await page.screenshot({path:shots+'/subscription-detail-final.png',fullPage:true});
    await page.locator('[data-action=edit]').click();assert.equal(await page.locator('.card-edit-footer [data-action=archive]').innerText(),'删除订阅');
    await page.locator('[data-action=cancel-edit]').click();await page.locator('.nav [data-page="订阅"]').click();

    await page.locator('header [data-action=add]').click();await page.locator('#f-name').fill('极长名称'.repeat(20));await page.locator('#f-paid').fill('90000000000');await page.locator('#f-fee').fill('90000000000');await page.waitForTimeout(100);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'edit width '+width);
    await page.locator('[data-action=cancel-edit]').click();await page.locator('[data-discard-dialog] [data-discard]').click();
    await page.locator('.nav [data-page="储值卡"]').click();await page.locator('header [data-action=add]').click();await page.locator('#f-name').fill('巷口咖啡');await page.locator('#f-paid').fill('200');await page.waitForTimeout(240);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'money creation width '+width);if(width===390)await page.screenshot({path:shots+'/money-create-final.png',fullPage:true});
    await page.locator('[data-stored-kind=quantity]').click();await page.locator('#f-name').fill('木间 SPA');await page.locator('#f-paid').fill('2000');await page.locator('[name=ent-name]').fill('身体护理');await page.locator('[name=ent-amount]').fill('10');await page.waitForTimeout(240);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'quantity creation width '+width);if(width===390)await page.screenshot({path:shots+'/quantity-create-final.png',fullPage:true});
    await page.locator('[data-action=cancel-edit]').click();await page.locator('[data-discard-dialog] [data-discard]').click();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  await browser.close();console.log('PASS local prototype browser: paid+quantity/combined creation, use/topup/adjust/undo, renewal, unknown/legacy, persistence, draft/native Back guards, storage failure, archive/restore, 320/390/1024 layouts and zero external requests.');
})().catch(async e=>{console.error(e);await runningBrowser?.close();process.exitCode=1});
