import { client, callbackUrl, completeAuthCallback } from './auth.js';
import { cycles, emptyWallet, loadWallet, localDate, saveRecord } from './wallet.js';

let currentSession = null;
let ready = false;
let writing = false;
const icons={home:'<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',card:'<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6M17 2v6M3 11h18"/>',user:'<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>'};
const svg=k=>'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">'+icons[k]+'</svg>';
let data = emptyWallet();
let page='总览',selected=null,type='cards',query='',sort='default';const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const money=n=>Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const days=d=>Math.round((Date.parse(d+'T00:00:00Z')-Date.parse(localDate()+'T00:00:00Z'))/86400000);const status=d=>!d?'日期待补充':days(d)<0?'已到期日，待确认':days(d)===0?'今天到期':'还有 '+days(d)+' 天';const active=k=>data[k].filter(x=>!x.archived);const get=()=>data[type].find(x=>x.id===selected);
function toast(t){document.querySelector('.toast')?.remove();const n=document.createElement('div');n.className='toast';n.textContent=t;document.body.append(n);setTimeout(()=>n.remove(),2600)}
function logo(x){return '<span class="logo">'+esc(x.name.slice(0,2))+'</span>'}
function rows(k,list){return '<div class="rows">'+list.map(x=>'<button class="row" data-open="'+k+':'+x.id+'">'+logo(x)+'<span><span class="name">'+esc(x.name)+'</span><div class="mini">'+(k==='cards'?esc((x.updated||'')+' 更新'):esc(x.date||'到期日待补充'))+'</div></span><span class="amount">'+(k==='cards'?(x.balance==null?'待更新':'¥'+money(x.balance)):'<span class="row-status">'+status(x.date)+'</span>')+'</span></button>').join('')+'</div>'}
function notice(x){return '<button class="notice" data-open="subs:'+x.id+'">'+svg('calendar')+'<span><strong>'+esc(x.name)+'</strong><span class="muted">'+esc(x.date)+' 到期</span></span><span class="pill">'+status(x.date)+'</span></button>'}
function render(){if (!ready) return;
if (selected && !get()) selected = null;
let html='<header>'+(selected?'<button data-action="back" aria-label="返回" style="font-size:26px">‹</button><h2>'+(type==='cards'?'储值卡详情':'订阅详情')+'</h2><span style="width:28px"></span>':'<h1>Saldo</h1><button class="round" data-action="add" aria-label="添加记录">+</button>')+'</header><main>';
if(selected){const x=get();html+='<div class="detail-head">'+logo(x)+'<input class="inline title-input" data-field="name" aria-label="名称" maxlength="80" value="'+esc(x.name)+'"></div><p class="muted">点击铅笔修改，离开输入框后保存</p>';
if(type==='cards')html+='<div class="hero"><div class="muted">最近记录余额</div><div class="balance inline-money"><span class="money-symbol">¥</span><input class="inline balance-input" data-field="balance" aria-label="余额" type="number" min="0" max="90000000000" step="0.01" placeholder="待更新" value="'+(esc(x.balance))+'"></div><div class="muted">'+esc(x.updated||'')+' 更新</div></div>';
else html+='<div class="hero"><label class="muted" for="detail-date">到期日</label><div class="date-wrap"><span class="date">'+esc(x.date?.replaceAll('-',' / ')||'待补充')+'</span><input id="detail-date" class="date-native" data-field="date" aria-label="到期日" type="date" value="'+esc(x.date)+'"></div><div class="pill" style="display:inline-block;margin-top:15px">'+status(x.date)+'</div></div><div class="info"><span>订阅周期</span><select class="inline" data-field="cycle" aria-label="订阅周期">'+['','按月','按季度','半年','按年','两年及以上'].map(c=>'<option '+(x.cycle===c?'selected':'')+'>'+c+'</option>').join('')+'</select></div><div class="info"><span>费用（元）</span><input class="inline" data-field="fee" aria-label="费用" type="number" min="0" max="90000000000" step="0.01" placeholder="未填写" value="'+(esc(x.fee))+'"></div><button class="info info-button" data-action="reminder"><span>到期提醒</span><span>'+esc(x.reminderDays?.length===0?'已关闭':formatReminders(x.reminderDays ?? defaults(x.cycle)))+' ›</span></button>';
if(type==='cards')html+='<div class="info"><span>有效期</span><input class="inline" data-field="date" aria-label="有效期" type="date" value="'+esc(x.date)+'"></div>';
html+='<div class="info"><span>备注</span><input class="inline" data-field="note" aria-label="备注" maxlength="200" placeholder="未填写" value="'+esc(x.note)+'"></div><div class="actions"><button class="secondary" data-action="archive">'+(x.archived?'重新显示在列表':'移出当前列表')+'</button><p class="muted">'+(x.archived?'重新显示后，将计入当前概况。':'保留记录，可在「我的 → 已移出的记录」中找回。')+'</p></div>';if(x.history?.length)html+='<div class="section"><h3>更新历史</h3></div><div class="rows">'+x.history.slice().reverse().map(h=>'<div class="row"><span class="muted">'+esc(localDate(new Date(h.recorded_at)))+'</span><span class="amount">'+'¥'+money(h.cents/100)+'</span></div>').join('')+'</div>';
}else if(page==='总览'){html+='<div class="wallet"><div class="muted">最近记录余额 · CNY</div><div class="balance"><span class="money-symbol">¥</span>'+money(active('cards').reduce((a,x)=>a+Math.round((x.balance||0)*100),0)/100)+'</div></div><div class="metrics"><button data-page="储值卡">'+svg('card')+' '+active('cards').length+' 张储值卡</button><button data-page="订阅">'+svg('calendar')+' '+active('subs').length+' 个订阅</button></div><div class="section"><h3>近期到期</h3><span class="muted">未来 30 天</span></div>';let soon=active('subs').filter(x=>x.date&&days(x.date)>=0&&days(x.date)<=30).sort((a,b)=>a.date.localeCompare(b.date));html+=soon.length?soon.map(notice).join(''):'<div class="empty">暂无近期到期事项</div>';html+='<div class="section"><h3>我的储值卡</h3><button data-page="储值卡">查看全部 →</button></div>'+rows('cards',active('cards').slice(0,4));
}else if(page==='我的'){
  html += '<div class="wallet"><h2 class="account-title">你的私人钱包</h2><p class="muted">'+esc(currentSession.user.email)+'</p></div>' +
    '<button class="secondary" data-action="notification-settings">管理通知</button>' +
    '<button class="secondary" data-action="notification-test">通知连接测试</button>' +
    '<button class="secondary" data-action="export">导出当前数据</button>' +
    '<button class="secondary" data-action="archives">已移出的记录</button>' +
    '<button class="secondary" data-action="sign-out">退出登录</button>';
}else{let k=page==='储值卡'?'cards':'subs';let list=active(k).filter(x=>x.name.toLowerCase().includes(query.toLowerCase()));if(sort==='name')list.sort((a,b)=>a.name.localeCompare(b.name));if(sort==='value')list.sort((a,b)=>k==='cards'?(b.balance??-1)-(a.balance??-1):(a.date||'9999').localeCompare(b.date||'9999'));html+='<div class="section"><h2>'+page+'</h2><span class="muted">'+active(k).length+' 项记录</span></div><div class="toolbar"><input id="search" aria-label="搜索记录" placeholder="搜索名称" value="'+esc(query)+'"><select id="sort" aria-label="排序"><option value="default">默认排序</option><option value="name" '+(sort==='name'?'selected':'')+'>按名称</option><option value="value" '+(sort==='value'?'selected':'')+'>'+(k==='cards'?'按余额':'按到期日')+'</option></select></div>';html+=list.length?rows(k,list):'<div class="empty">还没有匹配的记录<br>点击右上角 + 添加</div>'}
$('app').innerHTML = html + '</main><p id="sync-status" class="sync-status" role="status">' + esc(syncMessage) + '</p>';
  updateNavigation();
decorateFields();$('search')?.addEventListener('input',e=>{let pos=e.target.selectionStart;query=e.target.value;render();$('search').focus();$('search').setSelectionRange(pos,pos)});$('sort')?.addEventListener('change',e=>{sort=e.target.value;render()});}
const tabs = ['总览', '储值卡', '订阅', '我的'];
const navigation = document.createElement('nav');
navigation.className = 'nav';
navigation.hidden = true;
navigation.setAttribute('aria-label', '主导航');
navigation.innerHTML = '<span class="nav-button-highlight" aria-hidden="true"></span>' +
  tabs.map((tab, i) => '<button type="button" data-page="' + tab + '">' +
    svg(['home', 'card', 'calendar', 'user'][i]) + tab + '</button>').join('');
$('app').after(navigation);

function updateNavigation() {
  navigation.hidden = selected !== null;
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

function finishModalClose() {
  clearTimeout(closeTimer);
  delete dialog.dataset.closing;
  if (dialog.open) dialog.close();
}

function closeModal() {
  if (!dialog.open || 'closing' in dialog.dataset) return;
  if (reduceMotion.matches) {
    finishModalClose();
    return;
  }
  dialog.dataset.closing = '';
  // Fallback if the exit animation is skipped or interrupted.
  closeTimer = setTimeout(finishModalClose, 220);
}

dialog.addEventListener('animationend', event => {
  if (event.target === dialog && event.animationName === 'dialog-exit' && 'closing' in dialog.dataset) {
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

function modal(content) {
  clearTimeout(closeTimer);
  delete dialog.dataset.closing;
  dialog.innerHTML = '<button class="close" data-action="close" aria-label="关闭">×</button>' + content;
  if (!dialog.open) dialog.showModal();
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

function add(kind) {
  const isCard = kind === 'cards';
  const amount = isCard ? 'balance' : 'fee';
  const id = crypto.randomUUID();
  modal(`<h2>添加记录</h2>
    <div class="seg">
      <button type="button" class="${isCard ? 'active' : ''}" data-type="cards">储值卡</button>
      <button type="button" class="${isCard ? '' : 'active'}" data-type="subs">订阅</button>
    </div>
    <form id="record-form" class="record-form">
      <label for="record-name">名称 *</label>
      <input id="record-name" name="name" maxlength="80" required>
      <label for="record-amount">${isCard ? '余额' : '费用'}（元，可留空）</label>
      <input id="record-amount" name="${amount}" type="number" min="0" max="90000000000" step="0.01">
      ${isCard ? '' : `<label for="record-cycle">订阅周期</label>
        <select id="record-cycle" name="cycle">${[...cycles.keys()].map(c => `<option value="${c}">${c || '未填写'}</option>`).join('')}</select>`}
      <label for="record-date">${isCard ? '有效期' : '到期日'}</label>
      <input id="record-date" name="date" type="date">
      <label for="record-note">备注</label>
      <input id="record-note" name="note" maxlength="200">
      <p class="error" role="alert" id="record-error"></p>
      <button class="primary" type="submit">保存记录</button>
    </form>`);
  $('record-form').onsubmit = async event => {
    event.preventDefault();
    if (writing || 'closing' in dialog.dataset) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const name = values.get('name').trim();
    const error = $('record-error');
    if (!name) {
      error.textContent = '请填写名称。';
      return;
    }
    error.textContent = '';
    const changes = {
      name, date: values.get('date'), note: values.get('note'),
      [amount]: values.get(amount) === '' ? null : Number(values.get(amount)),
    };
    if (!isCard) changes.cycle = values.get('cycle');
    for (const el of form.elements) el.disabled = true;
    await changeRecord(kind, null, changes, {
      id, error,
      done: () => {
        type = kind;
        selected = id;
        closeModal();
        render();
      },
    });
    for (const el of form.elements) el.disabled = false;
  };
}

function reminderDialog(recommended = false) {
  const entry = get();
  const chosen = (recommended ? null : entry.reminderDays) ?? defaults(entry.cycle);
  modal(`<h2>到期提醒设置</h2><p class="muted">提醒时间会保存到你的账号。设备通知尚未启用。</p>
    <div class="rem-options" id="rem-options" role="group" aria-label="提醒时间">
      ${[0, 1, 3, 7, 14, 30].map(n => `<button type="button" class="rem-choice" data-rem-day="${n}" aria-pressed="${chosen.includes(n)}">
        <span>${n === 0 ? '到期当天' : '提前 ' + n + ' 天'}</span><span class="rem-check" aria-hidden="true">✓</span>
      </button>`).join('')}
    </div>
    <button class="rem-recommend" data-action="recommend-rem">按订阅周期推荐</button>
    <p class="error" role="alert" id="rem-error"></p>
    <button id="rem-save" class="primary" data-action="save-rem" ${chosen.length ? '' : 'disabled'}>保存设置</button>
    <button class="secondary" data-action="off-rem">关闭提醒</button>`);
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
  if (button.dataset.page) {
    page = button.dataset.page;
    selected = null;
    query = '';
    sort = 'default';
    render();
    window.scrollTo(0, 0);
  }
  if (button.dataset.open) {
    [type, selected] = button.dataset.open.split(':');
    closeModal();
    render();
    window.scrollTo(0, 0);
  }
  if (button.dataset.type && !writing) add(button.dataset.type);
  if (button.hasAttribute('data-rem-day') && !writing) {
    button.setAttribute('aria-pressed', button.getAttribute('aria-pressed') !== 'true');
    $('rem-save').disabled = !dialog.querySelector('[data-rem-day][aria-pressed="true"]');
  }
  switch (button.dataset.action) {
    case 'close':
      closeModal();
      break;
    case 'back':
      selected = null;
      render();
      break;
    case 'add':
      if (!writing) add(page === '订阅' ? 'subs' : 'cards');
      break;
    case 'archive': {
      const entry = get();
      await changeRecord(type, entry, { archived: !entry.archived }, {
        done: () => { selected = null; render(); },
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
      await changeRecord(type, get(), { reminderDays: days }, {
        error: $('rem-error'),
        done: () => { closeModal(); render(); },
      });
      break;
    }
    case 'archives': {
      const archived = ['cards', 'subs'].map(kind => rows(kind, data[kind].filter(entry => entry.archived))).join('');
      modal('<h2>已移出的记录</h2>' + (data.cards.concat(data.subs).some(entry => entry.archived)
        ? '<p class="muted">打开记录即可重新显示在列表中。</p>' + archived
        : '<p class="muted">暂无已移出的记录。</p>'));
      break;
    }
    case 'notification-settings':
      location.assign('/notification-settings.html');
      break;
    case 'notification-test':
      location.assign('/notification-test.html');
      break;
    case 'export':
      exportWallet();
      break;
    case 'sign-out':
      button.disabled = true;
      try {
        const { detachPushDevice } = await import('./notifications.js');
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

function decorateFields(){document.querySelectorAll('#app [data-field]').forEach(el=>{const k=el.dataset.field,wrap=document.createElement('div'),value=document.createElement('span'),pencil=document.createElement('button');wrap.className='field-view';value.className='field-value'+(el.value===''?' empty':'');let v=el.value;if((k==='balance'||k==='fee')&&v!=='')v=(k==='fee'?'¥':'')+money(v);if(k==='date'&&v)v=v.replaceAll('-',' / ');value.textContent=v||((k==='balance')?'待更新':'未填写');pencil.className='field-pencil';pencil.type='button';pencil.setAttribute('aria-label','修改'+(el.getAttribute('aria-label')||k));pencil.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="m15 4 5 5M4 15 16 3a2 2 0 0 1 5 5L9 20l-6 1z"/></svg>';el.before(wrap);wrap.append(value,pencil,el);el.classList.add('field-edit');pencil.onclick=()=>{wrap.classList.add('editing');el.focus();if(el.type==='date'&&el.showPicker)try{el.showPicker()}catch{}};el.addEventListener('keydown',e=>{if(e.key==='Escape'){el.value=get()[k]??'';el.blur()}else if(e.key==='Enter'&&el.tagName!=='SELECT'){e.preventDefault();el.blur()}})})}

function persistInline(event) {
  const field = event.target;
  const name = field.dataset.field;
  if (!name || !ready || !selected || !field.isConnected || field.dataset.submitted) return;
  const entry = get();
  const number = name === 'balance' || name === 'fee';
  const value = number ? (field.value === '' ? null : Number(field.value)) : field.value.trim();
  if (!field.checkValidity() || (name === 'name' && !value)) {
    render();
    toast(name === 'name' ? '名称不能为空。' : '请输入有效的金额或日期。');
    return;
  }
  if (value === (entry[name] ?? (number ? null : ''))) {
    field.closest('.field-view').classList.remove('editing');
    return;
  }
  if (writing) {
    render();
    toast('正在保存另一项修改，请稍后重试。');
    return;
  }
  field.dataset.submitted = 'true';
  field.disabled = true;
  void changeRecord(type, entry, { [name]: value }, {
    done: () => {
      render();
      const view = document.querySelector('[data-field="' + name + '"]')?.closest('.field-view');
      if (view) {
        view.classList.add('saved');
        setTimeout(() => view.classList.remove('saved'), 540);
      }
    },
  });
}
document.addEventListener('change', persistInline);
document.addEventListener('focusout', persistInline);
let authScreen = 'login';
let authMessage = '';
let sessionRevision = 0;
let syncMessage = '';

function showAccount() {
  navigation.hidden = true;
  const signup = authScreen === 'signup';
  const recover = authScreen === 'forgot';
  const reset = authScreen === 'reset';
  const login = !signup && !recover && !reset;
  const title = reset ? '设置新密码' : recover ? '找回密码' : signup ? '注册' : '登录';
  $('app').innerHTML = `<header><h1>Saldo</h1></header><main class="account-screen"><section class="wallet">
    <h2>${title}</h2>
    <form id="account-form">
      ${reset ? '' : '<label for="email">邮箱</label><input id="email" name="email" type="email" autocomplete="email" required>'}
      ${recover ? '' : `<label for="password">密码</label><input id="password" name="password" type="password"
        autocomplete="${login ? 'current-password' : 'new-password'}" ${login ? '' : 'minlength="8"'} required>`}
      <p id="auth-status" role="status">${esc(authMessage)}</p>
      <button class="primary" type="submit">${recover ? '发送重置邮件' : reset ? '保存新密码' : title}</button>
    </form>
    ${login || signup ? '<button id="google" class="secondary" type="button">使用 Google 登录</button>' : ''}
    <div class="account-links">
      ${login ? '<button type="button" data-screen="signup">创建账号</button><button type="button" data-screen="forgot">忘记密码</button>'
        : '<button type="button" data-screen="login">返回登录</button>'}
    </div></section></main>`;

  for (const el of $('app').querySelectorAll('[data-screen]')) {
    el.onclick = async () => {
      if (reset && currentSession) {
        el.disabled = true;
        const { error } = await client.auth.signOut({ scope: 'local' });
        if (error) {
          el.disabled = false;
          $('auth-status').textContent = '退出安全验证失败，请重试。';
        }
        return;
      }
      setAuthScreen(el.dataset.screen);
    };
  }

  const run = async action => {
    const controls = $('app').querySelectorAll('button, input');
    const status = $('auth-status');
    for (const control of controls) control.disabled = true;
    status.textContent = '请稍候…';
    try {
      const message = await action();
      if (status.isConnected) status.textContent = message ?? '';
    } catch (error) {
      if (status.isConnected) status.textContent = authError(error);
    } finally {
      for (const control of controls) control.disabled = false;
    }
  };

  $('account-form').onsubmit = event => {
    event.preventDefault();
    const input = new FormData(event.currentTarget);
    const email = input.get('email')?.trim();
    const password = input.get('password');
    run(async () => {
      if (recover) {
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: callbackUrl + '?type=recovery',
        });
        if (error) throw error;
        return '如果该邮箱可以找回账号，你将收到重置链接。';
      }
      if (reset) {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        authScreen = 'login';
        await switchSession(currentSession, { force: true });
        toast('密码已更新');
        return;
      }
      const result = signup
        ? await client.auth.signUp({ email, password, options: { emailRedirectTo: callbackUrl } })
        : await client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (signup && !result.data.session) return '请检查邮箱，打开确认链接后即可登录。';
    });
  };

  if ($('google')) $('google').onclick = () => run(async () => {
    const { data: oauth, error } = await client.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: callbackUrl, skipBrowserRedirect: true },
    });
    if (error) throw error;
    location.assign(oauth.url);
    return '正在跳转到 Google…';
  });
}

function authError(error) {
  switch (error.code) {
    case 'invalid_credentials': return '邮箱或密码不正确。';
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
  authScreen = screen;
  authMessage = message;
  showAccount();
}

function walletStatus(message, retry) {
  navigation.hidden = true;
  $('app').innerHTML = '<header><h1>Saldo</h1></header><main class="account-screen"><div class="wallet">' +
    '<p role="status">' + esc(message) + '</p>' +
    (retry ? '<button id="retry-wallet" class="primary">重试</button><button id="wallet-signout" class="secondary">退出登录</button>' : '') +
    '</div></main>';
  if (retry) {
    $('retry-wallet').onclick = () => switchSession(currentSession, { force: true });
    $('wallet-signout').onclick = async () => {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) toast('退出登录失败，请重试。');
    };
  }
}

async function switchSession(session, { force = false, recovery = false, message = '' } = {}) {
  const oldId = currentSession?.user.id;
  currentSession = session;
  if (!force && oldId === session?.user.id && (oldId || !recovery)) return;
  const revision = ++sessionRevision;
  ready = false;
  writing = false;
  data = emptyWallet();
  selected = null;
  page = '总览';
  query = '';
  sort = 'default';
  syncMessage = '';
  finishModalClose();
  dialog.replaceChildren();
  document.querySelector('.toast')?.remove();
  if (!session || recovery) {
    setAuthScreen(recovery && session ? 'reset' : 'login', message);
    return;
  }
  walletStatus('正在读取你的钱包…');
  try {
    const wallet = await loadWallet(client, session.user.id);
    if (revision !== sessionRevision) return;
    data = wallet;
    ready = true;
    render();
  } catch {
    if (revision === sessionRevision) walletStatus('暂时无法读取钱包，请稍后重试。', true);
  }
}

async function changeRecord(kind, previous, changes, { id, error, done } = {}) {
  if (!ready || writing) return;
  const revision = sessionRevision;
  const user = currentSession.user.id;
  writing = true;
  syncMessage = '正在保存…';
  const status = $('sync-status');
  if (status) status.textContent = syncMessage;
  let saved = false;
  try {
    await saveRecord(client, user, kind, previous, changes, id);
    saved = true;
    const fresh = await loadWallet(client, user);
    if (revision !== sessionRevision) return;
    data = fresh;
    syncMessage = '';
    if (done) done();
    else render();
    toast('已保存');
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
    syncMessage = stale ? '记录已在其他设备修改。请核对最新值并重新提交。' : '保存失败，请重试。';
    render();
    if (error?.isConnected) error.textContent = syncMessage;
    else toast(syncMessage);
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
