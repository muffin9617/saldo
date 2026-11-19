const preview = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
const $ = id => document.getElementById(id);
let api, helpers, user, delivery, preferences, connected = false, busy = false;
const supported = () => window.isSecureContext && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
const buttons = () => {
  $('enable').disabled = busy || (!preview && (!user || !preferences?.push_enabled || !delivery?.push_ready || !supported() || Notification.permission === 'denied'));
  $('enable').textContent = connected ? '更新设备连接' : '连接这台设备';
  $('display').disabled = busy || !connected;
  $('recheck').disabled = busy;
};

async function check() {
  busy = true; buttons();
  $('result').textContent = '';
  try {
    if (preview) {
      $('preview-note').hidden = false;
      $('status').textContent = connected ? '预览：设备已连接 · 每日自动提醒未开启' : '预览：账号已登录 · 通知服务已配置 · 等待连接设备';
      return;
    }
    api ??= (await import('./auth.js')).client;
    const session = await api.auth.getSession();
    if (session.error) throw session.error;
    user = session.data.session?.user;
    $('login').hidden = Boolean(user);
    if (!user) { connected = false; $('status').textContent = '请先登录 Saldo，然后返回本页重新检查。'; return; }
    // Reuse the existing production auth storage; no new sign-in flow on this page.
    helpers ??= await import('./notifications.js');
    preferences = await helpers.loadNotificationPreferences(user.id);
    delivery = await helpers.notificationDeliveryStatus();
    const subscription = await helpers.registeredPushDevice();
    connected = false;
    if (subscription) {
      const saved = await api.from('saldo_push_devices').select('id').eq('user_id', user.id).eq('endpoint', subscription.endpoint).maybeSingle();
      if (saved.error) throw saved.error;
      connected = Boolean(saved.data) && Notification.permission === 'granted';
    }
    const message = !supported() ? '当前环境不支持推送，请从主屏幕打开 Saldo。'
      : Notification.permission === 'denied' ? '通知已被拒绝，请在系统或浏览器设置中允许。'
      : !preferences.push_enabled ? '浏览器推送偏好已关闭，请先在「我的 → 管理通知」中开启。'
      : !delivery.push_ready ? '暂时无法连接推送服务，请稍后重新检查。'
      : connected ? '这台设备已连接，可以测试系统通知显示。' : '已登录，请点击下方按钮连接设备。';
    $('status').textContent = message + (delivery.scheduled ? ' 每日自动提醒已开启。' : ' 每日自动提醒未开启。');
  } catch {
    user = null; delivery = null; connected = false;
    $('status').textContent = '暂时无法读取设置，请重新检查。';
  } finally { busy = false; buttons(); }
}

$('enable').onclick = async () => {
  // Request permission synchronously from the user click, before any network await.
  const permission = preview ? Promise.resolve('granted') : Notification.requestPermission();
  busy = true; buttons(); $('result').textContent = '正在连接设备…';
  try {
    if (!preview) {
      const preferences = await helpers.loadNotificationPreferences(user.id);
      if (!preferences.push_enabled) {
        $('result').textContent = '浏览器推送偏好已关闭，请先在「我的 → 管理通知」中开启。';
        return;
      }
      await helpers.enablePushDevice(user.id, delivery.vapid_public_key, permission);
    }
    connected = true;
    $('result').textContent = preview ? '预览：连接成功，未申请真实权限。' : '设备已连接。下一步测试系统通知显示。';
  } catch {
    $('result').textContent = '未能连接设备。请检查通知权限后重试。';
  } finally { busy = false; buttons(); }
};
$('display').onclick = async () => {
  busy = true; buttons();
  try {
    if (!preview) {
      const registration = await navigator.serviceWorker.getRegistration(new URL('./', location.href));
      if (!registration || Notification.permission !== 'granted') throw new Error('Not connected');
      await registration.showNotification('Saldo · 通知显示测试', {
        body: '这台设备可以显示 Saldo 通知。后台推送与到期提醒仍需单独验收。',
        icon: './icon-192.png', tag: 'saldo-display-test',
      });
    }
    $('result').textContent = preview ? '预览：系统通知显示测试完成（模拟）。' : '已请求显示测试通知，请查看通知中心。这一步没有经过后台推送服务。';
  } catch { $('result').textContent = '系统通知未能显示，请检查权限或重新连接设备。'; }
  finally { busy = false; buttons(); }
};
$('recheck').onclick = check;
void check();
