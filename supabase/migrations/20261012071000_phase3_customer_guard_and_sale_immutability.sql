-- Tighten Phase 3 own-customer column permissions and make transaction records immutable.

create function public.guard_customer_update_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.auth_user_id = (select auth.uid())
    and not public.has_permission('manage_customers')
    and (new.email, new.notes, new.status) is distinct from (old.email, old.notes, old.status) then
    raise exception 'Customers may update only their own name and phone.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_customer_update_fields() from public, anon, authenticated;
create trigger guard_customer_update_fields before update on public.customers
  for each row execute function public.guard_customer_update_fields();

create function public.prevent_completed_sale_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Completed sale records are immutable; use a controlled correction workflow.'
    using errcode = '42501';
end;
$$;
revoke all on function public.prevent_completed_sale_mutation() from public, anon, authenticated;
create trigger sales_are_immutable before update or delete on public.sales
  for each row execute function public.prevent_completed_sale_mutation();
create trigger sale_items_are_immutable before update or delete on public.sale_items
  for each row execute function public.prevent_completed_sale_mutation();
create trigger payments_are_immutable before update or delete on public.payments
  for each row execute function public.prevent_completed_sale_mutation();

-- The first 16 UUID hex characters form a compact human-friendly receipt suffix.
-- If that suffix collides, the transaction function appends four more UUID hex characters.
alter table public.sales drop constraint sales_receipt_number_check;
alter table public.sales add constraint sales_receipt_number_check
  check (receipt_number ~ '^GP-[0-9]{6}-[0-9A-F]{16}([0-9A-F]{4})?$');
