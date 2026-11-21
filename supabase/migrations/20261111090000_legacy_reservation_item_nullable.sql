-- Current reservations reference orders and products directly. Preserve values in
-- the legacy order_item_id column while allowing the current checkout function to
-- insert reservations without that retired relationship.
-- This compatibility change is intentionally forward-only.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inventory_reservations'
      and column_name = 'order_item_id'
      and is_nullable = 'NO'
  ) then
    execute 'alter table public.inventory_reservations alter column order_item_id drop not null';
  end if;
end;
$$;
