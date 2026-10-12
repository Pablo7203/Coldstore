select jsonb_pretty(jsonb_build_object(
 'staff_profiles', (select count(*) from public.staff_profiles),
 'staff_phone_rows', (select count(*) from public.staff_profiles where phone is not null),
 'customers', (select count(*) from public.customers),
 'customer_phone_rows', (select count(*) from public.customers where phone is not null),
 'noncanonical_staff_phone_rows', (select count(*) from public.staff_profiles where phone is not null and phone !~ '^\+233[0-9]{9}$'),
 'noncanonical_customer_phone_rows', (select count(*) from public.customers where phone !~ '^\+233[0-9]{9}$')
));
