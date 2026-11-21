-- Trigger code needs to invoke the private phone helper during an authenticated
-- row write. Keep the helper private and execute these narrow trigger wrappers
-- with the function owner's privileges instead of granting helper access.
create or replace function public.normalize_staff_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.phone is not null then
    new.phone := public.normalize_ghana_phone(new.phone);
  end if;
  return new;
end;
$$;
revoke all on function public.normalize_staff_phone() from public, anon, authenticated;

create or replace function public.normalize_customer_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.phone := public.normalize_ghana_phone(new.phone);
  return new;
end;
$$;
revoke all on function public.normalize_customer_phone() from public, anon, authenticated;
