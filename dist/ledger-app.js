import {brandLogoMarkup,installBrandLogos} from './brand-logos.js';
import {activateLedgerStyles,deactivateLedgerStyles} from './ledger-styles.js';
import * as M from './ledger-model.js';
import {saveLedger} from './ledger-store.js';
import {appVersion,settingsRow} from './settings-ui.js';
import {loadNotificationPreferences,registeredPushDevice,browserPushStatus,detachPushDevice} from './notifications.js';
import {createHistoryNavigation} from './navigation.js';
import {installSwipeNavigation,confirmDiscardChanges} from './gestures.js';

export function mountLedger({client,session,initial}){
const controller=new AbortController(),signal=controller.signal;
const $=s=>document.querySelector(s), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let writing=false,disposed=false;
activateLedgerStyles();
document.body.classList.add('ledger-active');
let state,loadError='',route={page:'总览',selected:null,type:'cards',myView:'',creating:false,modal:0},draft=null,dirty=false,modalDirty=false,period='month',query='',sort='date',filter='all';
const tabs=[['总览','首页','home'],['储值卡','储值','card'],['订阅','订阅','calendar'],['我的','我的','user']],modalCache=new Map(),scrollPositions=new Map();
const paths={home:'<path d="m3 10 9-7 9 7v10H3Z M9 20v-7h6v7"/>',card:'<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6M17 2v6M3 11h18"/>',user:'<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',plus:'<path d="M12 5v14M5 12h14"/>',back:'<path d="m14 6-6 6 6 6"/>',arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',check:'<path d="m5 12 4 4 10-10"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'};
Object.assign(paths,{edit:'<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14Z"/>',fee:'<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="12" cy="12" r="3"/><path d="M6 12h1m10 0h1"/>',note:'<path d="M5 3h14v18H5ZM8 8h8M8 12h8M8 16h5"/>',renew:'<path d="M20 8a8 8 0 0 0-14-2L3 9m0-5v5h5M4 16a8 8 0 0 0 14 2l3-3m0 5v-5h-5"/>',credit:'<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',debit:'<path d="M12 15V3m-4 4 4-4 4 4M4 17v4h16v-4"/>',adjust:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--bg,#211c16)"/><circle cx="15" cy="17" r="3" fill="var(--bg,#211c16)"/>'});
const icon=n=>`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[n]||paths.card}</svg>`;
const amount=n=>n===null?'未记录':M.money(n);
const number=n=>esc(M.inputNumber(n));
const active=kind=>state.records.filter(r=>!r.archived&&(!kind||r.kind===kind));
const record=()=>state.records.find(r=>r.id===route.selected);
const balanceText=e=>e.remaining===null?'未记录':e.kind==='money'?M.money(e.remaining):M.quantity(e.remaining)+' '+e.unit;
const dateLabel=d=>!d?'日期未填写':M.daysUntil(d)<0?'已到期，待确认':M.daysUntil(d)===0?'今天到期':`还有 ${M.daysUntil(d)} 天`;
const typeLabel=r=>r.kind==='subscription'?'订阅':r.entitlements.some(e=>e.kind==='money')&&r.entitlements.some(e=>e.kind==='quantity')?'组合权益':r.entitlements.some(e=>e.kind==='quantity')?'次数权益':'金额储值';
const storedMode=r=>r.entitlements.every(e=>e.kind==='money')?'money':r.entitlements.every(e=>e.kind==='quantity')?'quantity':'combined';
const operationTitle=(r,type)=>type==='renew'?'记录一次续费':type==='use'?(storedMode(r)==='money'?'记录消费':storedMode(r)==='quantity'?'记录使用':'记录消费／使用'):type==='adjust'?(storedMode(r)==='money'?'手动更新余额':storedMode(r)==='quantity'?'手动更新权益':'手动更新余额／权益'):(storedMode(r)==='money'?'记录充值':storedMode(r)==='quantity'?'记录购买':'记录储值');
const eventTitle=(r,e)=>r.kind!=='stored'?({purchase:'首次购买',renew:'续费'}[e.type]||names[e.type]||e.type):e.type==='purchase'?(storedMode(r)==='money'?'首次充值':'首次购买'):e.type==='use'?(storedMode(r)==='money'?'余额消费':'权益使用'):e.type==='adjust'?(storedMode(r)==='money'?'余额更新':'剩余数量更新'):e.type==='topup'?(storedMode(r)==='money'?'再次充值':'再次购买'):names[e.type]||e.type;
const names={purchase:'首次购买',opening:'录入已有记录',legacy:'原始余额快照',topup:'增加储值',use:'使用权益',adjust:'校准记录',renew:'记录续费'};
state=initial;
async function commit(next){
 if(writing||disposed)throw Error('正在保存，请稍候。');
 if(!navigator.onLine)throw Error('当前离线，尚未保存。请联网后重试。');
 writing=true;document.querySelector('#app')?.setAttribute('aria-busy','true');
 try{const fresh=await saveLedger(client,session.user.id,state,next);if(disposed)throw Error('账号已切换，请重新打开。');state=fresh;}finally{writing=false;document.querySelector('#app')?.removeAttribute('aria-busy');}
}
let toastTimer;
function toast(message){clearTimeout(toastTimer);let n=$('.toast');n?.remove();n=document.createElement('div');n.className='toast';n.setAttribute('role','status');n.textContent=message;document.body.append(n);toastTimer=setTimeout(()=>n.remove(),4200);}
function confirmLeave(){if(writing){toast('正在保存，请稍候。');return Promise.resolve(false);}return new Promise(resolve=>confirmDiscardChanges(()=>{dirty=false;modalDirty=false;resolve(true);},{onStay:()=>resolve(false)}));}
function needsGuard(from,to){return writing||(dirty&&(from.selected!==to.selected||from.editing!==to.editing||from.type!==to.type||from.page!==to.page||from.creating!==to.creating))||(modalDirty&&from.modal!==to.modal);}
const nav=createHistoryNavigation({apply,needsGuard,confirmLeave,signal});
async function go(next,{replace=false}={}){next={...route,...next};if(needsGuard(route,next)&&!await confirmLeave())return false;replace?nav.replace(next):nav.push(next);apply(next,route);return true;}
function apply(next,previous){
  const previousY=window.scrollY,key=r=>r.selected?'record:'+r.selected:r.page;
  const onlyModal=previous&&next.selected===previous.selected&&next.page===previous.page&&next.editing===previous.editing&&next.creating===previous.creating&&next.modal!==previous.modal;
  if(previous&&!onlyModal&&!previous.editing&&!previous.creating)scrollPositions.set(key(previous),previousY);
  if(next.modal&& !modalCache.has(next.modal)){next={...next,modal:0};nav.replace(next);}
  if(!next.modal){if($('#modal').open)$('#modal').close();$('#modal').replaceChildren();modalDirty=false;}
  if(!onlyModal){draft=null;dirty=false;}
  route={...next};if(!onlyModal||(!route.modal&&!route.editing&&!route.creating))render();
  requestAnimationFrame(()=>window.scrollTo(0,onlyModal?previousY:(route.editing||route.creating)?0:(scrollPositions.get(key(route))||0)));
  if(route.modal)mountModal(modalCache.get(route.modal));
}
const base=page=>({page,selected:null,type:page==='订阅'?'subs':'cards',myView:'',creating:false,editing:false,modal:0});
async function back(){nav.back(()=>void go(base(route.page),{replace:true}));}
function openRecord(id){const r=state.records.find(r=>r.id===id);if(r)void go({...base(r.kind==='stored'?'储值卡':'订阅'),selected:id});}
function add(kind){void go({...base(kind==='stored'?'储值卡':'订阅'),creating:true,editing:true,type:kind==='stored'?'cards':'subs',selected:null});}
function smallInfo(label,value){return `<div class="info"><span>${label}</span><span>${value}</span></div>`;}
function empty(message,label,action){return `<div class="empty-state">${icon('card')}<p>${message}</p><button class="empty-cta" ${action}>${label}</button></div>`;}
function header(title='',child=false){return `<header><h1><button class="brand-home" data-page="总览" aria-label="Saldo 首页">Saldo</button></h1>${title?`<span class="page-context">${title}</span>`:''}${child?`<button class="back-control" data-action="back" aria-label="返回上一页">${icon('back')}</button>`:route.page==='我的'?'<span></span>':`<button class="round" data-action="add" aria-label="添加记录">${icon('plus')}</button>`}</header>`;}
function homeMarkup(){
  const s=M.summary(state,{period}),due=M.upcoming(state);
  const dated=active('subscription').filter(r=>r.expires).sort((a,b)=>a.expires.localeCompare(b.expires));
  const next=dated.find(r=>M.daysUntil(r.expires)>=0)||dated.at(-1);
  const hasMoney=active('stored').some(r=>r.entitlements.some(e=>e.kind==='money'));
  const rights=active('stored').flatMap(r=>r.entitlements.filter(e=>e.kind==='quantity').map(e=>({record:r,entitlement:e})));
  return `<div class="intro-line"><span class="eyebrow">你的资产与服务</span><span class="muted">${M.today()}</span></div>
  <section aria-label="持有概况"><button class="wallet asset-wallet ${hasMoney?'':'rights-only'}" data-page="储值卡"><span class="wallet-top"><span>${icon('card')} ${hasMoney?'储值余额':'剩余权益'}</span><span>${s.storedCount} 项储值 ${icon('arrow')}</span></span>${hasMoney?`<span class="balance main-money ${s.balance===null?'unknown-balance':''}">${s.balance===null?'余额待补充':esc(M.money(s.balance))}</span><span class="wallet-caption">已记录金额余额 · CNY${s.unknownBalances?` · ${s.unknownBalances} 项余额未知`:''}</span>`:''}${rights.length?`<span class="wallet-divider"></span><span class="wallet-bottom"><span>剩余次数与课时</span><span class="muted">${rights.length} 项权益</span></span><span class="home-rights">${rights.slice(0,3).map(({record:r,entitlement:e})=>`<span><small>${esc(r.name)}</small><strong>${esc(balanceText(e))}</strong><small>${esc(e.name)}</small></span>`).join('')}</span>${rights.length>3?`<span class="muted">另有 ${rights.length-3} 项，进入储值查看</span>`:''}`:''}</button>
  <div class="subscription-overview"><div class="overview-top"><button data-page="订阅">${icon('calendar')} 订阅 ${icon('arrow')}</button><span class="muted">${s.subscriptionCount} 项记录</span></div><button class="stat-main home-next" ${next?`data-open="${next.id}"`:'data-page="订阅"'}><span class="muted">${next?(M.daysUntil(next.expires)<0?'到期后待确认':'下一项到期'):'到期安排'}</span><strong class="home-next-date">${next?esc(next.expires.replaceAll('-',' / ')):'到期日待补充'}</strong><span class="home-next-name">${next?esc(next.name):'添加或补充订阅信息'}</span>${next?`<span class="pill">${esc(dateLabel(next.expires))}</span>`:''}</button><div class="home-cost-section"><div class="overview-top"><span class="muted">折合每${period==='month'?'月':'年'}费用</span><div class="mini-segment" aria-label="费用统计周期"><button data-period="month" aria-pressed="${period==='month'}">月</button><button data-period="year" aria-pressed="${period==='year'}">年</button></div></div><div class="home-equivalent"><strong>${s.equivalent===null?'待补费用':esc(M.money(s.equivalent))}</strong><span class="muted">${s.excluded?s.excluded+' 项信息未完整，未计入折合':'按当前记录估算，非实际扣款'}</span></div><div class="home-forecast"><span>未来 30 天预计续费</span><span>${esc(M.money(s.forecast))}</span></div><p class="field-help">仅已标记自动续约的记录，并非扣款确认</p></div></div></section>
  ${due.length?`<section class="schedule"><div class="section"><h2>近期安排</h2><span class="muted">未来 30 天 · ${due.length} 项</span></div><div class="timeline">${due.map(r=>`<button class="timeline-item" data-open="${r.id}"><span class="timeline-date"><strong>${r.expires.slice(8)}</strong><small>${Number(r.expires.slice(5,7))} 月</small></span><span class="timeline-copy"><strong>${esc(r.name)}</strong><span class="mini">${r.kind==='stored'?'储值权益到期':r.autoRenew===true?'预计续费':'订阅到期'}${r.kind==='subscription'&&r.fee!==null?' · '+esc(M.money(r.fee)):''}</span>${r.kind==='stored'?`<span class="schedule-rights">${r.entitlements.map(e=>`<span><small>${esc(e.name)}</small> <strong>${esc(balanceText(e))}</strong></span>`).join('')}</span>`:''}</span>${icon('arrow')}</button>`).join('')}</div></section>`:''}`;
}
function listMarkup(kind){
  const entries=active(kind);let list=entries.filter(r=>r.name.toLowerCase().includes(query.toLowerCase()));
  if(kind==='stored'&&filter!=='all')list=list.filter(r=>r.entitlements.some(e=>e.kind===filter));
  list.sort(sort==='name'?(a,b)=>a.name.localeCompare(b.name):(a,b)=>(a.expires||'9999').localeCompare(b.expires||'9999'));
  return `<div class="section list-title"><h2>${kind==='stored'?'我的储值':'我的订阅'}</h2><span class="muted">${entries.length} 项</span></div>
  ${kind==='stored'?`<div class="filter-chips" aria-label="储值筛选">${[['all','全部'],['money','金额余额'],['quantity','次数权益']].map(([v,l])=>`<button data-filter="${v}" aria-pressed="${filter===v}">${l}</button>`).join('')}</div>`:''}
  ${entries.length?`<div class="toolbar"><input id="search" aria-label="搜索记录" placeholder="搜索名称" value="${esc(query)}"><select id="sort" aria-label="排序"><option value="date" ${sort==='date'?'selected':''}>按到期日</option><option value="name" ${sort==='name'?'selected':''}>按名称</option></select></div>`:''}
  ${list.length?`<div class="record-list">${list.map(r=>recordCard(r)).join('')}</div>`:empty(entries.length?'没有找到匹配记录':'还没有'+(kind==='stored'?'储值':'订阅')+'记录',entries.length?'清空筛选':'添加记录',entries.length?'data-action="clear-filter"':`data-new="${kind}"`)}`;
}
function recordCard(r){
  const sub=r.kind==='subscription';
  return `<button class="record-card ${sub?'subscription-record':'stored-record'}" data-open="${r.id}"><span class="record-card-top">${brandLogoMarkup(r.name)}<span class="record-card-name"><strong>${esc(r.name)}</strong><small>${typeLabel(r)}</small></span>${icon('arrow')}</span>
  ${sub?`<span class="subscription-due"><span class="muted">本期到期日</span><strong class="subscription-due-date">${r.expires?esc(r.expires.replaceAll('-',' / ')):'待填写'}</strong><span class="pill">${esc(dateLabel(r.expires))}</span></span>`:`<span class="entitlement-summary ${r.entitlements.length===1?'single-entitlement':''}">${r.entitlements.map(e=>`<span><small>${esc(e.name)} · 剩余</small><strong>${esc(balanceText(e))}</strong></span>`).join('')}</span>`}
  <span class="record-card-bottom">${sub?`<span class="subscription-fee">${amount(r.fee)}${r.cycle?' · '+esc(M.cycleLabel(r.cycle)):' · 周期未明确'}</span><span>${r.autoRenew===true?'自动续约':r.autoRenew===false?'手动维护续费':'续约方式未填'}</span>`:`<span>${esc(dateLabel(r.expires))}</span><span>已记录支付 ${amount(M.recordPaid(state,r.id))}</span>`}</span></button>`;
}
function detailMarkup(r){
  if(!r)return empty('记录不存在或已删除','返回列表','data-action="back"');
  if(r.kind==='stored')return storedDetailMarkup(r);
  const paid=M.recordPaid(state,r.id),events=state.events.filter(e=>e.recordId===r.id).slice().reverse(),latest=events.find(e=>e.undoable&&!e.undone);
  return `<section class="card-profile subscription-profile" aria-label="订阅资料"><span class="eyebrow">订阅资料${r.archived?' · 已移除':''}</span><div class="detail-head">${brandLogoMarkup(r.name)}<div class="detail-title"><span class="mini">订阅</span><h2>${esc(r.name)}</h2></div>${!r.archived?`<button class="edit-link" data-action="edit">${icon('edit')}<span>编辑资料</span></button>`:''}</div><div class="profile-facts"><span class="fact-label">${icon('fee')}周期费用</span><span>${amount(r.fee)}</span></div><div class="profile-facts"><span class="fact-label">${icon('clock')}订阅周期</span><span>${esc(r.cycle?M.cycleLabel(r.cycle):r.legacyCycle||'未明确')}</span></div><div class="profile-facts"><span class="fact-label">${icon('renew')}续约方式</span><span>${r.autoRenew===null?'未填写':r.autoRenew?'自动续约':'手动续约'}</span></div><div class="profile-facts"><span class="fact-label">${icon('clock')}到期提醒</span><span>${r.reminderDays?.length===0?'已关闭':(r.reminderDays??recommendedDays(r.cycle)).map(d=>d===0?'当天':`提前 ${d} 天`).join('、')}</span></div>${r.note?`<div class="profile-note"><span class="fact-label">${icon('note')}备注</span><p>${esc(r.note)}</p></div>`:''}${r.archived?'<div class="profile-maintenance"><button class="text-action" data-action="restore">恢复订阅</button><button class="text-action danger" data-action="delete">永久删除</button></div>':''}</section>
  <section class="balance-management subscription-management" aria-label="续费管理"><div class="section"><h3>续费管理</h3>${r.archived?'<span class="muted">已移除，仅查看</span>':''}</div><div class="hero subscription-hero"><span class="muted detail-icon-label">${icon('calendar')}本期到期日</span><strong class="display-date">${esc(r.expires||'待填写')}</strong><span class="pill">${esc(dateLabel(r.expires))}</span></div>${!r.archived?`<button class="primary renewal-trigger" data-operation="renew">${icon('renew')}<span>记录一次续费</span></button>`:''}</section>
  <section class="record-history-section" aria-label="购买与续费记录"><div class="section"><h3>购买与续费记录</h3><span class="muted">${events.length} 条</span></div><div class="record-totals"><div class="cost-line"><span>已记录支付</span><strong>${amount(paid)}</strong></div></div><div class="record-history">${events.length?`<div class="event-list">${events.map(e=>compactEventMarkup(r,e,latest)).join('')}</div>`:'<p class="muted">还没有记录</p>'}</div></section>`;
}

function storedDetailMarkup(r){
  const paid=M.recordPaid(state,r.id),events=state.events.filter(e=>e.recordId===r.id).slice().reverse(),latest=events.find(e=>e.undoable&&!e.undone),mode=storedMode(r);
  return `<section class="card-profile" aria-label="卡片资料"><span class="eyebrow">卡片资料${r.archived?' · 已移除':''}</span><div class="detail-head">${brandLogoMarkup(r.name)}<div class="detail-title"><span class="mini">${typeLabel(r)}</span><h2>${esc(r.name)}</h2></div>${!r.archived?`<button class="edit-link" data-action="edit">${icon('edit')}<span>编辑资料</span></button>`:''}</div><div class="profile-facts"><span class="fact-label">${icon('calendar')}有效期</span><span>${esc(r.expires||'未设置')}</span></div>${r.note?`<div class="profile-note"><span class="fact-label">${icon('note')}备注</span><p>${esc(r.note)}</p></div>`:''}${r.archived?'<div class="profile-maintenance"><button class="text-action" data-action="restore">恢复卡片</button><button class="text-action danger" data-action="delete">永久删除</button></div>':''}</section>
  <section class="balance-management" aria-label="余额与权益管理"><div class="section"><h3>${mode==='money'?'余额管理':mode==='quantity'?'权益管理':'余额与权益管理'}</h3>${r.archived?'<span class="muted">已移除，仅查看</span>':''}</div><div class="holdings" aria-label="当前剩余">${r.entitlements.map(e=>`<div class="holding"><span class="muted">${esc(e.name)} · ${e.kind==='money'?'剩余余额':'剩余权益'}</span><strong>${esc(balanceText(e))}</strong></div>`).join('')}</div>${!r.archived?`<div class="action-grid intent-actions"><button class="primary" data-operation="use">${icon('debit')}<span>${operationTitle(r,'use')}</span></button><button class="secondary" data-operation="topup">${icon('credit')}<span>${operationTitle(r,'topup')}</span></button></div><div class="result-maintenance"><button class="manual-adjust" data-operation="adjust"><span class="detail-icon-label">${icon('adjust')}${operationTitle(r,'adjust')}</span>${icon('arrow')}</button></div>`:''}</section>
  <section class="record-history-section" aria-label="充值购买与使用记录"><div class="section"><h3>${mode==='money'?'充值与消费记录':'购买与使用记录'}</h3><span class="muted">${events.length} 条</span></div><div class="record-totals"><div class="cost-line"><span>${mode==='money'?'已记录充值':'已记录购买费用'}</span><strong>${amount(paid)}</strong></div>${r.entitlements.map(e=>{const used=M.usedAmount(state,r.id,e.id);return `<div class="usage-total"><span>${esc(e.name)} · ${e.kind==='money'?'已记录消费':'已记录使用'}</span><span>${e.kind==='money'?esc(M.money(used)):esc(M.quantity(used))+' '+esc(e.unit)}</span></div>`;}).join('')}</div><div class="record-history">${events.length?`<div class="event-list">${events.map(e=>compactEventMarkup(r,e,latest)).join('')}</div>`:'<p class="muted">还没有记录</p>'}</div></section>`;
}
function compactEventMarkup(r,e,latest){
  const category=e.type==='renew'?'renew':['purchase','topup'].includes(e.type)?'credit':e.type==='use'?'debit':'adjust',canUndo=e===latest&&!e.undone&&r.revision===e.afterRevision&&!r.archived;
  return `<article class="event compact-event ${e.undone?'is-undone':''}"><span class="event-icon event-icon-${category}">${icon(category)}</span><div class="event-content"><div class="event-heading"><strong>${esc(eventTitle(r,e))}${e.undone?' · 已撤销':''}</strong>${e.paid!==null&&e.paid!==undefined?`<span class="event-paid">支付 ${esc(M.money(e.paid))}</span>`:''}</div><div class="event-meta"><time datetime="${esc(e.date)}">${esc(e.date)}</time><span class="event-summary">${esc(e.summary||'')}</span>${canUndo?`<button class="undo-link" data-undo="${e.id}" aria-label="撤销本次${esc(eventTitle(r,e))}">撤销</button>`:''}</div>${e.note?`<p class="event-note">${esc(e.note)}</p>`:''}</div></article>`;
}
function field(name,label,value='',{type='text',required=false,placeholder='',help='',max=80,step='0.01'}={}){return `<label for="f-${name}">${label}${required?' <span class="required">*</span>':''}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''} ${type==='text'?`maxlength="${max}"`:''} ${type==='number'?`min="0" max="90000000000" step="${step}"`:''} placeholder="${esc(placeholder)}">${help?`<p class="field-help">${help}</p>`:''}`;}
function storedKindChoice(){return `<div class="stored-kind-choice" role="group" aria-label="储值方式"><button type="button" data-stored-kind="money" aria-pressed="true"><strong>余额储值</strong><small>充值后，用余额消费</small></button><button type="button" data-stored-kind="quantity" aria-pressed="false"><strong>次数权益</strong><small>买好次数，逐次使用</small></button></div>`;}
function purchaseFields(kind){return kind==='stored'?`<section class="field-section"><h3 id="stored-purchase-heading">这笔充值</h3>${field('purchaseDate','充值日期',M.today(),{type:'date',required:true})}${field('paid','充值金额（元）','',{type:'number',required:true,placeholder:'例如：200'})}</section>`:`<section class="field-section"><h3>本次购买</h3>${field('purchaseDate','购买日期',M.today(),{type:'date',required:true})}${field('paid','本次实际支付（元）','',{type:'number',required:true,placeholder:'例如：2000',help:'按填写的购买日期记录付款，实际付款与后续每期费用分别保存。'})}</section>`;}

function storedRightsMarkup(){return `<section class="field-section"><h3 id="stored-rights-title">可用余额</h3><p class="muted" id="stored-rights-help">默认按充值金额记录余额。有赠送金额时，可修改到账余额。</p><div id="entitlement-fields">${draft.entitlements.map(entitlementFields).join('')}</div><details class="extra-entitlements"><summary>同时获得其他余额或权益</summary><button type="button" class="add-entitlement" data-action="add-entitlement">${icon('plus')} 添加一项权益</button></details></section>`;}
function editorMarkup(){
  const r=record(),kind=route.type==='cards'?'stored':'subscription',isNew=route.creating;
  if(!draft)draft=r?M.clone(r):{id:M.uid(),kind,name:'',expires:'',note:'',fee:null,cycle:{unit:'month',value:1},autoRenew:null,entitlements:[{id:M.uid(),kind:'money',name:'可用余额',unit:'元',remaining:0}]};
  return `<div class="form-title form-title-with-logo"><div data-brand-preview>${brandLogoMarkup(draft.name)}</div><div><span class="eyebrow">${isNew?'新建记录':kind==='stored'?'编辑卡片资料':'编辑订阅资料'}</span><h2>${isNew?'添加'+(kind==='stored'?'储值':'订阅'):esc(r.name)}</h2></div></div>${isNew?`<div class="seg" role="group" aria-label="新建类型"><button type="button" data-new-kind="stored" class="${kind==='stored'?'active':''}">储值</button><button type="button" data-new-kind="subscription" class="${kind==='subscription'?'active':''}">订阅</button></div>`:''}
  <form id="record-form" novalidate><p class="form-error" role="alert" tabindex="-1"></p>${kind==='stored'&&isNew?storedKindChoice():''}${field('name',kind==='stored'?'门店／品牌名称':'名称',draft.name,{required:true,placeholder:kind==='stored'?'例如：巷口咖啡、木间 SPA':'例如：健身年卡'})}
  ${kind==='subscription'?'<div class="editor-date-group">'+field('expires','本期到期日（选填）',draft.expires,{type:'date'})+'</div>':''}${isNew?purchaseFields(kind):''}
  ${kind==='stored'?(isNew?storedRightsMarkup():''):
    `<section class="field-section"><h3>费用与周期</h3>${field('fee','每期费用（元）',M.inputNumber(draft.fee),{type:'number',required:isNew,help:isNew?'与首次实际支付分别记录；优惠购买时两者可以不同。':'未填写保留为未知，不按零统计。'})}<div class="cycle-fields"><div>${field('cycleValue','每隔',draft.cycle?.value||'',{type:'number',step:'1',placeholder:'1'})}</div><div><label for="f-cycleUnit">周期单位</label><select name="cycleUnit" id="f-cycleUnit">${[['month','个月'],['year','年'],['week','周'],['day','天'],['unknown','未明确（不折合）']].map(([v,l])=>`<option value="${v}" ${(draft.cycle?.unit||'unknown')===v?'selected':''}>${l}</option>`).join('')}</select></div></div>${!draft.cycle&&!isNew?'<p class="field-help">原有模糊周期保持不变；只有你确认具体周期后才计算折合费用。</p>':''}<label for="f-autoRenew">自动续约</label><select name="autoRenew" id="f-autoRenew">${[['','未填写'],['true','是'],['false','否']].map(([v,l])=>`<option value="${v}" ${String(draft.autoRenew??'')===v?'selected':''}>${l}</option>`).join('')}</select><p class="field-help">只记录你的设置，不确认扣款，不自动更新到期日。</p></section>`}
  ${kind==='subscription'?reminderFields():''}${kind==='stored'?field('expires','有效期（选填）',draft.expires,{type:'date'}):''}<label for="f-note">备注（选填）</label><textarea name="note" id="f-note" maxlength="200" rows="3">${esc(draft.note)}</textarea>
  <div class="edit-footer ${!isNew&&!r.archived?'card-edit-footer':''}">${!isNew&&!r.archived?`<button type="button" class="delete-card-button" data-action="archive">${kind==='stored'?'删除卡片':'删除订阅'}</button>`:''}<button type="button" class="cancel-button" data-action="cancel-edit">${isNew?'取消':'取消更改'}</button><button type="submit" class="primary">${isNew?'保存记录':'保存更改'}</button></div></form>`;
}
function entitlementFields(e,i){
  const primary=i===0;
  if(primary&&e.kind==='money')return `<fieldset class="entitlement-fields primary-entitlement" data-entitlement="${e.id}"><input type="hidden" name="ent-kind" value="money"><input type="hidden" name="ent-name" value="${esc(e.name||'可用余额')}"><input type="hidden" name="ent-unit" value="元"><div class="credit-preview"><span>充值后可用余额</span><strong id="money-credit-preview">${e.remaining?esc(M.money(e.remaining)):'待填写充值金额'}</strong></div><details class="credit-override"><summary>到账余额不同？</summary><label>到账余额（元）<input name="ent-amount" type="number" min="0" max="90000000000" step="0.01" value="${e.remaining?number(e.remaining):''}" placeholder="例如：充值 200，到账 220" data-auto-amount="true"></label></details></fieldset>`;
  return `<fieldset class="entitlement-fields ${primary?'primary-entitlement':''}" data-entitlement="${e.id}">${primary?'<input type="hidden" name="ent-kind" value="quantity">':`<legend>附加权益 ${i}</legend><div class="entitlement-row"><div><label>类型<select name="ent-kind">${[['quantity','次数／课时'],['money','金额余额']].map(([v,l])=>`<option value="${v}" ${e.kind===v?'selected':''}>${l}</option>`).join('')}</select></label></div><button type="button" class="remove-entitlement" data-remove-entitlement="${e.id}" aria-label="移除附加权益 ${i}">移除</button></div>`}<label>${primary?'购买了什么服务／权益':'权益名称'}<input name="ent-name" maxlength="40" value="${esc(e.name)}" placeholder="例如：身体护理"></label><div class="cycle-fields"><div><label><span data-amount-label>${primary?'购买数量':'余额／数量'}</span><input name="ent-amount" type="number" min="0" max="90000000000" step="0.01" value="${e.remaining?number(e.remaining):''}" placeholder="例如：10"></label></div><div><label>单位<input name="ent-unit" maxlength="8" value="${esc(e.kind==='money'?'元':e.unit)}" ${e.kind==='money'?'readonly':''} placeholder="次／节／小时"></label></div></div></fieldset>`;
}
function readEntitlements(){return [...document.querySelectorAll('[data-entitlement]')].map(row=>{const acquired=M.decimal(row.querySelector('[name="ent-amount"]').value,'余额／数量');return {id:row.dataset.entitlement,kind:row.querySelector('[name="ent-kind"]').value,name:row.querySelector('[name="ent-name"]').value.trim(),unit:row.querySelector('[name="ent-unit"]').value.trim(),remaining:acquired,acquired};});}

function myMarkup(){
 if(route.myView==='archives'){const list=state.records.filter(r=>r.archived);return `<div class="section"><h2>已移除记录</h2></div>${list.length?list.map(recordCard).join(''):empty('没有已移除记录','返回我的','data-page="我的"')}`;}
 if(route.myView==='about')return `<div class="settings-about"><img src="/icon-192.png" alt=""><h2>Saldo</h2><p>轻松管理你的储值卡和各类订阅</p></div><div class="settings-list">${settingsRow({label:'使用条款与隐私说明',icon:'document',href:'/terms.html?from=me'})}${settingsRow({label:'联系支持',icon:'mail',href:'mailto:service@saldo.tobmarket.ing',navigate:false})}${settingsRow({label:'版本信息',icon:'info',value:appVersion})}</div>`;
 return `<div class="my-account"><img src="/icon-192.png" alt=""><div class="my-account-copy"><h2>我的账号</h2><p class="account-email">${esc(session.user.email)}</p></div></div><section class="settings-group"><h2>使用设置</h2><div class="settings-list">${settingsRow({label:'管理通知',description:'查看接收方式',descriptionId:'my-notification-summary',icon:'bell',action:'notifications'})}${standalone()?'':settingsRow({label:'添加到主屏幕',description:'更方便地打开 Saldo',icon:'install',action:'install-guide'})}</div></section><section class="settings-group"><h2>数据管理</h2><div class="settings-list">${settingsRow({label:'已移除记录',description:'恢复或永久删除',value:String(state.records.filter(r=>r.archived).length||''),icon:'archive',action:'archives'})}${settingsRow({label:'导出数据',description:'包含权益、明细及已移除记录',icon:'export',action:'export',value:'JSON',navigate:false})}</div></section><section class="settings-group"><h2>关于</h2><div class="settings-list">${settingsRow({label:'关于 Saldo',description:'条款、支持与版本',icon:'info',action:'about'})}</div></section><button class="my-signout" data-action="sign-out">退出登录</button>`;
}
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
async function updateNotificationSummary(){try{const [p,sub]=await Promise.all([loadNotificationPreferences(session.user.id),registeredPushDevice()]);let connected=false;if(sub){const r=await client.from('saldo_push_devices').select('id').eq('user_id',session.user.id).eq('endpoint',sub.endpoint).maybeSingle();connected=Boolean(!r.error&&r.data);}const parts=[];if(p.email_enabled)parts.push('邮件开启');if(p.push_enabled)parts.push(connected?'此设备推送已连接':browserPushStatus().permission==='denied'?'此设备通知权限已关闭':'此设备推送待授权');if(!disposed&&$('#my-notification-summary'))$('#my-notification-summary').textContent=parts.join(' · ')||'全部提醒已关闭';}catch{}}
function installGuide(){const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);openModal('help',{title:'添加到主屏幕',html:`<p>从主屏幕快速打开 Saldo，并开启设备到期提醒。</p><h3>iPhone / iPad</h3><ol><li>在 Safari 中打开 saldo.tobmarket.ing。</li><li>点击分享 → 添加到主屏幕；如有「作为网页 App 打开」，请开启。</li></ol><h3>Android</h3><ol><li>在 Chrome 中打开 saldo.tobmarket.ing。</li><li>点击菜单 → 添加到主屏幕或安装应用。</li></ol><p>从主屏幕打开后，可在「我的 → 管理通知」连接此设备。在微信等应用内，请先选择「在浏览器打开」。</p>`});}
function recommendedDays(c){return c?.unit==='day'?[0]:c?.unit==='week'?[1]:c?.unit==='year'||(c?.unit==='month'&&c.value>=12)?[30,7,1]:c?.unit==='month'&&c.value===1?[3,1]:[7,1];}
function reminderFields(){const selected=draft.reminderDays??recommendedDays(draft.cycle);return `<section class="field-section"><h3>到期提醒</h3><label class="check-row"><input type="checkbox" name="recommendedReminders" ${draft.reminderDays===null||draft.reminderDays===undefined?'checked':''}>按周期推荐</label><div class="reminder-checks">${[30,14,7,3,1,0].map(d=>`<label class="check-row"><input type="checkbox" name="reminderDays" value="${d}" ${selected?.includes(d)?'checked':''}>${d===0?'当天':`提前 ${d} 天`}</label>`).join('')}</div></section>`;}
function render(){
  const editing=route.editing||route.creating,child=Boolean(route.selected||route.creating||route.myView);
  $('#app').innerHTML=header(editing?'编辑记录':route.selected?'记录详情':route.myView?(route.myView==='archives'?'已移除记录':'关于 Saldo'):'',child)+`<main>${editing?editorMarkup():route.selected?detailMarkup(record()):route.page==='总览'?homeMarkup():route.page==='我的'?myMarkup():listMarkup(route.page==='储值卡'?'stored':'subscription')}</main>`;
  $('.nav').hidden=editing||disposed;$('.nav').innerHTML=tabs.map(([id,label,name])=>`<button data-page="${id}" class="${route.page===id?'active':''}" ${route.page===id?'aria-current="page"':''}>${icon(name)}<span>${label}</span></button>`).join('');
  installBrandLogos();if(editing)bindEditor();if(route.page==='我的'&&!route.myView&&!route.selected)void updateNotificationSummary();
  $('#search')?.addEventListener('input',e=>{const position=e.target.selectionStart;query=e.target.value;render();$('#search').focus();$('#search').setSelectionRange(position,position);});
  $('#sort')?.addEventListener('change',e=>{sort=e.target.value;render();});
}
function bindEditor(){
  const form=$('#record-form');form.addEventListener('input',event=>{dirty=true;if(event.target.name==='name'){const preview=document.querySelector('[data-brand-preview]');if(preview){preview.innerHTML=brandLogoMarkup(event.target.value);installBrandLogos(preview);}}});form.addEventListener('change',()=>dirty=true);
  form.addEventListener('input',event=>{if(event.target.name==='ent-amount'&&event.target.closest('.primary-entitlement'))event.target.dataset.autoAmount='false';syncStoredCredit();});
  form.querySelectorAll('[name="ent-kind"]').forEach(select=>select.addEventListener('change',()=>{const row=select.closest('fieldset'),unit=row.querySelector('[name="ent-unit"]');unit.readOnly=select.value==='money';unit.value=select.value==='money'?'元':'次';}));
  form.elements.cycleUnit?.addEventListener('change',()=>{form.elements.cycleValue.disabled=form.elements.cycleUnit.value==='unknown';});if(form.elements.cycleUnit)form.elements.cycleValue.disabled=form.elements.cycleUnit.value==='unknown';
  form.addEventListener('change',event=>{if(event.target.name==='reminderDays')form.elements.recommendedReminders.checked=false;if((event.target.name==='recommendedReminders'&&event.target.checked)||(['cycleUnit','cycleValue'].includes(event.target.name)&&form.elements.recommendedReminders?.checked)){const c={unit:form.elements.cycleUnit.value,value:Number(form.elements.cycleValue.value)};for(const box of form.querySelectorAll('[name=reminderDays]'))box.checked=recommendedDays(c).includes(Number(box.value));}});
  refreshStoredEditor();syncStoredCredit();
  form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('[type="submit"]');try{
    const f=new FormData(form),r=M.clone(draft);r.name=f.get('name').trim();r.expires=f.get('expires');r.note=f.get('note');
    if(r.kind==='subscription'){r.fee=f.get('fee')===''?null:M.decimal(f.get('fee'),'每期费用');r.cycle=f.get('cycleUnit')==='unknown'?null:{unit:f.get('cycleUnit'),value:Number(f.get('cycleValue'))};r.autoRenew=f.get('autoRenew')===''?null:f.get('autoRenew')==='true';r.reminderDays=f.get('recommendedReminders')==='on'?(route.creating||(r.cycle&&['day','week'].includes(r.cycle.unit))?recommendedDays(r.cycle):null):f.getAll('reminderDays').map(Number);if(route.creating&&r.fee===null)throw Error('新订阅请填写每期费用。');}
    button.disabled=true;let next;
    if(route.creating){if(r.kind==='stored')r.entitlements=readEntitlements();const paid=M.decimal(f.get('paid'),'实际支付费用');next=M.createRecord(state,r,{paid,date:f.get('purchaseDate')});}
    else{const keys=r.kind==='stored'?['name','note','expires']:['name','note','expires','fee','cycle','autoRenew','reminderDays'];next=M.editRecord(state,r.id,Object.fromEntries(keys.map(k=>[k,r[k]])),draft.revision);}
    await commit(next);dirty=false;draft=null;void go({...route,selected:r.id,editing:false,creating:false},{replace:true});toast('已保存');
  }catch(error){showError(form,error.message);button.disabled=false;}};
}
function refreshStoredEditor(){
  const form=$('#record-form');if(!$('#stored-purchase-heading'))return;
  const row=form.querySelector('.primary-entitlement'),money=row.querySelector('[name="ent-kind"]').value==='money';
  $('#stored-purchase-heading').textContent=money?'这笔充值':'这次购买';
  form.querySelector('label[for="f-purchaseDate"]').firstChild.textContent=(money?'充值日期':'购买日期')+' ';
  form.querySelector('label[for="f-paid"]').firstChild.textContent=(money?'充值金额（元）':'购买费用（元）')+' ';
  form.elements.paid.placeholder=money?'例如：200':'例如：2000';
  $('#stored-rights-title').textContent=money?'可用余额':'购买的权益';
  $('#stored-rights-help').textContent=money?'默认按充值金额记录余额。有赠送金额时，可修改到账余额。':'例如：购买 10 次身体护理，费用只记录一次。';
  form.querySelectorAll('[data-stored-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.storedKind===(money?'money':'quantity'))));
}

function syncStoredCredit(){
  const form=$('#record-form'),row=form?.querySelector('.primary-entitlement'),input=row?.querySelector('[name="ent-amount"]'),output=$('#money-credit-preview');if(!output)return;
  if(input.dataset.autoAmount!=='false')input.value=form.elements.paid.value;
  try{output.textContent=M.money(M.decimal(input.value));}catch{output.textContent='待填写充值金额';}
}
function switchStoredKind(kind){
  const row=$('.primary-entitlement'),old=row?.querySelector('[name="ent-kind"]').value;if(!row||old===kind)return;
  draft.modeFields??={};draft.modeFields[old]=Object.fromEntries([...row.querySelectorAll('[name]')].map(el=>[el.name,el.value]));
  const saved=draft.modeFields[kind],e={id:row.dataset.entitlement,kind,name:kind==='money'?'可用余额':'',unit:kind==='money'?'元':'次',remaining:0};
  row.outerHTML=entitlementFields(e,0);const replacement=$('.primary-entitlement');
  if(saved)for(const [name,value]of Object.entries(saved)){const input=replacement.querySelector(`[name="${name}"]`);if(input)input.value=value;}
  const input=replacement.querySelector('[name="ent-amount"]');if(saved&&kind==='money')input.dataset.autoAmount='false';
  refreshStoredEditor();syncStoredCredit();dirty=true;
}
function showError(form,message){const el=form.querySelector('.form-error');el.textContent=message;el.focus();el.scrollIntoView({block:'nearest',behavior:'smooth'});}
function openModal(type,payload={}){const key=M.uid();modalCache.set(key,{type,...payload});void go({...route,modal:key});}
function closeModal(){modalDirty=false;modalCache.delete(route.modal);nav.back(()=>{route.modal=0;nav.replace(route);$('#modal').close();render();});}
function operationMarkup(r,type){
  const title=operationTitle(r,type),mode=r.kind==='stored'?storedMode(r):'';
  let next='';if(type==='renew'&&r.cycle){try{next=M.addCycle(r.expires&&r.expires>M.today()?r.expires:M.today(),r.cycle,r.cycleAnchor||Number(r.expires?.slice(8)||M.today().slice(8)));}catch{}}
  return `<h2 id="modal-title">${title}</h2><p class="muted">${esc(r.name)}</p><form id="operation-form" novalidate><p class="form-error" role="alert" tabindex="-1"></p>${field('date','本次记录日期',M.today(),{type:'date',required:true})}
  ${['topup','renew'].includes(type)?field('paid',type==='renew'?'本次实际续费（元）':mode==='money'?'本次充值金额（元）':'本次购买费用（元）',type==='renew'?M.inputNumber(r.fee):'',{type:'number',required:true,placeholder:'请记录实际支付费用'}):''}
  ${type==='renew'?`${field('nextDate','下一到期日',next,{type:'date',required:true,help:next?'根据当前周期给出建议，请核对后保存。':'原周期未明确，请自行确认下一到期日。'})}<label class="check-row"><input name="updateFee" type="checkbox"> 将本次金额作为后续每期费用</label>`:
    `<div class="operation-items">${r.entitlements.map(e=>`<div class="operation-item"><div><strong>${esc(e.name)}</strong><small>当前 ${esc(balanceText(e))}</small></div><label>${type==='topup'?(e.kind==='money'?'本次到账余额':'本次购买数量'):type==='use'?(e.kind==='money'?'本次花了':'本次用了'):(e.kind==='money'?'余额还剩':'权益还剩')}（${esc(e.kind==='money'?'元':e.unit)}）<input name="value-${e.id}" data-operation-entitlement="${e.id}" data-auto-amount="true" type="number" min="0" max="90000000000" step="0.01" value="${type==='adjust'?number(e.remaining):''}" placeholder="${type==='adjust'?'填写当前剩余':'填写本次数量'}"></label><span class="operation-result muted" data-result="${e.id}"></span></div>`).join('')}</div>`}
  <label for="operation-note">备注（选填）</label><textarea name="note" id="operation-note" maxlength="200" rows="2"></textarea><div class="modal-actions"><button type="button" class="cancel-button" data-action="close-modal">取消</button><button class="primary" type="submit">确认记录</button></div></form>`;
}
function mountModal(config){
  if(!config)return;const dialog=$('#modal');dialog.className='bottom-sheet prototype-sheet';dialog.setAttribute('aria-labelledby','modal-title');
  if(config.type==='operation'){
    const r=state.records.find(r=>r.id===config.recordId);dialog.innerHTML=operationMarkup(r,config.operation);const form=dialog.querySelector('form');
    form.oninput=event=>{modalDirty=true;if(config.operation==='topup'&&storedMode(r)==='money'&&r.entitlements.length===1){const input=form.elements['value-'+r.entitlements[0].id];if(event.target===input)input.dataset.autoAmount='false';if(event.target.name==='paid'&&input.dataset.autoAmount!=='false')input.value=event.target.value;}for(const e of r.entitlements||[]){const input=form.elements['value-'+e.id],result=form.querySelector(`[data-result="${e.id}"]`);if(!input||!result)continue;try{if(input.value===''){result.textContent='';continue;}if(e.remaining===null&&config.operation!=='adjust'){result.textContent='先填写当前剩余，再记录增减';continue;}const n=M.decimal(input.value),after=config.operation==='topup'?e.remaining+n:config.operation==='use'?e.remaining-n:n;result.textContent=after<0?'剩余不足':'记录后 '+balanceText({...e,remaining:after});}catch{result.textContent='请填写有效数值';}}};
    form.onsubmit=async event=>{event.preventDefault();const submit=form.querySelector('[type="submit"]');try{const f=new FormData(form),op={type:config.operation,date:f.get('date'),note:f.get('note')};if(config.operation==='renew'){op.paid=M.decimal(f.get('paid'),'续费费用');op.nextDate=f.get('nextDate');op.updateFee=f.get('updateFee')==='on';}else{op.values={};for(const e of r.entitlements){const raw=f.get('value-'+e.id);if(raw!=='')op.values[e.id]=M.decimal(raw,'余额／数量');}if(config.operation==='topup')op.paid=M.decimal(f.get('paid'),'实际支付费用');}submit.disabled=true;await commit(M.applyOperation(state,r.id,op,r.revision));closeModal();toast('已记录，可在历史中撤销本次操作。');}catch(error){showError(form,error.message);submit.disabled=false;}};
  }else if(config.type==='confirm'){
    dialog.innerHTML=`<h2 id="modal-title">${config.title}</h2><p class="muted confirmation-copy">${config.message}</p><div class="modal-actions"><button class="cancel-button" data-action="close-modal">取消</button><button class="primary" data-confirm>确认</button></div>`;
    dialog.querySelector('[data-confirm]').onclick=async()=>{try{if(writing)return;const confirm=dialog.querySelector('[data-confirm]');confirm.disabled=true;await config.run();modalDirty=false;modalCache.delete(route.modal);dialog.close();dialog.replaceChildren();route={...route,modal:0};nav.replace(route);render();toast(config.success||'已完成');}catch(error){dialog.querySelector('[data-confirm]').disabled=false;toast(error.message);}};
  }else{
    dialog.innerHTML=`<h2 id="modal-title">${config.title}</h2><div class="help-copy">${config.html}</div><button class="secondary" data-action="close-modal">知道了</button>`;
  }
  if(!dialog.open)dialog.showModal();dialog.querySelector('input,button')?.focus({preventScroll:true});
}
$('#modal').addEventListener('cancel',e=>{e.preventDefault();if(writing)return;if(modalDirty)void confirmLeave().then(ok=>{if(ok)closeModal();});else closeModal();},{signal});
document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;if(writing){toast('正在保存，请稍候。');return;}
  if(button.dataset.page){query='';filter='all';await go(base(button.dataset.page));return;}
  if(button.dataset.open){openRecord(button.dataset.open);return;}
  if(button.dataset.new){add(button.dataset.new);return;}
  if(button.dataset.period){period=button.dataset.period;render();return;}
  if(button.dataset.filter){filter=button.dataset.filter;render();return;}
  if(button.dataset.newKind){if((route.type==='cards'?'stored':'subscription')!==button.dataset.newKind)add(button.dataset.newKind);return;}
  if(button.dataset.storedKind){switchStoredKind(button.dataset.storedKind);return;}
  if(button.dataset.operation){openModal('operation',{recordId:record().id,operation:button.dataset.operation});return;}
  if(button.dataset.undo){openModal('confirm',{title:'撤销这次操作？',message:'还原本次修改的余额／权益或续费信息。这条历史保留并标记已撤销，不再计入费用统计。',run:()=>commit(M.undoOperation(state,button.dataset.undo)),success:'已撤销，原历史仍保留。'});return;}
  if(button.dataset.removeEntitlement){if(document.querySelectorAll('[data-entitlement]').length===1){toast('至少保留一项权益。');return;}button.closest('fieldset').remove();dirty=true;return;}
  const action=button.dataset.action;
  if(action==='add')add(route.page==='订阅'?'subscription':'stored');
  if(action==='back')void back();
  if(action==='edit')void go({...route,editing:true});
  if(action==='cancel-edit'){if(dirty&&!await confirmLeave())return;dirty=false;if(route.creating)void back();else void go({...route,editing:false},{replace:true});}
  if(action==='add-entitlement'){const container=$('#entitlement-fields');if(container.children.length>=8){toast('最多添加 8 项权益。');return;}container.insertAdjacentHTML('beforeend',entitlementFields({id:M.uid(),kind:'quantity',name:'',remaining:0,unit:'次'},container.children.length));const last=container.lastElementChild;last.querySelector('[name="ent-kind"]').onchange=e=>{const unit=last.querySelector('[name="ent-unit"]');unit.readOnly=e.target.value==='money';unit.value=unit.readOnly?'元':'次';};dirty=true;last.querySelector('[name="ent-name"]').focus();}
  if(action==='close-modal'){if(modalDirty&&!await confirmLeave())return;closeModal();}
  if(action==='clear-filter'){query='';filter='all';render();}
  if(action==='archives')void go({...base('我的'),myView:'archives'});
  if(action==='archive'){const r=record();openModal('confirm',{title:'删除这条记录？',message:(dirty?'本页未保存的修改将被放弃。':'')+'删除后先移入「已移除记录」，保留历史并允许恢复。不会替你取消商家服务或订阅。',run:async()=>{await commit(M.archiveRecord(state,r.id,true));dirty=false;draft=null;route={...route,editing:false,creating:false};},success:'已移除，可在我的中恢复。'});}
  if(action==='restore'){try{await commit(M.archiveRecord(state,record().id,false));render();toast('已恢复');}catch(error){toast(error.message);}}
  if(action==='delete'){const id=record().id;openModal('confirm',{title:'永久删除记录？',message:'该记录及关联的购买、使用历史会被删除，费用统计也会随之变化。无法恢复。',run:async()=>{await commit(M.deleteArchived(state,id));route={...base('我的'),myView:'archives'};},success:'已永久删除记录'});}
  if(action==='statistics-help')openModal('help',{title:'费用如何计算',html:`<p>月／年折合：根据当前周期费用计算，不是实际付款。天／周周期按 365 天一年折算，每条四舍五入到分后汇总。</p><p>已记录支付：只累计选定自然月／年内明确记录的订阅购买与续费，已撤销记录不计入；不按周期反推历史。</p><p>预计续费：仅统计未来 30 天、已标记自动续约且费用明确的订阅。不是扣款确认，也不自动推进到期日。</p><p>费用未知、周期未明确不按零处理。到期后未更新的记录仍按原信息保留，需你自行维护。</p>`});
  if(action==='about')void go({...base('我的'),myView:'about'});
  if(action==='notifications'){sessionStorage.setItem('saldo.notificationFromApp','true');location.assign('/notification-settings.html');}
  if(action==='install-guide')installGuide();
  if(action==='export'){const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='saldo-'+M.today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  if(action==='sign-out'){button.disabled=true;try{await detachPushDevice(session.user.id);const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;}catch{toast('退出登录失败，请重试。');button.disabled=false;}}

},{signal});
window.addEventListener('beforeunload',event=>{if(writing||dirty||modalDirty){event.preventDefault();event.returnValue='';}},{signal});
installSwipeNavigation({signal,canStart:()=>!writing&&!disposed&&!$('#modal').open&&!route.editing&&!route.creating,onLeft:()=>{if(route.selected||route.myView){void back();return true;}const i=tabs.findIndex(t=>t[0]===route.page);if(i<3){void go(base(tabs[i+1][0]));return true;}return false;},onRight:()=>{if(route.selected||route.myView)return false;const i=tabs.findIndex(t=>t[0]===route.page);if(i>0){void go(base(tabs[i-1][0]));return true;}return false;}});
const params=new URLSearchParams(location.search),pages={cards:'储值卡',subscriptions:'订阅',me:'我的',home:'总览'};route=base(pages[params.get('view')]||'总览');
if(params.get('record')&&state.records.some(r=>r.id===params.get('record')))route={...route,selected:params.get('record'),type:state.records.find(r=>r.id===params.get('record')).kind==='stored'?'cards':'subs'};
nav.initialize(route,route.selected?base(route.page):undefined);render();

return {destroy(){disposed=true;controller.abort();clearTimeout(toastTimer);document.querySelector('.toast')?.remove();$('.nav').hidden=true;document.body.classList.remove('ledger-active');deactivateLedgerStyles();$('#modal').close();$('#modal').replaceChildren();}};
}
