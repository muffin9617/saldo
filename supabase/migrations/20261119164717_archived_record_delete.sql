-- Permanent deletion is limited to the owner's archived records.
-- Existing card -> balance snapshot foreign keys cascade history deletion.
begin;

create policy saldo_cards_delete_archived on public.saldo_cards
for delete to authenticated
using ((select auth.uid()) = user_id and archived_at is not null);

create policy saldo_subscriptions_delete_archived on public.saldo_subscriptions
for delete to authenticated
using ((select auth.uid()) = user_id and archived_at is not null);

grant delete on public.saldo_cards, public.saldo_subscriptions to authenticated;

commit;
