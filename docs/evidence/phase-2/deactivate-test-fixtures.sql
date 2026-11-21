update public.products
set is_active = false
where is_active
  and (sku like 'P2QA-%' or sku like 'P2CON-%');

update public.categories
set is_active = false
where is_active
  and (slug like 'phase-2-qa-%' or slug like 'phase-2-concurrency-%');

select jsonb_build_object(
  'active_test_products_remaining', (
    select count(*) from public.products
    where is_active and (sku like 'P2QA-%' or sku like 'P2CON-%')
  ),
  'active_test_categories_remaining', (
    select count(*) from public.categories
    where is_active and (slug like 'phase-2-qa-%' or slug like 'phase-2-concurrency-%')
  )
) as cleanup_result;
