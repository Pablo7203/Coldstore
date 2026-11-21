-- Delivery orders reuse the existing customer reservation and POS fulfillment
-- RPCs. This migration adds a staff-managed flat rate and an auditable delivery
-- tracking timeline for customers and store staff.

do $$
begin
  if to_regclass('public.orders') is null
    or to_regclass('public.order_items') is null
    or to_regprocedure('public.submit_customer_order(uuid,jsonb)') is null
    or to_regprocedure('public.mark_order_ready(uuid)') is null
    or to_regprocedure('public.fulfil_customer_order(uuid,uuid,public.payment_method,text)') is null then
    raise exception 'Delivery tracking requires the existing customer-order tables and reservation/fulfillment RPCs.';
  end if;
end;
$$;

do $$
begin
  create type public.delivery_stage as enum (
    'not_applicable',
    'awaiting_fee',
    'fee_quoted',
    'confirmed',
    'preparing',
    'packed',
    'out_for_delivery',
    'delivered',
    'cancelled'
  );
exception
  when duplicate_object then null;
end;
$$;

alter table public.orders
  add column if not exists delivery_address text,
  add column if not exists delivery_area text,
  add column if not exists delivery_instructions text,
  add column if not exists delivery_fee numeric,
  add column if not exists delivery_fee_accepted_at timestamptz,
  add column if not exists delivery_stage public.delivery_stage not null default 'not_applicable',
  add column if not exists delivery_tracking_reference text,
  add column if not exists delivery_estimated_at timestamptz,
  add column if not exists delivery_updated_at timestamptz;

do $$
begin
  alter table public.orders
    add constraint orders_delivery_fee_valid
    check (delivery_fee is null or (delivery_fee >= 0 and delivery_fee < 1000000000 and scale(delivery_fee) <= 2));
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.orders
    add constraint orders_delivery_fields_valid
    check (
      (fulfillment_method = 'delivery'
        and delivery_address is not null
        and delivery_area is not null
        and delivery_stage <> 'not_applicable')
      or (fulfillment_method <> 'delivery' and delivery_stage = 'not_applicable')
    ) not valid;
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.order_delivery_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  stage public.delivery_stage not null,
  message text not null check (length(btrim(message)) between 1 and 500),
  actor_user_id uuid references auth.users(id) on delete set null,
  idempotency_key text,
  created_at timestamptz not null default now(),
  unique (order_id, idempotency_key)
);

create index if not exists order_delivery_events_timeline_idx
  on public.order_delivery_events(order_id, created_at, id);

alter table public.order_delivery_events enable row level security;
revoke all on public.order_delivery_events from anon, authenticated;
grant select on public.order_delivery_events to authenticated;

do $$
declare
  old_policy record;
begin
  for old_policy in
    select policy.policyname
    from pg_policies as policy
    where policy.schemaname = 'public'
      and policy.tablename = 'order_delivery_events'
  loop
    execute format('drop policy %I on public.order_delivery_events', old_policy.policyname);
  end loop;
end;
$$;

create policy order_delivery_events_read_own_or_staff
  on public.order_delivery_events for select to authenticated
  using (
    (select public.has_permission('manage_orders'))
    or exists (
      select 1
      from public.orders as customer_order
      join public.customers as customer on customer.id = customer_order.customer_id
      where customer_order.id = order_delivery_events.order_id
        and customer.auth_user_id = (select auth.uid())
    )
  );

create table if not exists public.delivery_settings (
  singleton boolean primary key default true check (singleton),
  flat_fee numeric not null
    check (flat_fee >= 0 and flat_fee < 1000000000 and scale(flat_fee) <= 2),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.delivery_settings enable row level security;
revoke all on public.delivery_settings from anon, authenticated;
grant select on public.delivery_settings to authenticated;
drop policy if exists delivery_settings_read_authenticated on public.delivery_settings;
create policy delivery_settings_read_authenticated
  on public.delivery_settings for select to authenticated
  using (true);

create or replace function public.set_delivery_rate(p_flat_fee numeric)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or not public.has_permission('manage_delivery_rate') then
    raise exception 'You are not authorized to change store settings.'
      using errcode = '42501';
  end if;
  if p_flat_fee is null or p_flat_fee < 0
    or p_flat_fee >= 1000000000 or scale(p_flat_fee) > 2 then
    raise exception 'Delivery rate must be non-negative with at most two decimals.'
      using errcode = '22023';
  end if;

  insert into public.delivery_settings(singleton, flat_fee, updated_by)
  values (true, p_flat_fee, actor)
  on conflict (singleton) do update
    set flat_fee = excluded.flat_fee,
        updated_by = excluded.updated_by,
        updated_at = now();

  return p_flat_fee;
end;
$$;
revoke all on function public.set_delivery_rate(numeric) from public, anon;
grant execute on function public.set_delivery_rate(numeric) to authenticated;

comment on table public.delivery_settings is
  'Single staff-managed flat delivery rate used for new customer delivery orders.';

insert into public.permissions(permission_key, description)
values ('manage_delivery_rate', 'Set the customer delivery rate.')
on conflict (permission_key) do nothing;

insert into public.role_permissions(role, permission_key)
values
  ('admin', 'manage_delivery_rate'),
  ('manager', 'manage_delivery_rate')
on conflict (role, permission_key) do nothing;

drop function if exists public.submit_customer_delivery_order(uuid, jsonb, text, text, text);
create or replace function public.submit_customer_delivery_order(
  p_client_operation_id uuid,
  p_items jsonb,
  p_delivery_address text,
  p_delivery_area text,
  p_expected_delivery_fee numeric,
  p_delivery_instructions text default null
)
returns table (
  order_id uuid,
  order_number text,
  status public.order_status,
  subtotal numeric,
  total numeric,
  reservation_expires_at timestamptz,
  placed_at timestamptz,
  delivery_stage public.delivery_stage,
  delivery_fee numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  customer_key uuid;
  prior_order public.orders%rowtype;
  created_order record;
  clean_address text := nullif(btrim(p_delivery_address), '');
  clean_area text := nullif(btrim(p_delivery_area), '');
  clean_instructions text := nullif(btrim(p_delivery_instructions), '');
  configured_delivery_fee numeric;
begin
  if actor is null then
    raise exception 'Sign in with a customer account to place a delivery order.'
      using errcode = '42501';
  end if;
  select customer.id into customer_key
  from public.customers as customer
  where customer.auth_user_id = actor and customer.status = 'active';
  if customer_key is null then
    raise exception 'An active customer profile is required to place an order.'
      using errcode = '42501';
  end if;
  if p_client_operation_id is null then
    raise exception 'A checkout operation ID is required.' using errcode = '22023';
  end if;
  perform public.expire_customer_order_reservations();
  if clean_address is null or length(clean_address) > 250
    or clean_area is null or length(clean_area) > 120
    or length(coalesce(clean_instructions, '')) > 500 then
    raise exception 'Enter a valid delivery address, area, and optional instructions.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(customer_key::text || ':' || p_client_operation_id::text, 0)
  );

  select customer_order.* into prior_order
  from public.orders as customer_order
  where customer_order.client_operation_id = p_client_operation_id
  for update;
  if found then
    if prior_order.customer_id <> customer_key
      or prior_order.fulfillment_method <> 'delivery'
      or prior_order.delivery_address is distinct from clean_address
      or prior_order.delivery_area is distinct from clean_area
      or prior_order.delivery_instructions is distinct from clean_instructions then
      raise exception 'This checkout request was already used for a different order.'
        using errcode = '23505';
    end if;
    return query select prior_order.id, prior_order.order_number, prior_order.status,
      prior_order.subtotal, prior_order.total, prior_order.reservation_expires_at,
      prior_order.placed_at, prior_order.delivery_stage, prior_order.delivery_fee;
    return;
  end if;

  select setting.flat_fee into configured_delivery_fee
  from public.delivery_settings as setting
  where setting.singleton
  for share;
  if not found then
    raise exception 'The store has not configured a delivery rate yet.'
      using errcode = '55000';
  end if;
  if p_expected_delivery_fee is null
    or p_expected_delivery_fee is distinct from configured_delivery_fee then
    raise exception 'The store delivery rate changed. Refresh checkout to review the new total.'
      using errcode = '40001';
  end if;

  select * into created_order
  from public.submit_customer_order(p_client_operation_id, p_items);
  if created_order.order_id is null then
    raise exception 'The reservation service did not return an order.'
      using errcode = 'P0001';
  end if;

  update public.orders as customer_order
  set fulfillment_method = 'delivery',
      delivery_address = clean_address,
      delivery_area = clean_area,
      delivery_instructions = clean_instructions,
      delivery_fee = configured_delivery_fee,
      delivery_fee_accepted_at = now(),
      total = customer_order.subtotal + configured_delivery_fee,
      status = 'confirmed',
      reservation_expires_at = greatest(
        customer_order.reservation_expires_at, now() + interval '24 hours'
      ),
      delivery_stage = 'confirmed',
      delivery_tracking_reference = null,
      delivery_estimated_at = null,
      delivery_updated_at = now()
  where customer_order.id = created_order.order_id
    and customer_order.customer_id = customer_key
    and customer_order.status in ('pending', 'confirmed');
  if not found then
    raise exception 'The order is no longer available for delivery.'
      using errcode = 'P0002';
  end if;

  update public.inventory_reservations as reservation
  set expires_at = greatest(reservation.expires_at, now() + interval '24 hours')
  where reservation.order_id = created_order.order_id
    and reservation.status = 'active';

  insert into public.order_delivery_events(
    order_id, stage, message, actor_user_id, idempotency_key
  ) values (
    created_order.order_id,
    'confirmed',
    'Delivery placed at the store flat rate of GHS '
      || to_char(configured_delivery_fee, 'FM999999990.00')
      || '. Cash is due when the order arrives.',
    actor,
    'order_created'
  ) on conflict on constraint order_delivery_events_order_id_idempotency_key_key
    do nothing;

  return query
  select customer_order.id, customer_order.order_number, customer_order.status,
    customer_order.subtotal, customer_order.total,
    customer_order.reservation_expires_at, customer_order.placed_at,
    customer_order.delivery_stage, customer_order.delivery_fee
  from public.orders as customer_order
  where customer_order.id = created_order.order_id;
end;
$$;

revoke all on function public.submit_customer_delivery_order(
  uuid, jsonb, text, text, numeric, text
) from public, anon;
grant execute on function public.submit_customer_delivery_order(
  uuid, jsonb, text, text, numeric, text
) to authenticated;

drop function if exists public.quote_customer_delivery_fee(uuid, numeric);
drop function if exists public.accept_customer_delivery_quote(uuid);
drop function if exists public.decline_customer_delivery_quote(uuid);

create or replace function public.advance_customer_delivery(
  p_order_id uuid,
  p_next_stage public.delivery_stage,
  p_tracking_reference text default null,
  p_estimated_at timestamptz default null
)
returns public.delivery_stage
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  customer_order public.orders%rowtype;
  clean_reference text := nullif(btrim(p_tracking_reference), '');
  event_message text;
begin
  if actor is null or not public.has_permission('manage_orders') then
    raise exception 'You are not authorized to manage customer deliveries.'
      using errcode = '42501';
  end if;
  if p_next_stage not in ('preparing', 'packed', 'out_for_delivery') then
    raise exception 'Choose a valid next delivery step.' using errcode = '22023';
  end if;
  if length(coalesce(clean_reference, '')) > 120
    or (p_estimated_at is not null and p_estimated_at <= now()) then
    raise exception 'Tracking reference or estimated delivery time is invalid.'
      using errcode = '22023';
  end if;

  select * into customer_order
  from public.orders as stored_order
  where stored_order.id = p_order_id
  for update;
  if not found or customer_order.fulfillment_method <> 'delivery'
    or customer_order.delivery_fee_accepted_at is null
    or customer_order.reservation_expires_at <= now() then
    raise exception 'The delivery fee must be accepted and the reservation current.'
      using errcode = 'P0002';
  end if;

  if customer_order.delivery_stage = 'confirmed' and p_next_stage = 'preparing' then
    update public.orders set status = 'preparing' where id = p_order_id;
    event_message := 'Your order is being prepared.';
  elsif customer_order.delivery_stage = 'preparing' and p_next_stage = 'packed' then
    perform public.mark_order_ready(p_order_id);
    event_message := 'Your order has been packed and is ready for dispatch.';
  elsif customer_order.delivery_stage = 'packed' and p_next_stage = 'out_for_delivery' then
    if customer_order.delivery_fee is null or customer_order.status <> 'ready' then
      raise exception 'The delivery fee and packed order must be confirmed before dispatch.'
        using errcode = 'P0002';
    end if;
    update public.orders
    set delivery_tracking_reference = clean_reference,
        delivery_estimated_at = p_estimated_at,
        reservation_expires_at = 'infinity'::timestamptz
    where id = p_order_id;
    -- Keep the stock reserved while it is physically with the delivery team.
    update public.inventory_reservations
    set expires_at = 'infinity'::timestamptz
    where order_id = p_order_id and status = 'active';
    event_message := 'Your order is out for delivery.';
  else
    raise exception 'This delivery cannot move to the selected step.' using errcode = 'P0002';
  end if;

  update public.orders
  set delivery_stage = p_next_stage, delivery_updated_at = now()
  where id = p_order_id;

  insert into public.order_delivery_events(
    order_id, stage, message, actor_user_id, idempotency_key
  ) values (
    p_order_id, p_next_stage, event_message, actor, p_next_stage::text
  ) on conflict (order_id, idempotency_key) do nothing;
  return p_next_stage;
end;
$$;

revoke all on function public.advance_customer_delivery(uuid, public.delivery_stage, text, timestamptz)
  from public, anon;
grant execute on function public.advance_customer_delivery(uuid, public.delivery_stage, text, timestamptz)
  to authenticated;

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
  final_total numeric;
begin
  if actor is null or not public.has_permission('manage_orders')
    or not public.has_permission('complete_sale') then
    raise exception 'You are not authorized to complete a delivery.'
      using errcode = '42501';
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
    p_order_id,
    customer_order.id,
    'cash'::public.payment_method,
    null::text,
    customer_order.delivery_fee
  );
  if fulfillment.sale_id is null then
    raise exception 'The delivery payment could not be recorded.' using errcode = 'P0001';
  end if;

  final_total := fulfillment.total;

  if customer_order.delivery_stage <> 'delivered' then
    update public.orders
    set delivery_stage = 'delivered', delivery_updated_at = now()
    where id = p_order_id;

    insert into public.order_delivery_events(
      order_id, stage, message, actor_user_id, idempotency_key
    ) values (
      p_order_id, 'delivered', 'Delivered. Cash on delivery was recorded by store staff.',
      actor, 'delivered'
    ) on conflict (order_id, idempotency_key) do nothing;
  end if;

  return query select fulfillment.sale_id, fulfillment.receipt_number,
    customer_order.subtotal, final_total, 'cash'::public.payment_method;
end;
$$;

revoke all on function public.complete_customer_delivery(uuid) from public, anon;
grant execute on function public.complete_customer_delivery(uuid) to authenticated;
