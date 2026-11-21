-- Keep Phase 6/7 test transactions and inventory history, but remove their
-- synthetic products from the active development catalogue.
update public.products
set is_active = false, updated_at = now()
where sku like 'DEV-%'
   or sku like 'P6B-%'
   or sku like 'P6BC-%'
   or sku like 'P7%';

update public.categories as category
set is_active = false, updated_at = now()
where category.is_active
  and not exists (
    select 1 from public.products as product
    where product.category_id = category.id and product.is_active
  );
