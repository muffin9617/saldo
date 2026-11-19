import { client } from './auth.js';

export const defaultNotificationPreferences = () => ({ push_enabled: true, email_enabled: true });
export const notificationTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export async function loadNotificationPreferences(userId) {
  let { data, error } = await client.from('saldo_notification_preferences').select('push_enabled,email_enabled,time_zone')
    .eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (data) return data;
  const defaults = { user_id: userId, ...defaultNotificationPreferences(), time_zone: notificationTimeZone() };
  ({ data, error } = await client.from('saldo_notification_preferences')
    .upsert(defaults, { onConflict: 'user_id', ignoreDuplicates: true }).select().maybeSingle());
  if (error) throw error;
  if (data) return data;
  // Another device may have created the preferences while this device was signing in.
  const existing = await client.from('saldo_notification_preferences').select('push_enabled,email_enabled,time_zone')
    .eq('user_id', userId).single();
  if (existing.error) throw existing.error;
  return existing.data;
}

export async function saveNotificationPreferences(userId, preferences) {
  const { error } = await client.from('saldo_notification_preferences').upsert({
    user_id: userId,
    push_enabled: preferences.push_enabled,
    email_enabled: preferences.email_enabled,
    time_zone: notificationTimeZone(),
  }, { onConflict: 'user_id' });
  if (error) throw error;
}

export async function notificationDeliveryStatus() {
  const { data, error } = await client.functions.invoke('saldo-notifications', { body: { action: 'status' } });
  if (error) return { push_ready: false, email_ready: false, vapid_public_key: null };
  return data;
}

export function browserPushStatus() {
  if (!window.isSecureContext || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { available: false, permission: 'unsupported' };
  }
  return { available: true, permission: Notification.permission };
}

export async function registeredPushDevice() {
  if (!browserPushStatus().available) return null;
  const registration = await navigator.serviceWorker.getRegistration(new URL('./', location.href));
  return registration ? registration.pushManager.getSubscription() : null;
}

export async function enablePushDevice(userId, publicKey, permissionRequest) {
  const permission = await permissionRequest;
  if (permission !== 'granted') throw new Error('PUSH_PERMISSION');
  const key = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
  const registration = await navigator.serviceWorker.register('./notification-worker.js', { scope: './' });
  await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription()
    ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const serialized = subscription.toJSON();
  // The endpoint is unique, so a device cannot silently switch its account owner.
  const { error } = await client.from('saldo_push_devices').upsert({
    user_id: userId, endpoint: serialized.endpoint, p256dh: serialized.keys.p256dh, auth: serialized.keys.auth,
  }, { onConflict: 'endpoint' });
  if (error) {
    await subscription.unsubscribe();
    throw error;
  }
  return subscription;
}

export async function detachPushDevice(userId) {
  const subscription = await registeredPushDevice();
  if (!subscription) return;
  const { error } = await client.from('saldo_push_devices').delete()
    .eq('user_id', userId).eq('endpoint', subscription.endpoint);
  if (error) throw error;
  await subscription.unsubscribe();
}
