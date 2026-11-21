-- Avoid a PL/pgSQL name collision between the returned order_id field and the
-- order_delivery_events unique key when a delivery is first submitted.
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
