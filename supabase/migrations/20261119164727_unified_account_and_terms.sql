begin;

create schema if not exists saldo_internal;
revoke all on schema saldo_internal from public, anon, authenticated;
grant usage on schema saldo_internal to service_role;

-- The Auth directory stays private. No public/anonymous email lookup is exposed.
create function saldo_internal.auth_email_exists(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users where lower(email) = lower(btrim(p_email)));
$$;
revoke all on function saldo_internal.auth_email_exists(text) from public, anon, authenticated;
grant execute on function saldo_internal.auth_email_exists(text) to service_role;
create function public.saldo_auth_email_exists(p_email text) returns boolean
language sql stable security invoker set search_path = '' as $$
  select saldo_internal.auth_email_exists(p_email);
$$;
revoke all on function public.saldo_auth_email_exists(text) from public, anon, authenticated;
grant execute on function public.saldo_auth_email_exists(text) to service_role;

-- Salted hashes only; never store passwords, raw IPs or email addresses here.
create table saldo_internal.auth_attempts (
  key_hash text not null check (key_hash ~ '^[a-f0-9]{64}$'),
  window_start timestamptz not null,
  attempts integer not null default 1,
  primary key(key_hash, window_start)
);
create index saldo_auth_attempts_expiry on saldo_internal.auth_attempts(window_start);
alter table saldo_internal.auth_attempts enable row level security;
revoke all on saldo_internal.auth_attempts from public, anon, authenticated;
grant select,insert,update,delete on saldo_internal.auth_attempts to service_role;
create function public.saldo_auth_take_attempt(p_key_hash text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare bucket timestamptz; hits integer;
begin
  if p_limit not between 1 and 100 or p_window_seconds not between 1 and 3600 then
    raise exception 'Invalid rate limit';
  end if;
  delete from saldo_internal.auth_attempts where window_start < now() - interval '1 day';
  bucket := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into saldo_internal.auth_attempts as current(key_hash,window_start,attempts)
  values(p_key_hash,bucket,1)
  on conflict(key_hash,window_start) do update set attempts=current.attempts+1
  returning attempts into hits;
  return hits <= p_limit;
end;
$$;
revoke all on function public.saldo_auth_take_attempt(text,integer,integer) from public, anon, authenticated;
grant execute on function public.saldo_auth_take_attempt(text,integer,integer) to service_role;

create table public.saldo_terms_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null check (terms_version = '2026-11-20'),
  method text not null check (method in ('password','google')),
  accepted_at timestamptz not null default now(),
  primary key(user_id,terms_version)
);
alter table public.saldo_terms_acceptances enable row level security;
revoke all on public.saldo_terms_acceptances from public, anon, authenticated;
grant select on public.saldo_terms_acceptances to authenticated;
grant insert(user_id,terms_version,method) on public.saldo_terms_acceptances to authenticated;
grant select,insert,delete on public.saldo_terms_acceptances to service_role;
create policy saldo_terms_read_own on public.saldo_terms_acceptances for select to authenticated
using ((select auth.uid())=user_id);
create policy saldo_terms_accept_own on public.saldo_terms_acceptances for insert to authenticated
with check ((select auth.uid())=user_id);
create function public.saldo_accept_terms(p_terms_version text,p_method text) returns void
language sql security invoker set search_path = '' as $$
  insert into public.saldo_terms_acceptances(user_id,terms_version,method)
  values(auth.uid(),p_terms_version,p_method) on conflict(user_id,terms_version) do nothing;
$$;
revoke all on function public.saldo_accept_terms(text,text) from public, anon;
grant execute on function public.saldo_accept_terms(text,text) to authenticated;

commit;
