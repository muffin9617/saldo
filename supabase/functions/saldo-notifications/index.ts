import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';
import * as webpush from 'npm:web-push@4.0.0';
import { pushEndpointAllowed, reminderOffset, reminderText } from './reminders.js';
import { reminderEmail } from './email-templates.js';

const env = (name: string) => Deno.env.get(name) || '';
const origins = new Set(['https://saldo.tobmarket.ing']);
const cors = (origin: string) => ({
  'Access-Control-Allow-Origin': origins.has(origin) ? origin : 'https://saldo.tobmarket.ing',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
});
// Device registration must be possible before scheduled delivery is enabled.
const pushReady = () => Boolean(env('VAPID_PUBLIC_KEY') && env('VAPID_PRIVATE_KEY') && env('VAPID_SUBJECT'));
const emailReady = () => Boolean(env('RESEND_API_KEY') && env('SALDO_FROM_EMAIL'));

async function allRows(client: SupabaseClient, table: string, configure = (query: any) => query) {
  const rows: any[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await configure(client.from(table).select('*')).order('id').range(start, start + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}

async function sendReminder(client: SupabaseClient, subscription: any, destination: string, channel: 'push' | 'email', offset: number, device: any) {
  if (channel === 'push' && !pushEndpointAllowed(device.endpoint)) return false;
  const lease = crypto.randomUUID();
  const { data: id, error } = await client.rpc('saldo_claim_notification', {
    p_user_id: subscription.user_id, p_subscription_id: subscription.id,
    p_expires_on: subscription.expires_on, p_reminder_day: offset,
    p_channel: channel, p_destination: destination, p_lease_id: lease,
  });
  if (error) throw error;
  if (!id) return false;
  try {
    // Respect preferences changed since this invocation began.
    const { data: latest, error: readError } = await client.from('saldo_notification_preferences')
      .select('push_enabled,email_enabled').eq('user_id', subscription.user_id).single();
    if (readError) throw readError;
    if (!latest[channel + '_enabled']) return false;
    if (channel === 'push') {
      const { data: current, error: deviceError } = await client.from('saldo_push_devices').select('id')
        .eq('id', device.id).eq('user_id', subscription.user_id).maybeSingle();
      if (deviceError) throw deviceError;
      if (!current) return false;
      await webpush.sendNotification({
        endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth },
      }, JSON.stringify({ body: reminderText(subscription, offset), tag: id }), {
        vapidDetails: { subject: env('VAPID_SUBJECT'), publicKey: env('VAPID_PUBLIC_KEY'), privateKey: env('VAPID_PRIVATE_KEY') },
        timeout: 8000, TTL: 3600, urgency: 'normal', topic: id.replaceAll('-', '').slice(0, 32),
      });
    } else {
      const { data, error: userError } = await client.auth.admin.getUserById(subscription.user_id);
      if (userError) throw userError;
      if (!data.user?.email_confirmed_at || !data.user.email) return false;
      const message = reminderEmail(subscription, offset);
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + env('RESEND_API_KEY'),
          'Content-Type': 'application/json', 'Idempotency-Key': 'saldo-reminder/' + id,
        },
        body: JSON.stringify({
          from: env('SALDO_FROM_EMAIL'), to: [data.user.email],
          subject: message.subject, html: message.html, text: message.text,
        }),
        signal: AbortSignal.timeout(8000), redirect: 'error',
      });
      if (!response.ok) throw new Error('Email delivery failed');
    }
    const { error: writeError } = await client.from('saldo_notification_deliveries').update({ sent_at: new Date().toISOString() })
      .eq('id', id).eq('lease_id', lease);
    if (writeError) throw writeError;
    return true;
  } catch (error) {
    if (channel === 'push' && [404, 410].includes((error as { statusCode?: number }).statusCode ?? 0)) {
      await client.from('saldo_push_devices').delete().eq('id', device.id);
    }
    // Keep the lease after a failure. A provider may have accepted a timed-out request.
    throw new Error('Reminder delivery failed');
  }
}

Deno.serve(async request => {
  const origin = request.headers.get('origin') || '';
  const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: cors(origin) });
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
  let body: { action?: string; user_id?: string; device_id?: string };
  try { body = await request.json(); } catch { return respond({ error: 'Invalid request' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return respond({ error: 'Invalid request' }, 400);
  if (body.action === 'status') {
    const { data, error } = await client.auth.getUser(token || '');
    if (error || !data.user) return respond({ error: 'Sign in required' }, 401);
    return respond({ push_ready: pushReady(), email_ready: emailReady(), scheduled: env('SALDO_NOTIFICATIONS_SCHEDULED') === 'true', vapid_public_key: pushReady() ? env('VAPID_PUBLIC_KEY') : null });
  }
  const scheduleToken = env('SALDO_REMINDER_TOKEN');
  if (!scheduleToken || token !== scheduleToken) return respond({ error: 'Unauthorized' }, 401);
  // A scheduler-authenticated configuration check never sends notifications.
  if (body.action === 'diagnostics') return respond({
    scheduled: env('SALDO_NOTIFICATIONS_SCHEDULED') === 'true',
    email_configured: Boolean(env('RESEND_API_KEY') && env('SALDO_FROM_EMAIL')),
    from_email: env('SALDO_FROM_EMAIL') || null,
    push_configured: Boolean(env('VAPID_PUBLIC_KEY') && env('VAPID_PRIVATE_KEY') && env('VAPID_SUBJECT')),
    vapid_public_key: env('VAPID_PUBLIC_KEY') || null,
  });
  // An operator can test one explicitly selected device without enabling cron.
  // This route cannot send email or accept a caller-supplied push endpoint/body.
  if (body.action === 'test-push') {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(body.user_id || '') || !uuid.test(body.device_id || '')) return respond({ error: 'Select a user and device' }, 400);
    if (!pushReady()) return respond({ error: 'Push is not configured' }, 503);
    try {
      const { data: device, error: deviceError } = await client.from('saldo_push_devices').select('*')
        .eq('id', body.device_id).eq('user_id', body.user_id).maybeSingle();
      if (deviceError) throw deviceError;
      if (!device) return respond({ error: 'Device not found' }, 404);
      const { data: preferences, error: preferencesError } = await client.from('saldo_notification_preferences')
        .select('push_enabled').eq('user_id', body.user_id).maybeSingle();
      if (preferencesError) throw preferencesError;
      if (!preferences?.push_enabled) return respond({ error: 'Push is disabled' }, 409);
      if (!pushEndpointAllowed(device.endpoint)) return respond({ error: 'Invalid push provider' }, 400);
      const result = await webpush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
        JSON.stringify({ body: '后台推送测试：这条通知由 Saldo 服务器发送。收到即表示后台到设备的推送链路已连通。', tag: 'saldo-backend-test' }), {
          vapidDetails: { subject: env('VAPID_SUBJECT'), publicKey: env('VAPID_PUBLIC_KEY'), privateKey: env('VAPID_PRIVATE_KEY') },
          timeout: 8000, TTL: 300, urgency: 'high', topic: 'saldo-backend-test',
        });
      return respond({ accepted: true, channel: 'push', provider_status: result.statusCode });
    } catch (error) {
      const code = (error as { statusCode?: number }).statusCode;
      return respond({ error: 'Test push failed', provider_status: typeof code === 'number' ? code : null }, 503);
    }
  }
  if (body.action !== 'dispatch') return respond({ error: 'Unauthorized' }, 401);
  if (env('SALDO_NOTIFICATIONS_SCHEDULED') !== 'true') return respond({ error: 'Scheduled delivery is disabled' }, 503);
  if (!pushReady() && !emailReady()) return respond({ error: 'Delivery is not configured' }, 503);
  try {
    const preferences = await allRows(client, 'saldo_notification_preferences', query => query.or('push_enabled.eq.true,email_enabled.eq.true'));
    const subscriptions = await allRows(client, 'saldo_subscriptions', query => query.is('archived_at', null).not('expires_on', 'is', null));
    const devices = pushReady() ? await allRows(client, 'saldo_push_devices') : [];
    const byUser = new Map(preferences.map(row => [row.user_id, row]));
    let sent = 0, failed = 0;
    const now = new Date();
    for (const subscription of subscriptions) {
      const settings = byUser.get(subscription.user_id);
      if (!settings) continue;
      let offset;
      try { offset = reminderOffset(subscription, settings, now); } catch { failed++; continue; }
      if (offset === null) continue;
      const destinations: { channel: 'email' | 'push'; destination: string; device: any }[] = [];
      if (emailReady() && settings.email_enabled) destinations.push({ channel: 'email', destination: 'account-email', device: null });
      if (pushReady() && settings.push_enabled) {
        for (const device of devices.filter(device => device.user_id === subscription.user_id)) {
          destinations.push({ channel: 'push', destination: device.id, device });
        }
      }
      for (const { channel, destination, device } of destinations) {
        try {
          if (await sendReminder(client, subscription, destination, channel, offset, device)) sent++;
        } catch { failed++; }
      }
    }
    return respond({ sent, failed }, failed ? 503 : 200);
  } catch {
    return respond({ error: 'Reminder dispatch failed' }, 503);
  }
});
