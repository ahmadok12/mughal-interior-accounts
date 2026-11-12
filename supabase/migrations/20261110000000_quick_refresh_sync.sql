-- Quick refresh after saves.
-- 1. Every app table gets an updated_at that the DATABASE stamps on each insert and update
--    (the phone's clock is never trusted).
-- 2. Every delete is written to public.sync_deletions, so the app can remove it locally.
-- The app then downloads only rows changed since its last load, instead of every table.
-- Until this file is run, the app keeps working with a full reload after each save.
-- Safe to run more than once.

create table if not exists public.sync_deletions (
  id bigint generated always as identity primary key,
  business_id uuid not null,
  table_name text not null,
  row_id uuid not null,
  deleted_at timestamptz not null default now()
);
create index if not exists sync_deletions_business_id_idx on public.sync_deletions (business_id, id);

alter table public.sync_deletions enable row level security;
revoke all on public.sync_deletions from anon, authenticated;
grant select on public.sync_deletions to authenticated;
drop policy if exists "Members view deletions" on public.sync_deletions;
create policy "Members view deletions" on public.sync_deletions
for select to authenticated
using ((select private.is_business_member(business_id)));

create or replace function private.sync_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- security definer: members cannot write to sync_deletions themselves; only this trigger can.
create or replace function private.sync_log_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.sync_deletions (business_id, table_name, row_id)
  values (old.business_id, tg_table_name, old.id);
  -- Keep the log small: entries older than 90 days are no longer needed by any app session.
  if random() < 0.01 then
    delete from public.sync_deletions where deleted_at < now() - interval '90 days';
  end if;
  return old;
end;
$$;
revoke all on function private.sync_log_deletion() from public, anon, authenticated;
revoke all on function private.sync_touch_updated_at() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'parties', 'projects', 'project_entries', 'invoices', 'payment_accounts', 'payments',
    'labourers', 'labour_assignments', 'labour_wage_settlements', 'labour_wage_settlement_items',
    'materials', 'material_movements', 'expense_categories', 'walk_in_orders', 'walk_in_order_entries',
    'order_items', 'order_invoice_items', 'suppliers', 'purchase_bills', 'purchase_bill_items'
  ] loop
    if to_regclass('public.' || t) is null then
      raise notice 'Skipping %, table not found', t;
      continue;
    end if;
    execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()', t);
    execute format('create index if not exists %I on public.%I (business_id, updated_at)', t || '_sync_updated_idx', t);
    execute format('drop trigger if exists sync_touch_updated_at on public.%I', t);
    execute format('create trigger sync_touch_updated_at before insert or update on public.%I for each row execute function private.sync_touch_updated_at()', t);
    execute format('drop trigger if exists sync_log_deletion on public.%I', t);
    execute format('create trigger sync_log_deletion after delete on public.%I for each row execute function private.sync_log_deletion()', t);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
