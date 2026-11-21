-- Durable offline POS submissions, idempotent sync, and manager conflict review.

create table public.offline_pos_operations (
  id uuid primary key default gen_random_uuid(),
  cashier_user_id uuid not null references auth.users (id) on delete restrict,
  cashier_name_snapshot text not null check (length(btrim(cashier_name_snapshot)) between 2 and 120),
  client_operation_id uuid not null,
  occurred_at timestamptz not null,
  items_snapshot jsonb not null check (
    jsonb_typeof(items_snapshot) = 'array'
      and jsonb_array_length(items_snapshot) between 1 and 100
  ),
  status text not null default 'syncing'
    check (status in ('syncing', 'synced', 'pending_review', 'accepted', 'voided')),
  conflict_reasons jsonb not null default '[]'::jsonb
    check (jsonb_typeof(conflict_reasons) = 'array'),
  sale_id uuid references public.sales (id) on delete restrict,
  reviewed_by uuid references auth.users (id) on delete set null,
  review_note text check (review_note is null or length(btrim(review_note)) between 3 and 1000),
  created_at timestamptz not null default now(),
  synced_at timestamptz,
  resolved_at timestamptz,
  unique (cashier_user_id, client_operation_id),
  check ((status in ('synced', 'accepted')) = (sale_id is not null)),
  check ((status in ('accepted', 'voided')) = (resolved_at is not null))
);

create index offline_pos_operations_review_idx
  on public.offline_pos_operations (created_at desc)
  where status = 'pending_review';
create index offline_pos_operations_cashier_idx
  on public.offline_pos_operations (cashier_user_id, created_at desc);

alter table public.offline_pos_operations enable row level security;
revoke all on public.offline_pos_operations from anon, authenticated;
grant select on public.offline_pos_operations to authenticated;
create policy offline_pos_operations_read_own_or_review
  on public.offline_pos_operations for select to authenticated
  using (
    cashier_user_id = (select auth.uid())
    or (select public.has_permission('resolve_conflicts'))
  );

create function public.get_offline_pos_catalog()
returns table (
  id uuid,
  name text,
  sku text,
  barcode text,
  selling_price numeric,
  available_stock numeric,
  reorder_level numeric,
  updated_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission('complete_sale') then
    raise exception 'You are not authorized to prepare the POS.' using errcode = '42501';
  end if;

  return query
  select product.id,
    product.name,
    product.sku,
    product.barcode,
    product.selling_price,
    greatest(coalesce(balance.quantity, 0) - coalesce(reserved.quantity, 0), 0),
    product.reorder_level,
    product.updated_at
  from public.products as product
  left join public.inventory_balances as balance on balance.product_id = product.id
  left join lateral (
    select sum(reservation.quantity) as quantity
    from public.inventory_reservations as reservation
    where reservation.product_id = product.id
      and reservation.status = 'active'
      and reservation.expires_at > now()
  ) as reserved on true
  where product.is_active
  order by product.name, product.id;
end;
$$;
revoke all on function public.get_offline_pos_catalog() from public, anon;
grant execute on function public.get_offline_pos_catalog() to authenticated;

-- Shared posting routine. The caller has already authorized the cashier or reviewer.
create function public.post_offline_pos_operation(
  p_operation_id uuid,
  p_inventory_actor_id uuid,
  p_inventory_actor_name text
)
returns table (sale_id uuid, receipt_number text)
language plpgsql security definer set search_path = '' as $$
declare
  operation public.offline_pos_operations%rowtype;
  prior_sale public.sales%rowtype;
  item record;
  stock_quantity numeric;
  reserved_quantity numeric;
  subtotal_value numeric := 0;
  sale_key uuid := gen_random_uuid();
  receipt_key text;
  payment_key uuid := gen_random_uuid();
begin
  select * into operation from public.offline_pos_operations as stored
  where stored.id = p_operation_id for update;
  if not found or operation.status not in ('syncing', 'pending_review') then
    raise exception 'Offline sale is not ready to be recorded.' using errcode = 'P0002';
  end if;

  select * into prior_sale from public.sales as sale
  where sale.cashier_user_id = operation.cashier_user_id
    and sale.client_operation_id = operation.client_operation_id;
  if found then
    return query select prior_sale.id, prior_sale.receipt_number;
    return;
  end if;

  if p_inventory_actor_id is null or p_inventory_actor_name is null
    or length(btrim(p_inventory_actor_name)) not between 2 and 120 then
    raise exception 'An active staff actor is required to record this sale.' using errcode = '42501';
  end if;

  perform product.id
  from public.products as product
  join (
    select distinct entry.product_id
    from jsonb_to_recordset(operation.items_snapshot) as entry(product_id uuid)
  ) as cart on cart.product_id = product.id
  order by product.id
  for update of product;
  perform balance.product_id
  from public.inventory_balances as balance
  join (
    select distinct entry.product_id
    from jsonb_to_recordset(operation.items_snapshot) as entry(product_id uuid)
  ) as cart on cart.product_id = balance.product_id
  order by balance.product_id
  for update of balance;

  for item in
    select entry.product_id, entry.quantity, entry.line_total
    from jsonb_to_recordset(operation.items_snapshot) as entry(
      product_id uuid, quantity numeric, line_total numeric
    )
    order by entry.product_id
  loop
    select balance.quantity into stock_quantity
    from public.inventory_balances as balance
    where balance.product_id = item.product_id;
    select coalesce(sum(reservation.quantity), 0) into reserved_quantity
    from public.inventory_reservations as reservation
    where reservation.product_id = item.product_id
      and reservation.status = 'active'
      and reservation.expires_at > now();
    if stock_quantity is null or stock_quantity - reserved_quantity < item.quantity then
      raise exception 'Reconcile stock or active reservations before recording this sale.'
        using errcode = '23514';
    end if;
    subtotal_value := subtotal_value + item.line_total;
  end loop;
  subtotal_value := round(subtotal_value, 2);
  if subtotal_value <= 0 then
    raise exception 'The offline sale total must be greater than zero.' using errcode = '22023';
  end if;

  receipt_key := 'GP-' || to_char(operation.occurred_at at time zone 'Africa/Accra', 'YYMMDD')
    || '-' || upper(substr(replace(operation.client_operation_id::text, '-', ''), 1, 16));
  insert into public.sales (
    id, receipt_number, customer_id, cashier_user_id, channel, status,
    subtotal, total, client_operation_id, occurred_at
  ) values (
    sale_key, receipt_key, null, operation.cashier_user_id, 'pos', 'completed',
    subtotal_value, subtotal_value, operation.client_operation_id, operation.occurred_at
  );

  for item in
    select entry.product_id, entry.product_name_snapshot, entry.sku_snapshot,
      entry.unit_price, entry.quantity, entry.line_total
    from jsonb_to_recordset(operation.items_snapshot) as entry(
      product_id uuid,
      product_name_snapshot text,
      sku_snapshot text,
      unit_price numeric,
      quantity numeric,
      line_total numeric
    )
    order by entry.product_id
  loop
    insert into public.sale_items (
      sale_id, product_id, product_name_snapshot, sku_snapshot,
      unit_price, quantity, line_total
    ) values (
      sale_key, item.product_id, item.product_name_snapshot, item.sku_snapshot,
      item.unit_price, item.quantity, item.line_total
    );
    insert into public.stock_movements (
      product_id, movement_type, quantity_delta, reference_type,
      reference_id, actor_user_id, actor_name, client_operation_id, occurred_at
    ) values (
      item.product_id, 'sale', -item.quantity, 'sale', sale_key,
      p_inventory_actor_id, p_inventory_actor_name, gen_random_uuid(), operation.occurred_at
    );
    update public.inventory_balances
    set quantity = quantity - item.quantity, updated_at = now()
    where product_id = item.product_id;
  end loop;

  insert into public.payments (
    id, sale_id, method, amount, status, client_operation_id,
    recorded_by, occurred_at
  ) values (
    payment_key, sale_key, 'cash', subtotal_value, 'recorded',
    operation.client_operation_id, operation.cashier_user_id, operation.occurred_at
  );

  return query select sale_key, receipt_key;
end;
$$;
revoke all on function public.post_offline_pos_operation(uuid, uuid, text) from public, anon, authenticated;

create function public.sync_offline_pos_sale(
  p_cashier_user_id uuid,
  p_client_operation_id uuid,
  p_occurred_at timestamptz,
  p_items jsonb
)
returns table (
  operation_status text,
  synced_sale_id uuid,
  synced_receipt_number text,
  conflicts jsonb
)
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  cashier uuid := p_cashier_user_id;
  actor_name text;
  cashier_name text;
  submitted_by_manager boolean := false;
  operation public.offline_pos_operations%rowtype;
  prior_sale public.sales%rowtype;
  product_row public.products%rowtype;
  posted record;
  item record;
  stock_quantity numeric;
  reserved_quantity numeric;
  conflicts_json jsonb := '[]'::jsonb;
  item_count integer;
  distinct_count integer;
begin
  if actor is null or cashier is null then
    raise exception 'A signed-in staff cashier is required to sync this sale.' using errcode = '42501';
  end if;
  select profile.full_name into actor_name
  from public.staff_profiles as profile
  where profile.user_id = actor and profile.is_active;
  if actor_name is null then
    raise exception 'An active staff profile is required to sync this sale.' using errcode = '42501';
  end if;
  if cashier = actor then
    if not public.has_permission('complete_sale') then
      raise exception 'You are not authorized to sync POS sales.' using errcode = '42501';
    end if;
    select profile.full_name into cashier_name
    from public.staff_profiles as profile
    where profile.user_id = cashier and profile.is_active
      and profile.role in ('admin', 'manager', 'cashier');
  else
    if not public.has_permission('resolve_conflicts') then
      raise exception 'Only an authorised manager can submit another cashier’s offline sale.'
        using errcode = '42501';
    end if;
    submitted_by_manager := true;
    select profile.full_name into cashier_name
    from public.staff_profiles as profile
    where profile.user_id = cashier;
  end if;
  if cashier_name is null then
    raise exception 'An active POS staff profile is required.' using errcode = '42501';
  end if;
  if p_client_operation_id is null or p_occurred_at is null
    or p_occurred_at > now() + interval '5 minutes'
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'The offline sale payload is invalid.' using errcode = '22023';
  end if;

  select count(*), count(distinct entry.product_id)
  into item_count, distinct_count
  from jsonb_to_recordset(p_items) as entry(
    product_id uuid,
    product_name_snapshot text,
    sku_snapshot text,
    unit_price numeric,
    quantity numeric,
    line_total numeric
  );
  if item_count not between 1 and 100 or distinct_count <> item_count
    or exists (
      select 1 from jsonb_to_recordset(p_items) as entry(
        product_id uuid,
        product_name_snapshot text,
        sku_snapshot text,
        unit_price numeric,
        quantity numeric,
        line_total numeric
      )
      where entry.product_id is null
        or entry.product_name_snapshot is null
        or length(btrim(entry.product_name_snapshot)) not between 1 and 160
        or entry.quantity is null or entry.quantity <= 0
        or entry.quantity >= 1000000000 or scale(entry.quantity) > 3
        or entry.unit_price is null or entry.unit_price < 0
        or entry.unit_price >= 10000000000 or scale(entry.unit_price) > 2
        or entry.line_total is null or entry.line_total < 0
        or entry.line_total >= 1000000000000 or scale(entry.line_total) > 2
        or entry.line_total <> round(entry.unit_price * entry.quantity, 2)
    ) then
    raise exception 'The offline sale items are invalid.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(cashier::text || ':' || p_client_operation_id::text, 0)
  );
  select * into operation from public.offline_pos_operations as stored
  where stored.cashier_user_id = cashier
    and stored.client_operation_id = p_client_operation_id
  for update;
  if found then
    return query
    select operation.status, operation.sale_id, sale.receipt_number,
      operation.conflict_reasons
    from (select 1) as singleton
    left join public.sales as sale on sale.id = operation.sale_id;
    return;
  end if;

  select * into prior_sale from public.sales as sale
  where sale.cashier_user_id = cashier
    and sale.client_operation_id = p_client_operation_id;
  if found then
    insert into public.offline_pos_operations (
      cashier_user_id, cashier_name_snapshot, client_operation_id,
      occurred_at, items_snapshot, status, sale_id, synced_at
    ) values (
      cashier, cashier_name, p_client_operation_id, p_occurred_at,
      p_items, 'synced', prior_sale.id, now()
    );
    return query select 'synced', prior_sale.id, prior_sale.receipt_number, '[]'::jsonb;
    return;
  end if;

  insert into public.offline_pos_operations (
    cashier_user_id, cashier_name_snapshot, client_operation_id,
    occurred_at, items_snapshot, status
  ) values (
    cashier, cashier_name, p_client_operation_id, p_occurred_at,
    p_items, 'syncing'
  ) returning * into operation;

  if submitted_by_manager then
    conflicts_json := jsonb_build_array(jsonb_build_object(
      'code', 'manager_submitted_for_cashier',
      'message', 'A manager submitted this offline sale for cashier review.'
    ));
    update public.offline_pos_operations
    set status = 'pending_review', conflict_reasons = conflicts_json, synced_at = now()
    where id = operation.id;
    return query select 'pending_review', null::uuid, null::text, conflicts_json;
    return;
  end if;

  -- Lock products and balances in the same order as online sales and reservations.
  perform product.id
  from public.products as product
  join (
    select distinct entry.product_id
    from jsonb_to_recordset(p_items) as entry(product_id uuid)
  ) as cart on cart.product_id = product.id
  order by product.id
  for update of product;
  perform balance.product_id
  from public.inventory_balances as balance
  join (
    select distinct entry.product_id
    from jsonb_to_recordset(p_items) as entry(product_id uuid)
  ) as cart on cart.product_id = balance.product_id
  order by balance.product_id
  for update of balance;

  for item in
    select entry.product_id, entry.product_name_snapshot, entry.sku_snapshot,
      entry.unit_price, entry.quantity
    from jsonb_to_recordset(p_items) as entry(
      product_id uuid,
      product_name_snapshot text,
      sku_snapshot text,
      unit_price numeric,
      quantity numeric,
      line_total numeric
    )
    order by entry.product_id
  loop
    select * into product_row from public.products as product
    where product.id = item.product_id;
    if not found or not product_row.is_active then
      conflicts_json := conflicts_json || jsonb_build_array(jsonb_build_object(
        'code', 'product_unavailable',
        'message', 'The product is no longer active.',
        'productName', item.product_name_snapshot
      ));
      continue;
    end if;

    if product_row.selling_price <> item.unit_price
      or product_row.name <> item.product_name_snapshot
      or product_row.sku is distinct from item.sku_snapshot then
      conflicts_json := conflicts_json || jsonb_build_array(jsonb_build_object(
        'code', 'catalog_changed',
        'message', 'The current product details differ from the offline snapshot.',
        'productName', item.product_name_snapshot
      ));
    end if;

    select balance.quantity into stock_quantity
    from public.inventory_balances as balance
    where balance.product_id = item.product_id;
    select coalesce(sum(reservation.quantity), 0) into reserved_quantity
    from public.inventory_reservations as reservation
    where reservation.product_id = item.product_id
      and reservation.status = 'active'
      and reservation.expires_at > now();
    if stock_quantity is null or stock_quantity - reserved_quantity < item.quantity then
      conflicts_json := conflicts_json || jsonb_build_array(jsonb_build_object(
        'code', case
          when reserved_quantity > 0 then 'stock_reserved_or_insufficient'
          else 'insufficient_stock'
        end,
        'message', case
          when reserved_quantity > 0 then 'Available stock is insufficient after active reservations.'
          else 'Current stock is lower than the quantity recorded offline.'
        end,
        'productName', item.product_name_snapshot
      ));
    end if;
  end loop;

  if jsonb_array_length(conflicts_json) > 0 then
    update public.offline_pos_operations
    set status = 'pending_review', conflict_reasons = conflicts_json, synced_at = now()
    where id = operation.id;
    return query select 'pending_review', null::uuid, null::text, conflicts_json;
    return;
  end if;

  begin
    select * into posted
    from public.post_offline_pos_operation(operation.id, actor, actor_name);
  exception
    when check_violation or no_data_found then
      conflicts_json := jsonb_build_array(jsonb_build_object(
        'code', 'inventory_changed_during_sync',
        'message', 'Stock or a reservation changed while this sale was syncing.'
      ));
      update public.offline_pos_operations
      set status = 'pending_review', conflict_reasons = conflicts_json, synced_at = now()
      where id = operation.id;
      return query select 'pending_review', null::uuid, null::text, conflicts_json;
      return;
  end;

  update public.offline_pos_operations
  set status = 'synced', sale_id = posted.sale_id,
    conflict_reasons = '[]'::jsonb, synced_at = now()
  where id = operation.id;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
  values (actor, 'sale.completed', 'sale', posted.sale_id,
    jsonb_build_object('source', 'offline_pos', 'client_operation_id', p_client_operation_id));
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
  select actor, 'payment.recorded', 'payment', payment.id,
    jsonb_build_object(
      'sale_id', posted.sale_id,
      'method', payment.method,
      'amount', payment.amount,
      'source', 'offline_pos'
    )
  from public.payments as payment
  where payment.sale_id = posted.sale_id;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
  values (actor, 'offline_sale.synced', 'offline_pos_operation', operation.id,
    jsonb_build_object(
      'client_operation_id', p_client_operation_id,
      'sale_id', posted.sale_id,
      'occurred_at', p_occurred_at
    ));

  return query select 'synced', posted.sale_id, posted.receipt_number, '[]'::jsonb;
end;
$$;
revoke all on function public.sync_offline_pos_sale(uuid, uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.sync_offline_pos_sale(uuid, uuid, timestamptz, jsonb) to authenticated;

create function public.resolve_offline_pos_operation(
  p_operation_id uuid,
  p_resolution text,
  p_note text
)
returns table (
  operation_status text,
  resolved_sale_id uuid,
  resolved_receipt_number text
)
language plpgsql security definer set search_path = '' as $$
declare
  reviewer uuid := (select auth.uid());
  reviewer_name text;
  operation public.offline_pos_operations%rowtype;
  product_row public.products%rowtype;
  item record;
  sale_key uuid;
  receipt_key text;
  payment_key uuid := gen_random_uuid();
  subtotal_value numeric := 0;
  stock_quantity numeric;
  reserved_quantity numeric;
begin
  if reviewer is null or not public.has_permission('resolve_conflicts') then
    raise exception 'You are not authorized to resolve offline sale conflicts.' using errcode = '42501';
  end if;
  select profile.full_name into reviewer_name
  from public.staff_profiles as profile
  where profile.user_id = reviewer and profile.is_active;
  if reviewer_name is null then
    raise exception 'An active manager account is required.' using errcode = '42501';
  end if;
  if p_operation_id is null or p_resolution is null
    or p_resolution not in ('accept', 'void')
    or p_note is null or length(btrim(p_note)) not between 3 and 1000 then
    raise exception 'Choose a resolution and enter a review note.' using errcode = '22023';
  end if;

  select * into operation from public.offline_pos_operations as stored
  where stored.id = p_operation_id
  for update;
  if not found then
    raise exception 'Offline sale was not found.' using errcode = 'P0002';
  end if;
  if operation.status in ('accepted', 'voided') then
    return query
    select operation.status, operation.sale_id, sale.receipt_number
    from (select 1) as singleton
    left join public.sales as sale on sale.id = operation.sale_id;
    return;
  end if;
  if operation.status <> 'pending_review' then
    raise exception 'Only pending conflicts can be resolved.' using errcode = '22023';
  end if;

  if p_resolution = 'void' then
    update public.offline_pos_operations
    set status = 'voided', reviewed_by = reviewer, review_note = btrim(p_note),
      resolved_at = now()
    where id = operation.id;
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
    values (reviewer, 'offline_sale.voided', 'offline_pos_operation', operation.id,
      jsonb_build_object('client_operation_id', operation.client_operation_id,
        'cashier_user_id', operation.cashier_user_id, 'note', btrim(p_note)));
    return query select 'voided', null::uuid, null::text;
    return;
  end if;

  perform product.id
  from public.products as product
  join (
    select distinct entry.product_id
    from jsonb_to_recordset(operation.items_snapshot) as entry(product_id uuid)
  ) as cart on cart.product_id = product.id
  order by product.id
  for update of product;
  perform balance.product_id
  from public.inventory_balances as balance
  join (
    select distinct entry.product_id
    from jsonb_to_recordset(operation.items_snapshot) as entry(product_id uuid)
  ) as cart on cart.product_id = balance.product_id
  order by balance.product_id
  for update of balance;

  for item in
    select entry.product_id, entry.product_name_snapshot, entry.sku_snapshot,
      entry.unit_price, entry.quantity, entry.line_total
    from jsonb_to_recordset(operation.items_snapshot) as entry(
      product_id uuid,
      product_name_snapshot text,
      sku_snapshot text,
      unit_price numeric,
      quantity numeric,
      line_total numeric
    )
    order by entry.product_id
  loop
    select * into product_row
    from public.products as product
    where product.id = item.product_id
    for update;
    if not found or not product_row.is_active then
      raise exception 'Reconcile the catalogue: an offline sale product is no longer active.'
        using errcode = '23514';
    end if;

    select balance.quantity into stock_quantity
    from public.inventory_balances as balance
    where balance.product_id = item.product_id;
    select coalesce(sum(reservation.quantity), 0) into reserved_quantity
    from public.inventory_reservations as reservation
    where reservation.product_id = item.product_id
      and reservation.status = 'active'
      and reservation.expires_at > now();
    if stock_quantity is null or stock_quantity - reserved_quantity < item.quantity then
      raise exception 'Reconcile stock or active reservations before accepting this sale.'
        using errcode = '23514';
    end if;
    subtotal_value := subtotal_value + item.line_total;
  end loop;
  subtotal_value := round(subtotal_value, 2);
  if subtotal_value <= 0 then
    raise exception 'The offline sale total must be greater than zero.' using errcode = '22023';
  end if;

  sale_key := gen_random_uuid();
  receipt_key := 'GP-' || to_char(operation.occurred_at at time zone 'Africa/Accra', 'YYMMDD')
    || '-' || upper(substr(replace(operation.client_operation_id::text, '-', ''), 1, 16));
  insert into public.sales (
    id, receipt_number, customer_id, cashier_user_id, channel, status,
    subtotal, total, client_operation_id, occurred_at
  ) values (
    sale_key, receipt_key, null, operation.cashier_user_id, 'pos', 'completed',
    subtotal_value, subtotal_value, operation.client_operation_id, operation.occurred_at
  );

  for item in
    select entry.product_id, entry.product_name_snapshot, entry.sku_snapshot,
      entry.unit_price, entry.quantity, entry.line_total
    from jsonb_to_recordset(operation.items_snapshot) as entry(
      product_id uuid,
      product_name_snapshot text,
      sku_snapshot text,
      unit_price numeric,
      quantity numeric,
      line_total numeric
    )
    order by entry.product_id
  loop
    insert into public.sale_items (
      sale_id, product_id, product_name_snapshot, sku_snapshot,
      unit_price, quantity, line_total
    ) values (
      sale_key, item.product_id, item.product_name_snapshot, item.sku_snapshot,
      item.unit_price, item.quantity, item.line_total
    );
    insert into public.stock_movements (
      product_id, movement_type, quantity_delta, reference_type,
      reference_id, actor_user_id, actor_name, client_operation_id, occurred_at
    ) values (
      item.product_id, 'sale', -item.quantity, 'sale', sale_key,
      reviewer, reviewer_name, gen_random_uuid(), operation.occurred_at
    );
    update public.inventory_balances
    set quantity = quantity - item.quantity, updated_at = now()
    where product_id = item.product_id;
  end loop;

  insert into public.payments (
    id, sale_id, method, amount, status, client_operation_id,
    recorded_by, occurred_at
  ) values (
    payment_key, sale_key, 'cash', subtotal_value, 'recorded',
    operation.client_operation_id, operation.cashier_user_id, operation.occurred_at
  );
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
  values (reviewer, 'sale.completed', 'sale', sale_key,
    jsonb_build_object(
      'source', 'offline_pos_review',
      'client_operation_id', operation.client_operation_id,
      'cashier_user_id', operation.cashier_user_id
    ));
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
  values (reviewer, 'payment.recorded', 'payment', payment_key,
    jsonb_build_object(
      'sale_id', sale_key,
      'method', 'cash',
      'amount', subtotal_value,
      'source', 'offline_pos_review'
    ));
  update public.offline_pos_operations
  set status = 'accepted', sale_id = sale_key, reviewed_by = reviewer,
    review_note = btrim(p_note), resolved_at = now()
  where id = operation.id;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
  values (reviewer, 'offline_sale.accepted', 'offline_pos_operation', operation.id,
    jsonb_build_object(
      'client_operation_id', operation.client_operation_id,
      'sale_id', sale_key,
      'cashier_user_id', operation.cashier_user_id,
      'note', btrim(p_note)
    ));

  return query select 'accepted', sale_key, receipt_key;
end;
$$;
revoke all on function public.resolve_offline_pos_operation(uuid, text, text) from public, anon;
grant execute on function public.resolve_offline_pos_operation(uuid, text, text) to authenticated;

alter table public.audit_logs drop constraint audit_logs_action_check;
alter table public.audit_logs add constraint audit_logs_action_check check (action in (
  'category.created', 'category.updated', 'category.deactivated',
  'product.created', 'product.updated', 'product.deactivated',
  'product.selling_price_changed',
  'inventory.opening_stock', 'inventory.receipt', 'inventory.wastage',
  'inventory.damage', 'inventory.adjustment_in', 'inventory.adjustment_out',
  'customer.created', 'customer.updated', 'sale.completed', 'payment.recorded',
  'credit.account_enabled', 'credit.limit_changed', 'credit.status_changed',
  'credit.sale_completed', 'credit.repayment_recorded',
  'offline_sale.synced', 'offline_sale.accepted', 'offline_sale.voided'
));
alter table public.audit_logs drop constraint audit_logs_entity_type_check;
alter table public.audit_logs add constraint audit_logs_entity_type_check
  check (entity_type in (
    'category', 'product', 'stock_movement', 'customer', 'sale', 'payment',
    'credit_account', 'credit_transaction', 'offline_pos_operation'
  ));

comment on table public.offline_pos_operations is
  'Immutable snapshots of locally recorded cash POS operations and their idempotent sync/review state.';
