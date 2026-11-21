-- The phone helper is pure validation. Run it as its owner so RLS-protected
-- customer/staff writes can invoke their normalization triggers without granting
-- clients direct execution of the helper.
create or replace function public.normalize_ghana_phone(raw_phone text)
returns text
language plpgsql
immutable
strict
security definer
set search_path = ''
as $$
declare
  compact text := pg_catalog.regexp_replace(pg_catalog.btrim(raw_phone), '[-[:space:]()]', '', 'g');
begin
  if compact ~ '^0[0-9]{9}$' then
    return '+233' || pg_catalog.substr(compact, 2);
  end if;

  if compact ~ '^\+?233[0-9]{9}$' then
    if pg_catalog.left(compact, 1) = '+' then
      return compact;
    end if;
    return '+' || compact;
  end if;

  raise exception 'Enter a valid Ghana phone number.' using errcode = '22023';
end;
$$;
revoke all on function public.normalize_ghana_phone(text) from public, anon, authenticated;
