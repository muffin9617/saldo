begin;

alter table public.saldo_subscriptions add column auto_renew boolean;

create table public.saldo_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push_enabled boolean not null default true,
  email_enabled boolean not null default true,
  time_zone text not null default 'UTC' check (char_length(time_zone) between 1 and 100)
);
alter table public.saldo_notification_preferences enable row level security;
revoke all on public.saldo_notification_preferences from public, anon, authenticated;
grant select, insert, update on public.saldo_notification_preferences to authenticated;
create policy saldo_notification_preferences_read on public.saldo_notification_preferences
  for select to authenticated using ((select auth.uid()) = user_id);
create policy saldo_notification_preferences_add on public.saldo_notification_preferences
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy saldo_notification_preferences_edit on public.saldo_notification_preferences
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create table public.saldo_push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (
    char_length(endpoint) <= 2048 and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/'
  ),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}={0,1}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{22}={0,2}$')
);
create index saldo_push_devices_owner on public.saldo_push_devices(user_id);
alter table public.saldo_push_devices enable row level security;
revoke all on public.saldo_push_devices from public, anon, authenticated;
grant select, insert, update, delete on public.saldo_push_devices to authenticated;
create policy saldo_push_devices_read on public.saldo_push_devices for select to authenticated
  using ((select auth.uid()) = user_id);
create policy saldo_push_devices_add on public.saldo_push_devices for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy saldo_push_devices_edit on public.saldo_push_devices for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy saldo_push_devices_remove on public.saldo_push_devices for delete to authenticated
  using ((select auth.uid()) = user_id);

create table public.saldo_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid not null references public.saldo_subscriptions(id) on delete cascade,
  expires_on date not null,
  reminder_day integer not null check (reminder_day in (0,1,3,7,14,30)),
  channel text not null check (channel in ('push', 'email')),
  destination text not null,
  lease_id uuid,
  lease_until timestamptz,
  sent_at timestamptz,
  unique (subscription_id, expires_on, reminder_day, channel, destination)
);
alter table public.saldo_notification_deliveries enable row level security;
revoke all on public.saldo_notification_deliveries from public, anon, authenticated;

-- Only the server can acquire leases. Retries and concurrent invocations share one event key.
create function public.saldo_claim_notification(
  p_user_id uuid, p_subscription_id uuid, p_expires_on date, p_reminder_day integer,
  p_channel text, p_destination text, p_lease_id uuid
) returns uuid
language sql security invoker set search_path = '' as $$
  insert into public.saldo_notification_deliveries as delivery
    (user_id, subscription_id, expires_on, reminder_day, channel, destination, lease_id, lease_until)
  select p_user_id, p_subscription_id, p_expires_on, p_reminder_day, p_channel, p_destination,
         p_lease_id, now() + interval '10 minutes'
  where exists (
    select 1 from public.saldo_subscriptions s where s.id = p_subscription_id
      and s.user_id = p_user_id and s.expires_on = p_expires_on and s.archived_at is null
  ) and exists (
    select 1 from public.saldo_notification_preferences p where p.user_id = p_user_id
      and case p_channel when 'email' then p.email_enabled else p.push_enabled end
  )
  on conflict (subscription_id, expires_on, reminder_day, channel, destination) do update
    set lease_id = excluded.lease_id, lease_until = excluded.lease_until
    where delivery.sent_at is null and delivery.lease_until < now()
  returning id;
$$;
revoke all on function public.saldo_claim_notification(uuid,uuid,date,integer,text,text,uuid) from public, anon, authenticated;
grant execute on function public.saldo_claim_notification(uuid,uuid,date,integer,text,text,uuid) to service_role;
grant all on public.saldo_notification_preferences, public.saldo_push_devices,
  public.saldo_notification_deliveries to service_role;

commit;
