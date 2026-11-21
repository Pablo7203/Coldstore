-- Phase 5 requires a distinct sale channel. Keep enum alteration isolated so
-- subsequent migrations can safely use the new value.
alter type public.sale_channel add value 'order_fulfilment';
