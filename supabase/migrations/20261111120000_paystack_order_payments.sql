-- Add verified Paystack prepayment to customer pickup and delivery orders.
-- Attempt rows are private; only authenticated customer RPCs and the server-only
-- verification service can create or change them.

alter table public.orders
  add column if not exists payment_method public.payment_method not null default 'cash',
  add column if not exists payment_status text not null default 'unpaid';

alter table public.orders
  add constraint orders_payment_status_check
    check (payment_status in ('unpaid', 'pending', 'paid', 'failed')),
  add constraint orders_payment_state_check
    check (
      (payment_method = 'cash' and payment_status in ('unpaid', 'paid'))
      or (payment_method = 'paystack' and payment_status in ('pending', 'paid', 'failed'))
    );

create table public.paystack_order_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  reference text not null unique check (reference ~ '^GP-[A-Fa-f0-9]{32}$'),
  amount numeric not null check (amount > 0 and scale(amount) <= 2),
  currency text not null default 'GHS' check (currency = 'GHS'),
  status text not null default 'initialized'
    check (status in ('initialized', 'paid', 'failed')),
  authorization_url text check (
    authorization_url is null or (
      length(authorization_url) <= 1000
      and authorization_url like 'https://checkout.paystack.com/%'
    )
  ),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index paystack_order_attempts_order_created_idx
  on public.paystack_order_attempts(order_id, created_at desc);
create unique index paystack_order_attempts_one_active_per_order
  on public.paystack_order_attempts(order_id) where status = 'initialized';

alter table public.paystack_order_attempts enable row level security;
revoke all on public.paystack_order_attempts from anon, authenticated;

create unique index payments_paystack_reference_unique
  on public.payments(provider_reference)
  where method = 'paystack' and provider_reference is not null;

create policy payments_read_order_staff
  on public.payments for select to authenticated
  using (order_id is not null and (select public.has_permission('manage_orders')));

-- Allow the fulfillment transaction to link a previously verified immutable
-- Paystack payment to its sale. Every other payment update remains forbidden.
create or replace function public.prevent_payment_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and old.sale_id is null
    and old.order_id is not null
    and old.method = 'paystack'
    and new.sale_id is not null
    and (new.id, new.customer_id, new.order_id, new.method, new.amount, new.status,
      new.provider, new.provider_reference, new.client_operation_id, new.recorded_by,
      new.occurred_at, new.created_at)
      is not distinct from
      (old.id, old.customer_id, old.order_id, old.method, old.amount, old.status,
      old.provider, old.provider_reference, old.client_operation_id, old.recorded_by,
      old.occurred_at, old.created_at)
    and exists (
      select 1 from public.sales as sale
      where sale.id = new.sale_id
        and sale.customer_id = old.customer_id
        and sale.total = old.amount
    ) then
    return new;
  end if;

  raise exception 'Completed payment records are immutable.' using errcode = '42501';
end;
$$;
revoke all on function public.prevent_payment_mutation() from public, anon, authenticated;
drop trigger if exists payments_are_immutable on public.payments;
create trigger payments_are_immutable
  before update or delete on public.payments
  for each row execute function public.prevent_payment_mutation();

create or replace function public.expire_customer_order_reservations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  expired_order_count integer;
begin
  if actor is null then
    raise exception 'Sign in to refresh order availability.' using errcode = '42501';
  end if;

  update public.orders as customer_order
  set status = 'expired'
  where customer_order.status in ('pending', 'confirmed', 'preparing', 'ready')
    and customer_order.reservation_expires_at <= now()
    and not (customer_order.payment_method = 'paystack'
      and customer_order.payment_status = 'paid');
  get diagnostics expired_order_count = row_count;

  update public.inventory_reservations as reservation
  set status = 'expired', released_at = now()
  where reservation.status = 'active'
    and reservation.expires_at <= now()
    and not exists (
      select 1
      from public.orders as customer_order
      where customer_order.id = reservation.order_id
        and customer_order.payment_method = 'paystack'
        and customer_order.payment_status = 'paid'
    );

  return expired_order_count;
end;
$$;
revoke all on function public.expire_customer_order_reservations() from public, anon;
grant execute on function public.expire_customer_order_reservations() to authenticated;

create function public.guard_paid_online_order_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.payment_method = 'paystack'
    and new.payment_status <> 'paid'
    and (
      new.status in ('preparing', 'ready', 'completed')
      or new.delivery_stage in ('preparing', 'packed', 'out_for_delivery', 'delivered')
    ) then
    raise exception 'A Paystack order must be paid and verified before preparation.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_paid_online_order_progress() from public, anon, authenticated;
create trigger orders_require_verified_online_payment
  before update of status, delivery_stage on public.orders
  for each row execute function public.guard_paid_online_order_progress();

create function public.start_paystack_order_payment(p_order_id uuid)
returns table (
  reference text,
  amount numeric,
  currency text,
  customer_email text,
  order_number text,
  authorization_url text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  customer_key uuid;
  customer_address text;
  customer_order public.orders%rowtype;
  existing_attempt public.paystack_order_attempts%rowtype;
  new_reference text;
begin
  if actor is null then
    raise exception 'Sign in to pay for this order.' using errcode = '42501';
  end if;

  select customer.id, customer.email
  into customer_key, customer_address
  from public.customers as customer
  where customer.auth_user_id = actor and customer.status = 'active';
  if customer_key is null or customer_address is null then
    raise exception 'An active customer profile with an email address is required.'
      using errcode = '42501';
  end if;

  select * into customer_order
  from public.orders as stored_order
  where stored_order.id = p_order_id and stored_order.customer_id = customer_key
  for update;
  if not found or customer_order.status not in ('pending', 'confirmed')
    or customer_order.reservation_expires_at <= now() then
    raise exception 'This order is no longer available for online payment.'
      using errcode = 'P0002';
  end if;
  if customer_order.fulfillment_method = 'delivery'
    and (customer_order.delivery_fee_accepted_at is null
      or customer_order.delivery_fee is null
      or customer_order.total <> customer_order.subtotal + customer_order.delivery_fee) then
    raise exception 'The delivery fee must be confirmed before payment.'
      using errcode = '55000';
  end if;
  if customer_order.payment_status = 'paid' then
    raise exception 'This order is already paid.' using errcode = '23505';
  end if;

  select * into existing_attempt
  from public.paystack_order_attempts as attempt
  where attempt.order_id = customer_order.id and attempt.status = 'initialized'
  for update;
  if found then
    return query select existing_attempt.reference, existing_attempt.amount,
      existing_attempt.currency, customer_address, customer_order.order_number,
      existing_attempt.authorization_url;
    return;
  end if;

  new_reference := 'GP-' || replace(gen_random_uuid()::text, '-', '');
  update public.orders
  set payment_method = 'paystack', payment_status = 'pending'
  where id = customer_order.id;

  if customer_order.fulfillment_method = 'delivery' then
    update public.order_delivery_events
    set message = 'Delivery order placed at the store flat rate. Paystack payment is pending.'
    where order_id = customer_order.id and idempotency_key = 'order_created';
  end if;

  insert into public.paystack_order_attempts(order_id, reference, amount, currency)
  values (customer_order.id, new_reference, customer_order.total, 'GHS');

  return query select new_reference, customer_order.total, 'GHS'::text,
    customer_address, customer_order.order_number, null::text;
end;
$$;
revoke all on function public.start_paystack_order_payment(uuid) from public, anon;
grant execute on function public.start_paystack_order_payment(uuid) to authenticated;

create function public.lookup_paystack_order_attempt(p_reference text)
returns table (
  order_id uuid,
  amount numeric,
  currency text,
  customer_email text,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the payment verification service may inspect Paystack attempts.'
      using errcode = '42501';
  end if;

  return query
  select attempt.order_id, attempt.amount, attempt.currency,
    customer.email, attempt.status
  from public.paystack_order_attempts as attempt
  join public.orders as customer_order on customer_order.id = attempt.order_id
  join public.customers as customer on customer.id = customer_order.customer_id
  where attempt.reference = p_reference;
end;
$$;
revoke all on function public.lookup_paystack_order_attempt(text) from public, anon, authenticated;
grant execute on function public.lookup_paystack_order_attempt(text) to service_role;

create function public.save_paystack_authorization_url(
  p_reference text,
  p_authorization_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the payment service may save provider authorization links.'
      using errcode = '42501';
  end if;
  update public.paystack_order_attempts
  set authorization_url = p_authorization_url
  where reference = p_reference and status = 'initialized'
    and p_authorization_url like 'https://checkout.paystack.com/%';
  if not found then
    raise exception 'The Paystack authorization link could not be saved.'
      using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.save_paystack_authorization_url(text, text)
  from public, anon, authenticated;
grant execute on function public.save_paystack_authorization_url(text, text) to service_role;

create function public.confirm_paystack_order_payment(
  p_reference text,
  p_amount_minor bigint,
  p_currency text
)
returns table (order_id uuid, order_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.paystack_order_attempts%rowtype;
  customer_order public.orders%rowtype;
  payment_key uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only verified Paystack transactions may be recorded.'
      using errcode = '42501';
  end if;
  if p_currency <> 'GHS' or p_amount_minor <= 0 then
    raise exception 'The verified transaction currency or amount is invalid.'
      using errcode = '22023';
  end if;

  select * into attempt
  from public.paystack_order_attempts as stored_attempt
  where stored_attempt.reference = p_reference
  for update;
  if not found then
    raise exception 'The Paystack reference is not linked to a store order.'
      using errcode = 'P0002';
  end if;

  select * into customer_order
  from public.orders as stored_order
  where stored_order.id = attempt.order_id
  for update;

  if p_amount_minor <> round(attempt.amount * 100)::bigint
    or p_amount_minor <> round(customer_order.total * 100)::bigint
    or attempt.currency <> p_currency then
    raise exception 'The verified payment does not match the order total.'
      using errcode = '22023';
  end if;

  if attempt.status = 'paid' then
    return query select customer_order.id, customer_order.order_number;
    return;
  end if;

  update public.paystack_order_attempts
  set status = 'paid', paid_at = coalesce(paid_at, now())
  where id = attempt.id;

  update public.orders
  set payment_method = 'paystack', payment_status = 'paid',
      reservation_expires_at = 'infinity'::timestamptz
  where id = customer_order.id;
  update public.inventory_reservations
  set expires_at = 'infinity'::timestamptz
  where order_id = customer_order.id and status = 'active';

  insert into public.payments(
    customer_id, order_id, method, amount, status, provider, provider_reference
  ) values (
    customer_order.customer_id, customer_order.id, 'paystack', customer_order.total,
    'recorded', 'paystack', attempt.reference
  ) returning id into payment_key;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
  values (
    null, 'payment.recorded', 'payment', payment_key,
    jsonb_build_object(
      'order_id', customer_order.id,
      'order_number', customer_order.order_number,
      'method', 'paystack',
      'amount', customer_order.total,
      'provider_reference', attempt.reference
    )
  );

  if customer_order.fulfillment_method = 'delivery' then
    insert into public.order_delivery_events(
      order_id, stage, message, actor_user_id, idempotency_key
    ) values (
      customer_order.id, 'confirmed', 'Paystack payment verified. Your delivery order is confirmed.',
      null, 'paystack_payment_confirmed'
    ) on conflict (order_id, idempotency_key) do nothing;
  end if;

  return query select customer_order.id, customer_order.order_number;
end;
$$;
revoke all on function public.confirm_paystack_order_payment(text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.confirm_paystack_order_payment(text, bigint, text)
  to service_role;

create function public.fail_paystack_order_attempt(p_reference text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_order uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the payment service may update Paystack attempts.'
      using errcode = '42501';
  end if;

  update public.paystack_order_attempts
  set status = 'failed'
  where reference = p_reference and status = 'initialized'
  returning order_id into linked_order;
  if linked_order is null then return; end if;

  update public.orders as customer_order
  set payment_status = case
    when exists (
      select 1 from public.paystack_order_attempts as other_attempt
      where other_attempt.order_id = linked_order and other_attempt.status = 'initialized'
    ) then 'pending'
    else 'failed'
  end
  where customer_order.id = linked_order and customer_order.payment_status <> 'paid';
end;
$$;
revoke all on function public.fail_paystack_order_attempt(text)
  from public, anon, authenticated;
grant execute on function public.fail_paystack_order_attempt(text) to service_role;

create or replace function public.fulfil_customer_order_internal(
  p_order_id uuid,
  p_client_operation_id uuid,
  p_payment_method public.payment_method,
  p_momo_reference text,
  p_delivery_fee numeric
)
returns table (
  sale_id uuid,
  receipt_number text,
  subtotal numeric,
  total numeric,
  payment_method public.payment_method
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_name text;
  customer_order public.orders%rowtype;
  existing_sale public.sales%rowtype;
  verified_payment public.payments%rowtype;
  item record;
  current_stock numeric;
  final_total numeric;
  sale_key uuid := gen_random_uuid();
  receipt_key text;
  payment_key uuid := gen_random_uuid();
  actual_payment_method public.payment_method;
begin
  if actor is null or not public.has_permission('manage_orders')
    or not public.has_permission('complete_sale') then
    raise exception 'You are not authorized to complete customer orders.'
      using errcode = '42501';
  end if;
  if p_client_operation_id is null
    or p_payment_method is distinct from 'cash'::public.payment_method
    or coalesce(p_delivery_fee, 0) < 0
    or p_delivery_fee >= 1000000000
    or scale(coalesce(p_delivery_fee, 0)) > 2
    or nullif(btrim(p_momo_reference), '') is not null then
    raise exception 'Customer order fulfillment requires a valid payment workflow.'
      using errcode = '22023';
  end if;

  select profile.full_name into actor_name
  from public.staff_profiles as profile
  where profile.user_id = actor and profile.is_active
    and profile.role in ('admin', 'manager', 'cashier');
  if actor_name is null then
    raise exception 'An active order-fulfillment staff profile is required.'
      using errcode = '42501';
  end if;

  select * into customer_order
  from public.orders as stored_order
  where stored_order.id = p_order_id
  for update;
  if not found then
    raise exception 'Customer order was not found.' using errcode = 'P0002';
  end if;

  actual_payment_method := customer_order.payment_method;
  if customer_order.status = 'completed' and customer_order.sale_id is not null then
    if customer_order.fulfillment_client_operation_id
      is distinct from p_client_operation_id then
      raise exception 'This order was completed with a different operation ID.'
        using errcode = '23505';
    end if;
    select * into existing_sale
    from public.sales as sale
    where sale.id = customer_order.sale_id;
    return query select existing_sale.id, existing_sale.receipt_number,
      existing_sale.subtotal, existing_sale.total, actual_payment_method;
    return;
  end if;

  if customer_order.status <> 'ready'
    or (customer_order.fulfillment_method = 'pickup'
      and customer_order.reservation_expires_at <= now())
    or (customer_order.fulfillment_method = 'pickup' and p_delivery_fee <> 0)
    or (customer_order.fulfillment_method = 'delivery' and p_delivery_fee is null) then
    raise exception 'The order is not ready for fulfillment.' using errcode = 'P0002';
  end if;

  if p_client_operation_id is distinct from customer_order.id then
    raise exception 'The order UUID must be used as its fulfillment operation ID.'
      using errcode = '22023';
  end if;

  final_total := round(customer_order.subtotal + coalesce(p_delivery_fee, 0), 2);
  if final_total <> customer_order.total then
    raise exception 'The order total no longer matches its confirmed checkout amount.'
      using errcode = '23514';
  end if;

  if actual_payment_method = 'paystack' then
    if customer_order.payment_status <> 'paid' then
      raise exception 'Paystack payment must be verified before completing this order.'
        using errcode = '55000';
    end if;
    select * into verified_payment
    from public.payments as payment
    where payment.order_id = p_order_id
      and payment.method = 'paystack'
      and payment.provider = 'paystack'
      and payment.status = 'recorded'
      and payment.amount = final_total
      and payment.sale_id is null
    for update;
    if not found then
      raise exception 'The verified Paystack payment record is missing.'
        using errcode = 'P0002';
    end if;
  elsif customer_order.payment_status not in ('unpaid', 'failed') then
    raise exception 'This cash order has an unexpected payment state.'
      using errcode = '55000';
  end if;

  if not exists (
    select 1 from public.order_items as order_item
    where order_item.order_id = p_order_id
  ) then
    raise exception 'The order has no items to fulfill.' using errcode = 'P0002';
  end if;

  -- Lock products before balances, matching POS and stock-movement order.
  perform product.id
  from public.products as product
  join public.order_items as order_item on order_item.product_id = product.id
  where order_item.order_id = p_order_id
  order by product.id
  for update of product;

  for item in
    select order_item.product_id, order_item.quantity
    from public.order_items as order_item
    where order_item.order_id = p_order_id
    order by order_item.product_id
  loop
    select balance.quantity into current_stock
    from public.inventory_balances as balance
    where balance.product_id = item.product_id
    for update;
    if current_stock is null or current_stock < item.quantity then
      raise exception 'The reserved quantity is no longer in stock.' using errcode = '23514';
    end if;
  end loop;

  if exists (
    select 1
    from public.order_items as order_item
    left join public.inventory_reservations as reservation
      on reservation.order_id = order_item.order_id
      and reservation.product_id = order_item.product_id
    left join public.inventory_balances as balance
      on balance.product_id = order_item.product_id
    where order_item.order_id = p_order_id
      and (reservation.status <> 'active'
        or reservation.id is null
        or (customer_order.fulfillment_method = 'pickup'
          and reservation.expires_at <= now())
        or reservation.quantity <> order_item.quantity
        or balance.product_id is null
        or balance.quantity < order_item.quantity)
  ) then
    raise exception 'The order reservation or stock is no longer available.'
      using errcode = '23514';
  end if;

  update public.inventory_reservations as reservation
  set status = 'consumed', released_at = now()
  where reservation.order_id = p_order_id and reservation.status = 'active';

  receipt_key := 'GP-' || to_char(now() at time zone 'Africa/Accra', 'YYMMDD')
    || '-' || upper(substr(replace(p_client_operation_id::text, '-', ''), 1, 16));
  if exists (
    select 1 from public.sales as existing_receipt
    where existing_receipt.receipt_number = receipt_key
  ) then
    receipt_key := receipt_key
      || upper(substr(replace(p_client_operation_id::text, '-', ''), 17, 4));
  end if;

  insert into public.sales (
    id, receipt_number, customer_id, cashier_user_id, channel, status,
    subtotal, total, client_operation_id
  ) values (
    sale_key, receipt_key, customer_order.customer_id, actor, 'pos', 'completed',
    customer_order.subtotal, final_total, p_client_operation_id
  );

  insert into public.sale_items (
    sale_id, product_id, product_name_snapshot, sku_snapshot, unit_price, quantity, line_total
  )
  select sale_key, order_item.product_id, order_item.product_name_snapshot,
    order_item.sku_snapshot, order_item.unit_price, order_item.quantity, order_item.line_total
  from public.order_items as order_item
  where order_item.order_id = p_order_id;

  for item in
    select order_item.product_id, order_item.quantity
    from public.order_items as order_item
    where order_item.order_id = p_order_id
    order by order_item.product_id
  loop
    insert into public.stock_movements (
      product_id, movement_type, quantity_delta, reference_type,
      reference_id, actor_user_id, actor_name, client_operation_id
    ) values (
      item.product_id, 'sale', -item.quantity, 'order_fulfillment',
      p_order_id, actor, actor_name, gen_random_uuid()
    );

    update public.inventory_balances as balance
    set quantity = balance.quantity - item.quantity, updated_at = now()
    where balance.product_id = item.product_id;
  end loop;

  if actual_payment_method = 'paystack' then
    update public.payments as payment
    set sale_id = sale_key
    where payment.id = verified_payment.id;
  else
    insert into public.payments (
      id, sale_id, customer_id, order_id, method, amount, status,
      client_operation_id, recorded_by
    ) values (
      payment_key, sale_key, customer_order.customer_id, p_order_id,
      'cash', final_total, 'recorded', p_client_operation_id, actor
    );
  end if;

  update public.orders as stored_order
  set status = 'completed',
      payment_status = 'paid',
      sale_id = sale_key,
      fulfillment_client_operation_id = p_client_operation_id,
      fulfilled_at = now()
  where stored_order.id = p_order_id;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, details
  ) values (
    actor, 'sale.completed', 'sale', sale_key,
    jsonb_build_object(
      'receipt_number', receipt_key,
      'order_id', p_order_id,
      'total', final_total,
      'payment_method', actual_payment_method
    )
  );

  if actual_payment_method = 'cash' then
    insert into public.audit_logs (
      actor_user_id, action, entity_type, entity_id, details
    ) values (
      actor, 'payment.recorded', 'payment', payment_key,
      jsonb_build_object(
        'sale_id', sale_key,
        'order_id', p_order_id,
        'method', 'cash',
        'amount', final_total
      )
    );
  end if;

  return query select sale_key, receipt_key,
    customer_order.subtotal, final_total, actual_payment_method;
end;
$$;
revoke all on function public.fulfil_customer_order_internal(
  uuid, uuid, public.payment_method, text, numeric
) from public, anon, authenticated;

create or replace function public.complete_customer_delivery(p_order_id uuid)
returns table (
  sale_id uuid,
  receipt_number text,
  subtotal numeric,
  total numeric,
  payment_method public.payment_method
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  customer_order public.orders%rowtype;
  fulfillment record;
begin
  if actor is null or not public.has_permission('manage_orders')
    or not public.has_permission('complete_sale') then
    raise exception 'You are not authorized to complete a delivery.' using errcode = '42501';
  end if;

  select * into customer_order
  from public.orders as stored_order
  where stored_order.id = p_order_id
  for update;
  if not found or customer_order.fulfillment_method <> 'delivery'
    or customer_order.delivery_stage not in ('out_for_delivery', 'delivered')
    or customer_order.delivery_fee_accepted_at is null then
    raise exception 'This delivery is not ready to complete.' using errcode = 'P0002';
  end if;

  select * into fulfillment
  from public.fulfil_customer_order_internal(
    p_order_id, customer_order.id, 'cash'::public.payment_method,
    null::text, customer_order.delivery_fee
  );
  if fulfillment.sale_id is null then
    raise exception 'The delivery payment could not be recorded.' using errcode = 'P0001';
  end if;

  if customer_order.delivery_stage <> 'delivered' then
    update public.orders
    set delivery_stage = 'delivered', delivery_updated_at = now()
    where id = p_order_id;

    insert into public.order_delivery_events(
      order_id, stage, message, actor_user_id, idempotency_key
    ) values (
      p_order_id, 'delivered',
      case when fulfillment.payment_method = 'paystack'
        then 'Delivered. Your Paystack payment was verified before dispatch.'
        else 'Delivered. Cash on delivery was recorded by store staff.' end,
      actor, 'delivered'
    ) on conflict (order_id, idempotency_key) do nothing;
  end if;

  return query select fulfillment.sale_id, fulfillment.receipt_number,
    customer_order.subtotal, fulfillment.total, fulfillment.payment_method;
end;
$$;
revoke all on function public.complete_customer_delivery(uuid) from public, anon;
grant execute on function public.complete_customer_delivery(uuid) to authenticated;

-- Keep function-level permissions narrow: no browser-facing update path can
-- mark a payment paid or change an order's verified payment state.
