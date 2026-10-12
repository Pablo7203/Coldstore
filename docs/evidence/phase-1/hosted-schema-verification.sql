select jsonb_pretty(jsonb_build_object(
  'enums', (
    select jsonb_agg(jsonb_build_object('name', t.typname, 'values', (
      select jsonb_agg(e.enumlabel order by e.enumsortorder)
      from pg_enum e where e.enumtypid = t.oid
    )) order by t.typname)
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname in ('staff_role', 'customer_status')
  ),
  'tables', (
    select jsonb_agg(c.relname order by c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname in ('staff_profiles', 'customers', 'permissions', 'role_permissions', 'staff_profile_audit')
  ),
  'rls_enabled', (
    select jsonb_agg(jsonb_build_object('table', c.relname, 'enabled', c.relrowsecurity) order by c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('staff_profiles', 'customers', 'permissions', 'role_permissions', 'staff_profile_audit')
  ),
  'functions', (
    select jsonb_agg(p.proname order by p.proname)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('current_staff_role', 'has_permission', 'is_active_staff', 'assign_staff_profile')
  ),
  'policies', (
    select jsonb_agg(jsonb_build_object('table', tablename, 'policy', policyname) order by tablename, policyname)
    from pg_policies where schemaname = 'public'
  ),
  'triggers', (
    select jsonb_agg(jsonb_build_object('schema', n.nspname, 'table', c.relname, 'trigger', tg.tgname) order by n.nspname, c.relname, tg.tgname)
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not tg.tgisinternal and tg.tgname in (
      'audit_staff_profile_changes', 'on_auth_user_created_create_customer',
      'on_auth_user_email_updated_sync_customer', 'set_staff_profiles_updated_at',
      'set_customers_updated_at'
    )
  ),
  'out_of_scope_tables', (
    select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname = any(array[
        'products', 'categories', 'inventory', 'inventory_balances', 'stock_movements',
        'pos', 'sales', 'sale_items', 'credit_accounts', 'credit_transactions', 'orders'
      ])
  )
));
