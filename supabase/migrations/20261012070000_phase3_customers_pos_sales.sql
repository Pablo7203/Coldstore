-- Phase 3: staff customer operations and online POS transactions.
-- Sales, payments, inventory movements, and audit records are written atomically
-- by complete_pos_sale; client DML on transactional tables is intentionally absent.

create type public.sale_channel as enum ('pos');
create type public.sale_status as enum ('completed', 'voided', 'reversed');
create type public.payment_method as enum ('cash', 'external_momo', 'paystack', 'credit');
create type public.payment_status as enum ('recorded', 'reversed');

insert into public.permissions (permission_key, description) values
  ('view_sales_history', 'View permitted POS sales and reprint their receipts.'),
  ('view_all_sales_history', 'View all POS sales, not only sales completed by the current cashier.')
on conflict (permission_key) do nothing;

insert into public.role_permissions (role, permission_key)
select role.role::public.staff_role, 'view_sales_history'
from (values ('admin'), ('manager'), ('cashier')) as role(role)
on conflict do nothing;

insert into public.role_permissions (role, permission_key)
select role.role::public.staff_role, 'view_all_sales_history'
from (values ('admin'), ('manager')) as role(role)
on conflict do nothing;

-- The Phase 1 foundation already has walk-in customers. Keep those identities
-- and historical references, while adding searchable indexes for POS lookups.
create index customers_phone_search_idx on public.customers (phone);
create index customers_name_search_idx on public.customers (lower(full_name) text_pattern_ops);
create index customers_email_search_idx on public.customers (lower(email) text_pattern_ops)
  where email is not null;

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  customer_id uuid references public.customers (id) on delete restrict,
  cashier_user_id uuid not null references auth.users (id) on delete restrict,
  channel public.sale_channel not null default 'pos',
  status public.sale_status not null default 'completed',
  subtotal numeric not null check (subtotal > 0 and subtotal < 1000000000000 and scale(subtotal) <= 2),
  total numeric not null check (total > 0 and total < 1000000000000 and scale(total) <= 2),
  client_operation_id uuid not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (cashier_user_id, client_operation_id),
  check (receipt_number ~ '^GP-[0-9]{6}-[0-9A-F]{16}$')
);
create index sales_occurred_idx on public.sales (occurred_at desc, id desc);
create index sales_cashier_occurred_idx on public.sales (cashier_user_id, occurred_at desc);
create index sales_customer_occurred_idx on public.sales (customer_id, occurred_at desc)
  where customer_id is not null;

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  product_name_snapshot text not null check (length(btrim(product_name_snapshot)) between 1 and 160),
  sku_snapshot text,
  unit_price numeric not null check (unit_price >= 0 and unit_price < 10000000000 and scale(unit_price) <= 2),
  quantity numeric not null check (quantity > 0 and quantity < 1000000000 and scale(quantity) <= 3),
  line_total numeric not null check (line_total >= 0 and line_total < 1000000000000 and scale(line_total) <= 2),
  created_at timestamptz not null default now()
);
create index sale_items_sale_idx on public.sale_items (sale_id, id);
create index sale_items_product_idx on public.sale_items (product_id, created_at desc);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references public.sales (id) on delete restrict,
  order_id uuid,
  method public.payment_method not null,
  amount numeric not null check (amount > 0 and amount < 1000000000000 and scale(amount) <= 2),
  status public.payment_status not null default 'recorded',
  provider text,
  provider_reference text,
  client_operation_id uuid,
  recorded_by uuid references auth.users (id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (sale_id is not null or order_id is not null),
  check (method <> 'external_momo' or provider_reference is null or length(btrim(provider_reference)) <= 120)
);
create unique index payments_sale_unique on public.payments (sale_id) where sale_id is not null;
create unique index payments_client_operation_unique on public.payments (client_operation_id)
  where client_operation_id is not null;
create index payments_occurred_idx on public.payments (occurred_at desc, id desc);

-- Extend the established audit vocabulary rather than adding a separate log.
alter table public.audit_logs drop constraint audit_logs_action_check;
alter table public.audit_logs add constraint audit_logs_action_check check (action in (
  'category.created', 'category.updated', 'category.deactivated',
  'product.created', 'product.updated', 'product.deactivated',
  'product.selling_price_changed',
  'inventory.opening_stock', 'inventory.receipt', 'inventory.wastage',
  'inventory.damage', 'inventory.adjustment_in', 'inventory.adjustment_out',
  'customer.created', 'customer.updated', 'sale.completed', 'payment.recorded'
));
alter table public.audit_logs drop constraint audit_logs_entity_type_check;
alter table public.audit_logs add constraint audit_logs_entity_type_check
  check (entity_type in ('category', 'product', 'stock_movement', 'customer', 'sale', 'payment'));

create function public.audit_customer_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
    values ((select auth.uid()), 'customer.created', 'customer', new.id,
      jsonb_build_object('auth_linked', new.auth_user_id is not null));
  elsif (new.full_name, new.phone, new.email, new.status, new.notes)
      is distinct from (old.full_name, old.phone, old.email, old.status, old.notes) then
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
    values ((select auth.uid()), 'customer.updated', 'customer', new.id,
      jsonb_build_object('changed_fields', array_remove(array[
        case when new.full_name is distinct from old.full_name then 'full_name' end,
        case when new.phone is distinct from old.phone then 'phone' end,
        case when new.email is distinct from old.email then 'email' end,
        case when new.status is distinct from old.status then 'status' end,
        case when new.notes is distinct from old.notes then 'notes' end
      ], null)));
  end if;
  return new;
end;
$$;
revoke all on function public.audit_customer_change() from public, anon, authenticated;
create trigger audit_customer_changes after insert or update on public.customers
  for each row execute function public.audit_customer_change();

-- Customers remain staff-managed, never hard-deleted. Existing own-profile
-- update remains limited by its RLS policy; staff edits require manage_customers.
revoke insert, update, delete on public.customers from anon, authenticated;
grant insert (full_name, phone, email, notes) on public.customers to authenticated;
grant update (full_name, phone, email, notes, status) on public.customers to authenticated;


alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.payments enable row level security;
revoke all on public.sales, public.sale_items, public.payments from anon, authenticated;
grant select on public.sales, public.sale_items, public.payments to authenticated;

create policy sales_read_permitted_staff on public.sales for select to authenticated
  using ((select public.has_permission('view_sales_history'))
    and (cashier_user_id = (select auth.uid())
      or (select public.has_permission('view_all_sales_history'))));
create policy sale_items_read_permitted_staff on public.sale_items for select to authenticated
  using (exists (select 1 from public.sales sale where sale.id = sale_id
    and (select public.has_permission('view_sales_history'))));
create policy payments_read_permitted_staff on public.payments for select to authenticated
  using (sale_id is not null and exists (select 1 from public.sales sale where sale.id = sale_id
    and (select public.has_permission('view_sales_history'))));

create function public.search_customers(p_query text default '', p_limit integer default 20)
returns table (id uuid, full_name text, phone text, email text, status public.customer_status)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.has_permission('view_customers') then
    raise exception 'You are not authorized to view customers.' using errcode = '42501';
  end if;
  if p_limit not between 1 and 50 or length(btrim(coalesce(p_query, ''))) > 100 then
    raise exception 'Invalid customer search.' using errcode = '22023';
  end if;
  return query
  select customer.id, customer.full_name, customer.phone, customer.email, customer.status
  from public.customers customer
  where customer.status = 'active'
    and (nullif(btrim(p_query), '') is null
      or lower(customer.full_name) like lower(btrim(p_query)) || '%'
      or customer.phone like btrim(p_query) || '%'
      or lower(coalesce(customer.email, '')) like lower(btrim(p_query)) || '%')
  order by customer.full_name, customer.id limit p_limit;
end;
$$;
revoke all on function public.search_customers(text, integer) from public, anon;
grant execute on function public.search_customers(text, integer) to authenticated;

create function public.complete_pos_sale(
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
  current_stock numeric;
  normalized_phone text;
  computed_subtotal numeric := 0;
  computed_line numeric;
  sale_key uuid := gen_random_uuid();
  receipt_key text;
  payment_key uuid := gen_random_uuid();
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
  if p_payment_method not in ('cash', 'external_momo') then
    raise exception 'Choose cash or externally confirmed mobile money.' using errcode = '22023';
  end if;
  if p_payment_method = 'external_momo' and p_momo_reference is not null
    and (length(btrim(p_momo_reference)) = 0 or length(btrim(p_momo_reference)) > 120) then
    raise exception 'MoMo reference must be 1 to 120 characters.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'A sale must contain between 1 and 100 items.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':' || p_client_operation_id::text, 0));
  select * into prior_sale from public.sales
    where cashier_user_id = actor and client_operation_id = p_client_operation_id;
  if found then
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
  if p_customer_id is not null and not exists (select 1 from public.customers customer
    where customer.id = p_customer_id and customer.status = 'active') then
    raise exception 'Choose an active customer.' using errcode = 'P0002';
  end if;

  -- Lock product rows in stable order, serializing sales before reading balances.
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

  -- Balances are locked in the same product order and validated as one unit.
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

  receipt_key := 'GP-' || to_char(now() at time zone 'Africa/Accra', 'YYMMDD') || '-'
    || upper(substr(replace(p_client_operation_id::text, '-', ''), 1, 16));
  if exists (select 1 from public.sales where receipt_number = receipt_key) then
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

  insert into public.payments(id, sale_id, method, amount, status, provider_reference,
    client_operation_id, recorded_by)
  values (payment_key, sale_key, p_payment_method, computed_subtotal, 'recorded',
    nullif(btrim(p_momo_reference), ''), p_client_operation_id, actor);

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
  values (actor, 'sale.completed', 'sale', sale_key,
    jsonb_build_object('receipt_number', receipt_key, 'total', computed_subtotal,
      'item_count', item_count, 'payment_method', p_payment_method));
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
  values (actor, 'payment.recorded', 'payment', payment_key,
    jsonb_build_object('sale_id', sale_key, 'method', p_payment_method, 'amount', computed_subtotal));

  return query select sale_key, receipt_key, computed_subtotal, computed_subtotal, now();
end;
$$;
revoke all on function public.complete_pos_sale(uuid, jsonb, public.payment_method, uuid, text) from public, anon;
grant execute on function public.complete_pos_sale(uuid, jsonb, public.payment_method, uuid, text) to authenticated;

create function public.get_pos_sale(p_sale_id uuid)
returns table (
  id uuid, receipt_number text, customer_id uuid, customer_name text, cashier_user_id uuid,
  cashier_name text, status public.sale_status, subtotal numeric, total numeric,
  payment_method public.payment_method, provider_reference text, occurred_at timestamptz,
  item_id uuid, product_id uuid, product_name text, sku text, unit_price numeric,
  quantity numeric, line_total numeric
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.has_permission('view_sales_history') then
    raise exception 'You are not authorized to view sales.' using errcode = '42501';
  end if;
  return query
  select sale.id, sale.receipt_number, sale.customer_id, customer.full_name,
    sale.cashier_user_id, staff.full_name, sale.status, sale.subtotal, sale.total,
    payment.method, payment.provider_reference, sale.occurred_at,
    item.id, item.product_id, item.product_name_snapshot, item.sku_snapshot,
    item.unit_price, item.quantity, item.line_total
  from public.sales sale
  join public.staff_profiles staff on staff.user_id = sale.cashier_user_id
  left join public.customers customer on customer.id = sale.customer_id
  join public.payments payment on payment.sale_id = sale.id
  join public.sale_items item on item.sale_id = sale.id
  where sale.id = p_sale_id
  order by item.id;
end;
$$;
revoke all on function public.get_pos_sale(uuid) from public, anon;
grant execute on function public.get_pos_sale(uuid) to authenticated;

create function public.search_pos_sales(p_query text default '', p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, receipt_number text, occurred_at timestamptz, cashier_name text,
  customer_name text, payment_method public.payment_method, total numeric, status public.sale_status)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.has_permission('view_sales_history') then
    raise exception 'You are not authorized to view sales.' using errcode = '42501';
  end if;
  if p_limit not between 1 and 100 or p_offset < 0
    or length(btrim(coalesce(p_query, ''))) > 100 then
    raise exception 'Invalid sales search.' using errcode = '22023';
  end if;
  return query
  select sale.id, sale.receipt_number, sale.occurred_at, staff.full_name,
    customer.full_name, payment.method, sale.total, sale.status
  from public.sales sale
  join public.staff_profiles staff on staff.user_id = sale.cashier_user_id
  left join public.customers customer on customer.id = sale.customer_id
  join public.payments payment on payment.sale_id = sale.id
  where nullif(btrim(p_query), '') is null or sale.receipt_number ilike btrim(p_query) || '%'
  order by sale.occurred_at desc, sale.id desc limit p_limit offset p_offset;
end;
$$;
revoke all on function public.search_pos_sales(text, integer, integer) from public, anon;
grant execute on function public.search_pos_sales(text, integer, integer) to authenticated;

comment on table public.sales is 'Completed online POS sales; correct with controlled void/reversal workflows in a later phase.';
comment on column public.sales.client_operation_id is 'Idempotency key retained for online retries and future offline reconciliation.';
comment on column public.sales.receipt_number is 'Date plus client operation UUID prefix; unique constraint prevents receipt collisions and supports later offline issuance.';
comment on column public.payments.provider_reference is 'For external_momo this is a cashier-entered reference only; no provider verification is implied.';
