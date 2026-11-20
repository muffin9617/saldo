import { createHistoryNavigation } from './navigation.js';
import { installSwipeNavigation, confirmDiscardChanges } from './gestures.js';
import { client, callbackUrl, completeAuthCallback, continueWithPassword, hasAcceptedTerms, acceptTerms, rememberGoogleConsent, completeGoogleConsent } from './auth.js';
import { money, moneyFromCents, nameInitial, recordFieldError, totalBalanceCents } from './presentation.js';
import { cycles, deleteRecord, emptyWallet, loadWallet, localDate, saveRecord } from './wallet.js';
import { appVersion, settingsHeader, settingsRow } from './settings-ui.js';
import {
  browserPushStatus, detachPushDevice, loadNotificationPreferences, registeredPushDevice,
} from './notifications.js';

let currentSession = null;
let ready = false;
let writing = false;
let editDraft = null, detailError = '', detailFieldErrors = {};
let navReady=false, modalLayer=0, modalSequence=0;
const tabStates={}, modalCache=new Map();
let myView = '', myScroll = 0, notificationSummary = '查看接收方式', summaryOwner = null, summaryLoading = false;
const icons={home:'<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',card:'<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6M17 2v6M3 11h18"/>',user:'<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>'};
Object.assign(icons, {
  add: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  archive: '<path d="M4 8h16v12H4zM3 3h18v5H3zM9 12h6"/>',
});
const svg=k=>'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">'+icons[k]+'</svg>';
let data = emptyWallet();
let page='总览',selected=null,type='cards',query='',sort='default';const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const days=d=>Math.round((Date.parse(d+'T00:00:00Z')-Date.parse(localDate()+'T00:00:00Z'))/86400000);const status=d=>!d?'日期待补充':days(d)<0?'已到期日，待确认':days(d)===0?'今天到期':'还有 '+days(d)+' 天';const active=k=>data[k].filter(x=>!x.archived);const get=()=>editDraft?.isNew && editDraft.base.id===selected ? editDraft.base : data[type].find(x=>x.id===selected);
let toastTimer;
function dismissToast(){clearTimeout(toastTimer);document.querySelector('.toast')?.remove();}
function toast(message,{action,label='撤销',duration=4200}={}){
  dismissToast();
  const node=document.createElement('div');node.className='toast';
  const statusNode=document.createElement('span');statusNode.setAttribute('role','status');statusNode.textContent=message;node.append(statusNode);
  if(action){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=async()=>{button.disabled=true;clearTimeout(toastTimer);await action();if(node.isConnected)node.remove();};node.append(button);}
  document.body.append(node);toastTimer=setTimeout(()=>node.remove(),action?10000:duration);
}
function connectivityMessage(){return navigator.onLine?'':'当前离线。输入会保留在此页面，联网后可重试保存。';}
function updateConnectivity(){
  let node=$('connectivity-status');
  if(!node){node=document.createElement('p');node.id='connectivity-status';node.className='connectivity-status';node.setAttribute('role','status');$('app').before(node);}
  node.textContent=connectivityMessage();node.hidden=navigator.onLine;
}
window.addEventListener('online',updateConnectivity);window.addEventListener('offline',updateConnectivity);
updateConnectivity();

function logo(entry) {
  return '<span class="logo" aria-hidden="true">'+esc(nameInitial(entry.name))+'</span>';
}

const amountMarkup = formatted => esc(formatted).replaceAll(',', ',<wbr>');

function emptyState(icon, message, label, action) {
  return '<div class="empty-state">'+svg(icon)+'<p>'+esc(message)+'</p>'+
    '<button class="empty-cta" type="button" '+action+'>'+esc(label)+'</button></div>';
}

function rows(kind, list) {
  if (!list.length) return '';
  return '<div class="rows">'+list.map(entry => {
    const amount = kind === 'cards'
      ? entry.balance === null ? '待更新' : '¥'+amountMarkup(money(entry.balance))
      : '<span class="row-status">'+status(entry.date)+'</span>';
    return '<button class="row" data-open="'+kind+':'+esc(entry.id)+'">'+logo(entry)+
      '<span class="row-copy"><span class="name">'+esc(entry.name)+'</span><span class="mini">'+
      esc(kind === 'cards' ? (entry.updated || '')+' 更新' : entry.date || '到期日待补充')+
      '</span></span><span class="amount"><span class="amount-value">'+amount+'</span></span></button>';
  }).join('')+'</div>';
}

function notice(entry) {
  return '<button class="notice" data-open="subs:'+esc(entry.id)+'">'+svg('calendar')+
    '<span class="notice-copy"><strong>'+esc(entry.name)+'</strong><span class="muted">'+
    esc(entry.date)+' 到期</span></span><span class="pill">'+status(entry.date)+'</span></button>';
}
const brand = attributes => '<h1><button type="button" class="brand-home" aria-label="Saldo 首页" '+attributes+'>Saldo</button></h1>';
const renewalOptions = value => [[null, '未填写'], [true, '是'], [false, '否']].map(([choice, label]) =>
  '<option value="'+(choice ?? '')+'"'+(choice === value ? ' selected' : '')+'>'+label+'</option>'
).join('');
const parseRenewal = value => value === '' ? null : value === 'true';

const textMeasure = document.createElement('canvas').getContext('2d');
function naturalTextWidth(element) {
  const style = getComputedStyle(element);
  textMeasure.font = style.fontWeight+' '+style.fontSize+' '+style.fontFamily;
  return textMeasure.measureText(element.textContent).width;
}

function fitLayout() {
  for (const row of document.querySelectorAll('.row')) {
    const amount = row.querySelector('.amount-value');
    amount.style.removeProperty('--amount-font');
    const text = amount.querySelector('.row-status') || amount;
    const width = naturalTextWidth(text);
    row.classList.toggle('row-stacked', width > row.clientWidth * .42);
    if (text === amount && width > amount.parentElement.clientWidth) {
      amount.style.setProperty('--amount-font', Math.max(14, 21 * amount.parentElement.clientWidth / width)+'px');
    }
  }
  for (const balance of document.querySelectorAll('.balance')) {
    const number = balance.querySelector('.money-number');
    if (!number) continue;
    balance.style.removeProperty('--balance-font');
    const base = parseFloat(getComputedStyle(balance).fontSize);
    const width = naturalTextWidth(number);
    const available = number.clientWidth;
    if (width > available) balance.style.setProperty('--balance-font', Math.max(24, base * available / width)+'px');
  }
}

const layoutObserver = new ResizeObserver(fitLayout);
function observeLayout() {
  layoutObserver.disconnect();
  for (const element of document.querySelectorAll('.balance, .row')) layoutObserver.observe(element);
  fitLayout();
}

function render() {
  if (!ready) return;
  if (selected && !get()) selected = null;
  const settingsView = page === '我的' && myView && !selected;
  let html = settingsView ? settingsHeader(myView === 'archives' ? '已移除记录' : '关于 Saldo',{backAction:'my-back'})+'<main class="wallet-main settings-main">'
    : selected ? '<header class="detail-header">'+brand('data-page="总览"')+'<h2>'+(editDraft?.isNew?(type==='cards'?'添加储值卡':'添加订阅'):(type==='cards'?'储值卡详情':'订阅详情'))+'</h2><button class="detail-back" data-action="back" aria-label="返回上一页">‹ 返回</button></header><main class="wallet-main record-detail'+(editDraft?' is-editing':'')+'" '+(writing?'aria-busy="true"':'')+'>'+(detailError?'<p id="detail-error" class="detail-error error" role="alert">'+esc(detailError)+'</p>':'')
    : '<header>'+brand('data-page="总览"')+(page === '我的' ? '<span class="my-heading">我的</span>' : '<button class="round" data-action="add" aria-label="添加记录">'+svg('add')+'</button>')+'</header><main class="wallet-main">';
  if (selected) {
    const entry = get();
    if(editDraft?.isNew)html+='<div class="seg" role="group" aria-label="记录类型">'+['cards','subs'].map(kind=>'<button type="button" data-type="'+kind+'" aria-pressed="'+(type===kind)+'" class="'+(type===kind?'active':'')+'">'+(kind==='cards'?'储值卡':'订阅')+'</button>').join('')+'</div>';
    html += '<div class="detail-head">'+(editDraft?.isNew?'<span class="logo" aria-hidden="true">'+svg(type==='cards'?'card':'calendar')+'</span>':logo(entry))+'<input class="inline title-input" data-field="name" aria-label="名称" value="'+esc(entry.name)+'">'+(editDraft?'':'<button class="record-edit-trigger" data-action="edit-detail" type="button">编辑</button>')+'</div>';
    if (type === 'cards') {
      html += '<div class="hero"><div class="muted">'+(editDraft?.isNew?'余额（选填）':'最近记录余额')+'</div><div class="balance inline-money"><span class="money-symbol">¥</span>'+
        '<input class="inline balance-input" data-field="balance" aria-label="余额" type="number" min="0" max="90000000000" step="0.01" placeholder="待更新" value="'+esc(entry.balance)+'">'+
        '</div>'+(editDraft?.isNew?'':'<div class="muted">'+esc(entry.updated || '')+' 更新</div>')+'</div>';
      html += '<div class="info"><span>有效期</span><input class="inline" data-field="date" aria-label="有效期" type="date" value="'+esc(entry.date)+'"></div>';
    } else {
      html += '<div class="hero"><label class="muted" for="detail-date">到期日</label><div class="date-wrap"><input id="detail-date" class="date-native" data-field="date" aria-label="到期日" type="date" value="'+esc(entry.date)+'"></div>'+
        '<div class="pill detail-status">'+status(editDraft?editDraft.raw.date:entry.date)+'</div></div>'+
        '<div class="info"><span>订阅周期</span><select class="inline" data-field="cycle" aria-label="订阅周期">'+[...cycles.keys()].map(cycle =>
          '<option value="'+cycle+'"'+(entry.cycle === cycle ? ' selected' : '')+'>'+(cycle||'未填写')+'</option>').join('')+'</select></div>'+
        '<div class="info"><span>费用（元）</span><input class="inline" data-field="fee" aria-label="费用" type="number" min="0" max="90000000000" step="0.01" value="'+esc(entry.fee)+'"></div>'+
        '<div class="info"><span>自动续约</span><select class="inline" data-field="autoRenew" aria-label="自动续约">'+renewalOptions(entry.autoRenew)+'</select></div>'+
        '<'+(editDraft?'button':'div')+' class="info info-button"'+(editDraft?' type="button" data-action="reminder"':'')+'><span>到期提醒</span><span class="reminder-value"><span class="reminder-copy">'+reminderSummary(editDraft ? editDraft.reminderDays : entry.reminderDays, editDraft ? editDraft.raw.cycle : entry.cycle)+'</span>'+(editDraft?'<span class="detail-chevron" aria-hidden="true">›</span>':'')+'</span></'+(editDraft?'button':'div')+'>' ;
    }
    html += '<div class="info note-info"><span>备注</span><textarea class="inline" data-field="note" aria-label="备注" rows="3" placeholder="未填写">'+esc(entry.note)+'</textarea></div>'+
      (editDraft ? '' : '<div class="actions"><button class="secondary" data-action="archive">'+(entry.archived ? '重新显示在列表' : '移出当前列表')+'</button>'+
      '<p class="muted">'+(entry.archived ? '重新显示后，将计入当前概况。' : '保留记录，可在「我的 → 已移除记录」中找回。')+'</p></div>');
    if (entry.history?.length) {
      html += '<div class="section"><h3>更新历史</h3></div><div class="rows">'+entry.history.slice().reverse().map(item =>
        '<div class="history-row"><span class="muted">'+esc(localDate(new Date(item.recorded_at)))+'</span><span class="amount">'+amountMarkup(moneyFromCents(item.cents))+'</span></div>'
      ).join('')+'</div>';
    }
  } else if (settingsView) {
    html += myView === 'archives' ? archivedRecordsMarkup() : '<div class="settings-about"><img src="/icon-192.png?v=20261120" alt=""><h2>Saldo</h2><p>轻松管理你的储值卡和各类订阅</p></div><div class="settings-list">'+
      settingsRow({label:'使用条款与隐私说明',icon:'document',href:'/terms.html?from=me'})+
      settingsRow({label:'联系支持',description:'service@saldo.tobmarket.ing',icon:'mail',href:'mailto:service@saldo.tobmarket.ing',navigate:false})+
      settingsRow({label:'版本信息',icon:'info',value:appVersion+(isLocalPreview()?' · 预览版':'')})+'</div>';
  } else if (page === '总览') {
    const cards = active('cards');
    const hasBalance = cards.some(entry => entry.balance !== null);
    html += '<div class="wallet overview-balance"><div class="muted">最近记录余额 · CNY</div><div class="balance">'+
      (hasBalance ? '<span class="money-symbol">¥</span><span class="money-number">'+amountMarkup(moneyFromCents(totalBalanceCents(cards)))+'</span>'
        : '<span class="balance-placeholder">待记录</span>')+'</div></div>'+
      '<div class="metrics"><button data-page="储值卡">'+svg('card')+' '+cards.length+' 张储值卡</button>'+
      '<button data-page="订阅">'+svg('calendar')+' '+active('subs').length+' 个订阅</button></div>';
    const soon = active('subs').filter(entry => entry.date && days(entry.date) >= 0 && days(entry.date) <= 30)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (soon.length) html += '<div class="section"><h3>近期到期</h3><span class="muted">未来 30 天</span></div>'+soon.map(notice).join('');
    html += '<div class="section"><h3>我的储值卡</h3>'+(cards.length ? '<button data-page="储值卡">查看全部 →</button>' : '')+'</div>';
    if (!cards.length) {
      html += emptyState('card', '添加第一张储值卡，开始记录余额', '添加储值卡', 'data-add-kind="cards"');
    } else {
      if (!hasBalance) html += emptyState('card', '补充余额后，即可查看汇总', '记录余额', 'data-record-balance="'+esc(cards[0].id)+'"');
      html += rows('cards', cards.slice(0, 4));
    }
  } else if (page === '我的') {
    const archiveCount = data.cards.filter(x=>x.archived).length+data.subs.filter(x=>x.archived).length;
    html += '<div class="my-account"><img src="/icon-192.png?v=20261120" alt=""><div class="my-account-copy"><h2>我的账号</h2><p class="account-email">'+esc(currentSession.user.email)+'</p></div></div>'+
      '<section class="settings-group"><h2>使用设置</h2><div class="settings-list">'+
      settingsRow({label:'管理通知',description:notificationSummary,descriptionId:'my-notification-summary',icon:'bell',action:'notifications'})+
      (isStandalone() || installedThisSession ? '' : settingsRow({label:'添加到主屏幕',description:'更方便地打开 Saldo',icon:'install',action:'install-guide'}))+'</div></section>'+
      '<section class="settings-group"><h2>数据管理</h2><div class="settings-list">'+
      settingsRow({label:'已移除记录',description:'恢复或永久删除',icon:'archive',value:archiveCount?String(archiveCount):'',action:'archives'})+
      settingsRow({label:'导出数据',description:'包含已移除记录及余额历史',icon:'export',action:'export',value:'JSON',navigate:false})+'</div></section>'+
      '<section class="settings-group"><h2>关于</h2><div class="settings-list">'+settingsRow({label:'关于 Saldo',description:'条款、支持与版本',icon:'info',action:'about'})+'</div></section>'+
      '<button class="my-signout" data-action="sign-out">退出登录</button>';
  } else {
    const kind = page === '储值卡' ? 'cards' : 'subs';
    const entries = active(kind);
    const list = entries.filter(entry => entry.name.toLowerCase().includes(query.toLowerCase()));
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'value') list.sort((a, b) => kind === 'cards' ? (b.balance ?? -1) - (a.balance ?? -1) : (a.date || '9999').localeCompare(b.date || '9999'));
    html += '<div class="section"><h2>'+page+'</h2><span class="muted">'+entries.length+' 项记录</span></div>';
    if (entries.length) html += '<div class="toolbar"><input id="search" aria-label="搜索记录" placeholder="搜索名称" value="'+esc(query)+'"><select id="sort" aria-label="排序">'+
      '<option value="default">默认排序</option><option value="name"'+(sort === 'name' ? ' selected' : '')+'>按名称</option>'+
      '<option value="value"'+(sort === 'value' ? ' selected' : '')+'>'+(kind === 'cards' ? '按余额' : '按到期日')+'</option></select></div>';
    html += list.length ? rows(kind, list) : entries.length
      ? emptyState('search', '没有找到匹配的记录，试试其他关键词', '清空搜索', 'data-action="clear-search"')
      : emptyState(kind === 'cards' ? 'card' : 'calendar', kind === 'cards' ? '还没有储值卡，添加后即可记录余额' : '添加订阅，集中查看到期日',
        kind === 'cards' ? '添加储值卡' : '添加订阅', 'data-add-kind="'+kind+'"');
  }
  $('app').innerHTML = html+'</main><p id="sync-status" class="sync-status" role="status">'+esc(syncMessage)+'</p>';
  updateNavigation();
  updateDetailActions();
  decorateFields();
  observeLayout();
  if (page === '我的' && !myView && !selected) void updateMyNotificationSummary();
  $('search')?.addEventListener('input', event => {
    const position = event.target.selectionStart;
    query = event.target.value;
    render();
    $('search').focus();
    $('search').setSelectionRange(position, position);
  });
  $('sort')?.addEventListener('change', event => { sort = event.target.value; render(); });
}

const tabs = ['总览', '储值卡', '订阅', '我的'];
let detailScroll = 0;

function appRoute(){return {page,selected,type,myView,creating:Boolean(editDraft?.isNew),modal:modalLayer};}
function routeBase(route){return {...route,selected:null,creating:false,myView:'',modal:0};}
function rememberTab(){if(!selected&&!myView)tabStates[page]={query,sort,scroll:window.scrollY};}
function routeChangesRecord(from,to){return from.selected!==to.selected || from.type!==to.type || from.creating!==to.creating;}
function needsRouteGuard(from,to){return writing || (from.modal!==to.modal && dialog.open && dialog.dataset.dirty==='true') || (routeChangesRecord(from,to)&&detailIsDirty());}
function confirmRouteLeave(from,to){
  if(writing){toast('正在保存，请稍候。');return Promise.resolve(false);}
  if(!needsRouteGuard(from,to))return Promise.resolve(true);
  if(document.querySelector('[data-discard-dialog]'))return Promise.resolve(false);
  return new Promise(resolve=>confirmDiscardChanges(()=>{delete dialog.dataset.dirty;const cached=modalCache.get(from.modal);if(cached)cached.invalid=true;resolve(true);},{onStay:()=>resolve(false)}));
}
function applyRoute(next,previous){
  if(!ready)return;
  rememberTab();
  const previousModal=modalCache.get(previous?.modal);
  const onlyLayer=previous && !routeChangesRecord(previous,next) && previous.page===next.page && previous.myView===next.myView;
  if(dialog.open && next.modal!==modalLayer)finishModalClose(false);
  if(onlyLayer && next.modal!==previous.modal){
    modalLayer=next.modal||0;
    if(modalLayer){const cached=modalCache.get(modalLayer);if(cached&&!cached.invalid){delete dialog.dataset.dirty;dialog.replaceChildren(...cached.nodes);dialog.classList.toggle('bottom-sheet',cached.sheet);dialog.showModal();focusModal();}else{modalLayer=0;navigationHistory.replace(appRoute());}}
    else restoreModalFocus(previousModal);
    return;
  }
  if(!onlyLayer)clearDetailDraft();
  page=next.page;type=next.type||'cards';selected=next.selected||null;myView=next.myView||'';modalLayer=0;
  const state=tabStates[page]||{};query=state.query||'';sort=state.sort||'default';
  if(next.creating)createRecordDraft(type,next.selected);
  if(selected&&!get()){selected=null;toast('这条记录暂不可用，已返回列表。');navigationHistory.replace(appRoute());}
  render();window.scrollTo(0,selected||myView?0:state.scroll||0);
  const previousRow=previous?.selected?$('app').querySelector('[data-open="'+previous.type+':'+previous.selected+'"]'):null;
  const focusTarget=previousRow || (selected?$('app').querySelector('.detail-head'):myView?$('app').querySelector('header h1'):$('app').querySelector('main h2,main h3,main'));
  if(focusTarget&&!focusTarget.matches('button,a,input,select,textarea'))focusTarget.setAttribute('tabindex','-1');focusTarget?.focus({preventScroll:true});
}
const navigationHistory=createHistoryNavigation({apply:applyRoute,needsGuard:needsRouteGuard,confirmLeave:confirmRouteLeave});
async function navigate(next,{replace=false}={}){
  const previous=appRoute();
  if(needsRouteGuard(previous,next)&&!await confirmRouteLeave(previous,next))return;
  rememberTab();navigationHistory[replace?'replace':'push'](next);applyRoute(next,previous);
}
function showPage(next,direction=0){
  if(next===page&&!selected&&!myView)return;
  void navigate({page:next,type:next==='订阅'?'subs':'cards',selected:null,myView:'',creating:false,modal:0}).then(()=>{if(direction)$('app').querySelector('main').dataset.enterFrom=direction>0?'right':'left';});
}
const isLocalPreview=()=>['localhost','127.0.0.1','[::1]'].includes(location.hostname);
function rememberMyReturn(){try{sessionStorage.setItem('saldo.myReturn',JSON.stringify({user:currentSession.user.id,scroll:myView?myScroll:window.scrollY}));}catch{}}
function openMyView(view){if(!myView){myScroll=window.scrollY;rememberMyReturn();}void navigate({page:'我的',type:'cards',selected:null,myView:view,creating:false,modal:0});}
function backToMy(){navigationHistory.back(()=>void navigate({page:'我的',type:'cards',selected:null,myView:'',creating:false,modal:0},{replace:true}));}
async function openRecord(key){const [kind,id]=key.split(':');detailScroll=window.scrollY;await navigate({page,type:kind,selected:id,myView,creating:false,modal:0});}
function initializeRoutes(){
  const url=new URL(location.href),pages={me:'我的',cards:'储值卡',subscriptions:'订阅',home:'总览'};
  page=pages[url.searchParams.get('view')]||page;
  type=url.searchParams.get('kind')==='subs'?'subs':page==='订阅'?'subs':'cards';
  selected=url.searchParams.get('record');myView=page==='我的'&&['about','archives'].includes(url.searchParams.get('section'))?url.searchParams.get('section'):'';
  const requested={page,type,selected,myView,creating:url.searchParams.get('new')==='1',modal:0};
  if(requested.creating){requested.selected=crypto.randomUUID();createRecordDraft(type,requested.selected);selected=requested.selected;}
  if(selected&&!get())selected=requested.selected=null;
  navigationHistory.initialize({...requested,selected},routeBase(requested));navReady=true;
}

async function updateMyNotificationSummary() {
  const owner = currentSession?.user.id;
  if (!owner || summaryLoading || summaryOwner === owner) return;
  summaryLoading = true;
  try {
    const [preferences,subscription] = await Promise.all([loadNotificationPreferences(owner),registeredPushDevice()]);
    let connected = false;
    if (subscription && browserPushStatus().permission === 'granted') {
      const saved = await client.from('saldo_push_devices').select('id').eq('user_id',owner).eq('endpoint',subscription.endpoint).maybeSingle();
      if (saved.error) throw saved.error;
      connected = Boolean(saved.data);
    }
    if (currentSession?.user.id !== owner) return;
    const channels = [];
    if (preferences.email_enabled) channels.push('邮件开启');
    if (preferences.push_enabled) {
      const browser = browserPushStatus();
      channels.push(connected ? '此设备推送已连接' : !browser.available ? '此设备暂不支持推送' : browser.permission === 'denied' ? '此设备通知权限已关闭' : '此设备推送待授权');
    }
    notificationSummary = channels.join(' · ') || '全部提醒已关闭';
  } catch { notificationSummary = '查看接收方式'; }
  finally {
    summaryLoading = false;
    if (currentSession?.user.id === owner) {
      summaryOwner = owner;
      const node = $('my-notification-summary'); if (node) node.textContent = notificationSummary;
    }
  }
}

function backFromDetail(){if(selected)navigationHistory.back(()=>void navigate(routeBase(appRoute()),{replace:true}));}

installSwipeNavigation({
  canStart: () => !writing && !authBusy && !document.querySelector('[data-discard-dialog]'),
  onLeft: () => {
    if (dialog.open) { closeModal(); return true; }
    if (!ready) {
      const back = $('app').querySelector('.auth-back-button');
      if (!back) return false;
      back.click(); return true;
    }
    if (selected) { $('app').querySelector('[data-action="back"]').click(); return true; }
    if (myView) { backToMy(); return true; }
    const next = tabs[tabs.indexOf(page)+1];
    if (!next) return false;
    showPage(next,1); return true;
  },
  onRight: () => {
    if (!ready || selected || myView || dialog.open) return false;
    const next = tabs[tabs.indexOf(page)-1];
    if (!next) return false;
    showPage(next,-1); return true;
  },
});

const navigation = document.createElement('nav');
navigation.className = 'nav';
navigation.hidden = true;
navigation.setAttribute('aria-label', '主导航');
navigation.innerHTML = '<span class="nav-button-highlight" aria-hidden="true"></span>' +
  tabs.map((tab, i) => '<button type="button" data-page="' + tab + '">' +
    svg(['home', 'card', 'calendar', 'user'][i]) + tab + '</button>').join('');
$('app').after(navigation);
const editActions=document.createElement('section');
editActions.className='detail-editbar';editActions.hidden=true;
editActions.setAttribute('role','group');editActions.setAttribute('aria-label','整页编辑操作');
navigation.after(editActions);
function updateEditViewport(){
  const viewport=window.visualViewport;
  const inset=editDraft && viewport && viewport.scale===1 ? Math.max(0,innerHeight-viewport.height-viewport.offsetTop) : 0;
  document.documentElement.style.setProperty('--detail-keyboard-inset',inset+'px');
}
window.visualViewport?.addEventListener('resize',updateEditViewport);
window.visualViewport?.addEventListener('scroll',updateEditViewport);
window.addEventListener('resize',updateEditViewport);
function updateDetailActions(){
  const editing=Boolean(ready&&selected&&editDraft);
  editActions.hidden=!editing;
  document.documentElement.classList.toggle('has-detail-draft',editing);
  editActions.innerHTML=editing?'<button class="editbar-cancel" type="button" data-action="cancel-detail" '+(writing?'disabled':'')+'>取消</button><button class="editbar-save" type="button" data-action="save-detail" '+(writing?'disabled':'')+'>'+(writing?loadingIndicator+'<span>保存中…</span>':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg><span>保存更改</span>')+'</button>':'';
  updateEditViewport();
}


let installPrompt = null;
let installedThisSession = false;
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  if (ready && page === '我的' && !selected && !dialog.open) render();
});
window.addEventListener('appinstalled', () => {
  installedThisSession = true;
  installPrompt = null;
  if (dialog.querySelector('[data-install-platform]')) installGuide();
  if (ready && page === '我的' && !selected) render();
});

function installGuide(platform) {
  const appleDevice = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const currentPlatform = platform || (appleDevice ? 'ios' : 'android');
  if (isStandalone() || installedThisSession) {
    modal(isStandalone()
      ? '<h2>已从主屏幕打开</h2><p class="muted">以后可以点击主屏幕上的 Saldo 图标进入。在「管理通知」中开启此设备的推送授权，即可接收到期提醒。</p><button class="primary" data-action="notifications">管理通知</button>'
      : '<h2>已添加到主屏幕</h2><p class="muted">请返回设备主屏幕，点击 Saldo 图标打开，再到「我的 → 管理通知」开启此设备推送。</p><button class="primary" data-action="close">知道了</button>', {sheet:true});
    return;
  }
  const steps = currentPlatform === 'ios'
    ? '<li>在 Safari 中打开 <strong>saldo.tobmarket.ing</strong>。</li>'+
      '<li>点击「分享」。部分版本需先点页面菜单，再选择「分享」。</li>'+
      '<li>选择「添加到主屏幕」，如出现「作为网页 App 打开」，请开启它，然后点击「添加」。</li>'+
      '<li>从主屏幕打开 Saldo，在「我的 → 管理通知」中开启此设备推送。</li>'
    : '<li>在 Android 的 Chrome 浏览器中打开 <strong>saldo.tobmarket.ing</strong>。</li>'+
      '<li>打开右上角菜单，选择「添加到主屏幕」或「安装应用」。</li>'+
      '<li>按提示点击「安装」或「添加」。</li>'+
      '<li>从主屏幕打开 Saldo，在「我的 → 管理通知」中开启此设备推送。</li>';
  modal('<h2>添加到主屏幕</h2><p class="muted">从主屏幕快速打开 Saldo，并开启设备到期提醒。</p>'+
    '<div class="seg" role="group" aria-label="选择设备系统">'+
    '<button type="button" data-install-platform="ios" aria-pressed="'+(currentPlatform === 'ios')+'" class="'+(currentPlatform === 'ios' ? 'active' : '')+'">iPhone / iPad</button>'+
    '<button type="button" data-install-platform="android" aria-pressed="'+(currentPlatform === 'android')+'" class="'+(currentPlatform === 'android' ? 'active' : '')+'">Android</button></div>'+
    '<ol class="install-steps">'+steps+'</ol>'+
    (currentPlatform === 'android' && installPrompt ? '<button type="button" class="primary" id="install-now">安装 Saldo</button>' : '')+
    '<p class="muted install-note">在微信等应用内打开时，请先选择「在浏览器打开」。菜单名称可能随浏览器版本不同。</p>', {sheet:true});
  dialog.querySelectorAll('[data-install-platform]').forEach(button => {
    button.onclick = () => installGuide(button.dataset.installPlatform);
  });
  const install = $('install-now');
  if (install) install.onclick = async () => {
    const prompt = installPrompt;
    if (!prompt) return;
    installPrompt = null;
    install.disabled = true;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      toast('请按上方步骤通过浏览器菜单添加。');
    } finally {
      if (install.isConnected && dialog.open) installGuide(currentPlatform);
    }
  };
}

function updateNavigation() {
  navigation.hidden = selected !== null || Boolean(myView);
  navigation.style.setProperty('--active-tab', tabs.indexOf(page));
  for (const button of navigation.querySelectorAll('button')) {
    const current = button.dataset.page === page;
    button.classList.toggle('active', current);
    if (current) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
}

const dialog = $('modal');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let closeTimer;

function restoreModalFocus(cached){
  const target=cached?.invoker?.isConnected?cached.invoker:cached?.action?$('app').querySelector('[data-action="'+cached.action+'"]'):null;
  target?.focus({preventScroll:true});
}
function focusModal(){
  const title=dialog.querySelector('h2');
  if(title){title.id='modal-title';title.tabIndex=-1;dialog.setAttribute('aria-labelledby','modal-title');title.focus({preventScroll:true});}
}
function finishModalClose(historyClose=true){
  clearTimeout(closeTimer);delete dialog.dataset.closing;
  const cached=modalCache.get(modalLayer);
  if(cached){cached.nodes=[...dialog.childNodes];cached.dirty=dialog.dataset.dirty==='true';}
  if(dialog.open)dialog.close();
  if(historyClose && navReady && modalLayer){navigationHistory.back(()=>{modalLayer=0;navigationHistory.replace(appRoute());});}
  else if(!historyClose)modalLayer=0;
  restoreModalFocus(cached);
}

function closeModal(committed = false) {
  if (writing && !committed) { toast('正在保存，请稍候。'); return; }
  if (!dialog.open || 'closing' in dialog.dataset || dialog.getAttribute('aria-busy') === 'true') return;
  if (dialog.dataset.dirty === 'true') {
    confirmDiscardChanges(() => { delete dialog.dataset.dirty;const cached=modalCache.get(modalLayer);if(cached)cached.invalid=true;closeModal(); });
    return;
  }
  if (reduceMotion.matches) { finishModalClose(); return; }
  dialog.dataset.closing = '';
  // Fallback if the exit animation is skipped or interrupted.
  closeTimer = setTimeout(()=>finishModalClose(), 220);
}

dialog.addEventListener('input', () => { dialog.dataset.dirty='true'; });
dialog.addEventListener('change', () => { dialog.dataset.dirty='true'; });
dialog.addEventListener('animationend', event => {
  if (event.target === dialog && ['dialog-exit','sheet-exit'].includes(event.animationName) && 'closing' in dialog.dataset) {
    finishModalClose();
  }
});
dialog.addEventListener('click', event => {
  if (!('closing' in dialog.dataset)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);
dialog.addEventListener('cancel', event => {
  event.preventDefault();
  closeModal();
});

function modal(content,{sheet=false}={}){
  const invoker=dialog.open?modalCache.get(modalLayer)?.invoker:document.activeElement;
  clearTimeout(closeTimer);delete dialog.dataset.closing;delete dialog.dataset.dirty;
  dialog.classList.toggle('bottom-sheet',sheet);
  dialog.innerHTML='<button class="close" data-action="close" aria-label="关闭">×</button>'+content;
  if(!dialog.open){
    modalLayer=++modalSequence;
    if(navReady)navigationHistory.push(appRoute());
    dialog.showModal();
  }
  modalCache.set(modalLayer,{nodes:[...dialog.childNodes],sheet,invoker,action:invoker?.dataset?.action});focusModal();
}

function defaults(cycle) {
  if (cycle === '按月') return [3, 1];
  if (cycle === '按年' || cycle === '两年及以上') return [30, 7, 1];
  return [7, 1];
}

function formatReminders(days) {
  return [...days].sort((a, b) => b - a)
    .map(n => n === 0 ? '到期当天' : '提前' + n + '天').join('、');
}

function archivedRecordsMarkup() {
  const groups = ['cards', 'subs'].map(kind => {
    const list = data[kind].filter(entry => entry.archived);
    if (!list.length) return '';
    return '<section class="archive-group"><h3>'+(kind === 'cards' ? '储值卡' : '订阅')+'</h3><div class="settings-list">'+list.map(entry => {
      const key = kind+':'+esc(entry.id);
      return '<article class="archive-entry"><button class="archive-open" data-open="'+key+'">'+logo(entry)+
        '<span class="row-copy"><span class="name">'+esc(entry.name)+'</span><span class="mini">查看详情 ›</span></span></button>'+
        '<div class="archive-actions"><button class="secondary" data-restore-record="'+key+'" aria-label="恢复 '+esc(entry.name)+'">恢复</button>'+
        '<button class="secondary danger" data-delete-record="'+key+'" aria-label="删除 '+esc(entry.name)+'">删除</button></div></article>';
    }).join('')+'</div></section>';
  }).join('');
  return groups ? '<p class="settings-intro">恢复后会重新显示在列表，并计入概况。永久删除后无法找回。</p>'+groups+'<p id="archive-error" class="error" role="alert"></p>'
    : emptyState('archive','你移除的记录会保留在这里','返回我的','data-action="my-back"');
}

function archivesDialog() {
  closeModal();
  if (myView === 'archives') render(); else openMyView('archives');
}

function confirmRecordDelete(key) {
  const [kind, id] = key.split(':');
  const entry = data[kind]?.find(item => item.id === id && item.archived);
  if (!entry) return;
  modal('<h2>永久删除这条记录？</h2><p class="delete-record-name">'+esc(entry.name)+'</p><p class="muted">'+
    (kind === 'cards' ? '这张储值卡及其余额历史将被永久删除，无法恢复。' : '这个订阅及其到期提醒设置将被永久删除，无法恢复。')+
    '</p><p id="archive-error" class="error" role="alert"></p><div class="delete-actions">'+
    '<button class="secondary" data-action="archives">取消</button><button class="secondary danger" data-confirm-delete="'+esc(key)+'">永久删除</button></div>', {sheet:true});
  dialog.querySelector('[data-action="archives"]').focus();
}

async function changeArchivedRecord(key, remove = false) {
  if (writing) return;
  const [kind, id] = key.split(':');
  const entry = data[kind]?.find(item => item.id === id && item.archived);
  if (!entry) { archivesDialog(); return; }
  const buttons = [...document.querySelectorAll('.archive-actions button'),...dialog.querySelectorAll('button')];
  buttons.forEach(button => button.disabled = true);
  dialog.setAttribute('aria-busy', 'true');
  try {
    await changeRecord(kind, entry, { archived: false }, {
      remove, error: dialog.open ? dialog.querySelector('#archive-error') : $('archive-error'), successMessage: remove ? '已永久删除' : '已恢复',
      done: () => { const scroll = window.scrollY;const cached=modalCache.get(modalLayer);if(cached)cached.invalid=true;finishModalClose(); render(); window.scrollTo(0,scroll); },
      onFailure: () => {
        // Refresh the list after a conflict; a changed record requires a new confirmation.
        if (data[kind].find(item => item.id === id)?.version !== entry.version) { finishModalClose(); render(); }
      },
    });
  } finally {
    buttons.forEach(button => button.disabled = false);
    dialog.removeAttribute('aria-busy');
  }
}

function createRecordDraft(kind,id=crypto.randomUUID()){
  dismissToast();
  const base={id,version:0,name:'',date:'',note:'',archived:false,...(kind==='cards'?{balance:null,history:[],updated:''}:{fee:null,cycle:'',autoRenew:null,reminderDays:null})};
  const raw=rawRecord(base,kind);editDraft={isNew:true,base,raw:{...raw},original:{...raw},reminderDays:base.reminderDays};
  detailError='';detailFieldErrors={};
}
async function add(kind){
  if(writing)return;
  const next={page,type:kind,selected:crypto.randomUUID(),myView,creating:true,modal:0};
  await navigate(next,{replace:Boolean(editDraft?.isNew)});
  $('app').querySelector('[data-field="name"]')?.focus({preventScroll:true});
}

function reminderDialog(recommended = false) {
  const entry = get();
  if (!editDraft) return;
  const chosen = (recommended ? null : editDraft.reminderDays) ?? defaults(editDraft.raw.cycle);
  modal(`<h2>到期提醒设置</h2><p class="muted">选择后点击「完成」，再用底部「保存更改」统一提交。</p>
    <div class="rem-options" id="rem-options" role="group" aria-label="提醒时间">
      ${[0, 1, 3, 7, 14, 30].map(n => `<button type="button" class="rem-choice" data-rem-day="${n}" aria-pressed="${chosen.includes(n)}">
        <span>${n === 0 ? '到期当天' : '提前 ' + n + ' 天'}</span><span class="rem-check" aria-hidden="true">✓</span>
      </button>`).join('')}
    </div>
    <button class="rem-recommend" data-action="recommend-rem">按订阅周期推荐</button>
    <p class="error" role="alert" id="rem-error"></p>
    <button id="rem-save" class="primary" data-action="save-rem" ${chosen.length ? '' : 'disabled'}>完成</button>
    <button class="secondary" data-action="off-rem">关闭提醒</button>`);
  if (recommended) dialog.dataset.dirty='true';
}

function exportWallet() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'saldo-' + localDate() + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!ready || !button) return;
  if (button.dataset.restoreRecord && !writing) await changeArchivedRecord(button.dataset.restoreRecord);
  if (button.dataset.deleteRecord && !writing) confirmRecordDelete(button.dataset.deleteRecord);
  if (button.dataset.confirmDelete && !writing) await changeArchivedRecord(button.dataset.confirmDelete, true);
  if (button.dataset.page) showPage(button.dataset.page);
  if(button.dataset.open)await openRecord(button.dataset.open);
  if(button.dataset.addKind&&!writing)await add(button.dataset.addKind);
  if(button.dataset.recordBalance){await openRecord('cards:'+button.dataset.recordBalance);beginDetailEdit();$('app').querySelector('[data-field="balance"]')?.focus();}
  if (button.dataset.type && !writing) add(button.dataset.type);
  if (button.hasAttribute('data-rem-day') && !writing) {
    dialog.dataset.dirty='true';
    button.setAttribute('aria-pressed', button.getAttribute('aria-pressed') !== 'true');
    $('rem-save').disabled = !dialog.querySelector('[data-rem-day][aria-pressed="true"]');
  }
  switch (button.dataset.action) {
    case 'close':
      closeModal();
      break;
    case 'edit-detail':
      if (!writing) beginDetailEdit();
      break;
    case 'cancel-detail':
      if (!writing) cancelDetailEdit();
      break;
    case 'save-detail':
      await saveDetail();
      break;
    case 'back':
      backFromDetail();
      break;
    case 'install-guide':
      installGuide();
      break;
    case 'notifications':
      rememberMyReturn();
      sessionStorage.setItem('saldo.notificationFromApp','true');
      location.assign('/notification-settings.html');
      break;
    case 'my-back':
      if (!writing) backToMy();
      break;
    case 'about':
      if (!writing) openMyView('about');
      break;
    case 'add':
      if (!writing) add(page === '订阅' ? 'subs' : 'cards');
      break;
    case 'archive': {
      const entry=get(),kind=type,restoring=entry.archived;
      await changeRecord(kind,entry,{archived:!entry.archived},{
        successMessage:restoring?'已恢复记录':'已移除记录',
        done:()=>{clearDetailDraft();navigationHistory.back(()=>{selected=null;navigationHistory.replace(appRoute());render();});
          if(!restoring){const fresh=data[kind].find(row=>row.id===entry.id);queueMicrotask(()=>toast('已移除记录',{action:async()=>{await changeRecord(kind,fresh,{archived:false},{successMessage:'已撤销移除'});}}));}
        },
      });
      break;
    }
    case 'reminder':
    case 'recommend-rem':
      if (!writing) reminderDialog(button.dataset.action === 'recommend-rem');
      break;
    case 'save-rem':
    case 'off-rem': {
      const days = button.dataset.action === 'off-rem' ? [] :
        Array.from(dialog.querySelectorAll('[data-rem-day][aria-pressed="true"]'), el => Number(el.dataset.remDay));
      if (!editDraft || writing) break;
      editDraft.reminderDays = days;
      delete dialog.dataset.dirty;
      finishModalClose();
      const scroll = window.scrollY;
      render(); window.scrollTo(0,scroll);
      break;
    }
    case 'archives': {
      if (!writing) archivesDialog();
      observeLayout();
      break;
    }
    case 'clear-search':
      query = '';
      render();
      $('search')?.focus();
      break;
    case 'export':
      exportWallet();
      toast('已导出数据，包含已移除记录');
      break;
    case 'sign-out':
      button.disabled = true;
      try {
        await detachPushDevice(currentSession.user.id);
        const { error } = await client.auth.signOut({ scope: 'local' });
        if (error) throw error;
      } catch {
        if (button.isConnected) toast('退出登录失败，请重试。');
      } finally {
        button.disabled = false;
      }
      break;
  }
});

function clearDetailDraft() {
  editDraft = null; detailError = ''; detailFieldErrors = {};
  updateDetailActions();
}
function rawRecord(entry,kind=type) {
  const names=kind==='cards'?['name','balance','date','note']:['name','date','cycle','fee','autoRenew','note'];
  return Object.fromEntries(names.map(name=>[name,entry[name]===null || entry[name]===undefined ? '' : String(entry[name])]));
}
function sameReminders(a,b) {
  if(a==null || b==null)return a==null && b==null;
  return JSON.stringify([...a].sort((x,y)=>x-y))===JSON.stringify([...b].sort((x,y)=>x-y));
}
function detailIsDirty() {
  return editDraft && (JSON.stringify(editDraft.raw)!==JSON.stringify(editDraft.original) || !sameReminders(editDraft.reminderDays,editDraft.base.reminderDays));
}
function reminderSummary(reminders,cycle) {
  return esc(reminders?.length===0?'已关闭':formatReminders(reminders??defaults(cycle))).split('、').map(text=>'<span class="reminder-token">'+text+'</span>').join('、');
}
function beginDetailEdit() {
  if (!selected || writing || editDraft) return;
  dismissToast();
  const entry=get(),raw=rawRecord(entry);
  editDraft={base:structuredClone(entry),raw:{...raw},original:{...raw},reminderDays:entry.reminderDays==null ? entry.reminderDays : [...entry.reminderDays]};
  // Cards have no reminder field; preserve the original undefined dirty baseline.
  if(type==='cards')editDraft.reminderDays=entry.reminderDays;
  detailError='';detailFieldErrors={};
  const scroll=window.scrollY;render();window.scrollTo(0,scroll);
}
function cancelDetailEdit() {
  if(!editDraft || writing)return;
  const cancel=()=>{if(editDraft?.isNew){clearDetailDraft();backFromDetail();return;}const scroll=window.scrollY;clearDetailDraft();render();window.scrollTo(0,scroll);$('app').querySelector('[data-action="edit-detail"]')?.focus({preventScroll:true});};
  if(detailIsDirty())confirmDiscardChanges(cancel);else cancel();
}
function decorateFields() {
  document.querySelectorAll('#app [data-field]').forEach(field=>{
    const name=field.dataset.field,view=document.createElement('div'),value=document.createElement('span');
    view.className='field-view'+(editDraft?' editing':'');
    value.className='field-value'+(field.value===''?' empty':'');
    let display=name==='autoRenew'?field.selectedOptions[0].textContent:field.value;
    if((name==='balance'||name==='fee') && display!==''){
      value.classList.add('money-number');value.innerHTML=(name==='fee'?'¥':'')+amountMarkup(money(display));
    }else{
      if(name==='date'&&display)display=display.replaceAll('-',' / ');
      value.textContent=display||(name==='balance'?'待更新':'未填写');
    }
    field.before(view);view.append(value,field);field.classList.add('field-edit');
    if(!editDraft)return;
    if(name==='name'){field.required=true;field.setAttribute('aria-required','true');field.placeholder='名称（必填）';}
    field.value=editDraft.raw[name];field.disabled=writing;
    if(field.tagName==='INPUT')field.setAttribute('enterkeyhint','next');
    const error=detailFieldErrors[name];
    if(error){
      field.setAttribute('aria-invalid','true');field.setAttribute('aria-describedby','detail-error-'+name);
      const message=document.createElement('p');message.className='inline-error error';message.id='detail-error-'+name;message.setAttribute('role','alert');message.textContent=error;view.append(message);
    }
    const update=()=>{
      editDraft.raw[name]=field.value;
      if(name==='date' && $('app').querySelector('.detail-status'))$('app').querySelector('.detail-status').textContent=status(field.value);
      if(name==='cycle' && $('app').querySelector('.reminder-copy'))$('app').querySelector('.reminder-copy').innerHTML=reminderSummary(editDraft.reminderDays,field.value);
      delete detailFieldErrors[name];field.removeAttribute('aria-invalid');field.removeAttribute('aria-describedby');view.querySelector('.inline-error')?.remove();
      if(detailError){detailError='';$('detail-error')?.remove();}
    };
    field.addEventListener('input',update);field.addEventListener('change',update);
    field.addEventListener('keydown',event=>{
      if(event.isComposing)return;
      if(event.key==='Escape'){event.preventDefault();cancelDetailEdit();}
      else if(event.key==='Enter' && field.tagName==='INPUT'){
        event.preventDefault();
        const fields=[...$('app').querySelectorAll('[data-field]')];
        (fields[fields.indexOf(field)+1]||document.querySelector('[data-action="save-detail"]')).focus();
      }
    });
  });
}
async function saveDetail() {
  if(!editDraft || writing || !selected)return;
  dismissToast();
  const draft=editDraft,kind=type,scroll=window.scrollY;
  detailFieldErrors={};
  const fields=[...$('app').querySelectorAll('[data-field]')];
  for(const field of fields){
    draft.raw[field.dataset.field]=field.value;
    const message=recordFieldError(field.dataset.field,field.value)||(!field.checkValidity()?'请填写有效的日期或金额。':'');
    if(message)detailFieldErrors[field.dataset.field]=message;
  }
  if(Object.keys(detailFieldErrors).length){
    render();const field=$('app').querySelector('[data-field="'+Object.keys(detailFieldErrors)[0]+'"]');field.focus();return;
  }
  if(!draft.isNew && !detailIsDirty()){clearDetailDraft();render();window.scrollTo(0,scroll);toast('没有需要保存的修改');return;}
  const changes={};
  for(const [name,raw] of Object.entries(draft.raw)){
    if(!draft.isNew && raw===draft.original[name])continue;
    const value=name==='autoRenew'?parseRenewal(raw):name==='balance'||name==='fee'?(raw===''?null:Number(raw)):name==='note'?raw:raw.trim();
    // Do not rewrite unchanged numeric values or coerce an existing long cycle.
    if(draft.isNew || value!==(draft.base[name]??(name==='balance'||name==='fee'||name==='autoRenew'?null:'')))changes[name]=value;
  }
  if(!sameReminders(draft.reminderDays,draft.base.reminderDays))changes.reminderDays=draft.reminderDays;
  if(!Object.keys(changes).length){clearDetailDraft();render();window.scrollTo(0,scroll);toast('没有需要保存的修改');return;}
  detailError='';
  const pending=changeRecord(kind,draft.isNew?null:draft.base,changes,{id:draft.base.id,
    done:()=>{clearDetailDraft();navigationHistory.replace(appRoute());render();window.scrollTo(0,scroll);$('app').querySelector('[data-action="edit-detail"]')?.focus({preventScroll:true});},
    onFailure:message=>{if(editDraft===draft)detailError=message+(message.includes('其他设备')?' 请取消编辑，核对最新数据后再修改。':'');},
  });
  render();window.scrollTo(0,scroll);
  await pending;
  if(editDraft===draft){render();window.scrollTo(0,scroll);}
}
window.addEventListener('beforeunload',event=>{
  if(detailIsDirty() || (dialog.open && dialog.dataset.dirty==='true')){event.preventDefault();event.returnValue='';}
});
let authScreen = 'welcome';
let authMessage = '';
let authEmail = '';
let authTermsAccepted = false;
let verificationMode = 'link';
let authBusy = false;
let otpEmail = '';
let otpResendAt = 0;
let otpTimer;
let sessionRevision = 0;
let syncMessage = '';

const authProviderNote = '<details class="auth-provider"><summary>账号验证由 Supabase 提供<span aria-hidden="true">⌄</span></summary><p>Google 授权页可能显示 Supabase 或 supabase.co，完成授权后将返回 Saldo。首次使用 Google 登录时，会自动创建账号。</p></details>';
const termsLink = '<a href="./terms.html" target="_blank" rel="noopener">使用条款与隐私说明</a>';
const loadingIndicator = '<span class="loading-ring" aria-hidden="true"></span>';

function consentField(id) {
  return `<div class="account-consent">
    <input id="${id}" name="terms" type="checkbox" required>
    <label id="${id}-label" for="${id}">我已阅读并同意${termsLink}。</label>
  </div>`;
}

function clearAuthFeedback() {
  const status = $('auth-status');
  if (!status) return;
  status.textContent = '';
  status.classList.remove('is-error');
  status.setAttribute('role','status');
  for (const field of $('app').querySelectorAll('#account-form input')) {
    field.removeAttribute('aria-invalid');
    const description = (field.getAttribute('aria-describedby') || '').split(' ').filter(id=>id && id!=='auth-status').join(' ');
    if (description) field.setAttribute('aria-describedby',description);
    else field.removeAttribute('aria-describedby');
  }
}

function showAuthFeedback(message, { fields = [], error = false, before } = {}) {
  const status = $('auth-status');
  if (!status) return;
  const targets = fields.filter(Boolean);
  const field = targets.at(-1);
  const anchor = field?.closest('.password-wrap, .account-consent') || field;
  if (anchor) anchor.after(status);
  else (before || $('account-form')?.querySelector('[type="submit"]'))?.before(status);
  status.textContent = message;
  status.classList.toggle('is-error',error);
  status.setAttribute('role',error ? 'alert' : 'status');
  for (const target of targets) {
    target.setAttribute('aria-invalid','true');
    const ids = new Set((target.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
    ids.add('auth-status');
    target.setAttribute('aria-describedby',[...ids].join(' '));
  }
}

function accountNavigation() {
  for (const button of $('app').querySelectorAll('[data-screen]')) {
    button.onclick = async () => {
      if (authScreen === 'reset' && currentSession) {
        button.disabled = true;
        const { error } = await client.auth.signOut({ scope: 'local' });
        if (error) {
          button.disabled = false;
          $('auth-status').textContent = '退出安全验证失败，请重试。';
        }
        return;
      }
      if(button.classList.contains('auth-back-button')&&history.state?.saldoAuth&&history.state.index>0){history.back();return;}
      setAuthScreen(button.dataset.screen);
    };
  }
}

function showAccount() {
  clearInterval(otpTimer);
  navigation.hidden = true;
  if (authScreen === 'welcome') {
    $('app').innerHTML = `<main class="account-screen welcome-screen">
      <div class="welcome-brand">
        <span class="welcome-icon"><img src="./icon.svg" width="96" height="96" alt=""></span>
        <h1><span class="welcome-greeting">欢迎使用</span> <span class="welcome-name">Saldo</span></h1>
        <p>轻松管理你的储值卡和各类订阅</p>
      </div>
      <div class="welcome-actions"><button class="primary" data-screen="continue" type="button">开始使用 Saldo</button></div>
    </main>`;
    accountNavigation();
    return;
  }
  const unified = !['verify', 'forgot', 'reset'].includes(authScreen);
  const verify = authScreen === 'verify';
  const recover = authScreen === 'forgot';
  const reset = authScreen === 'reset';
  const title = unified ? '欢迎使用 Saldo' : verify ? '验证你的邮箱' : reset ? '设置新密码' : '找回密码';
  const back = verify || recover ? 'continue' : 'welcome';
  const backLabel = back === 'welcome' ? '返回欢迎页' : '返回账号入口';
  const googleMarkup = `<button id="google" class="google-button" type="button" aria-describedby="continue-terms-label auth-provider-note">
    <img src="./google-g.png" width="20" height="20" alt=""><span class="google-label">使用 Google 继续</span>
    <span class="google-progress" hidden>${loadingIndicator}</span></button>`;
  $('app').innerHTML = `<header class="auth-header">${brand('data-screen="welcome"')}
    <button class="auth-back auth-back-button" data-screen="${back}" type="button" aria-label="${backLabel}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m14 6-6 6 6 6"/></svg></button></header>
    <main class="account-screen"><section class="wallet auth-wallet">
      ${verify ? '<div class="otp-emblem" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/></svg></div>' : ''}
      <h2>${title}</h2>
      ${verify ? verificationMode === 'link' ? '<p class="auth-intro muted">验证邮件已发送至 <strong class="otp-address">'+esc(otpEmail)+'</strong>。请点击邮件中的「验证邮箱」按钮。</p><p class="muted">完成验证后，可使用刚设置的密码继续。</p>' : '<p class="auth-intro muted">输入发送至 <strong class="otp-address">'+esc(otpEmail)+'</strong> 的 6 位验证码。</p><p class="muted">完成验证后即可使用刚设置的密码登录。</p>'
        : recover ? '<p class="auth-intro muted">输入账号邮箱，我们会向你发送重置密码的链接。</p>' : ''}
      <form id="account-form" novalidate>
        ${verify ? verificationMode === 'link' ? '' : '<label for="otp">邮箱验证码</label><input id="otp" class="otp-input" name="otp" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" title="请输入 6 位数字验证码" aria-describedby="otp-help auth-status" required><p class="field-hint" id="otp-help">可直接粘贴完整验证码</p>'
          : reset ? '' : '<label for="email">邮箱</label><input id="email" name="email" type="email" autocomplete="email" value="'+esc(authEmail)+'" placeholder="请输入邮箱地址" required>'}
        ${unified || reset ? `<label for="password">${reset ? '新密码' : '密码'}</label><div class="password-wrap"><input id="password" name="password" type="password" autocomplete="${reset ? 'new-password' : 'current-password'}" ${reset ? 'minlength="8" placeholder="至少 8 位"' : 'placeholder="请输入密码"'} required><button class="password-toggle" type="button" aria-controls="password" aria-pressed="false" aria-label="显示密码">显示</button></div>` : ''}
        ${unified ? '<div class="account-links password-recovery"><button type="button" data-screen="forgot">忘记密码？</button></div>' : ''}
        ${unified ? consentField('continue-terms') : ''}
        <p id="auth-status" class="auth-status" role="status">${esc(authMessage)}</p>
        <button class="primary" type="submit">${unified ? '继续' : verify ? verificationMode === 'link' ? '返回登录' : '验证并继续' : recover ? '发送重置邮件' : '保存新密码'}</button>
        ${unified ? '<p class="muted account-creation-note">未注册时，将自动创建 Saldo 账号。</p>' : ''}
      </form>
      ${unified ? '<div class="auth-alternative"><span>或</span></div>'+googleMarkup
        : verify ? '<div class="otp-links"><button type="button" id="resend-code">重新发送验证码</button><button type="button" data-screen="continue">修改邮箱</button></div><p class="muted otp-help">没收到？请检查垃圾邮件，或确认邮箱地址是否正确。</p>'
        : '<div class="account-links"><button type="button" data-screen="continue">返回登录／注册</button></div>'}
    </section>${unified ? '<aside id="auth-provider-note" class="auth-service-note">'+authProviderNote+'</aside>' : ''}</main>`;
  accountNavigation();
  if ($('email')) $('email').oninput = event => {
    authEmail = event.target.value;
    if (!authBusy) clearAuthFeedback();
  };
  if ($('password')) $('password').oninput = event => {
    if (!authBusy) clearAuthFeedback();
  };
  if (unified) {
    $('continue-terms').checked = authTermsAccepted;
    $('continue-terms').onchange = event => {
      authTermsAccepted = event.target.checked;
      if (authTermsAccepted) {
        if ($('auth-status').textContent === '请先勾选同意使用条款与隐私说明。') clearAuthFeedback();
      }
    };
  }
  const toggle = $('app').querySelector('.password-toggle');
  if (toggle) toggle.onclick = () => {
    const visible = $('password').type === 'password';
    $('password').type = visible ? 'text' : 'password';
    toggle.textContent = visible ? '隐藏' : '显示';
    toggle.setAttribute('aria-label', visible ? '隐藏密码' : '显示密码');
    toggle.setAttribute('aria-pressed', String(visible));
  };
  const updateResend = () => {
    const button = $('resend-code');
    if (!button) return;
    const seconds = Math.max(0, Math.ceil((otpResendAt - Date.now()) / 1000));
    button.disabled = authBusy || seconds > 0;
    button.textContent = seconds > 0 ? seconds+' 秒后可重新发送' : '重新发送验证码';
  };
  if (verify) {
    updateResend();
    otpTimer = setInterval(updateResend, 1000);
    if ($('otp')) $('otp').oninput = event => {
      event.target.value = event.target.value.normalize('NFKC').replace(/\D/g, '').slice(0, 6);
      event.target.removeAttribute('aria-invalid');
      if (!authBusy) $('auth-status').textContent = '';
    };
    if ($('otp')) $('otp').onpaste = event => {
      event.preventDefault();
      $('otp').value = event.clipboardData.getData('text').normalize('NFKC').replace(/\D/g, '').slice(0, 6);
      $('otp').removeAttribute('aria-invalid');
      if (!authBusy) $('auth-status').textContent = '';
    };
    $('otp')?.focus({preventScroll:true});
  }
  const run = async (action, { submit, label = '请稍候…', feedbackAnchor } = {}) => {
    if (authBusy) return;
    authBusy = true;
    const controls = $('app').querySelectorAll('button, input');
    const status = $('auth-status');
    const oldLabel = submit?.textContent;
    let redirecting = false;
    for (const control of controls) control.disabled = true;
    clearAuthFeedback();
    if (submit) { submit.innerHTML = loadingIndicator+'<span>'+label+'</span>'; submit.setAttribute('aria-busy','true'); }
    try {
      const result = await action();
      redirecting = result === 'redirecting';
      if (!redirecting && status.isConnected && result) showAuthFeedback(result,{before:feedbackAnchor});
    } catch (error) {
      const fields = error.code === 'invalid_credentials' ? [$('email'),$('password')]
        : error.code === 'weak_password' || error.code === 'same_password' ? [$('password')]
        : error.code === 'terms_required' ? [$('continue-terms')]
        : verify && ['otp_expired','invalid_otp'].includes(error.code) ? [$('otp')] : [];
      if (status.isConnected) showAuthFeedback(authError(error),{fields,error:true,before:feedbackAnchor});
    } finally {
      if (!redirecting) {
        authBusy = false;
        for (const control of controls) control.disabled = false;
      }
      if (submit) { submit.textContent = oldLabel; submit.removeAttribute('aria-busy'); }
      if (!redirecting) updateResend();
    }
    return redirecting;
  };
  const requireConsent = () => {
    if (!$('continue-terms').checked) {
      clearAuthFeedback();
      showAuthFeedback('请先勾选同意使用条款与隐私说明。',{fields:[$('continue-terms')],error:true});
      $('continue-terms').focus();
      return false;
    }
    authTermsAccepted = true;
    return true;
  };
  const sendCode = async email => {
    const { error } = await client.auth.resend({ type: 'signup', email, options: { emailRedirectTo: callbackUrl } });
    if (error) throw error;
    otpEmail = email;
    otpResendAt = Date.now() + 60000;
  };
  $('account-form').onsubmit = event => {
    event.preventDefault();
    if (authBusy) return;
    const invalid = [...event.currentTarget.elements].find(field => field.name && field.name !== 'terms' && !field.checkValidity());
    if (invalid) {
      clearAuthFeedback();
      showAuthFeedback(invalid.name === 'email' ? '请填写有效的邮箱地址。' : invalid.name === 'otp' ? '请输入 6 位数字验证码。' : reset ? '请设置至少 8 位的新密码。' : '请输入密码。',{fields:[invalid],error:true});
      invalid.focus();
      return;
    }
    if (unified && !requireConsent()) return;
    const input = new FormData(event.currentTarget);
    const email = input.get('email')?.trim();
    if (email) authEmail = email;
    const password = input.get('password');
    const code = input.get('otp');
    void run(async () => {
      if (unified) {
        const result = await continueWithPassword(email, password);
        if (result.error) throw result.error;
        if (!result.data?.session) {
          verificationMode = result.data?.verification || 'link';
          otpEmail = email;
          otpResendAt = Date.now() + 60000;
          setAuthScreen('verify');
        }
      } else if (verify) {
        if (verificationMode === 'link') {
          setAuthScreen('continue','完成邮箱验证后，使用刚设置的密码继续。');
          return;
        }
        const { error } = await client.auth.verifyOtp({ email: otpEmail, token: code, type: 'signup' });
        if (error) throw error;
      } else if (recover) {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl+'?type=recovery' });
        if (error) throw error;
        return '如果该邮箱可以找回账号，你将收到重置链接。';
      } else if (reset) {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        authScreen = 'continue';
        await switchSession(currentSession, { force:true });
        toast('密码已更新');
      }
    }, { submit: event.currentTarget.querySelector('[type="submit"]'), label: unified ? '正在继续…' : verify ? '正在验证…' : undefined });
  };
  if (verify) $('resend-code').onclick = () => {
    if (Date.now() < otpResendAt) return;
    void run(async () => {
      await sendCode(otpEmail);
      if ($('otp')) { $('otp').value = ''; $('otp').removeAttribute('aria-invalid'); }
      return verificationMode === 'link' ? '新的验证邮件已发送，请使用最新的一封邮件。' : '新的验证码已发送，请使用最新的一封邮件。';
    }, { submit: $('resend-code'), label:'正在发送…' });
  };
  const google = $('google');
  if (!google) return;
  google.onclick = async () => {
    if (authBusy || !requireConsent()) return;
    const label = google.querySelector('.google-label');
    const progress = google.querySelector('.google-progress');
    const resetGoogle = () => { label.textContent = '使用 Google 继续'; progress.hidden = true; google.removeAttribute('aria-busy'); };
    label.textContent = '正在前往 Google…';
    progress.hidden = false;
    google.setAttribute('aria-busy','true');
    const redirecting = await run(async () => {
      rememberGoogleConsent();
      const { data: oauth, error } = await client.auth.signInWithOAuth({ provider:'google', options:{ redirectTo:callbackUrl, skipBrowserRedirect:true } });
      if (error) throw error;
      if (!oauth?.url) throw new Error('Missing Google authorization URL');
      location.assign(oauth.url);
      return 'redirecting';
    }, {feedbackAnchor:google});
    if (!redirecting) resetGoogle();
    else window.addEventListener('pageshow', event => {
      if (event.persisted && google.isConnected) {
        authBusy = false;
        resetGoogle();
        for (const control of $('app').querySelectorAll('button, input')) control.disabled = false;
      }
    }, { once:true });
  };
}

function authError(error) {
  switch (error.code) {
    case 'otp_expired':
    case 'invalid_otp': return '验证码不正确或已过期，请核对后重试，或重新获取验证码。';
    case 'invalid_credentials': return '邮箱或密码不正确。';
    case 'unified_auth_unavailable': return '暂时无法登录，请稍后重试。';
    case 'terms_required': return '请阅读并同意当前版本的使用条款与隐私说明。';
    case 'email_not_confirmed': return '请先打开邮件中的确认链接。';
    case 'weak_password': return '密码强度不足，请使用更长的密码，并混合字母、数字和符号。';
    case 'same_password': return '请设置一个不同的新密码。';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit': return '操作过于频繁，请稍后重试。';
    case 'signup_disabled': return '注册暂未开放。';
    default: return '操作未完成，请检查网络后重试。';
  }
}

function setAuthScreen(screen, message = '') {
  authScreen = ['login','password','signup'].includes(screen) ? 'continue' : screen;
  authMessage = message;
  if(!currentSession){const previous=history.state;const state={saldoAuth:true,screen:authScreen,index:previous?.saldoAuth?previous.index+(previous.screen===authScreen?0:1):0};history[previous?.saldoAuth&&previous.screen!==authScreen?'pushState':'replaceState'](state,'',location.href);}
  showAccount();
  window.scrollTo(0,0);
}

function walletStatus(message, { loading = false, retry = false } = {}) {
  navigation.hidden = true;
  $('app').innerHTML = '<header>'+brand(loading ? 'disabled' : 'data-wallet-home')+'</header><main class="account-screen"><div class="wallet wallet-status">' +
    '<p role="status">' + (loading ? loadingIndicator : '') + esc(message) + '</p>' +
    (retry ? '<button id="retry-wallet" class="primary">重试</button><button id="wallet-signout" class="secondary">退出登录</button>' : '') +
    '</div></main>';
  if (!loading) $('app').querySelector('[data-wallet-home]').onclick = () => {
    if (currentSession) void switchSession(currentSession, { force: true });
    else setAuthScreen('welcome');
  };
  if (retry) {
    $('retry-wallet').onclick = () => switchSession(currentSession, { force: true });
    $('wallet-signout').onclick = async () => {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) toast('退出登录失败，请重试。');
    };
  }
}

function showTermsGate(session) {
  navigation.hidden = true;
  $('app').innerHTML = `<header>${brand('disabled')}</header><main class="account-screen"><section class="wallet auth-wallet"><h2>使用前，请确认条款</h2><p class="muted">请阅读当前版本的使用条款与隐私说明。</p><form id="terms-form">${consentField('account-terms')}<p id="terms-error" class="auth-status" role="status"></p><button class="primary" type="submit">同意并继续</button></form><button class="secondary" id="terms-signout">退出登录</button></section></main>`;
  $('terms-signout').onclick = () => client.auth.signOut({scope:'local'});
  $('terms-form').onsubmit = async event => {
    event.preventDefault();
    if (!$('account-terms').checked) return;
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    try {
      const latest = await client.auth.getSession();
      if (latest.error || latest.data.session?.user.id !== session.user.id) throw new Error('Session changed');
      await acceptTerms(session.user.app_metadata?.provider === 'google' ? 'google' : 'password');
      await switchSession(session,{force:true});
    } catch {
      if ($('terms-error')) $('terms-error').textContent = '条款同意记录未能保存，请重试。';
      if (button.isConnected) button.disabled = false;
    }
  };
}

async function switchSession(session, { force = false, recovery = false, message = '' } = {}) {
  const oldId = currentSession?.user.id;
  currentSession = session;
  if (session?.user.email) authEmail = session.user.email;
  if (!force && oldId === session?.user.id && (oldId || !recovery)) return;
  clearInterval(otpTimer);
  if (session) { otpEmail = ''; otpResendAt = 0; }
  const revision = ++sessionRevision;
  ready = false;
  navReady=false;
  writing = false;
  data = emptyWallet();
  selected = null;
  clearDetailDraft();
  const route = new URL(location.href);
  page = route.searchParams.get('view') === 'me' ? '我的' : '总览';
  myView = page === '我的' && ['about','archives'].includes(route.searchParams.get('section')) ? route.searchParams.get('section') : '';
  if (oldId !== session?.user.id) { for(const key of Object.keys(tabStates))delete tabStates[key];summaryOwner = null; notificationSummary = '查看接收方式'; }
  try { const saved = JSON.parse(sessionStorage.getItem('saldo.myReturn')); myScroll = saved?.user === session?.user.id ? saved.scroll : 0; } catch { myScroll = 0; }
  query = '';
  sort = 'default';
  syncMessage = '';
  finishModalClose(false);
  modalCache.clear();
  dialog.replaceChildren();
  document.querySelector('.toast')?.remove();
  if (!session || recovery) {
    setAuthScreen(recovery && session ? 'reset' : message ? 'login' : 'welcome', message);
    return;
  }
  walletStatus('正在读取你的钱包…', { loading: true });
  try {
    const accepted = await hasAcceptedTerms(session.user.id) || await completeGoogleConsent(session);
    if (revision !== sessionRevision) return;
    if (!accepted) { showTermsGate(session); return; }
    const [wallet] = await Promise.all([
      loadWallet(client, session.user.id), loadNotificationPreferences(session.user.id),
    ]);
    if (revision !== sessionRevision) return;
    data = wallet;
    ready = true;
    initializeRoutes();
    render();
    if (page === '我的' && !myView) window.scrollTo(0,myScroll);
    if (route.searchParams.get('install') === '1') {
      route.searchParams.delete('install'); history.replaceState(history.state,'',route); installGuide();
    }
  } catch {
    if (revision === sessionRevision) walletStatus('暂时无法读取钱包，请稍后重试。', { retry: true });
  }
}

async function changeRecord(kind, previous, changes, { id, error, done, onFailure, remove = false, successMessage = '已保存' } = {}) {
  if (!ready || writing) return;
  dismissToast();
  if(!navigator.onLine){const message='当前离线，尚未保存。请联网后重试。';syncMessage=onFailure||error?'':message;onFailure?.(message);if(error?.isConnected)error.textContent=message;else if(!onFailure)toast(message);return;}
  const revision = sessionRevision;
  const user = currentSession.user.id;
  writing = true;
  syncMessage = remove ? '正在删除…' : '正在保存…';
  const status = $('sync-status');
  if (status) status.innerHTML = loadingIndicator + '<span>'+syncMessage+'</span>';
  let saved = false;
  try {
    if (remove) await deleteRecord(client, user, kind, previous);
    else await saveRecord(client, user, kind, previous, changes, id);
    saved = true;
    const fresh = await loadWallet(client, user);
    if (revision !== sessionRevision) return;
    data = fresh;
    syncMessage = '';
    if (done) done();
    else render();
    toast(successMessage);
  } catch (exception) {
    if (revision !== sessionRevision) return;
    if (saved) {
      await switchSession(currentSession, { force: true });
      return;
    }
    const stale = exception.message === 'STALE_RECORD';
    if (stale || exception.code === '23505') {
      try {
        const fresh = await loadWallet(client, user);
        if (revision !== sessionRevision) return;
        data = fresh;
        if (exception.code === '23505' && id && data[kind].some(row => row.id === id)) {
          syncMessage = '';
          done?.();
          toast('已保存');
          return;
        }
      } catch {
        if (revision !== sessionRevision) return;
      }
    }
    const message = !navigator.onLine ? '网络连接已断开，尚未保存。请联网后重试。' : stale ? '记录已在其他设备修改。请核对最新值并重新提交。' : remove ? '删除失败，记录仍保留，请重试。' : '保存失败，请重试。';
    syncMessage=onFailure||error?'':message;
    render();
    onFailure?.(message);
    const liveError=error?.isConnected?error:error?.id?$(error.id):null;
    if(liveError)liveError.textContent=message;
    else if(!onFailure)toast(message);
  } finally {
    if (revision === sessionRevision) writing = false;
  }
}

async function start() {
  if (!client) {
    walletStatus('登录组件未能加载，请刷新页面。');
    return;
  }
  let startup = true;
  client.auth.onAuthStateChange((event, session) => {
    if (startup) return;
    if (event === 'PASSWORD_RECOVERY') {
      void switchSession(session, { force: true, recovery: true });
    } else if (event !== 'USER_UPDATED' || authScreen !== 'reset') {
      void switchSession(session);
    }
  });
  let callback = {};
  try {
    callback = await completeAuthCallback();
    const { data: auth, error } = await client.auth.getSession();
    if (error) throw error;
    startup = false;
    await switchSession(auth.session, { force: true, ...callback });
  } catch {
    startup = false;
    setAuthScreen('login', '暂时无法连接登录服务，请重试。');
  }
}

void start();

document.addEventListener('click',event=>{if(event.target.closest('a[href="/terms.html?from=me"]'))sessionStorage.setItem('saldo.termsFromApp','true');});

window.addEventListener('popstate',event=>{if(!event.state?.saldoAuth)return;if(ready){const next=routeBase(appRoute());navigationHistory.initialize(next);applyRoute(next,appRoute());}else if(!currentSession){authScreen=event.state.screen;authMessage='';showAccount();window.scrollTo(0,0);}});
