-- The hosted Supabase CLI pgTAP runner connects as cli_login_postgres.
-- Let that operator-only role resolve pgTAP functions in the extensions schema.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'cli_login_postgres') then
    grant usage on schema extensions to cli_login_postgres;
  end if;
end;
$$;
