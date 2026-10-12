create function public.normalize_ghana_phone(raw_phone text)
returns text
language plpgsql
immutable
strict
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

create function public.normalize_staff_phone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.phone is not null then
    new.phone := public.normalize_ghana_phone(new.phone);
  end if;
  return new;
end;
$$;

create function public.normalize_customer_phone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.phone := public.normalize_ghana_phone(new.phone);
  return new;
end;
$$;

revoke all on function public.normalize_staff_phone() from public, anon, authenticated;
revoke all on function public.normalize_customer_phone() from public, anon, authenticated;

create trigger normalize_staff_profile_phone
  before insert or update of phone on public.staff_profiles
  for each row execute function public.normalize_staff_phone();

create trigger normalize_customer_profile_phone
  before insert or update of phone on public.customers
  for each row execute function public.normalize_customer_phone();

update public.staff_profiles
set phone = public.normalize_ghana_phone(phone)
where phone is not null;

update public.customers
set phone = public.normalize_ghana_phone(phone);
