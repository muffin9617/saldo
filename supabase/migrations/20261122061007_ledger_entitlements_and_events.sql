begin;
-- Additive only: existing balances, dates, notes and snapshots are untouched.
alter table public.saldo_cards add column entitlements jsonb;
alter table public.saldo_subscriptions add column cycle_exact jsonb;
alter table public.saldo_subscriptions add column cycle_anchor integer check(cycle_anchor between 1 and 31);
create table public.saldo_ledger_events (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 card_id uuid, subscription_id uuid, occurred_on date not null,
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<40000),
 created_at timestamptz not null default now(),
 check(num_nonnulls(card_id,subscription_id)=1),
 foreign key(card_id,user_id) references public.saldo_cards(id,user_id) on delete cascade,
 foreign key(subscription_id) references public.saldo_subscriptions(id) on delete cascade
);
create index saldo_ledger_events_owner on public.saldo_ledger_events(user_id,created_at,id);
create index saldo_ledger_events_card on public.saldo_ledger_events(card_id,user_id);
create index saldo_ledger_events_subscription on public.saldo_ledger_events(subscription_id);
alter table public.saldo_ledger_events enable row level security;
revoke all on public.saldo_ledger_events from public,anon,authenticated;
grant select,insert,update,delete on public.saldo_ledger_events to authenticated;
create policy saldo_ledger_events_read on public.saldo_ledger_events for select to authenticated using((select auth.uid())=user_id);
create policy saldo_ledger_events_add on public.saldo_ledger_events for insert to authenticated with check((select auth.uid())=user_id and (subscription_id is null or exists(select 1 from public.saldo_subscriptions s where s.id=subscription_id and s.user_id=(select auth.uid()))));
create policy saldo_ledger_events_edit on public.saldo_ledger_events for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id and (subscription_id is null or exists(select 1 from public.saldo_subscriptions s where s.id=subscription_id and s.user_id=(select auth.uid()))));
create policy saldo_ledger_events_delete on public.saldo_ledger_events for delete to authenticated using((select auth.uid())=user_id);

-- Open tabs running the old scalar-only UI must not silently overwrite new rights.
create function public.saldo_ledger_compatibility_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='saldo_cards' then
  if old.entitlements is not null and new.entitlements is not distinct from old.entitlements and new.balance_cents is distinct from old.balance_cents then raise exception 'REFRESH_REQUIRED'; end if;
 else
  if old.cycle_exact is not null and new.cycle_exact is not distinct from old.cycle_exact and new.cycle_months is distinct from old.cycle_months then raise exception 'REFRESH_REQUIRED'; end if;
 end if;
 return new;
end;
$$;
revoke all on function public.saldo_ledger_compatibility_guard() from public,anon,authenticated;
create trigger saldo_cards_ledger_guard before update on public.saldo_cards for each row execute function public.saldo_ledger_compatibility_guard();
create trigger saldo_subscriptions_ledger_guard before update on public.saldo_subscriptions for each row execute function public.saldo_ledger_compatibility_guard();

create function public.saldo_ledger_write(p_action text,p_kind text,p_id uuid,p_version bigint,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 u uuid:=auth.uid(); c public.saldo_cards; s public.saldo_subscriptions;
 r jsonb; items jsonb; previous jsonb; item jsonb; output jsonb:='[]'; changes jsonb:='[]';
 ev jsonb; old_ev jsonb; event_id uuid; old_event_id uuid; before_data jsonb:='{}';
 n bigint; old_n bigint; v bigint; paid bigint; balance bigint; version_now bigint; months integer;
 dt date; next_date date; anchor integer; cycle jsonb; archived timestamptz; is_new boolean:=p_action='create';
begin
 if u is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_kind not in ('stored','subscription') or p_kind is null or octet_length(p_payload::text)>40000 then raise exception 'INVALID_RECORD'; end if;
 if not is_new then
  if p_kind='stored' then select * into c from public.saldo_cards where id=p_id and user_id=u for update; version_now:=c.version; archived:=c.archived_at;
  else select * into s from public.saldo_subscriptions where id=p_id and user_id=u for update; version_now:=s.version; archived:=s.archived_at; end if;
  if version_now is null or version_now is distinct from p_version then raise exception 'STALE_RECORD'; end if;
  if archived is not null and p_action not in ('restore','delete') then raise exception 'ARCHIVED_RECORD'; end if;
 end if;
 if p_action='delete' then
  if archived is null then raise exception 'NOT_ARCHIVED'; end if;
  if p_kind='stored' then delete from public.saldo_cards where id=p_id and user_id=u; else delete from public.saldo_subscriptions where id=p_id and user_id=u; end if;
  return jsonb_build_object('deleted',true);
 end if;
 if p_action in ('archive','restore') then
  if p_kind='stored' then update public.saldo_cards set archived_at=case when p_action='archive' then now() else null end where id=p_id and user_id=u returning version into version_now;
  else update public.saldo_subscriptions set archived_at=case when p_action='archive' then now() else null end where id=p_id and user_id=u returning version into version_now; end if;
  return jsonb_build_object('version',version_now);
 end if;
 if p_action not in ('create','edit','use','topup','adjust','renew','undo') then raise exception 'INVALID_ACTION'; end if;
 r:=p_payload->'record';
 if p_action in ('create','edit') then
  if char_length(btrim(r->>'name')) not between 1 and 80 or char_length(coalesce(r->>'note',''))>200 then raise exception 'INVALID_RECORD'; end if;
  if p_kind='stored' then
   if is_new then items:=r->'entitlements'; else items:=c.entitlements; end if;
  else
   cycle:=r->'cycle';
   if cycle is not null and cycle<>'null'::jsonb then
    if not (cycle ?& array['unit','value']) or cycle->>'unit' not in ('day','week','month','year') or (cycle->>'value')::numeric not between 1 and 120 or (cycle->>'value')::numeric<>trunc((cycle->>'value')::numeric) then raise exception 'INVALID_CYCLE'; end if;
    months:=case cycle->>'unit' when 'month' then (cycle->>'value')::int when 'year' then (cycle->>'value')::int*12 else null end;
   if months>1200 then months:=null; end if;
   elsif not is_new and coalesce(r->>'legacyCycle','')<>'' then months:=s.cycle_months; end if;
   if cycle is null or cycle='null'::jsonb then cycle:='{}'::jsonb; end if;
   if (r->>'fee')::numeric<0 or (r->>'fee')::numeric>9000000000000 or (r->>'fee')::numeric<>trunc((r->>'fee')::numeric) then raise exception 'INVALID_FEE'; end if;
  end if;
 elsif p_action in ('use','topup','adjust') then
  if p_kind<>'stored' then raise exception 'INVALID_ACTION'; end if;
  previous:=coalesce(c.entitlements,jsonb_build_array(jsonb_build_object('id',c.id::text,'kind','money','name','余额','unit','元','remaining',c.balance_cents)));
  before_data:=jsonb_build_object('entitlements',previous);
  for item in select value from jsonb_array_elements(previous) loop
   old_n:=(item->>'remaining')::bigint;
   if (p_payload->'values') ? (item->>'id') then
    if jsonb_typeof(p_payload->'values'->(item->>'id'))<>'number' or (p_payload->'values'->>(item->>'id'))::numeric<>trunc((p_payload->'values'->>(item->>'id'))::numeric) then raise exception 'INVALID_AMOUNT'; end if;
    v:=(p_payload->'values'->>(item->>'id'))::bigint;
    if v<0 or v>9000000000000 or (old_n is null and p_action<>'adjust') then raise exception 'INVALID_AMOUNT'; end if;
    n:=case p_action when 'use' then old_n-v when 'topup' then old_n+v else v end;
    if n<0 or n>9000000000000 then raise exception 'INVALID_AMOUNT'; end if;
    if old_n is distinct from n then changes:=changes||jsonb_build_array(jsonb_build_object('entitlementId',item->>'id','kind',item->>'kind','unit',item->>'unit','before',old_n,'after',n)); end if;
    item:=jsonb_set(item,'{remaining}',to_jsonb(n));
   end if;
   output:=output||jsonb_build_array(item);
  end loop;
  if jsonb_array_length(changes)=0 then raise exception 'NO_CHANGES'; end if; items:=output;
 elsif p_action='renew' then
  if p_kind<>'subscription' then raise exception 'INVALID_ACTION'; end if;
  before_data:=jsonb_build_object('expires',coalesce(s.expires_on::text,''),'fee',s.fee_cents,'cycleAnchor',s.cycle_anchor);
  next_date:=(p_payload->>'nextDate')::date;
  if next_date is null or next_date<=(p_payload->>'date')::date then raise exception 'INVALID_DATE'; end if;
  anchor:=coalesce((p_payload->>'cycleAnchor')::int,extract(day from next_date)::int);
 elsif p_action='undo' then
  old_event_id:=(p_payload->>'eventId')::uuid;
  select payload into old_ev from public.saldo_ledger_events where id=old_event_id and user_id=u and coalesce(card_id,subscription_id)=p_id for update;
  if old_ev is null or not coalesce((old_ev->>'undoable')::boolean,false) or coalesce((old_ev->>'undone')::boolean,false) or (old_ev->>'afterRevision')::bigint<>version_now then raise exception 'CANNOT_UNDO'; end if;
  if p_kind='stored' then items:=old_ev->'before'->'entitlements';
  else next_date:=nullif(old_ev->'before'->>'expires','')::date; paid:=(old_ev->'before'->>'fee')::bigint; anchor:=(old_ev->'before'->>'cycleAnchor')::int; end if;
 end if;
 -- Validate all stored rights before any write. No changes to a legacy card on metadata edits.
 if items is not null then
  if jsonb_typeof(items)<>'array' or jsonb_array_length(items) not between 1 and 8 then raise exception 'INVALID_ENTITLEMENTS'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(items))<>jsonb_array_length(items) then raise exception 'INVALID_ENTITLEMENTS'; end if;
  for item in select value from jsonb_array_elements(items) loop
   if not (item ?& array['id','kind','name','unit','remaining']) or item->>'kind' not in ('money','quantity') or char_length(btrim(item->>'name')) not between 1 and 40 or char_length(btrim(item->>'unit')) not between 1 and 8 then raise exception 'INVALID_ENTITLEMENTS'; end if;
   if jsonb_typeof(item->'remaining') not in ('number','null') or (item->>'remaining')::numeric<0 or (item->>'remaining')::numeric>9000000000000 or (item->>'remaining')::numeric<>trunc((item->>'remaining')::numeric) then raise exception 'INVALID_AMOUNT'; end if;
  end loop;
  select sum((value->>'remaining')::bigint) into balance from jsonb_array_elements(items) where value->>'kind'='money';
  -- Combined balances remain separate rights; don't overflow the legacy scalar.
  if balance>9000000000000 then balance:=null; end if;
 end if;
 if p_action in ('create','topup','renew') then
  if jsonb_typeof(p_payload->'paid') is distinct from 'number' or (p_payload->>'paid')::numeric<>trunc((p_payload->>'paid')::numeric) then raise exception 'INVALID_PAYMENT'; end if;
  paid:=(p_payload->>'paid')::bigint;if paid<0 or paid>9000000000000 then raise exception 'INVALID_PAYMENT'; end if;
 end if;
 if p_action in ('create','use','topup','adjust','renew') then
  dt:=(p_payload->>'date')::date; if dt is null or dt>(now() at time zone 'Pacific/Kiritimati')::date then raise exception 'INVALID_DATE'; end if;
  if char_length(coalesce(p_payload->>'note',''))>200 or char_length(coalesce(p_payload->>'summary',''))>6000 then raise exception 'INVALID_EVENT'; end if;
  event_id:=(p_payload->>'eventId')::uuid; if event_id is null then raise exception 'INVALID_EVENT'; end if;
 end if;
 if p_kind='stored' then
  if is_new then
   if items is null or not exists(select 1 from jsonb_array_elements(items) x where (x->>'remaining')::bigint>0) then raise exception 'INVALID_ENTITLEMENTS'; end if;
   insert into public.saldo_cards(id,user_id,name,note,expires_on,entitlements,balance_cents) values(p_id,u,r->>'name',coalesce(r->>'note',''),nullif(r->>'expires','')::date,items,balance) returning version into version_now;
  elsif p_action='edit' then update public.saldo_cards set name=r->>'name',note=coalesce(r->>'note',''),expires_on=nullif(r->>'expires','')::date where id=p_id and user_id=u returning version into version_now;
  else update public.saldo_cards set entitlements=items,balance_cents=balance where id=p_id and user_id=u returning version into version_now; end if;
 else
  if is_new then
   insert into public.saldo_subscriptions(id,user_id,name,note,expires_on,fee_cents,cycle_months,cycle_exact,auto_renew,reminder_days,cycle_anchor)
   values(p_id,u,r->>'name',coalesce(r->>'note',''),nullif(r->>'expires','')::date,(r->>'fee')::bigint,months,cycle,(r->>'autoRenew')::boolean,case when jsonb_typeof(r->'reminderDays')='array' then array(select jsonb_array_elements_text(r->'reminderDays')::int) else null end,extract(day from nullif(r->>'expires','')::date)::int) returning version into version_now;
  elsif p_action='edit' then update public.saldo_subscriptions set name=r->>'name',note=coalesce(r->>'note',''),expires_on=nullif(r->>'expires','')::date,fee_cents=(r->>'fee')::bigint,cycle_months=months,cycle_exact=cycle,auto_renew=(r->>'autoRenew')::boolean,
   reminder_days=case when jsonb_typeof(r->'reminderDays')='array' then array(select jsonb_array_elements_text(r->'reminderDays')::int) else null end,
   cycle_anchor=case when s.expires_on is distinct from nullif(r->>'expires','')::date then extract(day from nullif(r->>'expires','')::date)::int else s.cycle_anchor end
   where id=p_id and user_id=u returning version into version_now;
  else update public.saldo_subscriptions set expires_on=next_date,cycle_anchor=anchor,fee_cents=case when p_action='undo' then paid when coalesce((p_payload->>'updateFee')::boolean,false) then paid else fee_cents end where id=p_id and user_id=u returning version into version_now; end if;
 end if;
 if p_action='undo' then
  update public.saldo_ledger_events set payload=payload||jsonb_build_object('undone',true,'undoOn',current_date::text) where id=old_event_id and user_id=u;
  -- Only re-enable sequential undo when no metadata edit intervened.
  update public.saldo_ledger_events set payload=jsonb_set(payload,'{afterRevision}',to_jsonb(version_now)) where id=(select id from public.saldo_ledger_events where user_id=u and coalesce(card_id,subscription_id)=p_id and payload->>'undoable'='true' and coalesce(payload->>'undone','false')='false' and (payload->>'afterRevision')::bigint=(old_ev->>'afterRevision')::bigint-1 order by created_at desc,id desc limit 1);
 elsif p_action<>'edit' then
  ev:=jsonb_build_object('id',event_id,'recordId',p_id,'type',case when is_new then 'purchase' else p_action end,'date',dt::text,'paid',paid,'note',coalesce(p_payload->>'note',''),'summary',coalesce(p_payload->>'summary',''),'before',before_data,'changes',changes,'undoable',not is_new,'undone',false,'afterRevision',version_now);
  insert into public.saldo_ledger_events(id,user_id,card_id,subscription_id,occurred_on,payload) values(event_id,u,case when p_kind='stored' then p_id end,case when p_kind='subscription' then p_id end,dt,ev);
 end if;
 return jsonb_build_object('version',version_now);
end;
$$;
revoke all on function public.saldo_ledger_write(text,text,uuid,bigint,jsonb) from public,anon;
grant execute on function public.saldo_ledger_write(text,text,uuid,bigint,jsonb) to authenticated;
grant all on public.saldo_ledger_events to service_role;
commit;
