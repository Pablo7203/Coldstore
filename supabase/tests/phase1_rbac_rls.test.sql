begin;

create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'cashier@example.test', '', now(), '{}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'inactive@example.test', '', now(), '{}', '{}', now(), now()),
  ('20000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'customer-a@example.test', '', now(), '{}', '{"account_type":"customer","full_name":"Customer A","phone":"0200000001"}', now(), now()),
  ('20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'customer-b@example.test', '', now(), '{}', '{"account_type":"customer","full_name":"Customer B","phone":"0200000002"}', now(), now());

insert into public.staff_profiles (user_id, full_name, role, is_active) values
  ('10000000-0000-0000-0000-000000000001', 'Test Admin', 'admin', true),
  ('10000000-0000-0000-0000-000000000002', 'Test Cashier', 'cashier', true),
  ('10000000-0000-0000-0000-000000000003', 'Inactive Staff', 'stock_assistant', false);

select has_table('public', 'staff_profiles', 'staff profile table exists');
select has_table('public', 'customers', 'customer table exists');
select has_table('public', 'staff_profile_audit', 'staff role audit table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.staff_profiles'::regclass), 'staff profiles enforce RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.customers'::regclass), 'customers enforce RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.staff_profile_audit'::regclass), 'staff role audit enforces RLS');
select isnt(has_column_privilege('authenticated', 'public.staff_profiles', 'role', 'UPDATE'), true, 'authenticated users cannot update staff roles');
select isnt(has_column_privilege('authenticated', 'public.customers', 'auth_user_id', 'UPDATE'), true, 'authenticated users cannot relink customer accounts');
select isnt(has_table_privilege('authenticated', 'public.staff_profiles', 'INSERT'), true, 'authenticated users cannot insert staff profiles directly');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is(public.current_staff_role()::text, 'cashier', 'cashier role is resolved from the server-owned profile');
select ok(public.has_permission('complete_sale'), 'cashier can complete sales');
select ok(not public.has_permission('manage_credit'), 'cashier cannot manage credit');
select is((select count(*)::integer from public.staff_profiles), 1, 'cashier can read only their own staff profile');
select is((select count(*)::integer from public.customers), 2, 'cashier can read customers for service');
select ok(not public.has_permission('manage_staff'), 'cashier cannot manage staff');
select is((select count(*)::integer from public.staff_profile_audit), 0, 'cashier cannot read staff role audit history');
select throws_ok(
  $$select public.assign_staff_profile('10000000-0000-0000-0000-000000000002', 'Escalated Cashier', null, 'admin', true)$$,
  '42501',
  'Only an active administrator may assign staff profiles.',
  'cashier cannot assign staff roles'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.assign_staff_profile('10000000-0000-0000-0000-000000000002', 'Test Cashier', null, 'manager', true)$$,
  'administrator can assign a staff role'
);
select is((select role::text from public.staff_profiles where user_id = '10000000-0000-0000-0000-000000000002'), 'manager', 'role assignment updates the staff profile');
select is((select event_type from public.staff_profile_audit where staff_user_id = '10000000-0000-0000-0000-000000000002' order by id desc limit 1), 'role_changed', 'role changes create an audit event');
select is((select actor_user_id::text from public.staff_profile_audit where staff_user_id = '10000000-0000-0000-0000-000000000002' order by id desc limit 1), '10000000-0000-0000-0000-000000000001', 'audit event records the acting administrator');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select ok(public.current_staff_role() is null, 'inactive staff have no active role');
select ok(not public.is_active_staff(), 'inactive staff fail the active staff check');
select ok(not public.has_permission('receive_stock'), 'inactive staff have no permissions');

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select ok(public.current_staff_role() is null, 'customers are not represented as staff roles');
select is((select count(*)::integer from public.staff_profiles), 0, 'customer cannot read staff profiles');
select is((select count(*)::integer from public.customers), 1, 'customer can read only their linked customer profile');
select is((select count(*)::integer from public.customers where auth_user_id = '20000000-0000-0000-0000-000000000002'), 0, 'customer cannot read another customer profile');

reset role;
select * from finish();
rollback;
