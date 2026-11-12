-- Make material codes (MAT-0001 ...) unique per business, like party, project,
-- supplier, labour, invoice, order and payment numbers already are.
-- Safe: if duplicate codes already exist, this stops with a list of them and changes nothing.

do $$
declare
  v_duplicates text;
begin
  select string_agg(sku || ' (' || n || ' materials)', ', ')
  into v_duplicates
  from (
    select sku, count(*) as n
    from public.materials
    where sku is not null
    group by business_id, sku
    having count(*) > 1
  ) d;

  if v_duplicates is not null then
    raise exception 'Duplicate material codes found: %. Rename these in the app first, then run this file again.', v_duplicates;
  end if;
end;
$$;

create unique index if not exists materials_business_sku_key
  on public.materials (business_id, sku)
  where sku is not null;

notify pgrst, 'reload schema';
