import { installSwipeNavigation, confirmDiscardChanges } from './gestures.js';
import { settingsHeader } from './settings-ui.js';
const preview = ['localhost','127.0.0.1','[::1]'].includes(location.hostname);
const $ = id => document.getElementById(id);
document.querySelector('#app').insertAdjacentHTML('afterbegin',settingsHeader('管理通知'));
let client, helpers, user, preferences, delivery, connected = false, busy = true;
const browserState = () => preview ? {available:true,permission:'default'} : helpers?.browserPushStatus();
function controls() {
  for (const element of $('settings').elements) element.disabled = busy || !user;
  const browser = browserState();
  $('device-panel').hidden = !user || !$('push').checked;
  $('connect').hidden = true; $('install-help').hidden = true;
  if (!user || !$('push').checked) return;
  if (!preferences?.push_enabled) $('device-note').textContent = '保存偏好后，即可为这台设备开启推送。';
  else if (!delivery?.push_ready) $('device-note').textContent = '推送服务暂不可用，你的接收偏好已保留。';
  else if (browser?.permission === 'denied') $('device-note').textContent = '此设备通知权限已关闭，请在浏览器或系统设置中允许 Saldo 通知。';
  else if (!browser?.available) {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    $('device-note').textContent = ios && !installed ? '请先将 Saldo 添加到主屏幕，再从主屏幕打开并开启推送。' : '当前浏览器不支持推送，可使用邮件提醒或换用支持推送的浏览器。';
    $('install-help').hidden = !ios || installed;
  } else if (connected) $('device-note').textContent = '这台设备已连接，可接收到期推送。';
  else {
    $('device-note').textContent = '推送偏好已开启，还需授权这台设备接收通知。';
    $('connect').hidden = false; $('connect').disabled = busy;
  }
}
async function sameAccount() {
  if (preview) return;
  const {data,error} = await client.auth.getSession();
  if (error || data.session?.user.id !== user.id) throw new Error('ACCOUNT_CHANGED');
}
async function init() {
  try {
    if (preview) {
      $('preview-note')?.remove();
      try { user = JSON.parse(localStorage.getItem('saldo-preview:session'))?.user; } catch {}
      user ||= {id:'preview',email:'you@example.com'};
      const rows = JSON.parse(localStorage.getItem('saldo-preview:saldo_notification_preferences') || '[]');
      preferences = rows.find(row=>row.user_id === user.id) || {push_enabled:true,email_enabled:true};
      delivery = {push_ready:true,scheduled:true};
    } else {
      client = (await import('./auth.js')).client;
      const session = await client.auth.getSession();
      if (session.error) throw session.error;
      user = session.data.session?.user;
      if (!user) { $('login').hidden = false; $('status').textContent = '请先登录，再管理通知。'; return; }
      helpers = await import('./notifications.js');
      [preferences,delivery] = await Promise.all([helpers.loadNotificationPreferences(user.id),helpers.notificationDeliveryStatus()]);
      const subscription = await helpers.registeredPushDevice();
      if (subscription && browserState().permission === 'granted') {
        const saved = await client.from('saldo_push_devices').select('id').eq('user_id',user.id).eq('endpoint',subscription.endpoint).maybeSingle();
        if (saved.error) throw saved.error;
        connected = Boolean(saved.data);
      }
    }
    $('push').checked = preferences.push_enabled; $('email').checked = preferences.email_enabled;
    $('email-note').textContent = '发送到 '+user.email;
    $('settings').hidden = false;
    $('status').textContent = preview ? '本地预览 · 不修改真实偏好或申请设备权限' : delivery.scheduled ? '按你的订阅设置接收到期提醒，也可以全部关闭。' : '自动提醒暂未开启，你仍可保存接收偏好。';
    if (!preview && !delivery.email_ready) $('email-note').textContent += ' · 邮件服务暂不可用';
  } catch { user = null; $('status').textContent = '暂时无法读取设置，请刷新重试。'; }
  finally { busy = false; controls(); }
}
$('push').onchange = controls;
$('settings').onsubmit = async event => {
  event.preventDefault(); if (busy || !user) return;
  if(!navigator.onLine){$('result').textContent='当前离线，尚未保存。请联网后重试。';return;}
  const changes = {push_enabled:$('push').checked,email_enabled:$('email').checked};
  busy = true; controls(); $('save').textContent = '正在保存…'; $('result').textContent = '';
  try {
    await sameAccount();
    if (!preview) await helpers.saveNotificationPreferences(user.id,changes);
    else {
      const key = 'saldo-preview:saldo_notification_preferences';
      const rows = JSON.parse(localStorage.getItem(key) || '[]').filter(row=>row.user_id !== user.id);
      localStorage.setItem(key,JSON.stringify([...rows,{user_id:user.id,...changes}]));
    }
    preferences = changes;
    $('result').textContent = (preview ? '预览：' : '')+(changes.push_enabled || changes.email_enabled ? '接收偏好已保存。' : '已关闭全部到期提醒。');
  } catch (error) {
    $('result').textContent = error.message === 'ACCOUNT_CHANGED' ? '登录状态已变化，请刷新页面后重试。' : '保存失败，请重试。';
  } finally { busy = false; $('save').textContent = '保存偏好'; controls(); }
};
$('connect').onclick = async () => {
  if (busy || !user || $('connect').disabled || $('connect').hidden) return;
  // Keep the browser permission request inside the explicit user gesture.
  const permission = preview ? Promise.resolve('granted') : Notification.requestPermission();
  busy = true; controls(); $('connect').textContent = '正在连接…';
  try {
    await sameAccount();
    if (!preview) await helpers.enablePushDevice(user.id,delivery.vapid_public_key,permission);
    connected = true;
    $('result').textContent = preview ? '预览：模拟设备已连接，未申请真实权限。' : '此设备已开启推送。';
  } catch { $('result').textContent = '设备连接未完成，请检查通知权限后重试。'; }
  finally { busy = false; $('connect').textContent = '开启此设备推送'; controls(); }
};
void init();

const hasUnsavedPreferences = () => preferences && ($('push').checked !== preferences.push_enabled || $('email').checked !== preferences.email_enabled);
const backLink = document.querySelector('.settings-back');
const fromApp=Boolean(history.state?.saldoNotification?.fromApp || sessionStorage.getItem('saldo.notificationFromApp')==='true');sessionStorage.removeItem('saldo.notificationFromApp');
let pendingBack=false,allowBack=false,internalBack=false;
if(!history.state?.saldoNotification){history.replaceState({saldoNotification:{phase:'base',fromApp}},'',location.href);history.pushState({saldoNotification:{phase:'active',fromApp}},'',location.href);}
else if(history.state.saldoNotification.phase==='base')history.pushState({saldoNotification:{phase:'active',fromApp}},'',location.href);
const discardPreferences=()=>{if(preferences){$('push').checked=preferences.push_enabled;$('email').checked=preferences.email_enabled;}};
window.addEventListener('popstate',event=>{
  const state=event.state?.saldoNotification;if(!state)return;
  if(state.phase==='base'){
    if(allowBack || (!busy&&!hasUnsavedPreferences())){allowBack=false;if(internalBack&&!fromApp)location.replace(backLink.href);else history.back();return;}
    pendingBack=true;history.forward();return;
  }
  if(pendingBack){pendingBack=false;if(busy){$('result').textContent='正在处理，请稍候。';return;}
    confirmDiscardChanges(()=>{discardPreferences();allowBack=true;history.back();},{onStay:()=>{internalBack=false;}});
  }
});
backLink.addEventListener('click',event=>{event.preventDefault();if(busy){$('result').textContent='正在处理，请稍候。';return;}internalBack=true;history.back();});
installSwipeNavigation({canStart:()=>!busy && !document.querySelector('[data-discard-dialog]'),onLeft:()=>{backLink.click();return true;}});
window.addEventListener('beforeunload',event=>{if(hasUnsavedPreferences()){event.preventDefault();event.returnValue='';}});
