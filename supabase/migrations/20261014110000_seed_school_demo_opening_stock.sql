-- School-project development demo data only. This is not a physical stock count.
-- Seed one immutable opening movement for each new product that has no stock history.
do $$
declare
  demo_product record;
begin
  for demo_product in
    select product.id
    from public.products as product
    where product.sku like 'GP-%' and product.is_active
      and not exists (
        select 1 from public.stock_movements as movement
        where movement.product_id = product.id
      )
  loop
    insert into public.inventory_balances (product_id, quantity)
    values (demo_product.id, 0)
    on conflict (product_id) do nothing;

    insert into public.stock_movements (
      product_id, movement_type, quantity_delta, reason, reference_type,
      actor_user_id, actor_name
    ) values (
      demo_product.id, 'opening_stock', 10,
      'DEMO ONLY: ten units for school-project checkout testing; not a physical stock count.',
      'development_demo_seed', null, 'GrandPa development demo seed'
    );

    update public.inventory_balances
    set quantity = 10, updated_at = now()
    where product_id = demo_product.id;
  end loop;
end;
$$;
