select jsonb_build_object(
  'temporary_test_accounts_remaining', (
    select count(*)
    from auth.users
    where email ~ '^phase2-(concurrency-|((admin|manager|stock_assistant|cashier|customer)-)).*@example\.test$'
  ),
  'active_phase2_test_products_remaining', (
    select count(*)
    from public.products
    where is_active
      and (sku like 'P2QA-%' or sku like 'P2CON-%')
  ),
  'active_phase2_test_categories_remaining', (
    select count(*)
    from public.categories
    where is_active
      and (slug like 'phase-2-qa-%' or slug like 'phase-2-concurrency-%')
  )
) as sanitized_fixture_cleanup;
