create or replace function public.confirm_paystack_order_payment(
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

  update public.inventory_reservations as reservation
  set expires_at = 'infinity'::timestamptz
  where reservation.order_id = customer_order.id
    and reservation.status = 'active';

  insert into public.payments(
    customer_id, order_id, method, amount, status, provider, provider_reference
  ) values (
    null, customer_order.id, 'paystack', customer_order.total,
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
