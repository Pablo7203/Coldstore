-- Phase 6B data-minimisation correction: do not cache credit accounts for inactive customers.
-- Phase 6 adds a narrowly scoped, authenticated snapshot RPC for temporary offline POS use.
-- No offline mutations or synchronization are accepted by PostgreSQL in this phase.
create or replace function public.get_offline_pos_bootstrap()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_role text;
  credit_allowed boolean;
  repayment_allowed boolean;
begin
  if actor is null
    or not public.has_permission('complete_sale')
    or not public.has_permission('view_inventory')
    or not public.has_permission('view_customers') then
    raise exception 'You are not authorized to prepare an offline POS dataset.' using errcode = '42501';
  end if;

  select profile.role::text into actor_role
  from public.staff_profiles profile
  where profile.user_id = actor and profile.is_active
    and profile.role in ('admin', 'manager', 'cashier');
  if actor_role is null then
    raise exception 'An active POS staff profile is required.' using errcode = '42501';
  end if;

  credit_allowed := public.has_permission('view_credit');
  repayment_allowed := public.has_permission('record_credit_repayment');

  return jsonb_build_object(
    'actor_user_id', actor::text,
    'actor_role', actor_role,
    'generated_at', to_char(statement_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'capabilities', jsonb_build_object(
      'can_complete_sale', true,
      'can_use_credit', credit_allowed,
      'can_record_credit_repayment', repayment_allowed
    ),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', category.id::text, 'name', category.name)
                       order by category.name, category.id)
      from public.categories category
      where exists (
        select 1 from public.products product
        where product.category_id = category.id and product.is_active
      )
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', product.id::text,
        'category_id', product.category_id::text,
        'category_name', category.name,
        'name', product.name,
        'sku', product.sku,
        'barcode', product.barcode,
        'selling_price', product.selling_price::text,
        'sellable_quantity', greatest(
          coalesce(balance.quantity, 0) - coalesce((
            select sum(reservation.quantity)
            from public.inventory_reservations reservation
            where reservation.product_id = product.id
              and reservation.status = 'active'
              and reservation.expires_at > statement_timestamp()
          ), 0),
          0
        )::text
      ) order by category.name, product.name, product.id)
      from public.products product
      join public.categories category on category.id = product.category_id
      left join public.inventory_balances balance on balance.product_id = product.id
      where product.is_active
    ), '[]'::jsonb),
    'customers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', customer.id::text,
        'full_name', customer.full_name,
        'phone', customer.phone,
        'status', customer.status::text
      ) order by customer.full_name, customer.id)
      from public.customers customer
      where customer.status = 'active'
    ), '[]'::jsonb),
    'credit_accounts', case when credit_allowed then coalesce((
      select jsonb_agg(jsonb_build_object(
        'customer_id', account.customer_id::text,
        'customer_name', customer.full_name,
        'customer_phone', customer.phone,
        'customer_status', customer.status::text,
        'credit_limit', account.credit_limit::text,
        'current_balance', account.current_balance::text,
        'available_credit', public.available_credit(
          account.credit_limit, account.current_balance, account.status
        )::text,
        'status', account.status::text
      ) order by customer.full_name, account.customer_id)
      from public.credit_accounts account
      join public.customers customer on customer.id = account.customer_id
      where customer.status = 'active'
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;
revoke all on function public.get_offline_pos_bootstrap() from public, anon;
grant execute on function public.get_offline_pos_bootstrap() to authenticated;
comment on function public.get_offline_pos_bootstrap() is
  'Returns the minimum RBAC-authorized reference snapshot for temporary offline POS. Does not accept or synchronize offline transactions.';
