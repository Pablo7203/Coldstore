begin;
create function pg_temp.phone_rejected(candidate text) returns boolean
language plpgsql as $$
begin
  perform public.normalize_ghana_phone(candidate);
  return false;
exception when sqlstate '22023' then
  return true;
end;
$$;
with valid_inputs(input, expected) as (values
  ('0241234567', '+233241234567'),
  ('024 123 4567', '+233241234567'),
  ('(024) 123-4567', '+233241234567'),
  ('+233241234567', '+233241234567'),
  ('+233 24 123 4567', '+233241234567'),
  ('233-24-123-4567', '+233241234567')
), checks as (
  select input, expected, public.normalize_ghana_phone(input) as actual,
         public.normalize_ghana_phone(input) = expected as passed
  from valid_inputs
), invalid_checks as (
  select input, pg_temp.phone_rejected(input) as passed
  from (values ('024123456'), ('02412345678'), ('+234241234567'), ('02412ABC67'), ('+2330241234567'), ('++233241234567')) as invalid(input)
)
select jsonb_pretty(jsonb_build_object(
  'valid_cases', (select jsonb_agg(jsonb_build_object('input', input, 'expected', expected, 'actual', actual, 'passed', passed)) from checks),
  'valid_passed', (select count(*) from checks where passed),
  'invalid_cases', (select jsonb_agg(jsonb_build_object('input', input, 'rejected', passed)) from invalid_checks),
  'invalid_rejected', (select count(*) from invalid_checks where passed)
)) as phone_verification;
rollback;
