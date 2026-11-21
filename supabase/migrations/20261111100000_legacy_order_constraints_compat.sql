-- Preserve existing order records while accepting the identifiers and fulfillment
-- methods written by the current customer checkout flow.
-- This compatibility migration is forward-only and does not rewrite stored rows.

alter table public.orders
  drop constraint if exists orders_order_number_check;

alter table public.orders
  add constraint orders_order_number_check
  check (
    order_number ~ '^(GP-ORD-[0-9]{6}-[0-9A-F]{16}|ORD-[0-9]{6}-[0-9A-F]{8})$'
  );

alter table public.orders
  drop constraint if exists orders_fulfillment_method_check;

alter table public.orders
  add constraint orders_fulfillment_method_check
  check (fulfillment_method in ('pickup', 'store_pickup', 'delivery'));
