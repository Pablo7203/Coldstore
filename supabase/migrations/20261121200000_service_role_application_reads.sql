-- A service_role request bypasses RLS but still needs ordinary SQL privileges.
-- Grant only the server-side reads used by the storefront and email service.
grant usage on schema public to service_role;

grant select on table public.categories, public.products, public.orders,
  public.order_items, public.customers, public.staff_profiles to service_role;

grant execute on function public.get_orderable_catalog(text, uuid, integer)
  to service_role;
