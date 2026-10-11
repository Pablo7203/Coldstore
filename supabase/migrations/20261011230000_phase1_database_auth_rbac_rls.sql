-- Phase 1: identity, staff roles, customer linkage, permissions, and row security.
-- Production will use a separate Supabase project and receives this migration only
-- through a reviewed, committed migration deployment.

create type public.staff_role as enum (
  'admin',
  'manager',
  'cashier',
  'stock_assistant'
);

create type public.customer_status as enum ('active', 'inactive');

create table public.permissions (
  permission_key text primary key,
  description text not null
);

create table public.role_permissions (
  role public.staff_role not null,
  permission_key text not null references public.permissions (permission_key) on delete cascade,
  primary key (role, permission_key)
);

create table public.staff_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 2 and 120),
  phone text,
  role public.staff_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff_profile_audit (
  id bigint generated always as identity primary key,
  staff_user_id uuid not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  event_type text not null check (
    event_type in (
      'profile_created',
      'role_changed',
      'activation_changed',
      'role_and_activation_changed'
    )
  ),
  old_role public.staff_role,
  new_role public.staff_role,
  old_is_active boolean,
  new_is_active boolean,
  created_at timestamptz not null default now()
);

create index staff_profile_audit_user_created_idx
  on public.staff_profile_audit (staff_user_id, created_at desc);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  full_name text not null check (length(btrim(full_name)) between 2 and 120),
  phone text not null check (length(btrim(phone)) between 3 and 32),
  email text,
  status public.customer_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index customers_email_lower_unique
  on public.customers (lower(email))
  where email is not null;

create index staff_profiles_role_active_idx
  on public.staff_profiles (role, user_id)
  where is_active;

insert into public.permissions (permission_key, description) values
  ('manage_staff', 'Create, deactivate, and assign staff roles.'),
  ('view_customers', 'View customer records needed for service and orders.'),
  ('create_customer', 'Create walk-in customer records.'),
  ('manage_customers', 'Update customer contact details.'),
  ('view_inventory', 'View products and stock availability.'),
  ('manage_products', 'Create and change product records.'),
  ('manage_inventory', 'Manage stock movements and adjustments.'),
  ('receive_stock', 'Record approved stock receipts.'),
  ('complete_sale', 'Complete online point-of-sale transactions.'),
  ('manage_credit', 'Manage customer credit and limits.'),
  ('manage_orders', 'Manage customer orders.'),
  ('view_reports', 'View operational reports.'),
  ('resolve_conflicts', 'Resolve synchronization conflicts.'),
  ('view_audit', 'View audit history.'),
  ('manage_settings', 'Change business settings.');

insert into public.role_permissions (role, permission_key)
select 'admin'::public.staff_role, permission_key from public.permissions;

insert into public.role_permissions (role, permission_key) values
  ('manager', 'view_customers'),
  ('manager', 'create_customer'),
  ('manager', 'manage_customers'),
  ('manager', 'view_inventory'),
  ('manager', 'manage_products'),
  ('manager', 'manage_inventory'),
  ('manager', 'receive_stock'),
  ('manager', 'complete_sale'),
  ('manager', 'manage_credit'),
  ('manager', 'manage_orders'),
  ('manager', 'view_reports'),
  ('manager', 'resolve_conflicts'),
  ('cashier', 'view_customers'),
  ('cashier', 'create_customer'),
  ('cashier', 'view_inventory'),
  ('cashier', 'complete_sale'),
  ('cashier', 'manage_orders'),
  ('stock_assistant', 'view_inventory'),
  ('stock_assistant', 'receive_stock');

create function public.current_staff_role()
returns public.staff_role
language sql
stable
security definer
set search_path = ''
as $$
  select profile.role
  from public.staff_profiles as profile
  where profile.user_id = (select auth.uid())
    and profile.is_active;
$$;

create function public.has_permission(requested_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_profiles as profile
    join public.role_permissions as role_permission
      on role_permission.role = profile.role
    where profile.user_id = (select auth.uid())
      and profile.is_active
      and role_permission.permission_key = requested_permission
  );
$$;

create function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_staff_role() is not null;
$$;

create function public.assign_staff_profile(
  target_user_id uuid,
  profile_name text,
  profile_phone text,
  assigned_role public.staff_role,
  active boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not public.has_permission('manage_staff') then
    raise exception 'Only an active administrator may assign staff profiles.'
      using errcode = '42501';
  end if;

  if target_user_id = (select auth.uid())
    and (assigned_role is distinct from public.current_staff_role() or active is distinct from true) then
    raise exception 'Administrators cannot change their own role or active status.'
      using errcode = '42501';
  end if;

  insert into public.staff_profiles (user_id, full_name, phone, role, is_active)
  values (target_user_id, profile_name, profile_phone, assigned_role, active)
  on conflict (user_id) do update
    set full_name = excluded.full_name,
        phone = excluded.phone,
        role = excluded.role,
        is_active = excluded.is_active;
end;
$$;

revoke all on function public.current_staff_role() from public, anon;
revoke all on function public.has_permission(text) from public, anon;
revoke all on function public.is_active_staff() from public, anon;
grant execute on function public.current_staff_role() to authenticated;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.is_active_staff() to authenticated;
revoke all on function public.assign_staff_profile(uuid, text, text, public.staff_role, boolean) from public, anon;
grant execute on function public.assign_staff_profile(uuid, text, text, public.staff_role, boolean) to authenticated;

create function public.audit_staff_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_event text;
begin
  if tg_op = 'INSERT' then
    insert into public.staff_profile_audit (
      staff_user_id, actor_user_id, event_type, new_role, new_is_active
    ) values (
      new.user_id, (select auth.uid()), 'profile_created', new.role, new.is_active
    );
    return new;
  end if;

  if new.role is distinct from old.role or new.is_active is distinct from old.is_active then
    audit_event := case
      when new.role is distinct from old.role and new.is_active is distinct from old.is_active
        then 'role_and_activation_changed'
      when new.role is distinct from old.role then 'role_changed'
      else 'activation_changed'
    end;

    insert into public.staff_profile_audit (
      staff_user_id, actor_user_id, event_type,
      old_role, new_role, old_is_active, new_is_active
    ) values (
      new.user_id, (select auth.uid()), audit_event,
      old.role, new.role, old.is_active, new.is_active
    );
  end if;

  return new;
end;
$$;

revoke all on function public.audit_staff_profile_change() from public, anon, authenticated;

create trigger audit_staff_profile_changes
  after insert or update on public.staff_profiles
  for each row execute function public.audit_staff_profile_change();

create function public.handle_customer_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_name text;
  customer_phone text;
begin
  if coalesce(new.raw_user_meta_data ->> 'account_type', '') <> 'customer' then
    return new;
  end if;

  customer_name := nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '');
  customer_phone := nullif(btrim(new.raw_user_meta_data ->> 'phone'), '');

  if customer_name is null or customer_phone is null or new.email is null then
    raise exception 'Customer sign-up requires a name, phone, and email.'
      using errcode = '23514';
  end if;

  insert into public.customers (auth_user_id, full_name, phone, email)
  values (new.id, customer_name, customer_phone, lower(new.email));

  return new;
end;
$$;

revoke all on function public.handle_customer_signup() from public, anon, authenticated;

create trigger on_auth_user_created_create_customer
  after insert on auth.users
  for each row execute function public.handle_customer_signup();

create function public.sync_customer_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.customers
    set email = lower(new.email), updated_at = now()
    where auth_user_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_customer_email() from public, anon, authenticated;

create trigger on_auth_user_email_updated_sync_customer
  after update of email on auth.users
  for each row execute function public.sync_customer_email();

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

create trigger set_staff_profiles_updated_at
  before update on public.staff_profiles
  for each row execute function public.set_updated_at();

create trigger set_customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.staff_profile_audit enable row level security;
alter table public.customers enable row level security;

revoke all on table public.permissions, public.role_permissions,
  public.staff_profiles, public.staff_profile_audit, public.customers from anon, authenticated;

grant select on table public.permissions, public.role_permissions to authenticated;
grant select on table public.staff_profiles to authenticated;
grant select on table public.staff_profile_audit to authenticated;
grant select on table public.customers to authenticated;
grant insert (full_name, phone, email) on public.customers to authenticated;
grant update (full_name, phone) on public.customers to authenticated;

create policy permissions_read_authenticated
  on public.permissions for select to authenticated
  using ((select auth.uid()) is not null);

create policy role_permissions_read_authenticated
  on public.role_permissions for select to authenticated
  using ((select auth.uid()) is not null);

create policy staff_profiles_read_own_or_admin
  on public.staff_profiles for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.has_permission('manage_staff'))
  );

create policy staff_profile_audit_read_admin
  on public.staff_profile_audit for select to authenticated
  using ((select public.has_permission('view_audit')));

create policy customers_read_own_or_permitted_staff
  on public.customers for select to authenticated
  using (
    auth_user_id = (select auth.uid())
    or (select public.has_permission('view_customers'))
  );

create policy customers_insert_walk_in_by_permitted_staff
  on public.customers for insert to authenticated
  with check (
    auth_user_id is null
    and (select public.has_permission('create_customer'))
  );

create policy customers_update_own_contact
  on public.customers for update to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

create policy customers_update_by_permitted_staff
  on public.customers for update to authenticated
  using ((select public.has_permission('manage_customers')))
  with check ((select public.has_permission('manage_customers')));
