-- Replace the Phase 3 sale transaction to add a credit tender without changing
-- the established atomic sale and inventory boundary.
create or replace function public.complete_pos_sale(
  p_client_operation_id uuid,
  p_items jsonb,
  p_payment_method public.payment_method,
  p_customer_id uuid default null,
  p_momo_reference text default null
)
returns table (sale_id uuid, receipt_number text, subtotal numeric, total numeric, occurred_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  actor_name text;
  prior_sale public.sales%rowtype;
  item record;
  product_row public.products%rowtype;
  customer_row public.customers%rowtype;
  account_row public.credit_accounts%rowtype;
  prior_payment public.payments%rowtype;
  current_stock numeric;
  computed_subtotal numeric := 0;
  computed_line numeric;
  next_balance numeric;
  next_available numeric;
  sale_key uuid := gen_random_uuid();
  receipt_key text;
  payment_key uuid := gen_random_uuid();
  credit_transaction_key uuid := gen_random_uuid();
  movement_key uuid;
  item_count integer;
begin
  if actor is null or not public.has_permission('complete_sale') then
    raise exception 'You are not authorized to complete sales.' using errcode = '42501';
  end if;
  select profile.full_name into actor_name from public.staff_profiles profile
    where profile.user_id = actor and profile.is_active and profile.role in ('admin','manager','cashier');
  if actor_name is null then
    raise exception 'An active POS staff profile is required.' using errcode = '42501';
  end if;
  if p_client_operation_id is null then
    raise exception 'A client operation ID is required.' using errcode = '22023';
  end if;
  if p_payment_method not in ('cash', 'external_momo', 'credit') then
    raise exception 'Choose cash, externally confirmed mobile money, or customer credit.' using errcode = '22023';
  end if;
  if p_payment_method = 'external_momo' and p_momo_reference is not null
    and (length(btrim(p_momo_reference)) = 0 or length(btrim(p_momo_reference)) > 120) then
    raise exception 'MoMo reference must be 1 to 120 characters.' using errcode = '22023';
  end if;
  if p_payment_method = 'credit' and (p_customer_id is null or p_momo_reference is not null) then
    raise exception 'Select an eligible customer for a credit sale.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'A sale must contain between 1 and 100 items.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':' || p_client_operation_id::text, 0));
  select * into prior_sale from public.sales
    where cashier_user_id = actor and client_operation_id = p_client_operation_id;
  if found then
    select * into prior_payment from public.payments where sale_id = prior_sale.id;
    if prior_payment.method is distinct from p_payment_method
      or coalesce(prior_payment.provider_reference, '') is distinct from coalesce(nullif(btrim(p_momo_reference), ''), '')
      or prior_sale.customer_id is distinct from p_customer_id then
      raise exception 'This operation ID was already used for a different sale.' using errcode = '23505';
    end if;
    if (select count(*) from jsonb_to_recordset(p_items) as entry(product_id uuid, quantity numeric))
      <> (select count(*) from public.sale_items where sale_id = prior_sale.id)
      or exists (
        select 1 from jsonb_to_recordset(p_items) as entry(product_id uuid, quantity numeric)
        where not exists (select 1 from public.sale_items existing
          where existing.sale_id = prior_sale.id and existing.product_id = entry.product_id
            and existing.quantity = entry.quantity)
      ) or exists (
        select 1 from public.sale_items existing where existing.sale_id = prior_sale.id
          and not exists (select 1 from jsonb_to_recordset(p_items) as entry(product_id uuid, quantity numeric)
            where entry.product_id = existing.product_id and entry.quantity = existing.quantity)
      ) then
      raise exception 'This operation ID was already used for a different cart.' using errcode = '23505';
    end if;
    return query select prior_sale.id, prior_sale.receipt_number, prior_sale.subtotal,
      prior_sale.total, prior_sale.occurred_at;
    return;
  end if;

  select count(*), count(distinct entry.product_id)
    into item_count, current_stock
  from jsonb_to_recordset(p_items) as entry(product_id uuid, quantity numeric);
  if item_count < 1 or item_count > 100 or current_stock <> item_count then
    raise exception 'Cart contains duplicate or invalid products.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_items) as entry(product_id uuid, quantity numeric)
    where entry.product_id is null or entry.quantity is null or entry.quantity <= 0
      or entry.quantity >= 1000000000 or scale(entry.quantity) > 3) then
    raise exception 'Each quantity must be positive and use at most three decimal places.' using errcode = '22023';
  end if;

  -- Global lock order: customer, credit account, products by UUID, then inventory
  -- balances by UUID. Repayments and credit management use customer -> account.
  if p_customer_id is not null then
    select * into customer_row from public.customers customer
      where customer.id = p_customer_id and customer.status = 'active' for update;
    if not found then
      raise exception 'Choose an active customer.' using errcode = 'P0002';
    end if;
    if p_payment_method = 'credit' then
      select * into account_row from public.credit_accounts account
        where account.customer_id = p_customer_id for update;
      if not found or account_row.status <> 'active' then
        raise exception 'Customer credit account is unavailable.' using errcode = '23514';
      end if;
    end if;
  end if;

  perform product.id from public.products product
    join (select distinct entry.product_id from jsonb_to_recordset(p_items)
      as entry(product_id uuid, quantity numeric)) cart on cart.product_id = product.id
    order by product.id for update of product;
  if (select count(*) from public.products product
      join (select distinct entry.product_id from jsonb_to_recordset(p_items)
        as entry(product_id uuid, quantity numeric)) cart on cart.product_id = product.id
      where product.is_active) <> item_count then
    raise exception 'A product is inactive or unavailable. Refresh the cart.' using errcode = 'P0002';
  end if;

  for item in select entry.product_id, entry.quantity
    from jsonb_to_recordset(p_items) as entry(product_id uuid, quantity numeric)
    order by entry.product_id
  loop
    select * into product_row from public.products where id = item.product_id;
    select quantity into current_stock from public.inventory_balances
      where product_id = item.product_id for update;
    if current_stock is null or current_stock < item.quantity then
      raise exception 'Insufficient stock for %.', product_row.name using errcode = '23514';
    end if;
    computed_line := round(product_row.selling_price * item.quantity, 2);
    computed_subtotal := computed_subtotal + computed_line;
  end loop;
  computed_subtotal := round(computed_subtotal, 2);
  if computed_subtotal <= 0 then
    raise exception 'Sale total must be greater than zero.' using errcode = '22023';
  end if;
  if p_payment_method = 'credit' then
    if public.available_credit(account_row.credit_limit, account_row.current_balance, account_row.status)
      < computed_subtotal then
      raise exception 'Insufficient available customer credit.' using errcode = '23514';
    end if;
    next_balance := account_row.current_balance + computed_subtotal;
    next_available := public.available_credit(account_row.credit_limit, next_balance, account_row.status);
  end if;

  receipt_key := 'GP-' || to_char(now() at time zone 'Africa/Accra', 'YYMMDD') || '-'
    || upper(substr(replace(p_client_operation_id::text, '-', ''), 1, 16));
  if exists (select 1 from public.sales existing_receipt where existing_receipt.receipt_number = receipt_key) then
    receipt_key := receipt_key || upper(substr(replace(p_client_operation_id::text, '-', ''), 17, 4));
  end if;

  insert into public.sales(id, receipt_number, customer_id, cashier_user_id, channel, status,
    subtotal, total, client_operation_id)
  values (sale_key, receipt_key, p_customer_id, actor, 'pos', 'completed',
    computed_subtotal, computed_subtotal, p_client_operation_id);

  for item in select entry.product_id, entry.quantity
    from jsonb_to_recordset(p_items) as entry(product_id uuid, quantity numeric)
    order by entry.product_id
  loop
    select * into product_row from public.products where id = item.product_id;
    computed_line := round(product_row.selling_price * item.quantity, 2);
    insert into public.sale_items(sale_id, product_id, product_name_snapshot, sku_snapshot,
      unit_price, quantity, line_total)
    values (sale_key, item.product_id, product_row.name, product_row.sku,
      product_row.selling_price, item.quantity, computed_line);

    insert into public.stock_movements(product_id, movement_type, quantity_delta,
      reference_type, reference_id, actor_user_id, actor_name, client_operation_id)
    values (item.product_id, 'sale', -item.quantity, 'sale', sale_key,
      actor, actor_name, gen_random_uuid()) returning id into movement_key;
    update public.inventory_balances set quantity = quantity - item.quantity, updated_at = now()
      where product_id = item.product_id;
  end loop;

  insert into public.payments(id, sale_id, customer_id, method, amount, status, provider_reference,
    client_operation_id, recorded_by)
  values (payment_key, sale_key, case when p_payment_method = 'credit' then p_customer_id end,
    p_payment_method, computed_subtotal,
    case when p_payment_method = 'credit' then 'outstanding'::public.payment_status
      else 'recorded'::public.payment_status end,
    nullif(btrim(p_momo_reference), ''), p_client_operation_id, actor);

  if p_payment_method = 'credit' then
    update public.credit_accounts account set current_balance = next_balance
      where account.customer_id = p_customer_id;
    insert into public.credit_transactions(id, customer_id, transaction_type, amount, sale_id,
      payment_id, client_operation_id, recorded_by, balance_after, available_after)
    values (credit_transaction_key, p_customer_id, 'credit_sale', computed_subtotal, sale_key,
      payment_key, p_client_operation_id, actor, next_balance, next_available);
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
    values (actor, 'credit.sale_completed', 'credit_transaction', credit_transaction_key,
      jsonb_build_object('customer_id', p_customer_id, 'sale_id', sale_key,
        'receipt_number', receipt_key, 'amount', computed_subtotal,
        'balance_before', account_row.current_balance, 'balance_after', next_balance,
        'available_after', next_available));
  end if;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
  values (actor, 'sale.completed', 'sale', sale_key,
    jsonb_build_object('receipt_number', receipt_key, 'total', computed_subtotal,
      'item_count', item_count, 'payment_method', p_payment_method));
  if p_payment_method <> 'credit' then
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
    values (actor, 'payment.recorded', 'payment', payment_key,
      jsonb_build_object('sale_id', sale_key, 'method', p_payment_method, 'amount', computed_subtotal));
  end if;

  return query select sale_key, receipt_key, computed_subtotal, computed_subtotal, now();
end;
$$;
revoke all on function public.complete_pos_sale(uuid, jsonb, public.payment_method, uuid, text) from public, anon;
grant execute on function public.complete_pos_sale(uuid, jsonb, public.payment_method, uuid, text) to authenticated;

-- PostgreSQL cannot replace a function when its RETURNS TABLE columns change.
-- The Phase 4 receipt adds payment and credit columns, so recreate the RPC.
drop function public.get_pos_sale(uuid);
create function public.get_pos_sale(p_sale_id uuid)
returns table (
  id uuid, receipt_number text, customer_id uuid, customer_name text, cashier_user_id uuid,
  cashier_name text, status public.sale_status, subtotal numeric, total numeric,
  payment_method public.payment_method, payment_status public.payment_status,
  provider_reference text, credit_balance_after numeric, credit_available_after numeric,
  occurred_at timestamptz, item_id uuid, product_id uuid, product_name text, sku text,
  unit_price numeric, quantity numeric, line_total numeric
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.has_permission('view_sales_history') then
    raise exception 'You are not authorized to view sales.' using errcode = '42501';
  end if;
  return query
  select sale.id, sale.receipt_number, sale.customer_id, customer.full_name,
    sale.cashier_user_id, staff.full_name, sale.status, sale.subtotal, sale.total,
    payment.method, payment.status, payment.provider_reference,
    credit_tx.balance_after, credit_tx.available_after, sale.occurred_at,
    item.id, item.product_id, item.product_name_snapshot, item.sku_snapshot,
    item.unit_price, item.quantity, item.line_total
  from public.sales sale
  join public.staff_profiles staff on staff.user_id = sale.cashier_user_id
  left join public.customers customer on customer.id = sale.customer_id
  join public.payments payment on payment.sale_id = sale.id
  left join public.credit_transactions credit_tx on credit_tx.sale_id = sale.id
  join public.sale_items item on item.sale_id = sale.id
  where sale.id = p_sale_id
  order by item.id;
end;
$$;
revoke all on function public.get_pos_sale(uuid) from public, anon;
grant execute on function public.get_pos_sale(uuid) to authenticated;
