select jsonb_pretty(jsonb_build_object(
  'phase2_tables', (
    select jsonb_agg(table_name order by table_name)
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('categories', 'products', 'inventory_balances', 'stock_movements', 'audit_logs')
  ),
  'phase2_rls', (
    select jsonb_agg(jsonb_build_object('table', relation.relname, 'enabled', relation.relrowsecurity) order by relation.relname)
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in ('categories', 'products', 'inventory_balances', 'stock_movements', 'audit_logs')
  ),
  'phase2_policies', (
    select jsonb_agg(jsonb_build_object('table', tablename, 'policy', policyname, 'command', cmd) order by tablename, policyname)
    from pg_policies
    where schemaname = 'public'
      and tablename in ('categories', 'products', 'inventory_balances', 'stock_movements', 'audit_logs')
  ),
  'numeric_columns', (
    select jsonb_agg(jsonb_build_object('table', table_name, 'column', column_name, 'data_type', data_type, 'precision', numeric_precision, 'scale', numeric_scale) order by table_name, column_name)
    from information_schema.columns
    where table_schema = 'public'
      and (table_name, column_name) in (
        ('products', 'selling_price'), ('products', 'cost_price'), ('products', 'reorder_level'),
        ('inventory_balances', 'quantity'), ('stock_movements', 'quantity_delta')
      )
  ),
  'permission_matrix', (
    select jsonb_agg(jsonb_build_object('role', role, 'permission', permission_key) order by role, permission_key)
    from public.role_permissions
    where permission_key in (
      'manage_products', 'manage_inventory', 'receive_stock', 'initialize_inventory',
      'record_wastage', 'record_damage', 'adjust_inventory', 'view_stock_history'
    )
  ),
  'direct_write_privileges', jsonb_build_object(
    'authenticated_balance_update', has_table_privilege('authenticated', 'public.inventory_balances', 'UPDATE'),
    'authenticated_movement_update', has_table_privilege('authenticated', 'public.stock_movements', 'UPDATE'),
    'authenticated_product_delete', has_table_privilege('authenticated', 'public.products', 'DELETE'),
    'anonymous_balance_read', has_table_privilege('anon', 'public.inventory_balances', 'SELECT')
  ),
  'phase3_tables_present', (
    select jsonb_agg(expected.name order by expected.name)
    from (values ('sales'), ('sale_items'), ('inventory_reservations'), ('orders'), ('credit_accounts')) as expected(name)
    where to_regclass('public.' || expected.name) is not null
  )
)) as hosted_phase2_schema_verification;
