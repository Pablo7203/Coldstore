begin;

create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('30000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'phase2-admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('30000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'phase2-manager@example.test', '', now(), '{}', '{}', now(), now()),
  ('30000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'phase2-stock@example.test', '', now(), '{}', '{}', now(), now()),
  ('30000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'phase2-cashier@example.test', '', now(), '{}', '{}', now(), now()),
  ('40000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'phase2-customer@example.test', '', now(), '{}',
    '{"account_type":"customer","full_name":"Phase 2 Customer","phone":"0200000003"}', now(), now());

insert into public.staff_profiles (user_id, full_name, role, is_active) values
  ('30000000-0000-0000-0000-000000000001', 'Phase 2 Test Admin', 'admin', true),
  ('30000000-0000-0000-0000-000000000002', 'Phase 2 Test Manager', 'manager', true),
  ('30000000-0000-0000-0000-000000000003', 'Phase 2 Test Stock Assistant', 'stock_assistant', true),
  ('30000000-0000-0000-0000-000000000004', 'Phase 2 Test Cashier', 'cashier', true);

insert into public.categories (id, name, slug)
values ('50000000-0000-0000-0000-000000000001', 'Phase 2 Test Frozen', 'phase-2-test-frozen');
insert into public.products (
  id, category_id, sku, barcode, name, selling_price, cost_price, reorder_level
) values (
  '60000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  'PHASE2-TEST-001', '9000000000010', 'Phase 2 Test Product', 12.35, 8.20, 2.500
);

select extensions.has_table('public', 'categories', 'categories table exists');
select extensions.has_table('public', 'products', 'products table exists');
select extensions.has_table('public', 'inventory_balances', 'inventory balances table exists');
select extensions.has_table('public', 'stock_movements', 'stock movement ledger exists');
select extensions.has_table('public', 'audit_logs', 'general audit table exists');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.categories'::regclass), 'categories enforce RLS');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.products'::regclass), 'products enforce RLS');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.inventory_balances'::regclass), 'balances enforce RLS');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.stock_movements'::regclass), 'movements enforce RLS');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.audit_logs'::regclass), 'audit logs enforce RLS');
select extensions.ok(not has_table_privilege('anon', 'public.categories', 'INSERT'), 'anonymous cannot manage categories');
select extensions.ok(not has_table_privilege('anon', 'public.products', 'INSERT'), 'anonymous cannot manage products');
select extensions.ok(not has_table_privilege('anon', 'public.inventory_balances', 'SELECT'), 'anonymous cannot read internal balances');
select extensions.ok(not has_table_privilege('authenticated', 'public.inventory_balances', 'UPDATE'), 'staff cannot directly update balances');
select extensions.ok(not has_table_privilege('authenticated', 'public.stock_movements', 'UPDATE'), 'staff cannot directly edit movement history');
select extensions.ok(not has_table_privilege('authenticated', 'public.products', 'DELETE'), 'products are deactivated rather than deleted');
select extensions.ok(not has_table_privilege('authenticated', 'public.categories', 'DELETE'), 'categories cannot be destructively deleted');

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select extensions.ok(not public.has_permission('view_inventory'), 'customer has no inventory permission');
select extensions.is((select count(*)::integer from public.products), 0, 'customer cannot read products');
select extensions.is((select count(*)::integer from public.inventory_balances), 0, 'customer cannot read inventory balances');
select extensions.throws_ok($$select * from public.search_products()$$, '42501', 'You are not authorized to view products.', 'customer search is denied');
select extensions.throws_ok(
  $$insert into public.products (category_id, name, selling_price) values ('50000000-0000-0000-0000-000000000001', 'Customer Product', 1)$$,
  '42501', 'new row violates row-level security policy for table "products"', 'customer cannot create products'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000004', true);
select extensions.ok(public.has_permission('view_inventory'), 'cashier may view products for future POS');
select extensions.is((select count(*)::integer from public.search_products('Phase 2 Test')), 1, 'cashier can use product search');
select extensions.throws_ok(
  $$insert into public.products (category_id, name, selling_price) values ('50000000-0000-0000-0000-000000000001', 'Cashier Product', 1)$$,
  '42501', 'new row violates row-level security policy for table "products"', 'cashier cannot create products'
);
select extensions.lives_ok(
  $$update public.products set name = 'Cashier edit attempt' where id = '60000000-0000-0000-0000-000000000001'$$,
  'cashier product update request is safely filtered by RLS'
);
select extensions.is((select name from public.products where id = '60000000-0000-0000-0000-000000000001'), 'Phase 2 Test Product', 'cashier cannot change product administration data');
select extensions.throws_ok(
  $$select public.record_stock_movement('60000000-0000-0000-0000-000000000001', 'adjustment_in', 1, 'not allowed')$$,
  '42501', 'You are not authorized to record this stock movement.', 'cashier cannot create manual adjustments'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000003', true);
select extensions.ok(public.has_permission('receive_stock'), 'stock assistant can receive stock');
select extensions.ok(public.has_permission('record_wastage'), 'stock assistant can record wastage');
select extensions.ok(public.has_permission('record_damage'), 'stock assistant can record damage');
select extensions.ok(public.has_permission('adjust_inventory'), 'stock assistant can make reasoned adjustments');
select extensions.ok(not public.has_permission('initialize_inventory'), 'stock assistant cannot initialize opening stock');
select extensions.throws_ok(
  $$select public.record_stock_movement('60000000-0000-0000-0000-000000000001', 'opening_stock', 10, null)$$,
  '42501', 'You are not authorized to record this stock movement.', 'stock assistant cannot record opening stock'
);
select extensions.lives_ok(
  $$select public.record_stock_movement('60000000-0000-0000-0000-000000000001', 'receipt', 10, 'Fictional test receipt')$$,
  'stock assistant can receive stock and a movement is recorded'
);
select extensions.is((select quantity from public.inventory_balances where product_id = '60000000-0000-0000-0000-000000000001'), 10.000::numeric, 'receipt updates balance');
select extensions.lives_ok($$select public.record_stock_movement('60000000-0000-0000-0000-000000000001', 'wastage', 1, 'Expired sample item')$$, 'wastage operation succeeds');
select extensions.lives_ok($$select public.record_stock_movement('60000000-0000-0000-0000-000000000001', 'damage', 0.5, 'Damaged sample pack')$$, 'damage operation succeeds');
select extensions.lives_ok($$select public.record_stock_movement('60000000-0000-0000-0000-000000000001', 'adjustment_in', 0.25, 'Count correction')$$, 'adjustment in succeeds');
select extensions.lives_ok($$select public.record_stock_movement('60000000-0000-0000-0000-000000000001', 'adjustment_out', 0.75, 'Count correction')$$, 'adjustment out succeeds');
select extensions.is((select quantity from public.inventory_balances where product_id = '60000000-0000-0000-0000-000000000001'), 8.000::numeric, 'all movement types update stock to the expected quantity');
select extensions.is(
  (select quantity from public.inventory_balances where product_id = '60000000-0000-0000-0000-000000000001'),
  (select sum(quantity_delta) from public.stock_movements where product_id = '60000000-0000-0000-0000-000000000001'),
  'current balance equals immutable movement ledger'
);
select extensions.throws_ok(
  $$select public.record_stock_movement('60000000-0000-0000-0000-000000000001', 'adjustment_out', 9, 'Overdraw test')$$,
  '23514', 'This movement would reduce stock below zero.', 'negative stock is rejected'
);
select extensions.throws_ok(
  $$select public.record_stock_movement('60000000-0000-0000-0000-000000000001', 'adjustment_out', 1, null)$$,
  '22023', 'A reason is required for this stock movement.', 'adjustment requires a reason'
);
select extensions.throws_ok(
  $$select public.record_stock_movement('60000000-0000-0000-0000-000000000001', 'receipt', 1.0001, null)$$,
  '22023', 'Quantity must be greater than zero and use at most three decimal places.', 'quantities above three decimals are rejected'
);
select extensions.is((select count(*)::integer from public.stock_movements where product_id = '60000000-0000-0000-0000-000000000001'), 5, 'rejected movements leave no partial ledger rows');

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
select extensions.ok(public.has_permission('manage_products'), 'manager can manage products');
select extensions.lives_ok(
  $$insert into public.categories (name, slug) values ('Manager Category', 'manager-category')$$,
  'manager can create categories'
);
select extensions.throws_ok(
  $$insert into public.categories (name, slug) values ('Phase 2 Test Frozen', 'another-frozen-slug')$$,
  '23505', 'duplicate key value violates unique constraint "categories_name_lower_unique"', 'category names are unique case-insensitively'
);
select extensions.throws_ok(
  $$insert into public.categories (name, slug) values ('Another Category', 'phase-2-test-frozen')$$,
  '23505', 'duplicate key value violates unique constraint "categories_slug_unique"', 'category slugs are unique'
);
select extensions.throws_ok(
  $$insert into public.products (category_id, sku, name, selling_price) values ('50000000-0000-0000-0000-000000000001', 'phase2-test-001', 'Duplicate SKU', 1)$$,
  '23505', 'duplicate key value violates unique constraint "products_sku_lower_unique"', 'SKU uniqueness ignores case'
);
select extensions.throws_ok(
  $$insert into public.products (category_id, sku, barcode, name, selling_price) values ('50000000-0000-0000-0000-000000000001', 'PHASE2-DUP-BARCODE', '9000000000010', 'Duplicate barcode', 1)$$,
  '23505', 'duplicate key value violates unique constraint "products_barcode_lower_unique"', 'barcode uniqueness is enforced'
);
select extensions.throws_ok(
  $$insert into public.products (category_id, name, selling_price) values ('50000000-0000-0000-0000-000000000001', 'Over-precision price', 1.001)$$,
  '23514', 'new row for relation "products" violates check constraint "products_selling_price_check"', 'database rejects prices with more than two decimal places'
);
select extensions.throws_ok(
  $$insert into public.products (category_id, name, selling_price, reorder_level) values ('50000000-0000-0000-0000-000000000001', 'Over-precision quantity', 1, 1.0001)$$,
  '23514', 'new row for relation "products" violates check constraint "products_reorder_level_check"', 'database rejects reorder levels with more than three decimal places'
);
select extensions.lives_ok(
  $$update public.products set selling_price = 13.25 where id = '60000000-0000-0000-0000-000000000001'$$,
  'manager can update product prices'
);
select extensions.lives_ok(
  $$select public.record_stock_movement('60000000-0000-0000-0000-000000000001', 'receipt', 1.125, 'Manager receipt')$$,
  'manager can record stock receipt'
);
select extensions.throws_ok(
  $$select public.record_stock_movement('60000000-0000-0000-0000-000000000001', 'opening_stock', 2, 'Second opening')$$,
  '23505', 'Opening stock can only be recorded before any other stock movement; use an adjustment to correct stock.', 'opening stock cannot overwrite movement history'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select extensions.ok(public.has_permission('initialize_inventory'), 'admin has opening-stock permission');
select extensions.lives_ok(
  $$select public.record_stock_movement('60000000-0000-0000-0000-000000000001', 'receipt', 0.5, 'Admin receipt')$$,
  'admin can perform an approved inventory operation'
);
select extensions.is((select quantity from public.inventory_balances where product_id = '60000000-0000-0000-0000-000000000001'), 9.625::numeric, 'manager and admin movements produce the expected current balance');
select extensions.is(
  (select quantity from public.inventory_balances where product_id = '60000000-0000-0000-0000-000000000001'),
  (select sum(quantity_delta) from public.stock_movements where product_id = '60000000-0000-0000-0000-000000000001'),
  'ledger and balance remain equal after all authorized roles operate'
);
select extensions.is((select count(*)::integer from public.audit_logs where entity_type = 'product' and entity_id = '60000000-0000-0000-0000-000000000001'), 3, 'admin can read catalog audit events');
select extensions.is((select count(*)::integer from public.audit_logs where action = 'product.selling_price_changed' and entity_id = '60000000-0000-0000-0000-000000000001'), 1, 'price changes retain old and new price audit history');
select extensions.is((select count(*)::integer from public.audit_logs where entity_type = 'stock_movement' and details ->> 'product_id' = '60000000-0000-0000-0000-000000000001'), 7, 'each successful stock movement is audited');

reset role;
select extensions.lives_ok(
  $$update public.stock_movements set actor_user_id = null where id = (select id from public.stock_movements where product_id = '60000000-0000-0000-0000-000000000001' order by occurred_at limit 1)$$,
  'Auth user deletion may redact only the actor foreign key'
);
select extensions.is(
  (select actor_name from public.stock_movements where product_id = '60000000-0000-0000-0000-000000000001' order by occurred_at limit 1),
  'Phase 2 Test Stock Assistant',
  'movement actor-name snapshot survives actor foreign-key redaction'
);
select extensions.throws_ok(
  $$update public.stock_movements set reason = 'Edited history' where product_id = '60000000-0000-0000-0000-000000000001'$$,
  '42501', 'Stock movements are immutable; record a compensating movement.', 'stock movement history cannot be edited even by database writers'
);

select * from extensions.finish();
rollback;
