const preview = ['localhost','127.0.0.1','[::1]'].includes(location.hostname);
const $ = id => document.getElementById(id);
let client, helpers, user, preferences, delivery, busy = false;
const controls = () => {
  for (const element of $('settings').elements) element.disabled = busy;
  const browser = preview ? { available:true,permission:'default' } : helpers?.browserPushStatus();
  $('connect').disabled = busy || !preferences?.push_enabled || !$('push').checked || !delivery?.push_ready || !browser?.available || browser.permission === 'denied';
};
async function sameAccount() {
  if (preview) return;
  const {data,error} = await client.auth.getSession();
  if (error || data.session?.user.id !== user.id) throw new Error('ACCOUNT_CHANGED');
}
async function init() {
  busy = true;
  try {
    if (preview) {
      $('preview-note').hidden = false;
      user = { id:'preview',email:'you@example.com' };
      preferences = { push_enabled:true,email_enabled:true };
      delivery = { push_ready:true,scheduled:false };
    } else {
      client = (await import('./auth.js')).client;
      const session = await client.auth.getSession();
      if (session.error) throw session.error;
      user = session.data.session?.user;
      if (!user) { $('login').hidden = false; $('status').textContent = '请先登录 Saldo，再管理通知。'; return; }
      helpers = await import('./notifications.js');
      [preferences,delivery] = await Promise.all([helpers.loadNotificationPreferences(user.id),helpers.notificationDeliveryStatus()]);
    }
    $('push').checked = preferences.push_enabled;
    $('email').checked = preferences.email_enabled;
    $('email-note').textContent = '发送到 '+user.email;
    $('settings').hidden = false;
    $('status').textContent = delivery.scheduled ? '按你的订阅设置接收到期提醒。' : '每日自动提醒尚未开启，你可以先保存接收偏好。';
    const browser = preview ? {available:true,permission:'default'} : helpers.browserPushStatus();
    $('device-note').textContent = !browser.available ? '此环境暂不支持推送。iPhone 请从主屏幕打开 Saldo。' : browser.permission === 'denied' ? '设备通知已被拒绝，请在系统或浏览器设置中允许。' : '保存浏览器推送偏好后，点击按钮授权此设备。';
  } catch { $('status').textContent = '暂时无法读取设置，请刷新重试。'; }
  finally { busy = false; controls(); }
}
$('push').onchange = controls;
$('settings').onsubmit = async event => {
  event.preventDefault();
  const changes = {push_enabled:$('push').checked,email_enabled:$('email').checked};
  busy = true; controls(); $('save').textContent = '正在保存…'; $('result').textContent = '';
  try {
    await sameAccount();
    if (!preview) await helpers.saveNotificationPreferences(user.id,changes);
    preferences = changes;
    // Account-level preference is authoritative. A device may stay registered
    // when push is off; retaining it avoids unsubscription side effects.
    $('result').textContent = (preview ? '预览：' : '')+(changes.push_enabled || changes.email_enabled ? '接收偏好已保存。' : '已关闭全部到期提醒。');
  } catch (error) {
    $('result').textContent = error.message === 'ACCOUNT_CHANGED' ? '登录状态已变化，请刷新页面后重试。' : '保存失败，请重试。';
  } finally { busy = false; $('save').textContent = '保存偏好'; controls(); }
};
$('connect').onclick = async () => {
  const permission = preview ? Promise.resolve('granted') : Notification.requestPermission();
  busy = true; controls(); $('connect').textContent = '正在连接…';
  try {
    await sameAccount();
    if (!preview) await helpers.enablePushDevice(user.id,delivery.vapid_public_key,permission);
    $('result').textContent = preview ? '预览：此设备已连接，未申请真实权限。' : '此设备已开启推送。';
  } catch { $('result').textContent = '设备连接未完成，请检查通知权限后重试。'; }
  finally { busy = false; $('connect').textContent = '开启此设备推送'; controls(); }
};
void init();
