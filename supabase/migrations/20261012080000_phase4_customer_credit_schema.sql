-- Phase 4 schema. The new enum value is isolated because PostgreSQL cannot use
-- a value added by ALTER TYPE until the transaction containing it commits.
alter type public.payment_status add value 'outstanding';
