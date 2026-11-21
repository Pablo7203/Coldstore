-- Phase 2: product catalogue and auditable, permission-controlled inventory.
-- All stock balance changes pass through record_stock_movement in one transaction.

create type public.stock_movement_type as enum (
  'opening_stock',
  'receipt',
  'wastage',
  'damage',
  'adjustment_in',
  'adjustment_out',
  'sale',
  'customer_return',
  'reversal'
);

insert into public.permissions (permission_key, description) values
  ('initialize_inventory', 'Record the one-time opening quantity for a product.'),
  ('record_wastage', 'Record stock lost through wastage.'),
  ('record_damage', 'Record stock lost through damage.'),
  ('adjust_inventory', 'Record reasoned stock adjustments.'),
  ('view_stock_history', 'View immutable inventory movement history.')
on conflict (permission_key) do nothing;

insert into public.role_permissions (role, permission_key)
select role.role::public.staff_role, permission.permission_key
from (values ('admin'), ('manager')) as role(role)
cross join (values
  ('initialize_inventory'),
  ('record_wastage'),
  ('record_damage'),
  ('adjust_inventory'),
  ('view_stock_history')
) as permission(permission_key)
on conflict do nothing;

insert into public.role_permissions (role, permission_key)
select 'stock_assistant'::public.staff_role, permission.permission_key
from (values
  ('record_wastage'),
  ('record_damage'),
  ('adjust_inventory'),
  ('view_stock_history')
) as permission(permission_key)
on conflict do nothing;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and length(name) between 1 and 100),
  slug text not null check (
    length(slug) between 1 and 120
    and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index categories_name_lower_unique
  on public.categories (lower(btrim(name)));
create unique index categories_slug_unique on public.categories (slug);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete restrict,
  sku text,
  barcode text,
  name text not null check (name = btrim(name) and length(name) between 1 and 160),
  description text check (description is null or length(description) <= 2000),
  selling_price numeric not null check (
    selling_price >= 0 and selling_price < 10000000000 and scale(selling_price) <= 2
  ),
  cost_price numeric check (
    cost_price is null or (cost_price >= 0 and cost_price < 10000000000 and scale(cost_price) <= 2)
  ),
  reorder_level numeric not null default 0 check (
    reorder_level >= 0 and reorder_level < 1000000000 and scale(reorder_level) <= 3
  ),
  is_active boolean not null default true,
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sku is null or (sku = btrim(sku) and sku <> '')),
  check (barcode is null or (barcode = btrim(barcode) and barcode <> ''))
);

create unique index products_sku_lower_unique
  on public.products (lower(sku)) where sku is not null;
create unique index products_barcode_lower_unique
  on public.products (lower(barcode)) where barcode is not null;
create index products_name_search_idx
  on public.products (lower(name) text_pattern_ops);
create index products_sku_search_idx
  on public.products (lower(sku) text_pattern_ops) where sku is not null;
create index products_barcode_search_idx
  on public.products (lower(barcode) text_pattern_ops) where barcode is not null;
create index products_category_idx on public.products (category_id);
create index products_active_idx on public.products (is_active);

create table public.inventory_balances (
  product_id uuid primary key references public.products (id) on delete restrict,
  quantity numeric not null default 0 check (
    quantity >= 0 and quantity < 1000000000 and scale(quantity) <= 3
  ),
  updated_at timestamptz not null default now()
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  movement_type public.stock_movement_type not null,
  quantity_delta numeric not null check (
    quantity_delta <> 0 and abs(quantity_delta) < 1000000000 and scale(quantity_delta) <= 3
  ),
  reference_type text check (reference_type is null or length(btrim(reference_type)) <= 80),
  reference_id uuid,
  reason text check (reason is null or length(btrim(reason)) between 1 and 1000),
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_name text not null check (length(btrim(actor_name)) between 2 and 120),
  client_operation_id uuid,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (
    (movement_type in ('opening_stock', 'receipt', 'adjustment_in', 'customer_return') and quantity_delta > 0)
    or (movement_type in ('wastage', 'damage', 'adjustment_out', 'sale') and quantity_delta < 0)
    or movement_type = 'reversal'
  ),
  check (
    movement_type not in ('wastage', 'damage', 'adjustment_in', 'adjustment_out')
    or reason is not null
  )
);

create unique index stock_movements_client_operation_unique
  on public.stock_movements (client_operation_id)
  where client_operation_id is not null;
create index stock_movements_product_occurred_idx
  on public.stock_movements (product_id, occurred_at desc, id desc);
create index stock_movements_occurred_idx on public.stock_movements (occurred_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null check (action in (
    'category.created', 'category.updated', 'category.deactivated',
    'product.created', 'product.updated', 'product.deactivated',
    'product.selling_price_changed',
    'inventory.opening_stock', 'inventory.receipt', 'inventory.wastage',
    'inventory.damage', 'inventory.adjustment_in', 'inventory.adjustment_out'
  )),
  entity_type text not null check (entity_type in ('category', 'product', 'stock_movement')),
  entity_id uuid not null,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index audit_logs_entity_created_idx
  on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create function public.require_active_product_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.category_id = old.category_id then
    return new;
  end if;
  if not exists (
    select 1 from public.categories
    where id = new.category_id and is_active
  ) then
    raise exception 'Choose an active product category.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.require_active_product_category() from public, anon, authenticated;
create trigger products_require_active_category
  before insert or update of category_id on public.products
  for each row execute function public.require_active_product_category();

create function public.audit_catalog_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_fields text[] := array[]::text[];
begin
  if tg_table_name = 'categories' then
    if tg_op = 'INSERT' then
      insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, details)
      values ((select auth.uid()), 'category.created', 'category', new.id,
        jsonb_build_object('name', new.name, 'slug', new.slug));
    else
      if new.name is distinct from old.name then changed_fields := array_append(changed_fields, 'name'); end if;
      if new.slug is distinct from old.slug then changed_fields := array_append(changed_fields, 'slug'); end if;
      if new.is_active is distinct from old.is_active then changed_fields := array_append(changed_fields, 'is_active'); end if;
      if cardinality(changed_fields) > 0 then
        insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, details)
        values ((select auth.uid()),
          case when old.is_active and not new.is_active then 'category.deactivated' else 'category.updated' end,
          'category', new.id, jsonb_build_object('changed_fields', changed_fields));
      end if;
    end if;
  else
    if tg_op = 'INSERT' then
      insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, details)
      values ((select auth.uid()), 'product.created', 'product', new.id,
        jsonb_build_object('category_id', new.category_id, 'sku', new.sku));
    else
      if new.category_id is distinct from old.category_id then changed_fields := array_append(changed_fields, 'category_id'); end if;
      if new.sku is distinct from old.sku then changed_fields := array_append(changed_fields, 'sku'); end if;
      if new.barcode is distinct from old.barcode then changed_fields := array_append(changed_fields, 'barcode'); end if;
      if new.name is distinct from old.name then changed_fields := array_append(changed_fields, 'name'); end if;
      if new.description is distinct from old.description then changed_fields := array_append(changed_fields, 'description'); end if;
      if new.cost_price is distinct from old.cost_price then changed_fields := array_append(changed_fields, 'cost_price'); end if;
      if new.reorder_level is distinct from old.reorder_level then changed_fields := array_append(changed_fields, 'reorder_level'); end if;
      if new.is_active is distinct from old.is_active then changed_fields := array_append(changed_fields, 'is_active'); end if;
      if new.image_path is distinct from old.image_path then changed_fields := array_append(changed_fields, 'image_path'); end if;
      if new.selling_price is distinct from old.selling_price then
        insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, details)
        values ((select auth.uid()), 'product.selling_price_changed', 'product', new.id,
          jsonb_build_object('old_price', old.selling_price, 'new_price', new.selling_price));
        changed_fields := array_append(changed_fields, 'selling_price');
      end if;
      if cardinality(changed_fields) > 0 then
        insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, details)
        values ((select auth.uid()),
          case when old.is_active and not new.is_active then 'product.deactivated' else 'product.updated' end,
          'product', new.id, jsonb_build_object('changed_fields', changed_fields));
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.audit_catalog_change() from public, anon, authenticated;
create trigger audit_category_changes
  after insert or update on public.categories
  for each row execute function public.audit_catalog_change();
create trigger audit_product_changes
  after insert or update on public.products
  for each row execute function public.audit_catalog_change();

create function public.prevent_stock_movement_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Stock movements are immutable; record a compensating movement.'
    using errcode = '42501';
end;
$$;
revoke all on function public.prevent_stock_movement_mutation() from public, anon, authenticated;
create trigger stock_movements_are_immutable
  before update or delete on public.stock_movements
  for each row execute function public.prevent_stock_movement_mutation();

create function public.audit_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.movement_type in ('opening_stock', 'receipt', 'wastage', 'damage', 'adjustment_in', 'adjustment_out') then
    insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, details)
    values (
      new.actor_user_id,
      'inventory.' || new.movement_type::text,
      'stock_movement',
      new.id,
      jsonb_build_object(
        'product_id', new.product_id,
        'quantity_delta', new.quantity_delta,
        'reason', new.reason,
        'reference_type', new.reference_type,
        'reference_id', new.reference_id
      )
    );
  end if;
  return new;
end;
$$;
revoke all on function public.audit_stock_movement() from public, anon, authenticated;
create trigger audit_inventory_movement
  after insert on public.stock_movements
  for each row execute function public.audit_stock_movement();

create function public.assert_inventory_ledger_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_key uuid := new.product_id;
  ledger_total numeric(12, 3);
  balance_total numeric(12, 3);
begin
  select coalesce(sum(movement.quantity_delta), 0)::numeric(12, 3)
  into ledger_total
  from public.stock_movements as movement
  where movement.product_id = product_key;

  select balance.quantity into balance_total
  from public.inventory_balances as balance
  where balance.product_id = product_key;

  if balance_total is null or balance_total <> ledger_total then
    raise exception 'Inventory balance must equal the sum of its immutable stock movements.'
      using errcode = '23514';
  end if;
  return null;
end;
$$;
revoke all on function public.assert_inventory_ledger_balance() from public, anon, authenticated;
create constraint trigger stock_movement_keeps_ledger_balanced
  after insert on public.stock_movements
  deferrable initially deferred
  for each row execute function public.assert_inventory_ledger_balance();
create constraint trigger inventory_balance_keeps_ledger_balanced
  after insert or update on public.inventory_balances
  deferrable initially deferred
  for each row execute function public.assert_inventory_ledger_balance();

create function public.record_stock_movement(
  p_product_id uuid,
  p_movement_type public.stock_movement_type,
  p_quantity numeric,
  p_reason text default null,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_client_operation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_label text;
  required_permission text;
  delta numeric;
  current_quantity numeric;
  movement_id uuid;
  existing public.stock_movements%rowtype;
begin
  if actor is null then
    raise exception 'An authenticated staff member is required.' using errcode = '42501';
  end if;
  select full_name into actor_label
  from public.staff_profiles
  where user_id = actor and is_active;
  if actor_label is null then
    raise exception 'An active staff profile is required.' using errcode = '42501';
  end if;

  required_permission := case p_movement_type
    when 'opening_stock' then 'initialize_inventory'
    when 'receipt' then 'receive_stock'
    when 'wastage' then 'record_wastage'
    when 'damage' then 'record_damage'
    when 'adjustment_in' then 'adjust_inventory'
    when 'adjustment_out' then 'adjust_inventory'
    else null
  end;
  if required_permission is null or not public.has_permission(required_permission) then
    raise exception 'You are not authorized to record this stock movement.' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity >= 1000000000 or scale(p_quantity) > 3 then
    raise exception 'Quantity must be greater than zero and use at most three decimal places.' using errcode = '22023';
  end if;
  delta := case
    when p_movement_type in ('wastage', 'damage', 'adjustment_out') then -p_quantity
    else p_quantity
  end;
  if p_reason is not null and length(btrim(p_reason)) > 1000 then
    raise exception 'Reason must be 1000 characters or fewer.' using errcode = '22023';
  end if;
  if p_movement_type in ('wastage', 'damage', 'adjustment_in', 'adjustment_out')
    and nullif(btrim(p_reason), '') is null then
    raise exception 'A reason is required for this stock movement.' using errcode = '22023';
  end if;
  if p_reference_type is not null and length(btrim(p_reference_type)) > 80 then
    raise exception 'Reference must be 80 characters or fewer.' using errcode = '22023';
  end if;

  perform 1 from public.products
  where id = p_product_id and is_active
  for update;
  if not found then
    raise exception 'Active product was not found.' using errcode = 'P0002';
  end if;

  if p_client_operation_id is not null then
    select * into existing
    from public.stock_movements
    where actor_user_id = actor and client_operation_id = p_client_operation_id;
    if found then
      if existing.product_id = p_product_id
        and existing.movement_type = p_movement_type
        and existing.quantity_delta = delta
        and existing.reason is not distinct from nullif(btrim(p_reason), '')
        and existing.reference_type is not distinct from nullif(btrim(p_reference_type), '')
        and existing.reference_id is not distinct from p_reference_id then
        return existing.id;
      end if;
      raise exception 'Operation ID was already used for a different stock movement.' using errcode = '23505';
    end if;
  end if;

  if p_movement_type = 'opening_stock' and exists (
    select 1 from public.stock_movements where product_id = p_product_id
  ) then
    raise exception 'Opening stock can only be recorded before any other stock movement; use an adjustment to correct stock.'
      using errcode = '23505';
  end if;

  insert into public.inventory_balances (product_id, quantity)
  values (p_product_id, 0)
  on conflict (product_id) do nothing;

  select quantity into current_quantity
  from public.inventory_balances
  where product_id = p_product_id
  for update;

  if current_quantity + delta < 0 then
    raise exception 'This movement would reduce stock below zero.' using errcode = '23514';
  end if;

  insert into public.stock_movements (
    product_id, movement_type, quantity_delta, reason, reference_type,
    reference_id, actor_user_id, actor_name, client_operation_id
  ) values (
    p_product_id, p_movement_type, delta, nullif(btrim(p_reason), ''),
    nullif(btrim(p_reference_type), ''), p_reference_id, actor, actor_label,
    p_client_operation_id
  ) returning id into movement_id;

  update public.inventory_balances
  set quantity = current_quantity + delta, updated_at = now()
  where product_id = p_product_id;

  return movement_id;
end;
$$;

revoke all on function public.record_stock_movement(
  uuid, public.stock_movement_type, numeric, text, text, uuid, uuid
) from public, anon;
grant execute on function public.record_stock_movement(
  uuid, public.stock_movement_type, numeric, text, text, uuid, uuid
) to authenticated;

create function public.search_products(
  p_query text default null,
  p_category_id uuid default null,
  p_active boolean default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  category_id uuid,
  category_name text,
  sku text,
  barcode text,
  name text,
  description text,
  selling_price numeric,
  cost_price numeric,
  reorder_level numeric,
  is_active boolean,
  quantity numeric,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.has_permission('view_inventory') then
    raise exception 'You are not authorized to view products.' using errcode = '42501';
  end if;
  if p_limit not between 1 and 100 or p_offset < 0 then
    raise exception 'Invalid product list pagination.' using errcode = '22023';
  end if;
  if p_query is not null and length(btrim(p_query)) > 100 then
    raise exception 'Search must be 100 characters or fewer.' using errcode = '22023';
  end if;

  return query
  select product.id, product.category_id, category.name,
    product.sku, product.barcode, product.name, product.description,
    product.selling_price, product.cost_price, product.reorder_level,
    product.is_active, balance.quantity, product.created_at, product.updated_at,
    count(*) over ()
  from public.products as product
  join public.categories as category on category.id = product.category_id
  left join public.inventory_balances as balance on balance.product_id = product.id
  where (p_category_id is null or product.category_id = p_category_id)
    and (p_active is null or product.is_active = p_active)
    and (
      nullif(btrim(p_query), '') is null
      or lower(product.name) like lower(btrim(p_query)) || '%'
      or lower(coalesce(product.sku, '')) like lower(btrim(p_query)) || '%'
      or lower(coalesce(product.barcode, '')) like lower(btrim(p_query)) || '%'
    )
  order by product.name, product.id
  limit p_limit offset p_offset;
end;
$$;
revoke all on function public.search_products(text, uuid, boolean, integer, integer) from public, anon;
grant execute on function public.search_products(text, uuid, boolean, integer, integer) to authenticated;

create function public.get_inventory_summary()
returns table (
  active_products bigint,
  initialized_products bigint,
  in_stock bigint,
  low_stock bigint,
  out_of_stock bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.has_permission('view_inventory') then
    raise exception 'You are not authorized to view inventory.' using errcode = '42501';
  end if;
  return query
  select
    count(*)::bigint,
    count(balance.product_id)::bigint,
    count(*) filter (where coalesce(balance.quantity, 0) > product.reorder_level)::bigint,
    count(*) filter (where coalesce(balance.quantity, 0) > 0 and coalesce(balance.quantity, 0) <= product.reorder_level)::bigint,
    count(*) filter (where coalesce(balance.quantity, 0) <= 0)::bigint
  from public.products as product
  left join public.inventory_balances as balance on balance.product_id = product.id
  where product.is_active;
end;
$$;
revoke all on function public.get_inventory_summary() from public, anon;
grant execute on function public.get_inventory_summary() to authenticated;

create function public.search_stock_movements(
  p_product_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  product_id uuid,
  product_name text,
  sku text,
  movement_type public.stock_movement_type,
  quantity_delta numeric,
  reason text,
  reference_type text,
  occurred_at timestamptz,
  actor_user_id uuid,
  actor_name text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('view_stock_history') then
    raise exception 'You are not authorized to view stock history.' using errcode = '42501';
  end if;
  if p_limit not between 1 and 100 or p_offset < 0 then
    raise exception 'Invalid stock history pagination.' using errcode = '22023';
  end if;
  return query
  select movement.id, movement.product_id, product.name, product.sku,
    movement.movement_type, movement.quantity_delta, movement.reason,
    movement.reference_type, movement.occurred_at, movement.actor_user_id,
    movement.actor_name, count(*) over ()
  from public.stock_movements as movement
  join public.products as product on product.id = movement.product_id
  where p_product_id is null or movement.product_id = p_product_id
  order by movement.occurred_at desc, movement.id desc
  limit p_limit offset p_offset;
end;
$$;
revoke all on function public.search_stock_movements(uuid, integer, integer) from public, anon;
grant execute on function public.search_stock_movements(uuid, integer, integer) to authenticated;

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.stock_movements enable row level security;
alter table public.audit_logs enable row level security;

revoke all on table public.categories, public.products, public.inventory_balances,
  public.stock_movements, public.audit_logs from anon, authenticated;
grant select, insert, update on public.categories to authenticated;
grant select, insert, update on public.products to authenticated;
grant select on public.inventory_balances, public.stock_movements, public.audit_logs to authenticated;

create policy categories_read_inventory_staff on public.categories
  for select to authenticated using ((select public.has_permission('view_inventory')));
create policy categories_create_product_managers on public.categories
  for insert to authenticated with check ((select public.has_permission('manage_products')));
create policy categories_update_product_managers on public.categories
  for update to authenticated
  using ((select public.has_permission('manage_products')))
  with check ((select public.has_permission('manage_products')));

create policy products_read_inventory_staff on public.products
  for select to authenticated using ((select public.has_permission('view_inventory')));
create policy products_create_product_managers on public.products
  for insert to authenticated with check ((select public.has_permission('manage_products')));
create policy products_update_product_managers on public.products
  for update to authenticated
  using ((select public.has_permission('manage_products')))
  with check ((select public.has_permission('manage_products')));

create policy inventory_balances_read_inventory_staff on public.inventory_balances
  for select to authenticated using ((select public.has_permission('view_inventory')));
create policy stock_movements_read_history_permission on public.stock_movements
  for select to authenticated using ((select public.has_permission('view_stock_history')));
create policy audit_logs_read_admin on public.audit_logs
  for select to authenticated using ((select public.has_permission('view_audit')));

comment on table public.inventory_balances is
  'Current materialized quantity; writes occur only with a stock_movements row inside record_stock_movement.';
comment on table public.stock_movements is
  'Append-only inventory ledger. Corrections are compensating movements, never edits.';
comment on table public.audit_logs is
  'Security/business audit events for product, category, price, and stock changes.';
