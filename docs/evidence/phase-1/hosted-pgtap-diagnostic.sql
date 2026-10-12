select jsonb_pretty(jsonb_build_object(
 'pgtap_extension', (select jsonb_build_object('schema', n.nspname, 'version', e.extversion) from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgtap'),
 'plan_functions', (select jsonb_agg(n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname='plan'),
 'search_path', current_setting('search_path')
));
