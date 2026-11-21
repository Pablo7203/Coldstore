-- Phase 7: authenticated offline synchronization, canonical idempotency and review.
create extension if not exists pgcrypto with schema extensions;
alter type public.sale_channel add value if not exists 'offline_pos';
create table public.offline_sync_snapshots (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  snapshot_data jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.offline_sync_snapshots enable row level security;
revoke all on public.offline_sync_snapshots from anon, authenticated;
create table public.processed_client_operations (
  id uuid primary key default gen_random_uuid(),
  client_operation_id uuid not null unique,
  operation_type text not null check (operation_type in ('pos_sale','credit_repayment')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  sync_initiated_by uuid not null references auth.users(id) on delete restrict,
  snapshot_id uuid not null references public.offline_sync_snapshots(id) on delete restrict,
  local_entity_id uuid,
  canonical_entity_type text,
  canonical_entity_id uuid,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('processing','applied','review_required','rejected')),
  result_summary jsonb,
  recovery_payload jsonb,
  first_received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create index processed_client_operations_actor_idx
  on public.processed_client_operations(actor_user_id, first_received_at desc);
alter table public.processed_client_operations enable row level security;
revoke all on public.processed_client_operations from anon, authenticated;
grant select on public.processed_client_operations to authenticated;
create policy processed_client_operations_read_owner_or_manager
  on public.processed_client_operations for select to authenticated
  using (actor_user_id = (select auth.uid()) or (select public.has_permission('resolve_conflicts')));
create table public.sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  processed_operation_id uuid not null references public.processed_client_operations(id) on delete restrict,
  client_operation_id uuid not null references public.processed_client_operations(client_operation_id) on delete restrict,
  conflict_type text not null check (conflict_type in (
    'stock_shortfall','reservation_shortfall','credit_limit_exceeded','credit_account_suspended',
    'customer_inactive','product_inactive','product_price_changed','actor_inactive',
    'repayment_exceeds_current_balance','credit_account_missing','snapshot_entity_missing'
  )),
  severity text not null check (severity in ('low','medium','high')),
  status text not null default 'open' check (status in ('open','resolved')),
  canonical_entity_type text,
  canonical_entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_by uuid references auth.users(id) on delete restrict,
  resolved_at timestamptz,
  resolution_note text,
  resolution_reference text,
  check ((status = 'resolved') = (resolved_by is not null and resolved_at is not null and resolution_note is not null and resolution_reference is not null))
);
create index sync_conflicts_status_detected_idx on public.sync_conflicts(status, detected_at desc);
alter table public.sync_conflicts enable row level security;
revoke all on public.sync_conflicts from anon, authenticated;
grant select on public.sync_conflicts to authenticated;
create policy sync_conflicts_read_authorized_staff on public.sync_conflicts
  for select to authenticated using ((select public.has_permission('resolve_conflicts')));
-- Preserve real offline events when stock reconciliation produces a negative physical balance.
-- Other mutation paths still reject negatives in their own RPCs.
alter table public.inventory_balances drop constraint inventory_balances_quantity_check;
alter table public.inventory_balances add constraint inventory_balances_quantity_check
  check (quantity > -1000000000 and quantity < 1000000000 and scale(quantity) <= 3);
alter table public.sales drop constraint sales_receipt_number_check;
alter table public.sales add constraint sales_receipt_number_check check (
  receipt_number ~ '^GP-[0-9]{6}-[0-9A-F]{16}([0-9A-F]{4})?$'
  or receipt_number ~ '^GP-LOCAL-[0-9]{6}-[0-9A-F]{16}$'
);
alter table public.audit_logs drop constraint audit_logs_action_check;
alter table public.audit_logs add constraint audit_logs_action_check check (action in (
  'category.created','category.updated','category.deactivated','product.created','product.updated',
  'product.deactivated','product.selling_price_changed','inventory.opening_stock','inventory.receipt',
  'inventory.wastage','inventory.damage','inventory.adjustment_in','inventory.adjustment_out',
  'customer.created','customer.updated','sale.completed','payment.recorded','credit.account_enabled',
  'credit.limit_changed','credit.status_changed','credit.sale_completed','credit.repayment_recorded',
  'order.submitted','order.cancelled','order.ready','order.fulfilled','order.expired',
  'reservation.consumed','reservation.released','reservation.expired','settings.reservation_expiry_changed',
  'sync.operation_applied','sync.operation_review_required','sync.operation_rejected',
  'sync.privileged_recovery','sync.conflict_created','sync.conflict_resolved'
));
alter table public.audit_logs drop constraint audit_logs_entity_type_check;
alter table public.audit_logs add constraint audit_logs_entity_type_check check (entity_type in (
  'category','product','stock_movement','customer','sale','payment','credit_account',
  'credit_transaction','order','reservation','business_settings','sync_operation','sync_conflict'
));
create or replace function public.guard_inventory_reservations()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  reserved numeric;
  operation_key uuid;
begin
  operation_key := nullif(current_setting('grandpa.offline_sync_operation_id', true), '')::uuid;
  if operation_key is not null and exists (
    select 1 from public.processed_client_operations operation
    where operation.client_operation_id = operation_key and operation.status = 'processing'
      and operation.sync_initiated_by = (select auth.uid())
  ) then
    return new;
  end if;
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
-- A new snapshot UUID binds the offline payload to server-generated reference data.
create function public.get_offline_pos_bootstrap_v7()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  data jsonb;
  snapshot_key uuid;
  actor uuid := (select auth.uid());
begin
  if actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  data := public.get_offline_pos_bootstrap();
  snapshot_key := gen_random_uuid();
  insert into public.offline_sync_snapshots(id, actor_user_id, snapshot_data)
  values (snapshot_key, actor, data);
  return data || jsonb_build_object('snapshot_id', snapshot_key);
end;
$$;
revoke all on function public.get_offline_pos_bootstrap_v7() from public, anon;
grant execute on function public.get_offline_pos_bootstrap_v7() to authenticated;
create function public.sync_offline_operation(p_operation jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  initiator uuid := (select auth.uid());
  actor uuid;
  op_id uuid;
  snap_id uuid;
  op_type text;
  op_payload jsonb;
  snapshot public.offline_sync_snapshots%rowtype;
  op_row public.processed_client_operations%rowtype;
  actor_row public.staff_profiles%rowtype;
  actor_name text;
  actor_active boolean;
  recovery boolean := false;
  canonical jsonb;
  payload_hash text;
  result jsonb;
  ledger_id uuid;
  sale_id uuid;
  payment_id uuid;
  credit_id uuid;
  item jsonb;
  snap_product jsonb;
  product_row public.products%rowtype;
  customer_row public.customers%rowtype;
  account_row public.credit_accounts%rowtype;
  qty numeric;
  unit_price numeric;
  line_total numeric;
  subtotal numeric := 0;
  current_stock numeric;
  reserved_qty numeric;
  sellable numeric;
  next_balance numeric;
  applied_amount numeric;
  excess_amount numeric;
  at_time timestamptz;
  receipt text;
  method public.payment_method;
  issues jsonb := '[]'::jsonb;
  conflict_id uuid;
  conflict_type text;
  conflict_details jsonb;
  local_id uuid;
  all_products_exist boolean := true;
  credit_snapshot jsonb;
  item_count integer;
  distinct_item_count integer;
  saved_conflicts jsonb := '[]'::jsonb;
  prior_quantity numeric;
  snapshot_quantity numeric;
  prior_credit_net numeric;
  snapshot_credit_amount numeric;
begin
  if initiator is null or jsonb_typeof(p_operation) <> 'object' then
    raise exception 'An authenticated operation is required.' using errcode = '42501';
  end if;
  begin
    op_id := (p_operation->>'clientOperationId')::uuid;
    actor := (p_operation->>'actorUserId')::uuid;
    snap_id := (p_operation->>'snapshotId')::uuid;
    op_type := p_operation->>'operationType';
    local_id := (p_operation->>'entityId')::uuid;
    at_time := (p_operation->>'createdAt')::timestamptz;
    op_payload := p_operation->'payload';
  exception when others then
    raise exception 'The operation envelope is invalid.' using errcode = '22023';
  end;
  if op_id is null or actor is null or snap_id is null or local_id is null
     or op_type not in ('pos_sale','credit_repayment') or op_payload is null then
    raise exception 'The operation envelope is invalid.' using errcode = '22023';
  end if;
  if at_time > now() + interval '15 minutes' then
    return jsonb_build_object('status','rejected','code','invalid_occurred_at','retryable',false);
  end if;

  select * into actor_row from public.staff_profiles where user_id = actor;
  actor_active := found and actor_row.is_active;
  select profile.full_name into actor_name from public.staff_profiles profile where profile.user_id = actor;
  recovery := actor <> initiator;
  if recovery then
    if not exists (select 1 from public.staff_profiles p where p.user_id = initiator and p.is_active and p.role in ('admin','manager'))
       or not public.has_permission('resolve_conflicts') then
      raise exception 'Only an active Manager or Admin may recover another staff member’s offline queue.' using errcode = '42501';
    end if;
  elsif not actor_active then
    raise exception 'An inactive actor requires Manager or Admin recovery synchronization.' using errcode = '42501';
  end if;
  if not recovery and not public.has_permission(case when op_type = 'pos_sale' then 'complete_sale' else 'record_credit_repayment' end) then
    raise exception 'Current staff permissions do not allow this synchronization.' using errcode = '42501';
  end if;

  select * into snapshot from public.offline_sync_snapshots where id = snap_id for share;
  if not found or snapshot.actor_user_id <> actor
     or snapshot.snapshot_data->>'actor_user_id' <> actor::text then
    return jsonb_build_object('status','rejected','code','invalid_snapshot','retryable',false);
  end if;
  if (snapshot.snapshot_data->>'generated_at')::timestamptz > at_time then
    return jsonb_build_object('status','rejected','code','operation_predates_snapshot','retryable',false);
  end if;

  -- Canonical JSON has a fixed field set, sorted product IDs and normalized numeric text.
  if op_type = 'pos_sale' then
    if jsonb_typeof(op_payload->'sale') <> 'object' or jsonb_typeof(op_payload->'items') <> 'array'
       or jsonb_array_length(op_payload->'items') not between 1 and 100 then
      raise exception 'The sale payload is invalid.' using errcode = '22023';
    end if;
    select count(*), count(distinct entry->>'productId') into item_count, distinct_item_count
      from jsonb_array_elements(op_payload->'items') entry;
    if item_count < 1 or item_count > 100 or item_count <> distinct_item_count then raise exception 'The sale items are invalid.' using errcode = '22023'; end if;
    receipt := op_payload->'sale'->>'receiptNumber';
    if receipt !~ ('^GP-LOCAL-[0-9]{6}-' || upper(substr(replace(op_id::text,'-',''),1,16)) || '$') then
      return jsonb_build_object('status','rejected','code','invalid_receipt','retryable',false);
    end if;
    method := (op_payload->'sale'->>'paymentMethod')::public.payment_method;
    canonical := jsonb_build_object(
      'operation_type',op_type,'client_operation_id',op_id,'actor_user_id',actor,
      'snapshot_id',snap_id,'created_at',at_time,
      'receipt_number',receipt,'customer_id',nullif(op_payload->'sale'->>'customerId','')::uuid,
      'payment_method',method,
      'momo_reference',case when method = 'external_momo' then nullif(btrim(op_payload->'sale'->>'momoReference'),'') else null end,
      'items',(select jsonb_agg(jsonb_build_object(
        'product_id',(entry->>'productId')::uuid,
        'product_name',entry->>'productName','sku',entry->'sku',
        'unit_price',trim_scale((entry->>'unitPrice')::numeric)::text,
        'quantity',trim_scale((entry->>'quantity')::numeric)::text,
        'line_total',trim_scale((entry->>'lineTotal')::numeric)::text
      ) order by entry->>'productId') from jsonb_array_elements(op_payload->'items') entry)
    );
    select coalesce(sum((row->>'line_total')::numeric),0) into subtotal
      from jsonb_array_elements(canonical->'items') row;
    if exists (select 1 from jsonb_array_elements(op_payload->'items') entry
      where round((entry->>'unitPrice')::numeric * (entry->>'quantity')::numeric,2) <> (entry->>'lineTotal')::numeric) then
      return jsonb_build_object('status','rejected','code','invalid_line_total','retryable',false);
    end if;
    if subtotal <= 0 or round(subtotal,2) <> (op_payload->'sale'->>'total')::numeric
       or round(subtotal,2) <> (op_payload->'sale'->>'subtotal')::numeric then
      return jsonb_build_object('status','rejected','code','invalid_totals','retryable',false);
    end if;
  else
    if jsonb_typeof(op_payload->'transaction') <> 'object' or jsonb_typeof(op_payload->'payment') <> 'object' then
      raise exception 'The repayment payload is invalid.' using errcode = '22023';
    end if;
    method := (op_payload->'payment'->>'method')::public.payment_method;
    if method not in ('cash','external_momo') then raise exception 'Invalid repayment method.' using errcode = '22023'; end if;
    canonical := jsonb_build_object('operation_type',op_type,'client_operation_id',op_id,
      'actor_user_id',actor,'snapshot_id',snap_id,'created_at',at_time,
      'customer_id',(op_payload->'transaction'->>'customerId')::uuid,
      'amount',trim_scale((op_payload->'transaction'->>'amount')::numeric)::text,
      'method',method,
      'external_reference',case when method = 'external_momo' then nullif(btrim(op_payload->'payment'->>'externalReference'),'') else null end,
      'receipt_number',op_payload->'transaction'->>'receiptNumber');
  end if;
  payload_hash := encode(extensions.digest(convert_to(canonical::text,'UTF8'),'sha256'),'hex');

  perform pg_advisory_xact_lock(hashtextextended(op_id::text,0));
  select * into op_row from public.processed_client_operations where client_operation_id = op_id for update;
  if found then
    if op_row.payload_hash <> payload_hash then
      insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
      values (initiator,'sync.operation_rejected','sync_operation',op_row.id,
        jsonb_build_object('client_operation_id',op_id,'reason','idempotency_payload_mismatch'));
      return jsonb_build_object('status','rejected','code','idempotency_payload_mismatch','retryable',false);
    end if;
    return coalesce(op_row.result_summary,jsonb_build_object('status',op_row.status,'operationId',op_row.id));
  end if;

  insert into public.processed_client_operations(client_operation_id,operation_type,actor_user_id,
    sync_initiated_by,snapshot_id,local_entity_id,payload_hash,status,recovery_payload)
  values(op_id,op_type,actor,initiator,snap_id,local_id,payload_hash,'processing',jsonb_build_object(
    'canonical',canonical,
    'receipt_number',case when op_type='pos_sale' then receipt else op_payload->'transaction'->>'receiptNumber' end,
    'actor_user_id',actor
  ))
  returning id into ledger_id;
  perform set_config('grandpa.offline_sync_operation_id',op_id::text,true);
  if recovery then
    insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
    values(initiator,'sync.privileged_recovery','sync_operation',ledger_id,
      jsonb_build_object('client_operation_id',op_id,'original_actor',actor));
  end if;
  if not actor_active then
    issues := issues || jsonb_build_array(jsonb_build_object('type','actor_inactive','severity','high','details',jsonb_build_object('actor_user_id',actor)));
  end if;

  if op_type = 'pos_sale' then
    -- Snapshot membership and values are compared against the server copy, not IndexedDB.
    for item in select value from jsonb_array_elements(op_payload->'items') loop
      select value into snap_product from jsonb_array_elements(snapshot.snapshot_data->'products')
        where value->>'id' = item->>'productId';
      if snap_product is null or snap_product->>'name' is distinct from item->>'productName'
        or snap_product->'sku' is distinct from item->'sku'
        or (snap_product->>'selling_price')::numeric <> (item->>'unitPrice')::numeric then
        delete from public.processed_client_operations where id = ledger_id;
        return jsonb_build_object('status','rejected','code','snapshot_payload_mismatch','retryable',false);
      end if;
      qty := (item->>'quantity')::numeric;
      snapshot_quantity := (snap_product->>'sellable_quantity')::numeric;
      select coalesce(sum((line->>'quantity')::numeric),0) into prior_quantity
      from public.processed_client_operations prior
      cross join lateral jsonb_array_elements(prior.recovery_payload->'canonical'->'items') line
      where prior.snapshot_id=snap_id and prior.status in ('applied','review_required')
        and prior.operation_type='pos_sale' and line->>'product_id'=item->>'productId';
      if prior_quantity + qty > snapshot_quantity then
        delete from public.processed_client_operations where id=ledger_id;
        return jsonb_build_object('status','rejected','code','snapshot_stock_exceeded','retryable',false);
      end if;
    end loop;
    if method = 'credit' then
      select value into credit_snapshot from jsonb_array_elements(snapshot.snapshot_data->'credit_accounts')
        where value->>'customer_id' = op_payload->'sale'->>'customerId';
      if credit_snapshot is null then
        delete from public.processed_client_operations where id = ledger_id;
        return jsonb_build_object('status','rejected','code','customer_not_in_credit_snapshot','retryable',false);
      end if;
      snapshot_credit_amount := (credit_snapshot->>'available_credit')::numeric;
      select coalesce(sum(case
        when prior.operation_type='pos_sale' and prior.recovery_payload->'canonical'->>'payment_method'='credit'
          then (select coalesce(sum((line->>'line_total')::numeric),0) from jsonb_array_elements(prior.recovery_payload->'canonical'->'items') line)
        when prior.operation_type='credit_repayment' then -coalesce((prior.recovery_payload->'canonical'->>'amount')::numeric,0)
        else 0 end),0) into prior_credit_net
      from public.processed_client_operations prior
      where prior.snapshot_id=snap_id and prior.actor_user_id=actor and prior.status in ('applied','review_required')
        and prior.recovery_payload->'canonical'->>'customer_id'=op_payload->'sale'->>'customerId';
      if prior_credit_net + subtotal > snapshot_credit_amount then
        delete from public.processed_client_operations where id=ledger_id;
        return jsonb_build_object('status','rejected','code','snapshot_credit_exceeded','retryable',false);
      end if;
    end if;
    if op_payload->'sale'->>'customerId' is not null and op_payload->'sale'->>'customerId' <> 'null'
      and not exists(select 1 from jsonb_array_elements(snapshot.snapshot_data->'customers') c where c->>'id' = op_payload->'sale'->>'customerId')
      and method <> 'credit' then
      delete from public.processed_client_operations where id = ledger_id;
      return jsonb_build_object('status','rejected','code','customer_not_in_snapshot','retryable',false);
    end if;

    -- Missing account/customer/product cannot be represented canonically. Keep a sanitized,
    -- reviewable server copy and do not claim the physical sale is applied.
    if method = 'credit' and not exists(select 1 from public.credit_accounts a where a.customer_id=(op_payload->'sale'->>'customerId')::uuid) then
      conflict_type := 'credit_account_missing';
      issues := issues || jsonb_build_array(jsonb_build_object('type',conflict_type,'severity','high','details',jsonb_build_object('customer_id',op_payload->'sale'->>'customerId','receipt_number',receipt)));
    elsif op_payload->'sale'->>'customerId' is not null and op_payload->'sale'->>'customerId' <> 'null'
      and not exists(select 1 from public.customers c where c.id=(op_payload->'sale'->>'customerId')::uuid) then
      conflict_type := 'snapshot_entity_missing';
      issues := issues || jsonb_build_array(jsonb_build_object('type',conflict_type,'severity','high','details',jsonb_build_object('entity','customer','receipt_number',receipt)));
    end if;
    for item in select value from jsonb_array_elements(op_payload->'items') loop
      if not exists(select 1 from public.products p where p.id=(item->>'productId')::uuid) then
        all_products_exist := false;
        issues := issues || jsonb_build_array(jsonb_build_object('type','snapshot_entity_missing','severity','high','details',jsonb_build_object('entity','product','product_id',item->>'productId','receipt_number',receipt)));
      end if;
    end loop;
    if (method = 'credit' and not exists(select 1 from public.credit_accounts a where a.customer_id=(op_payload->'sale'->>'customerId')::uuid))
       or (op_payload->'sale'->>'customerId' is not null and op_payload->'sale'->>'customerId' <> 'null' and not exists(select 1 from public.customers c where c.id=(op_payload->'sale'->>'customerId')::uuid))
       or not all_products_exist then
      -- Persist reference-free recovery material; no canonical sale or money row is fabricated.
      for item in select value from jsonb_array_elements(issues) loop
        conflict_id := gen_random_uuid();
        insert into public.sync_conflicts(id,processed_operation_id,client_operation_id,conflict_type,severity,details)
        values(conflict_id,ledger_id,op_id,item->>'type',item->>'severity',item->'details');
        saved_conflicts := saved_conflicts || jsonb_build_array(jsonb_set(item,'{id}',to_jsonb(conflict_id::text),true));
        insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
          values(initiator,'sync.conflict_created','sync_conflict',conflict_id,jsonb_build_object('type',item->>'type','client_operation_id',op_id));
      end loop;
      result := jsonb_build_object('status','review_required','operationId',ledger_id,'canonical',null,'conflicts',saved_conflicts,'processedAt',now());
      update public.processed_client_operations set status='review_required',result_summary=result,processed_at=now() where id=ledger_id;
      insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
      values(initiator,'sync.operation_review_required','sync_operation',ledger_id,jsonb_build_object('client_operation_id',op_id,'conflict_count',jsonb_array_length(saved_conflicts)));
      return result;
    end if;

    if op_payload->'sale'->>'customerId' is not null and op_payload->'sale'->>'customerId' <> 'null' then
      select * into customer_row from public.customers where id=(op_payload->'sale'->>'customerId')::uuid for update;
      if customer_row.status <> 'active' then issues := issues || jsonb_build_array(jsonb_build_object('type','customer_inactive','severity','medium','details',jsonb_build_object('customer_id',customer_row.id,'receipt_number',receipt))); end if;
    end if;
    if method = 'credit' then
      select * into account_row from public.credit_accounts where customer_id=customer_row.id for update;
      if account_row.status = 'suspended' then issues := issues || jsonb_build_array(jsonb_build_object('type','credit_account_suspended','severity','high','details',jsonb_build_object('customer_id',customer_row.id,'receipt_number',receipt))); end if;
      if public.available_credit(account_row.credit_limit,account_row.current_balance,account_row.status) < subtotal then
        issues := issues || jsonb_build_array(jsonb_build_object('type','credit_limit_exceeded','severity','high','details',jsonb_build_object('customer_id',customer_row.id,'balance_before',account_row.current_balance,'limit',account_row.credit_limit,'offline_sale_total',subtotal,'receipt_number',receipt)));
      end if;
    end if;
    perform p.id from public.products p join (select (value->>'productId')::uuid id from jsonb_array_elements(op_payload->'items')) x on x.id=p.id order by p.id for update of p;
    for item in select value from jsonb_array_elements(op_payload->'items') order by value->>'productId' loop
      select * into product_row from public.products where id=(item->>'productId')::uuid;
      if not product_row.is_active then issues := issues || jsonb_build_array(jsonb_build_object('type','product_inactive','severity','medium','details',jsonb_build_object('product_id',product_row.id,'product_name',product_row.name,'receipt_number',receipt))); end if;
      snap_product := (select value from jsonb_array_elements(snapshot.snapshot_data->'products') where value->>'id'=item->>'productId');
      if product_row.selling_price <> (snap_product->>'selling_price')::numeric then issues := issues || jsonb_build_array(jsonb_build_object('type','product_price_changed','severity','low','details',jsonb_build_object('product_id',product_row.id,'receipt_number',receipt,'offline_price',snap_product->>'selling_price','current_price',product_row.selling_price))); end if;
      qty := (item->>'quantity')::numeric;
      select quantity into current_stock from public.inventory_balances where product_id=product_row.id for update;
      select coalesce(sum(r.quantity),0) into reserved_qty from public.inventory_reservations r where r.product_id=product_row.id and r.status='active' and r.expires_at>now();
      sellable := coalesce(current_stock,0)-reserved_qty;
      if coalesce(current_stock,0) < qty then issues := issues || jsonb_build_array(jsonb_build_object('type','stock_shortfall','severity','high','details',jsonb_build_object('product_id',product_row.id,'product_name',product_row.name,'physical_stock',coalesce(current_stock,0),'quantity_sold',qty,'receipt_number',receipt))); end if;
      if sellable < qty and coalesce(current_stock,0) >= qty then issues := issues || jsonb_build_array(jsonb_build_object('type','reservation_shortfall','severity','high','details',jsonb_build_object('product_id',product_row.id,'product_name',product_row.name,'physical_stock',coalesce(current_stock,0),'active_reserved',reserved_qty,'quantity_sold',qty,'receipt_number',receipt))); end if;
    end loop;

    sale_id := gen_random_uuid(); payment_id := gen_random_uuid();
    if method = 'credit' then next_balance := account_row.current_balance + subtotal; credit_id := gen_random_uuid(); end if;
    insert into public.sales(id,receipt_number,customer_id,cashier_user_id,channel,status,subtotal,total,client_operation_id,occurred_at,created_at)
    values(sale_id,receipt, nullif(op_payload->'sale'->>'customerId','null')::uuid, actor,'offline_pos','completed',subtotal,subtotal,op_id,at_time,now());
    for item in select value from jsonb_array_elements(op_payload->'items') order by value->>'productId' loop
      qty := (item->>'quantity')::numeric; unit_price := (item->>'unitPrice')::numeric; line_total := (item->>'lineTotal')::numeric;
      insert into public.sale_items(sale_id,product_id,product_name_snapshot,sku_snapshot,unit_price,quantity,line_total,created_at)
      values(sale_id,(item->>'productId')::uuid,item->>'productName',nullif(item->>'sku','null'),unit_price,qty,line_total,at_time);
      insert into public.stock_movements(product_id,movement_type,quantity_delta,reference_type,reference_id,actor_user_id,actor_name,client_operation_id,occurred_at)
      values((item->>'productId')::uuid,'sale',-qty,'sale',sale_id,actor,coalesce(actor_name,'Inactive staff'),gen_random_uuid(),at_time);
      insert into public.inventory_balances(product_id,quantity) values((item->>'productId')::uuid,0) on conflict(product_id) do nothing;
      update public.inventory_balances set quantity=quantity-qty,updated_at=now() where product_id=(item->>'productId')::uuid;
    end loop;
    insert into public.payments(id,sale_id,customer_id,method,amount,status,provider_reference,client_operation_id,recorded_by,occurred_at,created_at)
    values(payment_id,sale_id,case when method='credit' then customer_row.id end,method,subtotal,
      case when method='credit' then 'outstanding'::public.payment_status else 'recorded'::public.payment_status end,
      case when method='external_momo' then nullif(btrim(op_payload->'sale'->>'momoReference'),'') end,op_id,actor,at_time,now());
    if method='credit' then
      update public.credit_accounts set current_balance=next_balance where customer_id=customer_row.id;
      insert into public.credit_transactions(id,customer_id,transaction_type,amount,sale_id,payment_id,client_operation_id,recorded_by,balance_after,available_after,occurred_at,created_at)
      values(credit_id,customer_row.id,'credit_sale',subtotal,sale_id,payment_id,op_id,actor,next_balance,public.available_credit(account_row.credit_limit,next_balance,account_row.status),at_time,now());
    end if;
    insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details,created_at)
      values(initiator,'sale.completed','sale',sale_id,jsonb_build_object('receipt_number',receipt,'total',subtotal,'channel','offline_pos','actor_user_id',actor,'client_operation_id',op_id),now());
    insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details,created_at)
      values(initiator,'payment.recorded','payment',payment_id,jsonb_build_object('method',method,'amount',subtotal,'offline',true),now());
    if method='credit' then insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details,created_at)
      values(initiator,'credit.sale_completed','credit_transaction',credit_id,jsonb_build_object('customer_id',customer_row.id,'sale_id',sale_id,'amount',subtotal,'balance_after',next_balance),now()); end if;
    result := jsonb_build_object('status',case when jsonb_array_length(issues)>0 then 'review_required' else 'applied' end,
      'operationId',ledger_id,'canonical',jsonb_build_object('saleId',sale_id,'paymentId',payment_id,'creditTransactionId',credit_id,'receiptNumber',receipt,'processedAt',now()),'conflicts',issues,'processedAt',now());
  else
    -- Repayment cash already received is recorded in full; only current debt is reduced.
    select value into credit_snapshot from jsonb_array_elements(snapshot.snapshot_data->'credit_accounts')
      where value->>'customer_id'=op_payload->'transaction'->>'customerId';
    if credit_snapshot is null then delete from public.processed_client_operations where id=ledger_id; return jsonb_build_object('status','rejected','code','customer_not_in_credit_snapshot','retryable',false); end if;
    select coalesce(sum(case
      when prior.operation_type='pos_sale' and prior.recovery_payload->'canonical'->>'payment_method'='credit'
        then (select coalesce(sum((line->>'line_total')::numeric),0) from jsonb_array_elements(prior.recovery_payload->'canonical'->'items') line)
      when prior.operation_type='credit_repayment' then -coalesce((prior.recovery_payload->'canonical'->>'amount')::numeric,0)
      else 0 end),0) into prior_credit_net
    from public.processed_client_operations prior
    where prior.snapshot_id=snap_id and prior.actor_user_id=actor and prior.status in ('applied','review_required')
      and prior.recovery_payload->'canonical'->>'customer_id'=op_payload->'transaction'->>'customerId';
    if (credit_snapshot->>'current_balance')::numeric + prior_credit_net < (op_payload->'transaction'->>'amount')::numeric then
      delete from public.processed_client_operations where id=ledger_id;
      return jsonb_build_object('status','rejected','code','snapshot_repayment_exceeded','retryable',false);
    end if;
    select * into customer_row from public.customers where id=(op_payload->'transaction'->>'customerId')::uuid for update;
    select * into account_row from public.credit_accounts where customer_id=(op_payload->'transaction'->>'customerId')::uuid for update;
    if not found then
      issues := jsonb_build_array(jsonb_build_object('type','credit_account_missing','severity','high','details',jsonb_build_object('customer_id',op_payload->'transaction'->>'customerId','receipt_number',op_payload->'transaction'->>'receiptNumber')));
      insert into public.sync_conflicts(processed_operation_id,client_operation_id,conflict_type,severity,details)
      values(ledger_id,op_id,'credit_account_missing','high',issues->0->'details') returning id into conflict_id;
      result := jsonb_build_object('status','review_required','operationId',ledger_id,'canonical',null,'conflicts',jsonb_build_array(jsonb_set(issues->0,'{id}',to_jsonb(conflict_id::text),true)),'processedAt',now());
      update public.processed_client_operations set status='review_required',result_summary=result,processed_at=now() where id=ledger_id;
      insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details) values(initiator,'sync.operation_review_required','sync_operation',ledger_id,jsonb_build_object('client_operation_id',op_id,'reason','credit_account_missing'));
      return result;
    end if;
    applied_amount := least((op_payload->'transaction'->>'amount')::numeric,account_row.current_balance);
    excess_amount := (op_payload->'transaction'->>'amount')::numeric-applied_amount;
    next_balance := account_row.current_balance-applied_amount;
    payment_id := gen_random_uuid();
    insert into public.payments(id,customer_id,method,amount,status,provider_reference,client_operation_id,recorded_by,occurred_at,created_at)
    values(payment_id,customer_row.id,method,(op_payload->'transaction'->>'amount')::numeric,'recorded',case when method='external_momo' then nullif(btrim(op_payload->'payment'->>'externalReference'),'') end,op_id,actor,at_time,now());
    update public.credit_accounts set current_balance=next_balance where customer_id=customer_row.id;
    if applied_amount > 0 then
      credit_id := gen_random_uuid();
      insert into public.credit_transactions(id,customer_id,transaction_type,amount,payment_id,client_operation_id,recorded_by,balance_after,available_after,occurred_at,created_at)
      values(credit_id,customer_row.id,'repayment',applied_amount,payment_id,op_id,actor,next_balance,public.available_credit(account_row.credit_limit,next_balance,account_row.status),at_time,now());
    end if;
    if excess_amount > 0 then issues := jsonb_build_array(jsonb_build_object('type','repayment_exceeds_current_balance','severity','high','details',jsonb_build_object('customer_id',customer_row.id,'amount_received',(op_payload->'transaction'->>'amount')::numeric,'amount_applied',applied_amount,'unapplied_amount',excess_amount,'receipt_number',op_payload->'transaction'->>'receiptNumber'))); end if;
    insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
      values(initiator,'payment.recorded','payment',payment_id,jsonb_build_object('customer_id',customer_row.id,'method',method,'amount_received',(op_payload->'transaction'->>'amount')::numeric,'amount_applied',applied_amount,'offline',true));
    if credit_id is not null then insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
      values(initiator,'credit.repayment_recorded','credit_transaction',credit_id,jsonb_build_object('customer_id',customer_row.id,'amount_applied',applied_amount,'balance_after',next_balance)); end if;
    result := jsonb_build_object('status',case when excess_amount>0 then 'review_required' else 'applied' end,
      'operationId',ledger_id,'canonical',jsonb_build_object('paymentId',payment_id,'creditTransactionId',credit_id,'amountReceived',(op_payload->'transaction'->>'amount')::numeric,'amountApplied',applied_amount,'unappliedAmount',excess_amount,'receiptNumber',op_payload->'transaction'->>'receiptNumber','processedAt',now()),'conflicts',issues,'processedAt',now());
  end if;

  if jsonb_array_length(issues)>0 then
    for item in select value from jsonb_array_elements(issues) loop
      insert into public.sync_conflicts(processed_operation_id,client_operation_id,conflict_type,severity,canonical_entity_type,canonical_entity_id,details)
      values(ledger_id,op_id,item->>'type',item->>'severity',case when op_type='pos_sale' then 'sale' else 'payment' end,case when op_type='pos_sale' then sale_id else payment_id end,item->'details') returning id into conflict_id;
      result := jsonb_set(result,'{conflicts}',(result->'conflicts') || jsonb_build_array(jsonb_set(item,'{id}',to_jsonb(conflict_id::text),true)));
      insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
        values(initiator,'sync.conflict_created','sync_conflict',conflict_id,jsonb_build_object('type',item->>'type','client_operation_id',op_id));
    end loop;
  end if;
  update public.processed_client_operations set
    status=result->>'status',canonical_entity_type=case when op_type='pos_sale' then 'sale' else 'payment' end,
    canonical_entity_id=case when op_type='pos_sale' then sale_id else payment_id end,
    result_summary=result,processed_at=now()
  where id=ledger_id;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
    values(initiator,case when result->>'status'='applied' then 'sync.operation_applied' else 'sync.operation_review_required' end,
      'sync_operation',ledger_id,jsonb_build_object('client_operation_id',op_id,'actor_user_id',actor,'conflict_count',jsonb_array_length(issues)));
  return result;
end;
$$;
revoke all on function public.sync_offline_operation(jsonb) from public, anon;
grant execute on function public.sync_offline_operation(jsonb) to authenticated;
create function public.resolve_sync_conflict(p_conflict_id uuid,p_resolution_note text,p_resolution_reference text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); conflict_row public.sync_conflicts%rowtype;
begin
  if actor is null or not public.has_permission('resolve_conflicts')
    or not exists(select 1 from public.staff_profiles p where p.user_id=actor and p.is_active and p.role in ('admin','manager')) then
    raise exception 'Only an active Manager or Admin may resolve synchronization conflicts.' using errcode='42501';
  end if;
  if p_resolution_note is null or length(btrim(p_resolution_note)) not between 10 and 1000
    or p_resolution_reference is null or length(btrim(p_resolution_reference)) not between 3 and 200 then
    raise exception 'Enter a meaningful resolution note and a compensating-action reference.' using errcode='22023';
  end if;
  select * into conflict_row from public.sync_conflicts where id=p_conflict_id for update;
  if not found then raise exception 'Conflict was not found.' using errcode='P0002'; end if;
  if conflict_row.status='resolved' then return jsonb_build_object('status','resolved','id',conflict_row.id); end if;
  update public.sync_conflicts set status='resolved',resolved_by=actor,resolved_at=now(),
    resolution_note=btrim(p_resolution_note),resolution_reference=btrim(p_resolution_reference)
  where id=p_conflict_id;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,details)
    values(actor,'sync.conflict_resolved','sync_conflict',p_conflict_id,
      jsonb_build_object('client_operation_id',conflict_row.client_operation_id,'reference',btrim(p_resolution_reference)));
  return jsonb_build_object('status','resolved','id',p_conflict_id,'resolvedAt',now());
end;
$$;
revoke all on function public.resolve_sync_conflict(uuid,text,text) from public, anon;
grant execute on function public.resolve_sync_conflict(uuid,text,text) to authenticated;
comment on table public.offline_sync_snapshots is 'Server-issued Phase 7 snapshots. Not directly exposed to application roles.';
comment on table public.processed_client_operations is 'Authoritative idempotency ledger for client-originated offline operations.';
comment on table public.sync_conflicts is 'Manager/Admin review queue for preserved offline transactions that need reconciliation.';
comment on column public.inventory_balances.quantity is 'May be negative only when an authenticated offline sync records a physically completed sale; normal stock RPCs still reject negative balances.';
