-- READ-ONLY health check. Changes nothing. Safe to run any time in the Supabase SQL Editor.
-- Every row should show status = OK. Anything else is listed with details.

with expected_triggers(table_name, trigger_name) as (
  values
    ('parties','assign_party_number'),
    ('projects','assign_project_number'),
    ('materials','assign_material_number'),
    ('suppliers','assign_supplier_number'),
    ('labourers','assign_labour_number'),
    ('invoices','invoices_assign_project_number')
),
trigger_check as (
  select 'Number trigger' as check_name,
         e.table_name || '.' || e.trigger_name as item,
         case when t.tgname is null then 'MISSING' else 'OK' end as status,
         case when t.tgname is null then 'New records on this table will keep whatever number the app sends' else '' end as details
  from expected_triggers e
  left join pg_trigger t
    on t.tgname = e.trigger_name
   and t.tgrelid = to_regclass('public.' || e.table_name)
   and not t.tgisinternal
),
expected_unique(table_name, column_name) as (
  values
    ('parties','party_number'),
    ('projects','project_number'),
    ('materials','sku'),
    ('suppliers','supplier_number'),
    ('labourers','labour_number'),
    ('invoices','invoice_number'),
    ('walk_in_orders','order_number'),
    ('payments','payment_number')
),
unique_check as (
  select 'Unique number' as check_name,
         e.table_name || '.' || e.column_name as item,
         case when exists (
           select 1
           from pg_index i
           join pg_attribute a1 on a1.attrelid = i.indrelid and a1.attnum = i.indkey[0]
           join pg_attribute a2 on a2.attrelid = i.indrelid and a2.attnum = i.indkey[1]
           where i.indrelid = to_regclass('public.' || e.table_name)
             and i.indisunique and i.indnatts = 2
             and a1.attname = 'business_id' and a2.attname = e.column_name
         ) then 'OK' else 'NOT UNIQUE' end as status,
         '' as details
  from expected_unique e
),
duplicates as (
  select 'Duplicate numbers' as check_name, 'materials.sku' as item,
         case when count(*) = 0 then 'OK' else 'DUPLICATES' end as status,
         coalesce(string_agg(sku || ' x' || n, ', '), '') as details
  from (select sku, count(*) n from public.materials where sku is not null group by business_id, sku having count(*) > 1) d
  union all
  select 'Duplicate numbers', 'parties.party_number',
         case when count(*) = 0 then 'OK' else 'DUPLICATES' end,
         coalesce(string_agg(party_number || ' x' || n, ', '), '')
  from (select party_number, count(*) n from public.parties group by business_id, party_number having count(*) > 1) d
  union all
  select 'Duplicate numbers', 'projects.project_number',
         case when count(*) = 0 then 'OK' else 'DUPLICATES' end,
         coalesce(string_agg(project_number || ' x' || n, ', '), '')
  from (select project_number, count(*) n from public.projects group by business_id, project_number having count(*) > 1) d
),
sizes as (
  select 'Table size' as check_name, relname as item,
         case when n_live_tup >= 1000 then 'OVER 1000 ROWS' else 'OK' end as status,
         n_live_tup::text || ' rows (approx.)' as details
  from pg_stat_user_tables
  where schemaname = 'public'
)
select * from (
  select * from trigger_check
  union all select * from unique_check
  union all select * from duplicates
  union all select * from sizes
) results
order by (status = 'OK'), check_name, item;
