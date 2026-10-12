select has_function_privilege('cli_login_postgres', 'extensions.plan(integer)', 'EXECUTE') as cli_can_execute_plan,
       has_schema_privilege('anon', 'extensions', 'USAGE') as anon_can_use_extensions,
       has_schema_privilege('authenticated', 'extensions', 'USAGE') as authenticated_can_use_extensions;
