begin;
create extension if not exists pgtap with schema extensions;
create temporary table phase4_test_results (sequence_id bigint generated always as identity, tap text not null);
grant insert on phase4_test_results to authenticated;
select extensions.no_plan();

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
 ('81000000-0000-0000-0000-000000000001','authenticated','authenticated','p4-admin@example.test','',now(),'{}','{}',now(),now()),
 ('81000000-0000-0000-0000-000000000002','authenticated','authenticated','p4-manager@example.test','',now(),'{}','{}',now(),now()),
 ('81000000-0000-0000-0000-000000000003','authenticated','authenticated','p4-cashier@example.test','',now(),'{}','{}',now(),now()),
 ('81000000-0000-0000-0000-000000000004','authenticated','authenticated','p4-stock@example.test','',now(),'{}','{}',now(),now()),
 ('82000000-0000-0000-0000-000000000001','authenticated','authenticated','p4-customer@example.test','',now(),'{}','{}',now(),now());
insert into public.staff_profiles(user_id,full_name,role,is_active) values
 ('81000000-0000-0000-0000-000000000001','P4 Admin','admin',true),
 ('81000000-0000-0000-0000-000000000002','P4 Manager','manager',true),
 ('81000000-0000-0000-0000-000000000003','P4 Cashier','cashier',true),
 ('81000000-0000-0000-0000-000000000004','P4 Stock Assistant','stock_assistant',true);
insert into public.customers(id,auth_user_id,full_name,phone) values
 ('82000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001','P4 Customer','0241234567');
insert into public.categories(id,name,slug) values ('83000000-0000-0000-0000-000000000001','P4 Frozen','phase-4-frozen');
insert into public.products(id,category_id,sku,name,selling_price,reorder_level) values
 ('84000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000001','P4-CREDIT','P4 Credit Sample',15,1),
 ('84000000-0000-0000-0000-000000000002','83000000-0000-0000-0000-000000000001','P4-LOW','P4 Insufficient Stock Sample',15,1);
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select public.record_stock_movement('84000000-0000-0000-0000-000000000001','opening_stock',10,null,null,null,'85000000-0000-0000-0000-000000000001');
select public.manage_credit_account('82000000-0000-0000-0000-000000000001',100,'active');
insert into phase4_test_results(tap) select extensions.is(public.available_credit(100,80,'active'),20::numeric,'Active available credit uses exact NUMERIC arithmetic');
insert into phase4_test_results(tap) select extensions.is(public.available_credit(100,20,'suspended'),0::numeric,'Suspended account has no available credit');
insert into phase4_test_results(tap) select extensions.ok(public.has_permission('manage_credit'),'Manager has credit management permission');
insert into phase4_test_results(tap) select extensions.ok(public.has_permission('record_credit_repayment'),'Manager can record repayment');

select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000003',true);
insert into phase4_test_results(tap) select extensions.ok(public.has_permission('record_credit_repayment'),'Cashier has repayment permission');
insert into phase4_test_results(tap) select extensions.ok(not public.has_permission('manage_credit'),'Cashier cannot manage credit limits/status');
insert into phase4_test_results(tap) select extensions.throws_ok(
 $$select * from public.manage_credit_account('82000000-0000-0000-0000-000000000001',500,'active')$$,
 '42501','You are not authorized to manage credit accounts.','Cashier cannot change limit or status');
insert into phase4_test_results(tap) select extensions.throws_ok(
 $$update public.credit_accounts set credit_limit=500 where customer_id='82000000-0000-0000-0000-000000000001'$$,
 '42501','permission denied for table credit_accounts','Cashier cannot directly update account');

select * from public.complete_pos_sale('86000000-0000-0000-0000-000000000001','[{"product_id":"84000000-0000-0000-0000-000000000001","quantity":"1"}]'::jsonb,'credit','82000000-0000-0000-0000-000000000001');
insert into phase4_test_results(tap) select extensions.is((select current_balance from public.credit_accounts where customer_id='82000000-0000-0000-0000-000000000001'),15::numeric,'Credit sale increases outstanding balance');
insert into phase4_test_results(tap) select extensions.is((select available_credit from public.get_credit_account('82000000-0000-0000-0000-000000000001')),85::numeric,'Credit sale decreases available credit');
insert into phase4_test_results(tap) select extensions.ok((select method='credit' and status='outstanding' from public.payments where sale_id=(select id from public.sales where client_operation_id='86000000-0000-0000-0000-000000000001')),'Credit tender records debt without marking cash received');
insert into phase4_test_results(tap) select extensions.ok((select available_after=85 and balance_after=15 from public.credit_transactions where client_operation_id='86000000-0000-0000-0000-000000000001'),'Credit ledger stores exact balance and availability snapshots');
insert into phase4_test_results(tap) select extensions.is((select quantity from public.inventory_balances where product_id='84000000-0000-0000-0000-000000000001'),9::numeric,'Credit sale deducts stock atomically');
insert into phase4_test_results(tap) select extensions.throws_ok(
 $$select * from public.complete_pos_sale('86000000-0000-0000-0000-000000000002','[{"product_id":"84000000-0000-0000-0000-000000000001","quantity":"6"}]'::jsonb,'credit','82000000-0000-0000-0000-000000000001')$$,
 '23514','Insufficient available customer credit.','Insufficient credit rejects sale');
insert into phase4_test_results(tap) select extensions.is((select count(*)::integer from public.sales where client_operation_id='86000000-0000-0000-0000-000000000002'),0,'Insufficient credit rolls back sale');
insert into phase4_test_results(tap) select extensions.is((select quantity from public.inventory_balances where product_id='84000000-0000-0000-0000-000000000001'),9::numeric,'Insufficient credit leaves stock unchanged');
insert into phase4_test_results(tap) select extensions.throws_ok(
 $$select * from public.complete_pos_sale('86000000-0000-0000-0000-000000000003','[{"product_id":"84000000-0000-0000-0000-000000000002","quantity":"1"}]'::jsonb,'credit','82000000-0000-0000-0000-000000000001')$$,
 '23514','Insufficient stock for P4 Insufficient Stock Sample.','Insufficient stock rejects credit sale');
insert into phase4_test_results(tap) select extensions.is((select current_balance from public.credit_accounts where customer_id='82000000-0000-0000-0000-000000000001'),15::numeric,'Insufficient stock leaves credit balance unchanged');

select * from public.record_credit_repayment('82000000-0000-0000-0000-000000000001',5,'cash','87000000-0000-0000-0000-000000000001');
insert into phase4_test_results(tap) select extensions.is((select current_balance from public.credit_accounts where customer_id='82000000-0000-0000-0000-000000000001'),10::numeric,'Repayment reduces balance');
insert into phase4_test_results(tap) select extensions.ok((select transaction_type='repayment' and amount=5 and balance_after=10 from public.credit_transactions where client_operation_id='87000000-0000-0000-0000-000000000001'),'Repayment is recorded in immutable ledger');
insert into phase4_test_results(tap) select extensions.ok((select customer_id='82000000-0000-0000-0000-000000000001' and method='cash' and status='recorded' from public.payments where client_operation_id='87000000-0000-0000-0000-000000000001'),'Repayment creates cash payment record');
insert into phase4_test_results(tap) select extensions.is((select payment_id::text from public.record_credit_repayment('82000000-0000-0000-0000-000000000001',5,'cash','87000000-0000-0000-0000-000000000001')),(select id::text from public.payments where client_operation_id='87000000-0000-0000-0000-000000000001'),'Repayment retry is idempotent');
insert into phase4_test_results(tap) select extensions.throws_ok(
 $$select * from public.record_credit_repayment('82000000-0000-0000-0000-000000000001',6,'cash','87000000-0000-0000-0000-000000000002')$$,
 '23514','Repayment exceeds the outstanding balance.','Overpayment is rejected');
insert into phase4_test_results(tap) select extensions.throws_ok(
 $$select * from public.record_credit_repayment('82000000-0000-0000-0000-000000000001',-1,'cash','87000000-0000-0000-0000-000000000003')$$,
 '22023','Enter a positive repayment amount with at most two decimal places.','Negative repayment is rejected');
select public.manage_credit_account('82000000-0000-0000-0000-000000000001',5,'active');
insert into phase4_test_results(tap) select extensions.is((select current_balance from public.credit_accounts where customer_id='82000000-0000-0000-0000-000000000001'),10::numeric,'Lowering limit does not erase debt');
insert into phase4_test_results(tap) select extensions.is((select available_credit from public.get_credit_account('82000000-0000-0000-0000-000000000001')),0::numeric,'Balance above limit yields zero availability');
select public.manage_credit_account('82000000-0000-0000-0000-000000000001',100,'suspended');
insert into phase4_test_results(tap) select extensions.throws_ok(
 $$select * from public.complete_pos_sale('86000000-0000-0000-0000-000000000004','[{"product_id":"84000000-0000-0000-0000-000000000001","quantity":"1"}]'::jsonb,'credit','82000000-0000-0000-0000-000000000001')$$,
 '23514','Customer credit account is unavailable.','Suspended account cannot receive new credit');
insert into phase4_test_results(tap) select extensions.is((select current_balance from public.credit_accounts where customer_id='82000000-0000-0000-0000-000000000001'),10::numeric,'Suspended credit sale leaves balance unchanged');
select * from public.record_credit_repayment('82000000-0000-0000-0000-000000000001',1,'external_momo','87000000-0000-0000-0000-000000000004','P4-MOMO-REF');
insert into phase4_test_results(tap) select extensions.is((select current_balance from public.credit_accounts where customer_id='82000000-0000-0000-0000-000000000001'),9::numeric,'Suspended account still accepts repayment');
update public.customers set status='inactive' where id='82000000-0000-0000-0000-000000000001';
select * from public.record_credit_repayment('82000000-0000-0000-0000-000000000001',1,'cash','87000000-0000-0000-0000-000000000006');
insert into phase4_test_results(tap) select extensions.is((select current_balance from public.credit_accounts where customer_id='82000000-0000-0000-0000-000000000001'),8::numeric,'Inactive customer can repay retained debt');

select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000004',true);
insert into phase4_test_results(tap) select extensions.ok(not public.has_permission('view_credit'),'Stock Assistant cannot view credit');
insert into phase4_test_results(tap) select extensions.throws_ok(
 $$select * from public.record_credit_repayment('82000000-0000-0000-0000-000000000001',1,'cash','87000000-0000-0000-0000-000000000005')$$,
 '42501','You are not authorized to record credit repayments.','Stock Assistant cannot record repayment');
select set_config('request.jwt.claim.sub','82000000-0000-0000-0000-000000000001',true);
insert into phase4_test_results(tap) select extensions.ok(not public.has_permission('view_credit'),'Customer has no credit permission');
insert into phase4_test_results(tap) select extensions.is((select count(*)::integer from public.credit_accounts),0,'Customer cannot read credit accounts');
reset role;
insert into phase4_test_results(tap) select extensions.ok((select relrowsecurity from pg_class where oid='public.credit_accounts'::regclass),'Credit account RLS is enabled');
insert into phase4_test_results(tap) select extensions.ok((select relrowsecurity from pg_class where oid='public.credit_transactions'::regclass),'Credit ledger RLS is enabled');
insert into phase4_test_results(tap) select extensions.ok(not has_table_privilege('anon','public.credit_accounts','SELECT'),'Anonymous cannot read credit accounts');
insert into phase4_test_results(tap) select extensions.ok(not has_table_privilege('authenticated','public.credit_accounts','UPDATE'),'Staff cannot directly update credit accounts');
insert into phase4_test_results(tap) select extensions.ok(not has_table_privilege('authenticated','public.credit_transactions','INSERT'),'Staff cannot directly insert ledger rows');
insert into phase4_test_results(tap) select extensions.is((select current_balance from public.credit_accounts where customer_id='82000000-0000-0000-0000-000000000001'),(select coalesce(sum(case when transaction_type='credit_sale' then amount else -amount end),0) from public.credit_transactions where customer_id='82000000-0000-0000-0000-000000000001'),'Outstanding balance reconciles to ledger');
insert into phase4_test_results(tap) select extensions.is((select quantity from public.inventory_balances where product_id='84000000-0000-0000-0000-000000000001'),(select sum(quantity_delta) from public.stock_movements where product_id='84000000-0000-0000-0000-000000000001'),'Inventory remains reconciled to movement ledger');
insert into phase4_test_results(tap) select extensions.ok((select count(*)>=1 from public.audit_logs where action='credit.account_enabled'),'Credit enablement is audited');
insert into phase4_test_results(tap) select extensions.ok((select count(*)>=1 from public.audit_logs where action='credit.limit_changed'),'Credit limit change is audited');
insert into phase4_test_results(tap) select extensions.ok((select count(*)>=1 from public.audit_logs where action='credit.status_changed'),'Credit status change is audited');
insert into phase4_test_results(tap) select extensions.ok((select count(*)=1 from public.audit_logs where action='credit.sale_completed'),'Credit sale is audited');
insert into phase4_test_results(tap) select extensions.ok((select count(*)=2 from public.audit_logs where action='credit.repayment_recorded'),'Repayments are audited');
select * from extensions.finish();
select string_agg(tap,E'\n' order by sequence_id) as tap_results from phase4_test_results;
rollback;
