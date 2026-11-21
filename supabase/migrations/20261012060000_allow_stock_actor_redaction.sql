-- Preserve append-only stock history while allowing Auth user deletion to apply
-- the stock_movements.actor_user_id ON DELETE SET NULL foreign-key action.
create or replace function public.prevent_stock_movement_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and old.actor_user_id is not null
    and new.actor_user_id is null
    and row(
      new.id, new.product_id, new.movement_type, new.quantity_delta,
      new.reference_type, new.reference_id, new.reason, new.actor_name,
      new.client_operation_id, new.occurred_at, new.created_at
    ) is not distinct from row(
      old.id, old.product_id, old.movement_type, old.quantity_delta,
      old.reference_type, old.reference_id, old.reason, old.actor_name,
      old.client_operation_id, old.occurred_at, old.created_at
    )
  then
    return new;
  end if;

  raise exception 'Stock movements are immutable; record a compensating movement.'
    using errcode = '42501';
end;
$$;

comment on function public.prevent_stock_movement_mutation() is
  'Rejects stock movement edits/deletes; allows only FK-driven actor_user_id redaction when an Auth user is deleted.';
