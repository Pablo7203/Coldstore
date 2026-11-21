-- Phase 5: customer ordering and inventory reservations.
create type public.order_status as enum ('pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled', 'expired');
create type public.reservation_status as enum ('active', 'consumed', 'released', 'expired');
create table public.business_settings (
  id smallint primary key default 1 check (id = 1),
  reservation_expiry_hours integer not null default 24 check (reservation_expiry_hours between 1 and 168),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
insert into public.business_settings (id) values (1);
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique check (order_number ~ '^GP-ORD-[0-9]{6}-[0-9A-F]{16}$'),
  customer_id uuid not null references public.customers (id) on delete restrict,
  status public.order_status not null default 'pending',
  fulfillment_method text not null default 'store_pickup' check (fulfillment_method = 'store_pickup'),
  subtotal numeric not null check (subtotal > 0 and subtotal < 1000000000000 and scale(subtotal) <= 2),
  total numeric not null check (total > 0 and total < 1000000000000 and scale(total) <= 2),
  client_operation_id uuid not null unique,
  reservation_expires_at timestamptz not null,
  placed_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  cancelled_at timestamptz,
  sale_id uuid unique references public.sales (id) on delete restrict,
  fulfillment_client_operation_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'completed') = (sale_id is not null)),
  check ((status = 'completed') = (fulfilled_at is not null)),
  check ((status = 'cancelled') = (cancelled_at is not null))
);
create index orders_customer_placed_idx on public.orders (customer_id, placed_at desc, id desc);
create index orders_status_placed_idx on public.orders (status, placed_at desc, id desc);
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  product_name_snapshot text not null check (length(btrim(product_name_snapshot)) between 1 and 160),
  sku_snapshot text,
  unit_price numeric not null check (unit_price >= 0 and unit_price < 10000000000 and scale(unit_price) <= 2),
  quantity numeric not null check (quantity > 0 and quantity < 1000000000 and scale(quantity) <= 3),
  line_total numeric not null check (line_total >= 0 and line_total < 1000000000000 and scale(line_total) <= 2),
  created_at timestamptz not null default now(),
  unique (order_id, product_id),
  unique (id, order_id, product_id)
);
create index order_items_order_idx on public.order_items (order_id, id);
create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  order_item_id uuid not null unique,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity numeric not null check (quantity > 0 and quantity < 1000000000 and scale(quantity) <= 3),
  status public.reservation_status not null default 'active',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  released_at timestamptz,
  foreign key (order_item_id, order_id, product_id)
    references public.order_items (id, order_id, product_id) on delete restrict,
  check ((status = 'consumed') = (consumed_at is not null)),
  check ((status in ('released','expired')) = (released_at is not null))
);
create index inventory_reservations_product_active_idx
  on public.inventory_reservations (product_id, expires_at) where status = 'active';
create index inventory_reservations_order_idx on public.inventory_reservations (order_id, status);
create unique index payments_order_unique on public.payments (order_id) where order_id is not null;
alter table public.audit_logs drop constraint audit_logs_action_check;
alter table public.audit_logs add constraint audit_logs_action_check check (action in (
  'category.created', 'category.updated', 'category.deactivated',
  'product.created', 'product.updated', 'product.deactivated', 'product.selling_price_changed',
  'inventory.opening_stock', 'inventory.receipt', 'inventory.wastage', 'inventory.damage',
  'inventory.adjustment_in', 'inventory.adjustment_out',
  'customer.created', 'customer.updated', 'sale.completed', 'payment.recorded',
  'credit.account_enabled', 'credit.limit_changed', 'credit.status_changed',
  'credit.sale_completed', 'credit.repayment_recorded',
  'order.submitted', 'order.cancelled', 'order.ready', 'order.fulfilled', 'order.expired',
  'reservation.consumed', 'reservation.released', 'reservation.expired', 'settings.reservation_expiry_changed'
));
alter table public.audit_logs drop constraint audit_logs_entity_type_check;
alter table public.audit_logs add constraint audit_logs_entity_type_check
  check (entity_type in ('category','product','stock_movement','customer','sale','payment',
    'credit_account','credit_transaction','order','reservation','business_settings'));
alter table public.business_settings enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.inventory_reservations enable row level security;
revoke all on public.business_settings, public.orders, public.order_items, public.inventory_reservations from anon, authenticated;
grant select on public.business_settings, public.orders, public.order_items, public.inventory_reservations to authenticated;
create policy settings_read_managers on public.business_settings for select to authenticated
  using ((select public.has_permission('manage_settings')) or (select public.current_staff_role()) in ('admin','manager'));
create policy orders_read_owner_or_staff on public.orders for select to authenticated using (
  exists (select 1 from public.customers customer
    where customer.id = customer_id and customer.auth_user_id = (select auth.uid()) and customer.status = 'active')
  or (select public.has_permission('manage_orders'))
);
create policy order_items_read_owner_or_staff on public.order_items for select to authenticated using (
  exists (select 1 from public.orders customer_order where customer_order.id = order_id and (
    exists (select 1 from public.customers customer where customer.id = customer_order.customer_id
      and customer.auth_user_id = (select auth.uid()) and customer.status = 'active')
    or (select public.has_permission('manage_orders'))))
);
create policy reservations_read_staff_only on public.inventory_reservations for select to authenticated
  using ((select public.has_permission('manage_orders')));
-- Any physical decrease must preserve unexpired reservations. Fulfilment first
-- consumes its own reservation rows in the same transaction, so the guard then
-- permits its sale movement. This database guard also covers adjustments.
create function public.guard_inventory_reservations()
returns trigger language plpgsql security definer set search_path = '' as $$
declare reserved numeric;
begin
  if new.quantity < old.quantity then
    select coalesce(sum(reservation.quantity), 0) into reserved
    from public.inventory_reservations reservation
    where reservation.product_id = new.product_id and reservation.status = 'active'
      and reservation.expires_at > now();
    if new.quantity < reserved then
      raise exception 'Stock is reserved for customer orders.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_inventory_reservations() from public, anon, authenticated;
create trigger inventory_reservations_guard before update of quantity on public.inventory_balances
  for each row execute function public.guard_inventory_reservations();
create function public.get_orderable_catalog(p_query text default '', p_category_id uuid default null, p_limit integer default 100)
returns table (product_id uuid, category_id uuid, category_name text, name text, description text,
  selling_price numeric, image_path text, available_to_order numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_limit not between 1 and 100 or length(btrim(coalesce(p_query,''))) > 100 then
    raise exception 'Invalid catalogue search.' using errcode = '22023';
  end if;
  return query
  select product.id, category.id, category.name, product.name, product.description,
    product.selling_price, product.image_path,
    greatest(coalesce(balance.quantity,0) - coalesce((
      select sum(reservation.quantity) from public.inventory_reservations reservation
      where reservation.product_id = product.id and reservation.status = 'active'
        and reservation.expires_at > now()),0),0)
  from public.products product
  join public.categories category on category.id = product.category_id and category.is_active
  left join public.inventory_balances balance on balance.product_id = product.id
  where product.is_active
    and (p_category_id is null or product.category_id = p_category_id)
    and (nullif(btrim(p_query),'') is null or lower(product.name) like '%' || lower(btrim(p_query)) || '%')
  order by category.name, product.name, product.id limit p_limit;
end;
$$;
revoke all on function public.get_orderable_catalog(text, uuid, integer) from public, authenticated;
grant execute on function public.get_orderable_catalog(text, uuid, integer) to anon, authenticated;
create function public.submit_customer_order(p_client_operation_id uuid, p_items jsonb)
returns table (order_id uuid, order_number text, status public.order_status, subtotal numeric,
  total numeric, reservation_expires_at timestamptz, placed_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid()); customer_row public.customers%rowtype;
  prior_order public.orders%rowtype; item record; product_row public.products%rowtype;
  physical numeric; reserved numeric; line numeric; subtotal_value numeric := 0;
  item_count integer; settings_hours integer; order_key uuid := gen_random_uuid();
  order_number_value text; expires_value timestamptz;
begin
  if actor is null or exists (select 1 from public.staff_profiles staff where staff.user_id = actor) then
    raise exception 'An authenticated customer account is required.' using errcode = '42501';
  end if;
  if p_client_operation_id is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'A valid order and client operation ID are required.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':' || p_client_operation_id::text, 0));
  select * into customer_row from public.customers customer
    where customer.auth_user_id = actor and customer.status = 'active' for update;
  if not found then raise exception 'An active linked customer profile is required.' using errcode = '42501'; end if;
  select * into prior_order from public.orders where client_operation_id = p_client_operation_id;
  if found then
    if prior_order.customer_id <> customer_row.id
      or (select count(*) from jsonb_to_recordset(p_items) as entry(product_id uuid, quantity numeric))
        <> (select count(*) from public.order_items existing where existing.order_id = prior_order.id)
      or exists (select 1 from jsonb_to_recordset(p_items) as entry(product_id uuid, quantity numeric)
        where not exists (select 1 from public.order_items existing where existing.order_id = prior_order.id
          and existing.product_id = entry.product_id and existing.quantity = entry.quantity)) then
      raise exception 'This operation ID was already used for a different order.' using errcode = '23505';
    end if;
    return query select prior_order.id, prior_order.order_number, prior_order.status,
      prior_order.subtotal, prior_order.total, prior_order.reservation_expires_at, prior_order.placed_at;
    return;
  end if;
  select count(*), count(distinct entry.product_id) into item_count, reserved
    from jsonb_to_recordset(p_items) as entry(product_id uuid, quantity numeric);
  if item_count not between 1 and 50 or reserved <> item_count
    or exists (select 1 from jsonb_to_recordset(p_items) as entry(product_id uuid, quantity numeric)
      where entry.product_id is null or entry.quantity is null or entry.quantity <= 0
        or entry.quantity >= 1000000000 or scale(entry.quantity) > 3) then
    raise exception 'Order items must use unique products and valid quantities.' using errcode = '22023';
  end if;
  -- Lock order: customer profile -> products by UUID -> inventory balances by UUID.
  perform product.id from public.products product
    join (select distinct entry.product_id from jsonb_to_recordset(p_items)
      as entry(product_id uuid, quantity numeric)) cart on cart.product_id = product.id
    order by product.id for update of product;
  if (select count(*) from public.products product
    join (select distinct entry.product_id from jsonb_to_recordset(p_items)
      as entry(product_id uuid, quantity numeric)) cart on cart.product_id = product.id
    join public.categories category on category.id = product.category_id
    where product.is_active and category.is_active) <> item_count then
    raise exception 'A product is inactive or unavailable. Refresh the cart.' using errcode = 'P0002';
  end if;
  for item in select entry.product_id, entry.quantity from jsonb_to_recordset(p_items)
    as entry(product_id uuid, quantity numeric) order by entry.product_id
  loop
    select * into product_row from public.products where id = item.product_id;
    select balance.quantity into physical from public.inventory_balances balance
      where balance.product_id = item.product_id for update;
    if physical is null then physical := 0; end if;
    select coalesce(sum(reservation.quantity),0) into reserved from public.inventory_reservations reservation
      where reservation.product_id = item.product_id and reservation.status = 'active'
        and reservation.expires_at > now();
    if physical - reserved < item.quantity then
      raise exception 'Insufficient available quantity for %.', product_row.name using errcode = '23514';
    end if;
    line := round(product_row.selling_price * item.quantity, 2);
    subtotal_value := subtotal_value + line;
  end loop;
  subtotal_value := round(subtotal_value,2);
  if subtotal_value <= 0 then raise exception 'Order total must be greater than zero.' using errcode = '22023'; end if;
  select settings.reservation_expiry_hours into settings_hours from public.business_settings settings where id = 1;
  expires_value := now() + make_interval(hours => settings_hours);
  order_number_value := 'GP-ORD-' || to_char(now() at time zone 'Africa/Accra','YYMMDD') || '-'
    || upper(substr(replace(order_key::text,'-',''),1,16));
  insert into public.orders(id, order_number, customer_id, status, subtotal, total,
    client_operation_id, reservation_expires_at)
  values (order_key, order_number_value, customer_row.id, 'pending', subtotal_value, subtotal_value,
    p_client_operation_id, expires_value);
  for item in select entry.product_id, entry.quantity from jsonb_to_recordset(p_items)
    as entry(product_id uuid, quantity numeric) order by entry.product_id
  loop
    select * into product_row from public.products where id = item.product_id;
    line := round(product_row.selling_price * item.quantity, 2);
    insert into public.order_items(order_id, product_id, product_name_snapshot, sku_snapshot,
      unit_price, quantity, line_total)
    values (order_key, item.product_id, product_row.name, product_row.sku,
      product_row.selling_price, item.quantity, line);
    insert into public.inventory_reservations(order_id, order_item_id, product_id, quantity, expires_at)
    select order_key, order_item.id, item.product_id, item.quantity, expires_value
      from public.order_items order_item where order_item.order_id = order_key and order_item.product_id = item.product_id;
  end loop;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
  values (actor, 'order.submitted', 'order', order_key,
    jsonb_build_object('order_number',order_number_value,'item_count',item_count,'total',subtotal_value,
      'reservation_expires_at',expires_value));
  return query select order_key, order_number_value, 'pending'::public.order_status,
    subtotal_value, subtotal_value, expires_value, now();
end;
$$;
revoke all on function public.submit_customer_order(uuid,jsonb) from public, anon;
grant execute on function public.submit_customer_order(uuid,jsonb) to authenticated;
create function public.cancel_customer_order(p_order_id uuid)
returns public.order_status language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); order_row public.orders%rowtype; new_status public.order_status;
begin
  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.' using errcode = 'P0002'; end if;
  if not (exists (select 1 from public.customers customer where customer.id = order_row.customer_id
      and customer.auth_user_id = actor and customer.status = 'active')
      or public.has_permission('manage_orders')) then
    raise exception 'You are not authorized to cancel this order.' using errcode = '42501';
  end if;
  if order_row.status in ('completed','cancelled','expired') then
    raise exception 'This order can no longer be cancelled.' using errcode = '23514';
  end if;
  if order_row.reservation_expires_at <= now() then new_status := 'expired'; else new_status := 'cancelled'; end if;
  update public.inventory_reservations reservation set
    status = case when reservation.expires_at <= now() then 'expired'::public.reservation_status else 'released'::public.reservation_status end,
    released_at = now()
    where reservation.order_id = p_order_id and reservation.status = 'active';
  update public.orders set status = new_status,
    cancelled_at = case when new_status = 'cancelled' then now() else null end, updated_at = now()
    where id = p_order_id;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
  values (actor, case when new_status = 'expired' then 'order.expired' else 'order.cancelled' end,
    'order', p_order_id, jsonb_build_object('previous_status',order_row.status,'status',new_status));
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
  values (actor, case when new_status = 'expired' then 'reservation.expired' else 'reservation.released' end,
    'reservation', p_order_id, jsonb_build_object('order_id',p_order_id));
  return new_status;
end;
$$;
revoke all on function public.cancel_customer_order(uuid) from public, anon;
grant execute on function public.cancel_customer_order(uuid) to authenticated;
create function public.mark_order_ready(p_order_id uuid)
returns public.order_status language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); order_row public.orders%rowtype;
begin
  if actor is null or not public.has_permission('manage_orders') then
    raise exception 'You are not authorized to manage orders.' using errcode = '42501'; end if;
  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.' using errcode = 'P0002'; end if;
  if order_row.status not in ('pending','confirmed','preparing') or order_row.reservation_expires_at <= now()
    or not exists (select 1 from public.inventory_reservations reservation
      where reservation.order_id = p_order_id and reservation.status = 'active' and reservation.expires_at > now()) then
    raise exception 'Only an active reserved order can be marked ready.' using errcode = '23514'; end if;
  update public.orders set status = 'ready', updated_at = now() where id = p_order_id;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
    values (actor,'order.ready','order',p_order_id,jsonb_build_object('previous_status',order_row.status));
  return 'ready';
end;
$$;
revoke all on function public.mark_order_ready(uuid) from public, anon;
grant execute on function public.mark_order_ready(uuid) to authenticated;
create function public.update_reservation_expiry_hours(p_hours integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); old_hours integer;
begin
  if actor is null or not public.has_permission('manage_settings')
    and coalesce(public.current_staff_role()::text,'') not in ('admin','manager') then
    raise exception 'You are not authorized to change business settings.' using errcode = '42501'; end if;
  if p_hours not between 1 and 168 then raise exception 'Reservation duration must be from 1 to 168 hours.' using errcode = '22023'; end if;
  select reservation_expiry_hours into old_hours from public.business_settings where id = 1 for update;
  update public.business_settings set reservation_expiry_hours = p_hours, updated_by = actor, updated_at = now() where id = 1;
  if old_hours <> p_hours then
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
      values (actor,'settings.reservation_expiry_changed','business_settings','00000000-0000-0000-0000-000000000001',
        jsonb_build_object('old_hours',old_hours,'new_hours',p_hours));
  end if;
  return p_hours;
end;
$$;
revoke all on function public.update_reservation_expiry_hours(integer) from public, anon;
grant execute on function public.update_reservation_expiry_hours(integer) to authenticated;
-- Expiry is a controlled cleanup convenience. Availability already ignores
-- expired-at rows even if this function has not yet run.
create function public.expire_customer_orders()
returns integer language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); order_row public.orders%rowtype; expired_count integer := 0;
begin
  if actor is null or not public.has_permission('manage_orders') then
    raise exception 'You are not authorized to expire orders.' using errcode = '42501'; end if;
  for order_row in select * from public.orders where status not in ('completed','cancelled','expired')
      and reservation_expires_at <= now() order by id for update skip locked
  loop
    update public.inventory_reservations set status = 'expired', released_at = now()
      where order_id = order_row.id and status = 'active';
    update public.orders set status = 'expired', updated_at = now() where id = order_row.id;
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
      values (actor,'order.expired','order',order_row.id,jsonb_build_object('previous_status',order_row.status));
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
      values (actor,'reservation.expired','reservation',order_row.id,jsonb_build_object('order_id',order_row.id));
    expired_count := expired_count + 1;
  end loop;
  return expired_count;
end;
$$;
revoke all on function public.expire_customer_orders() from public, anon;
grant execute on function public.expire_customer_orders() to authenticated;
-- Fulfilment reuses the order-time item price snapshot, existing payment tender,
-- sale movement, receipt, and credit ledger contracts in one transaction.
create function public.fulfil_customer_order(
  p_order_id uuid, p_client_operation_id uuid, p_payment_method public.payment_method,
  p_momo_reference text default null
)
returns table (sale_id uuid, receipt_number text, total numeric, payment_method public.payment_method)
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid()); actor_name text; order_row public.orders%rowtype;
  customer_row public.customers%rowtype; account_row public.credit_accounts%rowtype;
  old_sale public.sales%rowtype; old_payment public.payments%rowtype;
  item record; current_stock numeric; reserved numeric; amount_value numeric;
  next_balance numeric; next_available numeric; sale_key uuid := gen_random_uuid();
  receipt_key text; payment_key uuid := gen_random_uuid(); credit_key uuid := gen_random_uuid();
  item_count integer;
begin
  if actor is null or not public.has_permission('manage_orders') or not public.has_permission('complete_sale') then
    raise exception 'You are not authorized to fulfil customer orders.' using errcode = '42501'; end if;
  select profile.full_name into actor_name from public.staff_profiles profile
    where profile.user_id = actor and profile.is_active and profile.role in ('admin','manager','cashier');
  if actor_name is null then raise exception 'An active cashier profile is required.' using errcode = '42501'; end if;
  if p_client_operation_id is null or p_payment_method not in ('cash','external_momo','credit') then
    raise exception 'Choose a valid tender and operation ID.' using errcode = '22023'; end if;
  if p_payment_method = 'external_momo' and p_momo_reference is not null
    and (length(btrim(p_momo_reference)) = 0 or length(btrim(p_momo_reference)) > 120) then
    raise exception 'MoMo reference must be 1 to 120 characters.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':' || p_client_operation_id::text,0));
  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.' using errcode = 'P0002'; end if;
  if order_row.status = 'completed' then
    if order_row.fulfillment_client_operation_id <> p_client_operation_id then
      raise exception 'This order has already been fulfilled.' using errcode = '23505'; end if;
    select * into old_sale from public.sales where id = order_row.sale_id;
    select * into old_payment from public.payments prior_payment where prior_payment.sale_id = order_row.sale_id;
    if old_payment.method <> p_payment_method or coalesce(old_payment.provider_reference,'') <> coalesce(nullif(btrim(p_momo_reference),''),'') then
      raise exception 'This operation ID was already used with a different tender.' using errcode = '23505'; end if;
    return query select old_sale.id,old_sale.receipt_number,old_sale.total,old_payment.method; return;
  end if;
  if order_row.status in ('cancelled','expired') or order_row.reservation_expires_at <= now() then
    raise exception 'The order reservation has expired or was cancelled.' using errcode = '23514'; end if;
  if not exists (select 1 from public.inventory_reservations reservation
    where reservation.order_id = p_order_id and reservation.status = 'active' and reservation.expires_at > now()) then
    raise exception 'The order has no active reservation.' using errcode = '23514'; end if;
  select * into customer_row from public.customers where id = order_row.customer_id and status = 'active' for update;
  if not found then raise exception 'The linked customer is unavailable.' using errcode = '23514'; end if;
  if p_payment_method = 'credit' then
    select * into account_row from public.credit_accounts where customer_id = order_row.customer_id for update;
    if not found or account_row.status <> 'active' then raise exception 'Customer credit account is unavailable.' using errcode = '23514'; end if;
  end if;
  perform product.id from public.products product
    join (select distinct product_id from public.order_items where order_id = p_order_id) cart_product on cart_product.product_id = product.id
    order by product.id for update of product;
  amount_value := order_row.total;
  select count(*) into item_count from public.order_items where order_id = p_order_id;
  if item_count = 0 then raise exception 'The order has no items.' using errcode = '23514'; end if;
  for item in select order_item.product_id, order_item.quantity from public.order_items order_item
      where order_item.order_id = p_order_id order by order_item.product_id
  loop
    select balance.quantity into current_stock from public.inventory_balances balance
      where balance.product_id = item.product_id for update;
    select coalesce(sum(reservation.quantity),0) into reserved from public.inventory_reservations reservation
      where reservation.order_id = p_order_id and reservation.product_id = item.product_id
        and reservation.status = 'active' and reservation.expires_at > now();
    if current_stock is null or current_stock < item.quantity or reserved <> item.quantity then
      raise exception 'Reserved stock is no longer available for fulfilment.' using errcode = '23514'; end if;
  end loop;
  if p_payment_method = 'credit' then
    if public.available_credit(account_row.credit_limit,account_row.current_balance,account_row.status) < amount_value then
      raise exception 'Insufficient available customer credit.' using errcode = '23514'; end if;
    next_balance := account_row.current_balance + amount_value;
    next_available := public.available_credit(account_row.credit_limit,next_balance,account_row.status);
  end if;
  receipt_key := 'GP-' || to_char(now() at time zone 'Africa/Accra','YYMMDD') || '-'
    || upper(substr(replace(sale_key::text,'-',''),1,16));
  if exists (select 1 from public.sales existing_sale where existing_sale.receipt_number = receipt_key) then
    receipt_key := 'GP-' || to_char(now() at time zone 'Africa/Accra','YYMMDD') || '-'
      || upper(substr(replace(sale_key::text,'-',''),17,16));
  end if;
  insert into public.sales(id,receipt_number,customer_id,cashier_user_id,channel,status,subtotal,total,client_operation_id)
    values (sale_key,receipt_key,order_row.customer_id,actor,'order_fulfilment','completed',amount_value,amount_value,p_client_operation_id);
  for item in select order_item.* from public.order_items order_item where order_item.order_id = p_order_id
      order by order_item.product_id
  loop
    insert into public.sale_items(sale_id,product_id,product_name_snapshot,sku_snapshot,unit_price,quantity,line_total)
      values (sale_key,item.product_id,item.product_name_snapshot,item.sku_snapshot,item.unit_price,item.quantity,item.line_total);
  end loop;
  -- Consume this order's reservation before reducing physical stock. The stock
  -- guard then still protects every other customer's active reservation.
  update public.inventory_reservations set status = 'consumed', consumed_at = now()
    where order_id = p_order_id and status = 'active';
  for item in select order_item.product_id,order_item.quantity from public.order_items order_item
      where order_item.order_id = p_order_id order by order_item.product_id
  loop
    insert into public.stock_movements(product_id,movement_type,quantity_delta,reference_type,reference_id,
      actor_user_id,actor_name,client_operation_id)
      values (item.product_id,'sale',-item.quantity,'sale',sale_key,actor,actor_name,gen_random_uuid());
    update public.inventory_balances set quantity = quantity - item.quantity,updated_at = now()
      where product_id = item.product_id;
  end loop;
  insert into public.payments(id,sale_id,order_id,customer_id,method,amount,status,provider_reference,client_operation_id,recorded_by)
  values (payment_key,sale_key,p_order_id,case when p_payment_method='credit' then order_row.customer_id end,
    p_payment_method,amount_value,case when p_payment_method='credit' then 'outstanding'::public.payment_status else 'recorded'::public.payment_status end,
    nullif(btrim(p_momo_reference),''),p_client_operation_id,actor);
  if p_payment_method = 'credit' then
    update public.credit_accounts set current_balance = next_balance where customer_id = order_row.customer_id;
    insert into public.credit_transactions(id,customer_id,transaction_type,amount,sale_id,payment_id,
      client_operation_id,recorded_by,balance_after,available_after)
      values (credit_key,order_row.customer_id,'credit_sale',amount_value,sale_key,payment_key,p_client_operation_id,actor,next_balance,next_available);
    insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
      values (actor,'credit.sale_completed','credit_transaction',credit_key,
        jsonb_build_object('customer_id',order_row.customer_id,'sale_id',sale_key,'amount',amount_value,
          'balance_before',account_row.current_balance,'balance_after',next_balance,'available_after',next_available));
  end if;
  update public.orders set status='completed', sale_id=sale_key, fulfilled_at=now(),
    fulfillment_client_operation_id=p_client_operation_id, updated_at=now() where id=p_order_id;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
    values (actor,'sale.completed','sale',sale_key,jsonb_build_object('receipt_number',receipt_key,'total',amount_value,
      'item_count',item_count,'payment_method',p_payment_method,'order_id',p_order_id));
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
    values (actor,'order.fulfilled','order',p_order_id,jsonb_build_object('sale_id',sale_key,'receipt_number',receipt_key,'total',amount_value));
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
    values (actor,'reservation.consumed','reservation',p_order_id,jsonb_build_object('order_id',p_order_id,'item_count',item_count));
  if p_payment_method <> 'credit' then
    insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
      values (actor,'payment.recorded','payment',payment_key,jsonb_build_object('sale_id',sale_key,'order_id',p_order_id,'method',p_payment_method,'amount',amount_value));
  end if;
  return query select sale_key,receipt_key,amount_value,p_payment_method;
end;
$$;
revoke all on function public.fulfil_customer_order(uuid,uuid,public.payment_method,text) from public,anon;
grant execute on function public.fulfil_customer_order(uuid,uuid,public.payment_method,text) to authenticated;
comment on table public.orders is 'Online customer pickup orders. Prices are fixed by order item snapshots; fulfillment creates one linked completed sale.';
comment on table public.inventory_reservations is 'Active reservations reduce available-to-order only while expires_at is in the future; they never reduce physical inventory.';
comment on column public.business_settings.reservation_expiry_hours is 'Default reservation lifetime for new orders; existing orders retain their stored expiry timestamp.';
