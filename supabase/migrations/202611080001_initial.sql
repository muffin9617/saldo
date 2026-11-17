-- Saldo: initial private user data schema.
-- Supabase saved query name: Saldo 001 Initialization
-- Run once in the Saldo Supabase project's SQL Editor.
-- Transactional: existing conflicting objects cause rollback rather than replacement.
-- No seeds, auth settings, credentials, uploads or scheduled notifications are included.
begin;

create table public.saldo_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  balance_cents bigint check (balance_cents between 0 and 9000000000000),
  currency text not null default 'CNY' check (currency = 'CNY'),
  expires_on date,
  note text not null default '' check (char_length(note) <= 200),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  unique (id, user_id)
);

create table public.saldo_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  expires_on date,
  cycle_months integer check (cycle_months between 1 and 1200),
  fee_cents bigint check (fee_cents between 0 and 9000000000000),
  currency text not null default 'CNY' check (currency = 'CNY'),
  -- NULL: follow cycle recommendations; empty array: reminders off.
  -- Months 1 => [3,1], 3/6 => [7,1], >=12 => [30,7,1], otherwise [7,1].
  -- No inference about automatic renewal or the user's intended action.
  reminder_days integer[] default null,
  note text not null default '' check (char_length(note) <= 200),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  constraint saldo_valid_reminder_days check (
    reminder_days is null or (
      cardinality(reminder_days) <= 6
      and array_position(reminder_days, null) is null
      and reminder_days <@ array[0,1,3,7,14,30]
    )
  )
);

-- Balance snapshots are observations, never inferred spending transactions.
create table public.saldo_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null,
  user_id uuid not null,
  balance_cents bigint not null check (balance_cents between 0 and 9000000000000),
  recorded_at timestamptz not null default now(),
  foreign key (card_id, user_id) references public.saldo_cards(id, user_id) on delete cascade
);

create index saldo_cards_owner on public.saldo_cards(user_id, archived_at);
create index saldo_subscriptions_owner on public.saldo_subscriptions(user_id, archived_at, expires_on);
create index saldo_snapshots_owner on public.saldo_balance_snapshots(user_id, card_id, recorded_at);

create function public.saldo_record_metadata() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.name := btrim(new.name);
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.version := 1;
  else
    if new.id is distinct from old.id or new.user_id is distinct from old.user_id then
      raise exception 'Record ownership and identity cannot be changed';
    end if;
    new.created_at := old.created_at;
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

create trigger saldo_cards_metadata before insert or update on public.saldo_cards
for each row execute function public.saldo_record_metadata();
create trigger saldo_subscriptions_metadata before insert or update on public.saldo_subscriptions
for each row execute function public.saldo_record_metadata();

create function public.saldo_capture_balance() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.balance_cents is null then return new; end if;
  if tg_op = 'UPDATE' then
    if new.balance_cents is not distinct from old.balance_cents then return new; end if;
  end if;
  insert into public.saldo_balance_snapshots(card_id, user_id, balance_cents)
  values (new.id, new.user_id, new.balance_cents);
  return new;
end;
$$;

create trigger saldo_cards_snapshot after insert or update on public.saldo_cards
for each row execute function public.saldo_capture_balance();

alter table public.saldo_cards enable row level security;
alter table public.saldo_subscriptions enable row level security;
alter table public.saldo_balance_snapshots enable row level security;

create policy saldo_cards_read on public.saldo_cards for select to authenticated
using ((select auth.uid()) = user_id);
create policy saldo_cards_add on public.saldo_cards for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy saldo_cards_edit on public.saldo_cards for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy saldo_subscriptions_read on public.saldo_subscriptions for select to authenticated
using ((select auth.uid()) = user_id);
create policy saldo_subscriptions_add on public.saldo_subscriptions for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy saldo_subscriptions_edit on public.saldo_subscriptions for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy saldo_snapshots_read on public.saldo_balance_snapshots for select to authenticated
using ((select auth.uid()) = user_id);

-- Explicit grants override Supabase's possible default table privileges.
-- Archiving is an UPDATE; client hard deletes and snapshot rewrites are excluded.
revoke all on public.saldo_cards, public.saldo_subscriptions,
  public.saldo_balance_snapshots from public, anon, authenticated;
grant select, insert, update on public.saldo_cards, public.saldo_subscriptions to authenticated;
grant select on public.saldo_balance_snapshots to authenticated;
revoke all on function public.saldo_record_metadata() from public, anon, authenticated;
revoke all on function public.saldo_capture_balance() from public, anon, authenticated;

-- Clients must filter updates by both id AND last-read version and request the
-- updated row. Zero rows means stale data: refetch, keep the edit, ask to reconcile.
-- Do not upload the prototype's localStorage or sample data automatically.
commit;
