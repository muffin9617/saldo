export function reminderOffset(subscription, preferences, now = new Date()) {
  if (!subscription.expires_on || subscription.archived_at) return null;
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone: preferences.time_zone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const parts = Object.fromEntries(local.map(part => [part.type, part.value]));
  const today = parts.year + '-' + parts.month + '-' + parts.day;
  const remaining = Math.round((Date.parse(subscription.expires_on + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
  const months = subscription.cycle_months;
  const recommended = months === 1 ? [3, 1] : months >= 12 ? [30, 7, 1] : [7, 1];
  return (subscription.reminder_days ?? recommended).includes(remaining) ? remaining : null;
}

export function pushEndpointAllowed(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && (['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(url.hostname)
        || /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname));
  } catch {
    return false;
  }
}

export function reminderText(subscription, offset) {
  return subscription.name + ' 将于 ' + subscription.expires_on +
    (offset === 0 ? ' 到期（今天）。' : ' 到期，还有 ' + offset + ' 天。');
}
