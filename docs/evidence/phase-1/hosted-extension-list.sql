select extname, extversion, extnamespace::regnamespace::text as schema_name from pg_extension order by extname;
