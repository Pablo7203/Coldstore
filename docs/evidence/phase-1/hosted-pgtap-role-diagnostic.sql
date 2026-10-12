do $$ begin raise exception 'pgTAP runner role: %', current_user; end $$;
