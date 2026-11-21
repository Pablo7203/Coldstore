begin;
create extension if not exists pgtap with schema extensions;
create temporary table phase3_test_results (sequence_id bigint generated always as identity, tap text not null);
 grant insert on phase3_test_results to authenticated;
select extensions.no_plan();

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('71000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'p3-admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('71000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'p3-manager@example.test', '', now(), '{}', '{}', now(), now()),
  ('71000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'p3-cashier@example.test', '', now(), '{}', '{}', now(), now()),
  ('71000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'p3-stock@example.test', '', now(), '{}', '{}', now(), now()),
  ('72000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'p3-customer@example.test', '', now(), '{}',
    '{"account_type":"customer","full_name":"Phase 3 Customer","phone":"0241234567"}', now(), now());

insert into public.staff_profiles(user_id, full_name, role, is_active) values
  ('71000000-0000-0000-0000-000000000001', 'Phase 3 Admin', 'admin', true),
  ('71000000-0000-0000-0000-000000000002', 'Phase 3 Manager', 'manager', true),
  ('71000000-0000-0000-0000-000000000003', 'Phase 3 Cashier', 'cashier', true),
  ('71000000-0000-0000-0000-000000000004', 'Phase 3 Stock Assistant', 'stock_assistant', true);

insert into public.categories(id, name, slug)
values ('73000000-0000-0000-0000-000000000001', 'Phase 3 Frozen', 'phase-3-frozen');
insert into public.products(id, category_id, sku, barcode, name, selling_price, reorder_level)
values
  ('74000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', 'P3-A', '9300000000001', 'Phase 3 Sample A', 10.25, 1),
  ('74000000-0000-0000-0000-000000000002', '73000000-0000-0000-0000-000000000001', 'P3-B', '9300000000002', 'Phase 3 Sample B', 3.50, 1);

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select public.record_stock_movement('74000000-0000-0000-0000-000000000001', 'opening_stock', 5, null, null, null, '75000000-0000-0000-0000-000000000001');
select public.record_stock_movement('74000000-0000-0000-0000-000000000002', 'opening_stock', 10, null, null, null, '75000000-0000-0000-0000-000000000002');

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000003', true);
insert into phase3_test_results(tap) select extensions.is((select count(*)::integer from public.search_products('Phase 3 Sample')), 2, 'POS product search matches product names');
insert into phase3_test_results(tap) select extensions.is((select count(*)::integer from public.search_products('P3-A')), 1, 'POS product search matches SKU');
insert into phase3_test_results(tap) select extensions.is((select count(*)::integer from public.search_products('9300000000001')), 1, 'POS product search matches barcode');
insert into phase3_test_results(tap)
select extensions.ok(public.has_permission('complete_sale'), 'Cashier has the centralized complete_sale permission');
insert into phase3_test_results(tap)
select extensions.ok(public.has_permission('view_sales_history'), 'Cashier can view permitted sales history');
insert into phase3_test_results(tap)
select extensions.ok(not public.has_permission('view_all_sales_history'), 'Cashier is limited to own sale history');
insert into phase3_test_results(tap)
select extensions.ok(public.has_permission('create_customer'), 'Cashier can create walk-in customers');
insert into phase3_test_results(tap)
select extensions.lives_ok(
  $$insert into public.customers(full_name, phone) values ('Phase 3 Walk-in', '0201234567')$$,
  'Cashier can create a customer without an Auth account'
);
insert into phase3_test_results(tap)
select extensions.is(
  (select phone from public.customers where full_name = 'Phase 3 Walk-in'),
  '+233201234567', 'Walk-in customer phone is normalized canonically'
);
insert into phase3_test_results(tap)
select extensions.is(
  (select auth_user_id::text from public.customers where full_name = 'Phase 3 Walk-in'),
  null, 'Walk-in customer does not require or receive an Auth account'
);
insert into phase3_test_results(tap)
select extensions.ok(
  (select count(*) > 0 from public.search_customers('+23324123', 20)),
  'Phone prefix search finds canonical Ghana customer numbers'
);

select * from public.complete_pos_sale(
  '76000000-0000-0000-0000-000000000001',
  '[{"product_id":"74000000-0000-0000-0000-000000000001","quantity":"1.500","unit_price":"0.01"},{"product_id":"74000000-0000-0000-0000-000000000002","quantity":"2"}]'::jsonb,
  'cash', (select id from public.customers where auth_user_id = '72000000-0000-0000-0000-000000000001')
);
insert into phase3_test_results(tap)
select extensions.is((select count(*)::integer from public.sales where client_operation_id = '76000000-0000-0000-0000-000000000001'), 1, 'Cash sale created once');
insert into phase3_test_results(tap)
select extensions.is((select subtotal from public.sales where client_operation_id = '76000000-0000-0000-0000-000000000001'), 22.38::numeric, 'Database recomputes total from product prices and rounded line totals');
insert into phase3_test_results(tap)
select extensions.is((select unit_price from public.sale_items where sale_id = (select id from public.sales where client_operation_id = '76000000-0000-0000-0000-000000000001') and product_id = '74000000-0000-0000-0000-000000000001'), 10.25::numeric, 'Client supplied price is ignored; unit price is snapshotted from the product');
insert into phase3_test_results(tap)
select extensions.is((select line_total from public.sale_items where sale_id = (select id from public.sales where client_operation_id = '76000000-0000-0000-0000-000000000001') and product_id = '74000000-0000-0000-0000-000000000001'), 15.38::numeric, 'Decimal quantity line total is rounded to GHS cents');
insert into phase3_test_results(tap)
select extensions.is((select count(*)::integer from public.sale_items where sale_id = (select id from public.sales where client_operation_id = '76000000-0000-0000-0000-000000000001')), 2, 'Multi-item sale has both immutable line snapshots');
insert into phase3_test_results(tap)
select extensions.is((select count(*)::integer from public.payments where sale_id = (select id from public.sales where client_operation_id = '76000000-0000-0000-0000-000000000001') and method = 'cash' and amount = 22.38), 1, 'Cash payment matches completed sale total');
insert into phase3_test_results(tap)
select extensions.is((select quantity from public.inventory_balances where product_id = '74000000-0000-0000-0000-000000000001'), 3.500::numeric, 'Sale atomically deducts decimal stock');
insert into phase3_test_results(tap)
select extensions.ok((select receipt_number ~ '^GP-[0-9]{6}-[0-9A-F]{16}' from public.sales where client_operation_id = '76000000-0000-0000-0000-000000000001'), 'Receipt number has the documented readable unique format');

insert into phase3_test_results(tap)
select extensions.is(
  (select sale_id::text from public.complete_pos_sale('76000000-0000-0000-0000-000000000001', '[{"product_id":"74000000-0000-0000-0000-000000000001","quantity":"1.500"},{"product_id":"74000000-0000-0000-0000-000000000002","quantity":"2"}]'::jsonb, 'cash')),
  (select id::text from public.sales where client_operation_id = '76000000-0000-0000-0000-000000000001'), 'Same operation ID returns the original sale after a retry'
);
insert into phase3_test_results(tap)
select extensions.is((select count(*)::integer from public.sales where client_operation_id = '76000000-0000-0000-0000-000000000001'), 1, 'Idempotent retry does not create a duplicate sale');

insert into phase3_test_results(tap)
select extensions.throws_ok(
  $$select * from public.complete_pos_sale('76000000-0000-0000-0000-000000000002', '[{"product_id":"74000000-0000-0000-0000-000000000001","quantity":"4"}]'::jsonb, 'cash')$$,
  '23514', 'Insufficient stock for Phase 3 Sample A.', 'Insufficient-stock sale rejects the entire sale'
);
insert into phase3_test_results(tap)
select extensions.is((select count(*)::integer from public.sales where client_operation_id = '76000000-0000-0000-0000-000000000002'), 0, 'Insufficient-stock sale has no sale row');
insert into phase3_test_results(tap)
select extensions.is((select quantity from public.inventory_balances where product_id = '74000000-0000-0000-0000-000000000001'), 3.500::numeric, 'Insufficient-stock rollback leaves balance unchanged');
insert into phase3_test_results(tap)
select extensions.throws_ok(
  $$select * from public.complete_pos_sale('76000000-0000-0000-0000-000000000003', '[{"product_id":"74000000-0000-0000-0000-000000000001","quantity":"0.0001"}]'::jsonb, 'cash')$$,
  '22023', 'Each quantity must be positive and use at most three decimal places.', 'Quantity beyond three decimals is rejected'
);
insert into phase3_test_results(tap)
select extensions.throws_ok(
  $$select * from public.complete_pos_sale('76000000-0000-0000-0000-000000000004', '[{"product_id":"74000000-0000-0000-0000-000000000001","quantity":"1"}]'::jsonb, 'credit')$$,
  '22023', 'Choose cash or externally confirmed mobile money.', 'Reserved credit payment method is rejected'
);

select * from public.complete_pos_sale(
  '76000000-0000-0000-0000-000000000005',
  '[{"product_id":"74000000-0000-0000-0000-000000000002","quantity":"1"}]'::jsonb,
  'external_momo', null, 'P3-MOMO-REFERENCE'
);
insert into phase3_test_results(tap)
select extensions.is((select count(*)::integer from public.payments where client_operation_id = '76000000-0000-0000-0000-000000000005' and method = 'external_momo' and provider_reference = 'P3-MOMO-REFERENCE' and status = 'recorded'), 1, 'External MoMo is recorded without claiming provider verification');

insert into phase3_test_results(tap)
select extensions.throws_ok(
  $$update public.sales set total = 1 where client_operation_id = '76000000-0000-0000-0000-000000000001'$$,
  '42501', 'permission denied for table sales', 'Cashier cannot mutate a completed sale'
);
insert into phase3_test_results(tap)
select extensions.throws_ok(
  $$insert into public.payments(sale_id, method, amount, recorded_by) values ((select id from public.sales where client_operation_id = '76000000-0000-0000-0000-000000000001'), 'cash', 1, auth.uid())$$,
  '42501', 'permission denied for table payments', 'Cashier cannot directly create a payment'
);

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000004', true);
insert into phase3_test_results(tap)
select extensions.ok(not public.has_permission('complete_sale'), 'Stock assistant has no complete_sale permission');
insert into phase3_test_results(tap)
select extensions.throws_ok(
  $$select * from public.complete_pos_sale('76000000-0000-0000-0000-000000000006', '[{"product_id":"74000000-0000-0000-0000-000000000002","quantity":"1"}]'::jsonb, 'cash')$$,
  '42501', 'You are not authorized to complete sales.', 'Stock assistant cannot complete a sale'
);

select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000001', true);
insert into phase3_test_results(tap)
select extensions.ok(not public.has_permission('view_sales_history'), 'Customer has no sales-history permission');
insert into phase3_test_results(tap)
select extensions.is((select count(*)::integer from public.sales), 0, 'Customer cannot read internal POS sales');
insert into phase3_test_results(tap)
select extensions.throws_ok(
  $$select * from public.complete_pos_sale('76000000-0000-0000-0000-000000000007', '[{"product_id":"74000000-0000-0000-0000-000000000002","quantity":"1"}]'::jsonb, 'cash')$$,
  '42501', 'You are not authorized to complete sales.', 'Customer cannot create a POS sale'
);
insert into phase3_test_results(tap)
select extensions.throws_ok(
  $$update public.customers set status = 'inactive' where auth_user_id = auth.uid()$$,
  '42501', 'Customers may update only their own name and phone.', 'Customer cannot deactivate own customer profile'
);

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000002', true);
insert into phase3_test_results(tap)
select extensions.ok((select count(*) >= 2 from public.sales), 'Manager can view all permitted POS sales');
insert into phase3_test_results(tap)
select extensions.is(
  (select count(*)::integer from public.stock_movements where movement_type = 'sale'),
  (select count(*)::integer from public.sale_items), 'Every sale item has exactly one sale stock movement'
);

reset role;
insert into phase3_test_results(tap)
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.sales'::regclass), 'Sales RLS is enabled');
insert into phase3_test_results(tap)
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.sale_items'::regclass), 'Sale item RLS is enabled');
insert into phase3_test_results(tap)
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.payments'::regclass), 'Payment RLS is enabled');
insert into phase3_test_results(tap)
select extensions.ok(not has_table_privilege('anon', 'public.sales', 'SELECT'), 'Anonymous cannot read sales');
insert into phase3_test_results(tap)
select extensions.ok(not has_table_privilege('authenticated', 'public.sales', 'INSERT'), 'Authenticated users cannot directly create sales');
insert into phase3_test_results(tap)
select extensions.ok(not has_table_privilege('authenticated', 'public.sale_items', 'UPDATE'), 'Authenticated users cannot mutate sale items');
insert into phase3_test_results(tap)
select extensions.ok(not has_table_privilege('authenticated', 'public.payments', 'INSERT'), 'Authenticated users cannot directly create payments');
reset role;
insert into phase3_test_results(tap) select extensions.is((select count(*)::integer from public.stock_movements where reference_type = 'sale' and reference_id = (select id from public.sales where client_operation_id = '76000000-0000-0000-0000-000000000001') and movement_type = 'sale' and quantity_delta = -1.500), 1, 'Sale creates a linked negative stock movement');
insert into phase3_test_results(tap) select extensions.is((select quantity from public.inventory_balances where product_id = '74000000-0000-0000-0000-000000000001'), (select sum(quantity_delta) from public.stock_movements where product_id = '74000000-0000-0000-0000-000000000001'), 'Balance remains reconciled to movement ledger');
insert into phase3_test_results(tap) select extensions.is((select count(*)::integer from public.audit_logs where entity_type = 'sale' and action = 'sale.completed' and entity_id = (select id from public.sales where client_operation_id = '76000000-0000-0000-0000-000000000001')), 1, 'Sale completion is audited');
insert into phase3_test_results(tap) select extensions.is((select count(*)::integer from public.audit_logs where entity_type = 'payment' and action = 'payment.recorded' and details->>'sale_id' = (select id::text from public.sales where client_operation_id = '76000000-0000-0000-0000-000000000001')), 1, 'Payment recording is audited');
insert into phase3_test_results(tap) select * from extensions.finish();
select string_agg(tap, E'\n' order by sequence_id) as tap_results from phase3_test_results;
rollback;
