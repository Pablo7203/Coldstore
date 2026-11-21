-- Customer orders reserve available stock until pickup or delivery fulfillment.
-- Checkout and fulfillment are security-definer transactions; clients only read
-- orders they own and cannot edit stock, reservation, sale, or payment records.

do $$
begin
  create type public.order_status as enum (
    'pending',
    'confirmed',
    'preparing',
    'ready',
    'completed',
    'cancelled',
    'expired'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$
declare
  status_count integer;
begin
  select count(*) into status_count
  from pg_enum as enum_value
  join pg_type as enum_type on enum_type.oid = enum_value.enumtypid
  join pg_namespace as enum_schema on enum_schema.oid = enum_type.typnamespace
  where enum_schema.nspname = 'public'
    and enum_type.typname = 'order_status'
    and enum_value.enumlabel in (
      'pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled', 'expired'
    );
  if status_count <> 7 then
    raise exception 'The public.order_status type is missing one or more required order states.';
  end if;
end;
$$;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  status public.order_status not null default 'pending',
  fulfillment_method text not null default 'pickup'
    check (fulfillment_method in ('pickup', 'delivery')),
  subtotal numeric not null check (
    subtotal >= 0 and subtotal < 1000000000000 and scale(subtotal) <= 2
  ),
  total numeric not null check (
    total >= 0 and total < 1000000000000 and scale(total) <= 2
  ),
  client_operation_id uuid not null unique,
  reservation_expires_at timestamptz not null,
  placed_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  cancelled_at timestamptz,
  sale_id uuid references public.sales(id) on delete restrict,
  fulfillment_client_operation_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (order_number = btrim(order_number) and length(order_number) between 1 and 40),
  check (total >= subtotal)
);

create index if not exists orders_customer_placed_idx
  on public.orders(customer_id, placed_at desc, id desc);
create index if not exists orders_status_expiry_idx
  on public.orders(status, reservation_expires_at);

do $$
begin
  alter table public.payments
    add constraint payments_order_id_fkey
    foreign key (order_id) references public.orders(id) on delete restrict not valid;
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name_snapshot text not null
    check (length(btrim(product_name_snapshot)) between 1 and 160),
  sku_snapshot text,
  unit_price numeric not null
    check (unit_price >= 0 and unit_price < 10000000000 and scale(unit_price) <= 2),
  quantity numeric not null
    check (quantity > 0 and quantity < 1000000000 and scale(quantity) <= 3),
  line_total numeric not null
    check (line_total >= 0 and line_total < 1000000000000 and scale(line_total) <= 2),
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_idx on public.order_items(order_id, id);
create index if not exists order_items_product_idx on public.order_items(product_id, order_id);
create unique index if not exists order_items_order_product_unique
  on public.order_items(order_id, product_id);

create table if not exists public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric not null
    check (quantity > 0 and quantity < 1000000000 and scale(quantity) <= 3),
  status text not null default 'active'
    check (status in ('active', 'consumed', 'released', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  released_at timestamptz
);

create index if not exists inventory_reservations_product_active_idx
  on public.inventory_reservations(product_id, expires_at)
  where status = 'active';
create index if not exists inventory_reservations_order_idx
  on public.inventory_reservations(order_id, status);
create index if not exists inventory_reservations_expiry_idx
  on public.inventory_reservations(expires_at)
  where status = 'active';
create unique index if not exists inventory_reservations_order_product_unique
  on public.inventory_reservations(order_id, product_id);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.inventory_reservations enable row level security;
revoke all on public.orders, public.order_items, public.inventory_reservations
  from anon, authenticated;
grant select on public.orders, public.order_items to authenticated;

-- PostgreSQL combines permissive policies with OR, so remove old policies from
-- earlier manually-managed schemas before installing this ownership boundary.
do $$
declare
  old_policy record;
begin
  for old_policy in
    select policy.tablename, policy.policyname
    from pg_policies as policy
    where policy.schemaname = 'public'
      and policy.tablename in ('orders', 'order_items', 'inventory_reservations')
  loop
    execute format(
      'drop policy %I on public.%I',
      old_policy.policyname,
      old_policy.tablename
    );
  end loop;
end;
$$;

create policy orders_read_own_or_staff
  on public.orders for select to authenticated
  using (
    (select public.has_permission('manage_orders'))
    or exists (
      select 1
      from public.customers as customer
      where customer.id = orders.customer_id
        and customer.auth_user_id = (select auth.uid())
    )
  );

create policy order_items_read_own_or_staff
  on public.order_items for select to authenticated
  using (
    exists (
      select 1
      from public.orders as customer_order
      where customer_order.id = order_items.order_id
    )
  );

-- Reserve quantities from the available balance. This guard also prevents POS
-- or manual stock changes from consuming stock promised to active orders.
create or replace function public.guard_inventory_reservations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reserved_quantity numeric;
begin
  select coalesce(sum(reservation.quantity), 0)
    into reserved_quantity
  from public.inventory_reservations as reservation
  where reservation.product_id = new.product_id
    and reservation.status = 'active'
    and reservation.expires_at > now();

  if new.quantity < reserved_quantity then
    raise exception 'This stock is reserved for customer orders.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_inventory_reservations()
  from public, anon, authenticated;

drop trigger if exists inventory_balances_respect_reservations
  on public.inventory_balances;
create trigger inventory_balances_respect_reservations
  before update of quantity on public.inventory_balances
  for each row execute function public.guard_inventory_reservations();

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
    and customer_order.reservation_expires_at <= now();
  get diagnostics expired_order_count = row_count;

  update public.inventory_reservations as reservation
  set status = 'expired', released_at = now()
  where reservation.status = 'active'
    and reservation.expires_at <= now();

  return expired_order_count;
end;
$$;
revoke all on function public.expire_customer_order_reservations()
  from public, anon;
grant execute on function public.expire_customer_order_reservations()
  to authenticated;

create or replace function public.submit_customer_order(
  p_client_operation_id uuid,
  p_items jsonb
)
returns table (
  order_id uuid,
  order_number text,
  status public.order_status,
  subtotal numeric,
  total numeric,
  reservation_expires_at timestamptz,
  placed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  customer_key uuid;
  prior_order public.orders%rowtype;
  item record;
  product_row public.products%rowtype;
  current_stock numeric;
  reserved_quantity numeric;
  computed_line numeric;
  computed_subtotal numeric := 0;
  item_count integer;
  distinct_item_count integer;
  order_key uuid := gen_random_uuid();
  order_label text;
  expires_at timestamptz := now() + interval '24 hours';
begin
  if actor is null then
    raise exception 'Sign in with a customer account to place an order.'
      using errcode = '42501';
  end if;
  if p_client_operation_id is null then
    raise exception 'A checkout operation ID is required.' using errcode = '22023';
  end if;

  select customer.id into customer_key
  from public.customers as customer
  where customer.auth_user_id = actor and customer.status = 'active';
  if customer_key is null then
    raise exception 'An active customer profile is required to place an order.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(customer_key::text || ':' || p_client_operation_id::text, 0)
  );

  -- Expired reservations stop reducing available stock on time, even if a
  -- scheduled cleanup job is unavailable.
  perform public.expire_customer_order_reservations();

  select * into prior_order
  from public.orders as customer_order
  where customer_order.client_operation_id = p_client_operation_id
  for update;
  if found then
    if prior_order.customer_id <> customer_key
      or prior_order.fulfillment_method <> 'pickup'
      or (select count(*) from jsonb_to_recordset(p_items)
        as requested(product_id uuid, quantity numeric))
        <> (select count(*) from public.order_items existing
          where existing.order_id = prior_order.id)
      or exists (
        select 1
        from jsonb_to_recordset(p_items)
          as requested(product_id uuid, quantity numeric)
        where not exists (
          select 1 from public.order_items existing
          where existing.order_id = prior_order.id
            and existing.product_id = requested.product_id
            and existing.quantity = requested.quantity
        )
      ) then
      raise exception 'This checkout request was already used for a different order.'
        using errcode = '23505';
    end if;
    return query select prior_order.id, prior_order.order_number, prior_order.status,
      prior_order.subtotal, prior_order.total, prior_order.reservation_expires_at,
      prior_order.placed_at;
    return;
  end if;

  if jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'An order must contain between 1 and 50 different products.'
      using errcode = '22023';
  end if;
  select count(*), count(distinct requested.product_id)
    into item_count, distinct_item_count
  from jsonb_to_recordset(p_items)
    as requested(product_id uuid, quantity numeric);
  if item_count < 1 or item_count > 50 or item_count <> distinct_item_count
    or exists (
      select 1 from jsonb_to_recordset(p_items)
        as requested(product_id uuid, quantity numeric)
      where requested.product_id is null
        or requested.quantity is null
        or requested.quantity <= 0
        or requested.quantity >= 1000000000
        or scale(requested.quantity) > 3
    ) then
    raise exception 'The cart contains a duplicate product or invalid quantity.'
      using errcode = '22023';
  end if;

  -- Product locks serialize checkout with POS and inventory changes. Balances
  -- are then locked in the same UUID order used by the sales transaction.
  perform product.id
  from public.products as product
  join (
    select distinct requested.product_id
    from jsonb_to_recordset(p_items)
      as requested(product_id uuid, quantity numeric)
  ) as cart on cart.product_id = product.id
  order by product.id
  for update of product;

  if (
    select count(*)
    from public.products as product
    join (
      select distinct requested.product_id
      from jsonb_to_recordset(p_items)
        as requested(product_id uuid, quantity numeric)
    ) as cart on cart.product_id = product.id
    where product.is_active
  ) <> item_count then
    raise exception 'A product is inactive or unavailable. Refresh the cart.'
      using errcode = 'P0002';
  end if;

  for item in
    select requested.product_id, requested.quantity
    from jsonb_to_recordset(p_items)
      as requested(product_id uuid, quantity numeric)
    order by requested.product_id
  loop
    select * into product_row
    from public.products as product
    where product.id = item.product_id;

    select balance.quantity into current_stock
    from public.inventory_balances as balance
    where balance.product_id = item.product_id
    for update;
    if current_stock is null then
      raise exception 'Stock is unavailable for %.', product_row.name
        using errcode = '23514';
    end if;

    select coalesce(sum(reservation.quantity), 0) into reserved_quantity
    from public.inventory_reservations as reservation
    where reservation.product_id = item.product_id
      and reservation.status = 'active'
      and reservation.expires_at > now();
    if current_stock - reserved_quantity < item.quantity then
      raise exception 'Insufficient available stock for %.', product_row.name
        using errcode = '23514';
    end if;

    computed_line := round(product_row.selling_price * item.quantity, 2);
    computed_subtotal := computed_subtotal + computed_line;
  end loop;
  computed_subtotal := round(computed_subtotal, 2);
  if computed_subtotal <= 0 then
    raise exception 'Order total must be greater than zero.' using errcode = '22023';
  end if;

  order_label := 'ORD-' || to_char(now() at time zone 'Africa/Accra', 'YYMMDD')
    || '-' || upper(substr(replace(order_key::text, '-', ''), 1, 8));

  insert into public.orders (
    id, order_number, customer_id, status, fulfillment_method,
    subtotal, total, client_operation_id, reservation_expires_at
  ) values (
    order_key, order_label, customer_key, 'pending', 'pickup',
    computed_subtotal, computed_subtotal, p_client_operation_id, expires_at
  );

  insert into public.order_items (
    order_id, product_id, product_name_snapshot, sku_snapshot,
    unit_price, quantity, line_total
  )
  select order_key, product.id, product.name, product.sku,
    product.selling_price, requested.quantity,
    round(product.selling_price * requested.quantity, 2)
  from jsonb_to_recordset(p_items)
    as requested(product_id uuid, quantity numeric)
  join public.products as product on product.id = requested.product_id;

  insert into public.inventory_reservations (
    order_id, product_id, quantity, expires_at
  )
  select order_key, requested.product_id, requested.quantity, expires_at
  from jsonb_to_recordset(p_items)
    as requested(product_id uuid, quantity numeric);

  return query select order_key, order_label, 'pending'::public.order_status,
    computed_subtotal, computed_subtotal, expires_at, now();
end;
$$;

revoke all on function public.submit_customer_order(uuid, jsonb) from public, anon;
grant execute on function public.submit_customer_order(uuid, jsonb) to authenticated;

create or replace function public.mark_order_ready(p_order_id uuid)
returns public.order_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  customer_order public.orders%rowtype;
begin
  if actor is null or not public.has_permission('manage_orders') then
    raise exception 'You are not authorized to prepare customer orders.'
      using errcode = '42501';
  end if;

  select * into customer_order
  from public.orders as stored_order
  where stored_order.id = p_order_id
  for update;
  if not found or customer_order.status not in ('pending', 'confirmed', 'preparing')
    or customer_order.reservation_expires_at <= now() then
    raise exception 'This order cannot be marked ready in its current state.'
      using errcode = 'P0002';
  end if;

  update public.orders as stored_order
  set status = 'ready',
      reservation_expires_at = greatest(
        customer_order.reservation_expires_at, now() + interval '24 hours'
      )
  where stored_order.id = p_order_id;

  update public.inventory_reservations as reservation
  set expires_at = greatest(reservation.expires_at, now() + interval '24 hours')
  where reservation.order_id = p_order_id and reservation.status = 'active';
  return 'ready';
end;
$$;
revoke all on function public.mark_order_ready(uuid) from public, anon;
grant execute on function public.mark_order_ready(uuid) to authenticated;

create function public.fulfil_customer_order_internal(
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
  item record;
  current_stock numeric;
  final_total numeric;
  sale_key uuid := gen_random_uuid();
  receipt_key text;
  payment_key uuid := gen_random_uuid();
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
    raise exception 'Customer order fulfillment requires a valid cash payment.'
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
      existing_sale.subtotal, existing_sale.total, p_payment_method;
    return;
  end if;

  if customer_order.status <> 'ready'
    or (customer_order.fulfillment_method = 'pickup'
      and customer_order.reservation_expires_at <= now())
    or (customer_order.fulfillment_method = 'pickup' and p_delivery_fee <> 0)
    or (customer_order.fulfillment_method = 'delivery' and p_delivery_fee is null) then
    raise exception 'The order is not ready for cash fulfillment.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.order_items as order_item
    where order_item.order_id = p_order_id
  ) then
    raise exception 'The order has no items to fulfill.' using errcode = 'P0002';
  end if;

  if p_client_operation_id is distinct from customer_order.id then
    raise exception 'The order UUID must be used as its fulfillment operation ID.'
      using errcode = '22023';
  end if;

  -- Use the same product-then-balance lock order as POS and stock movements so
  -- two concurrent transactions cannot consume the same reserved units.
  perform product.id
  from public.products as product
  join public.order_items as order_item
    on order_item.product_id = product.id
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
      raise exception 'The reserved quantity is no longer in stock.'
        using errcode = '23514';
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

  final_total := round(customer_order.subtotal + coalesce(p_delivery_fee, 0), 2);
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
    sale_id, product_id, product_name_snapshot, sku_snapshot,
    unit_price, quantity, line_total
  )
  select sale_key, order_item.product_id, order_item.product_name_snapshot,
    order_item.sku_snapshot, order_item.unit_price, order_item.quantity,
    order_item.line_total
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
    set quantity = balance.quantity - item.quantity,
        updated_at = now()
    where balance.product_id = item.product_id;
  end loop;

  insert into public.payments (
    id, sale_id, customer_id, order_id, method, amount, status,
    client_operation_id, recorded_by
  ) values (
    payment_key, sale_key, customer_order.customer_id, p_order_id,
    'cash', final_total, 'recorded', p_client_operation_id, actor
  );

  update public.orders as stored_order
  set status = 'completed',
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
      'payment_method', 'cash'
    )
  );
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

  return query select sale_key, receipt_key,
    customer_order.subtotal, final_total, 'cash'::public.payment_method;
end;
$$;
revoke all on function public.fulfil_customer_order_internal(
  uuid, uuid, public.payment_method, text, numeric
) from public, anon, authenticated;

create or replace function public.fulfil_customer_order(
  p_order_id uuid,
  p_client_operation_id uuid,
  p_payment_method public.payment_method,
  p_momo_reference text default null
)
returns table (
  sale_id uuid,
  receipt_number text,
  total numeric,
  payment_method public.payment_method
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.orders as customer_order
    where customer_order.id = p_order_id
      and customer_order.fulfillment_method = 'pickup'
  ) then
    raise exception 'Use the delivery completion workflow for home-delivery orders.'
      using errcode = 'P0002';
  end if;

  return query
  select fulfillment.sale_id, fulfillment.receipt_number,
    fulfillment.total, fulfillment.payment_method
  from public.fulfil_customer_order_internal(
    p_order_id, p_client_operation_id, p_payment_method, p_momo_reference, 0
  ) as fulfillment;
end;
$$;
revoke all on function public.fulfil_customer_order(
  uuid, uuid, public.payment_method, text
) from public, anon;
grant execute on function public.fulfil_customer_order(
  uuid, uuid, public.payment_method, text
) to authenticated;

comment on table public.orders is
  'Customer pickup or delivery orders with an idempotent stock reservation lifecycle.';
comment on table public.inventory_reservations is
  'Active order quantities subtracted from sellable stock until consumed or released.';
