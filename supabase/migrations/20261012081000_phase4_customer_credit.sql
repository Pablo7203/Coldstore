create type public.credit_account_status as enum ('active', 'suspended');
create type public.credit_transaction_type as enum (
  'credit_sale', 'repayment', 'adjustment', 'reversal'
);

insert into public.permissions (permission_key, description) values
  ('view_credit', 'View credit account summaries needed to serve customers.'),
  ('view_credit_history', 'View customer credit ledger and repayment history.'),
  ('record_credit_repayment', 'Record cash or externally confirmed MoMo credit repayments.')
on conflict (permission_key) do nothing;

insert into public.role_permissions (role, permission_key)
select role.role::public.staff_role, permission.permission_key
from (values ('manager'), ('cashier')) as role(role)
cross join (values ('view_credit'), ('view_credit_history'), ('record_credit_repayment'))
  as permission(permission_key)
on conflict do nothing;

create table public.credit_accounts (
  customer_id uuid primary key references public.customers (id) on delete restrict,
  credit_limit numeric not null check (
    credit_limit >= 0 and credit_limit < 1000000000000 and scale(credit_limit) <= 2
  ),
  current_balance numeric not null default 0 check (
    current_balance >= 0 and current_balance < 1000000000000 and scale(current_balance) <= 2
  ),
  status public.credit_account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_credit_accounts_updated_at
before update on public.credit_accounts
for each row execute function public.set_updated_at();

alter table public.payments
  add column customer_id uuid references public.customers (id) on delete restrict;
alter table public.payments drop constraint payments_check;
alter table public.payments add constraint payments_reference_check check (
  (sale_id is not null and customer_id is null) or
  (sale_id is not null and method = 'credit' and customer_id is not null and status = 'outstanding') or
  (order_id is not null and customer_id is null) or
  (sale_id is null and order_id is null and customer_id is not null and method in ('cash', 'external_momo') and status = 'recorded')
);
create index payments_customer_occurred_idx
  on public.payments (customer_id, occurred_at desc, id desc)
  where customer_id is not null;

create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  transaction_type public.credit_transaction_type not null,
  amount numeric not null check (
    amount > 0 and amount < 1000000000000 and scale(amount) <= 2
  ),
  sale_id uuid references public.sales (id) on delete restrict,
  payment_id uuid references public.payments (id) on delete restrict,
  client_operation_id uuid not null unique,
  recorded_by uuid references auth.users (id) on delete set null,
  balance_after numeric not null check (
    balance_after >= 0 and balance_after < 1000000000000 and scale(balance_after) <= 2
  ),
  available_after numeric not null check (
    available_after >= 0 and available_after < 1000000000000 and scale(available_after) <= 2
  ),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (
    (transaction_type = 'credit_sale' and sale_id is not null and payment_id is not null)
    or (transaction_type = 'repayment' and sale_id is null and payment_id is not null)
    or transaction_type in ('adjustment', 'reversal')
  )
);
create unique index credit_transactions_sale_unique
  on public.credit_transactions (sale_id) where sale_id is not null;
create unique index credit_transactions_payment_unique
  on public.credit_transactions (payment_id) where payment_id is not null;
create unique index credit_transactions_credit_sale_operation_unique
  on public.credit_transactions (recorded_by, client_operation_id)
  where transaction_type = 'credit_sale';

create function public.prevent_credit_transaction_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Credit ledger entries are immutable.' using errcode = '42501';
end;
$$;
revoke all on function public.prevent_credit_transaction_mutation() from public, anon, authenticated;
create trigger credit_transactions_immutable
before update or delete on public.credit_transactions
for each row execute function public.prevent_credit_transaction_mutation();
create index credit_transactions_customer_occurred_idx
  on public.credit_transactions (customer_id, occurred_at desc, id desc);

alter table public.audit_logs drop constraint audit_logs_action_check;
alter table public.audit_logs add constraint audit_logs_action_check check (action in (
  'category.created', 'category.updated', 'category.deactivated',
  'product.created', 'product.updated', 'product.deactivated',
  'product.selling_price_changed',
  'inventory.opening_stock', 'inventory.receipt', 'inventory.wastage',
  'inventory.damage', 'inventory.adjustment_in', 'inventory.adjustment_out',
  'customer.created', 'customer.updated', 'sale.completed', 'payment.recorded',
  'credit.account_enabled', 'credit.limit_changed', 'credit.status_changed',
  'credit.sale_completed', 'credit.repayment_recorded'
));
alter table public.audit_logs drop constraint audit_logs_entity_type_check;
alter table public.audit_logs add constraint audit_logs_entity_type_check check (
  entity_type in (
    'category', 'product', 'stock_movement', 'customer', 'sale', 'payment',
    'credit_account', 'credit_transaction'
  )
);

alter table public.credit_accounts enable row level security;
alter table public.credit_transactions enable row level security;
revoke all on public.credit_accounts, public.credit_transactions from anon, authenticated;

create function public.prevent_credit_balance_direct_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.current_balance is distinct from old.current_balance then
    raise exception 'Credit balance changes must be recorded through the credit ledger.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_credit_balance_direct_update() from public, anon, authenticated;
create trigger credit_balance_ledger_guard
before update of current_balance on public.credit_accounts
for each row execute function public.prevent_credit_balance_direct_update();

create policy credit_accounts_read_permitted_staff
on public.credit_accounts for select to authenticated
using ((select public.has_permission('view_credit')));
create policy credit_transactions_read_permitted_staff
on public.credit_transactions for select to authenticated
using ((select public.has_permission('view_credit_history')));

create function public.available_credit(
  p_credit_limit numeric,
  p_current_balance numeric,
  p_status public.credit_account_status
)
returns numeric
language sql immutable
set search_path = ''
as $$
  select case when p_status = 'active'
    then greatest(p_credit_limit - p_current_balance, 0::numeric)
    else 0::numeric
  end;
$$;
revoke all on function public.available_credit(numeric, numeric, public.credit_account_status)
  from public, anon;
grant execute on function public.available_credit(numeric, numeric, public.credit_account_status)
  to authenticated;

create function public.manage_credit_account(
  p_customer_id uuid,
  p_credit_limit numeric,
  p_status public.credit_account_status
)
returns table (
  customer_id uuid,
  credit_limit numeric,
  current_balance numeric,
  available_credit numeric,
  status public.credit_account_status,
  updated_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  customer_row public.customers%rowtype;
  prior_account public.credit_accounts%rowtype;
  next_account public.credit_accounts%rowtype;
  account_event text;
begin
  if actor is null or not public.has_permission('manage_credit') then
    raise exception 'You are not authorized to manage credit accounts.' using errcode = '42501';
  end if;
  if p_customer_id is null or p_credit_limit is null or p_status is null
    or p_credit_limit < 0 or p_credit_limit >= 1000000000000 or scale(p_credit_limit) > 2 then
    raise exception 'Enter a valid credit limit and status.' using errcode = '22023';
  end if;

  select * into customer_row from public.customers
    where id = p_customer_id and status = 'active' for update;
  if not found then
    raise exception 'Credit can only be enabled for an active customer.' using errcode = 'P0002';
  end if;
  select * into prior_account from public.credit_accounts
    where credit_accounts.customer_id = p_customer_id for update;

  if not found then
    insert into public.credit_accounts(customer_id, credit_limit, status)
    values (p_customer_id, p_credit_limit, p_status)
    returning * into next_account;
    account_event := 'credit.account_enabled';
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
    values (actor, account_event, 'credit_account', p_customer_id,
      jsonb_build_object('credit_limit', next_account.credit_limit,
        'status', next_account.status, 'current_balance', next_account.current_balance));
  else
    update public.credit_accounts
      set credit_limit = p_credit_limit, status = p_status
      where credit_accounts.customer_id = p_customer_id
      returning * into next_account;
    if prior_account.credit_limit is distinct from next_account.credit_limit then
      insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
      values (actor, 'credit.limit_changed', 'credit_account', p_customer_id,
        jsonb_build_object('before', prior_account.credit_limit, 'after', next_account.credit_limit));
    end if;
    if prior_account.status is distinct from next_account.status then
      insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
      values (actor, 'credit.status_changed', 'credit_account', p_customer_id,
        jsonb_build_object('before', prior_account.status, 'after', next_account.status));
    end if;
  end if;

  return query select next_account.customer_id, next_account.credit_limit,
    next_account.current_balance,
    public.available_credit(next_account.credit_limit, next_account.current_balance, next_account.status),
    next_account.status, next_account.updated_at;
end;
$$;
revoke all on function public.manage_credit_account(uuid, numeric, public.credit_account_status)
  from public, anon;
grant execute on function public.manage_credit_account(uuid, numeric, public.credit_account_status)
  to authenticated;

create function public.get_credit_account(p_customer_id uuid)
returns table (
  customer_id uuid,
  customer_name text,
  customer_phone text,
  customer_status public.customer_status,
  credit_limit numeric,
  current_balance numeric,
  available_credit numeric,
  status public.credit_account_status,
  updated_at timestamptz
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.has_permission('view_credit') then
    raise exception 'You are not authorized to view credit accounts.' using errcode = '42501';
  end if;
  return query
    select account.customer_id, customer.full_name, customer.phone, customer.status,
      account.credit_limit, account.current_balance,
      public.available_credit(account.credit_limit, account.current_balance, account.status),
      account.status, account.updated_at
    from public.credit_accounts account
    join public.customers customer on customer.id = account.customer_id
    where account.customer_id = p_customer_id;
end;
$$;
revoke all on function public.get_credit_account(uuid) from public, anon;
grant execute on function public.get_credit_account(uuid) to authenticated;

create function public.search_credit_accounts(p_query text default '', p_limit integer default 50)
returns table (
  customer_id uuid,
  customer_name text,
  customer_phone text,
  customer_status public.customer_status,
  credit_limit numeric,
  current_balance numeric,
  available_credit numeric,
  status public.credit_account_status,
  updated_at timestamptz
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.has_permission('view_credit') then
    raise exception 'You are not authorized to view credit accounts.' using errcode = '42501';
  end if;
  if p_limit not between 1 and 100 or length(btrim(coalesce(p_query, ''))) > 100 then
    raise exception 'Invalid credit account search.' using errcode = '22023';
  end if;
  return query
    select account.customer_id, customer.full_name, customer.phone, customer.status,
      account.credit_limit, account.current_balance,
      public.available_credit(account.credit_limit, account.current_balance, account.status),
      account.status, account.updated_at
    from public.credit_accounts account
    join public.customers customer on customer.id = account.customer_id
    where nullif(btrim(p_query), '') is null
      or lower(customer.full_name) like lower(btrim(p_query)) || '%'
      or customer.phone like btrim(p_query) || '%'
    order by customer.full_name, account.customer_id
    limit p_limit;
end;
$$;
revoke all on function public.search_credit_accounts(text, integer) from public, anon;
grant execute on function public.search_credit_accounts(text, integer) to authenticated;

create function public.get_credit_history(
  p_customer_id uuid,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid,
  transaction_type public.credit_transaction_type,
  amount numeric,
  balance_after numeric,
  available_after numeric,
  occurred_at timestamptz,
  sale_id uuid,
  receipt_number text,
  payment_id uuid,
  payment_method public.payment_method,
  provider_reference text,
  recorded_by uuid,
  recorded_by_name text
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.has_permission('view_credit_history') then
    raise exception 'You are not authorized to view credit history.' using errcode = '42501';
  end if;
  if p_limit not between 1 and 100 or p_offset < 0 then
    raise exception 'Invalid credit history page.' using errcode = '22023';
  end if;
  return query
    select transaction.id, transaction.transaction_type, transaction.amount,
      transaction.balance_after, transaction.available_after, transaction.occurred_at, transaction.sale_id,
      sale.receipt_number, transaction.payment_id, payment.method,
      payment.provider_reference, transaction.recorded_by, staff.full_name
    from public.credit_transactions transaction
    left join public.sales sale on sale.id = transaction.sale_id
    left join public.payments payment on payment.id = transaction.payment_id
    left join public.staff_profiles staff on staff.user_id = transaction.recorded_by
    where transaction.customer_id = p_customer_id
    order by transaction.occurred_at desc, transaction.id desc
    limit p_limit offset p_offset;
end;
$$;
revoke all on function public.get_credit_history(uuid, integer, integer) from public, anon;
grant execute on function public.get_credit_history(uuid, integer, integer) to authenticated;

create function public.record_credit_repayment(
  p_customer_id uuid,
  p_amount numeric,
  p_payment_method public.payment_method,
  p_client_operation_id uuid,
  p_provider_reference text default null
)
returns table (
  payment_id uuid,
  transaction_id uuid,
  customer_id uuid,
  customer_name text,
  amount numeric,
  payment_method public.payment_method,
  provider_reference text,
  remaining_balance numeric,
  remaining_available numeric,
  available_after numeric,
  recorded_by_name text,
  occurred_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  actor_name text;
  customer_row public.customers%rowtype;
  account_row public.credit_accounts%rowtype;
  prior_transaction public.credit_transactions%rowtype;
  prior_payment public.payments%rowtype;
  payment_key uuid := gen_random_uuid();
  transaction_key uuid := gen_random_uuid();
  next_balance numeric;
  next_available numeric;
begin
  if actor is null or not public.has_permission('record_credit_repayment') then
    raise exception 'You are not authorized to record credit repayments.' using errcode = '42501';
  end if;
  if p_customer_id is null or p_amount is null or p_amount <= 0
    or p_amount >= 1000000000000 or scale(p_amount) > 2
    or p_client_operation_id is null then
    raise exception 'Enter a positive repayment amount with at most two decimal places.' using errcode = '22023';
  end if;
  if p_payment_method not in ('cash', 'external_momo') then
    raise exception 'Repayments must use cash or externally confirmed mobile money.' using errcode = '22023';
  end if;
  if p_payment_method = 'external_momo' and p_provider_reference is not null
    and (length(btrim(p_provider_reference)) = 0 or length(btrim(p_provider_reference)) > 120) then
    raise exception 'MoMo reference must be 1 to 120 characters.' using errcode = '22023';
  end if;
  select profile.full_name into actor_name from public.staff_profiles profile
    where profile.user_id = actor and profile.is_active
      and profile.role in ('admin', 'manager', 'cashier');
  if actor_name is null then
    raise exception 'An active authorized staff profile is required.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':' || p_client_operation_id::text, 0));
  select * into prior_transaction from public.credit_transactions transaction
    where transaction.client_operation_id = p_client_operation_id;
  if found then
    select * into prior_payment from public.payments payment where payment.id = prior_transaction.payment_id;
    if prior_transaction.transaction_type <> 'repayment'
      or prior_transaction.customer_id <> p_customer_id
      or prior_transaction.amount <> p_amount
      or prior_payment.method <> p_payment_method
      or coalesce(prior_payment.provider_reference, '') <> coalesce(nullif(btrim(p_provider_reference), ''), '') then
      raise exception 'This operation ID was already used for a different transaction.' using errcode = '23505';
    end if;
    return query select prior_payment.id, prior_transaction.id, prior_transaction.customer_id,
      (select customer.full_name from public.customers customer where customer.id = p_customer_id),
      prior_transaction.amount, prior_payment.method, prior_payment.provider_reference,
      prior_transaction.balance_after, prior_transaction.available_after,
      coalesce((select profile.full_name from public.staff_profiles profile
        where profile.user_id = prior_transaction.recorded_by), actor_name), prior_transaction.occurred_at;
    return;
  end if;

  -- All credit mutations lock customer then account. Inactive customers may repay.
  select * into customer_row from public.customers customer
    where customer.id = p_customer_id for update;
  if not found then
    raise exception 'Customer credit account was not found.' using errcode = 'P0002';
  end if;
  select * into account_row from public.credit_accounts account
    where account.customer_id = p_customer_id for update;
  if not found then
    raise exception 'Customer credit account was not found.' using errcode = 'P0002';
  end if;
  if p_amount > account_row.current_balance then
    raise exception 'Repayment exceeds the outstanding balance.' using errcode = '23514';
  end if;
  next_balance := account_row.current_balance - p_amount;
  next_available := public.available_credit(
    account_row.credit_limit, next_balance, account_row.status
  );

  insert into public.payments(
    id, customer_id, method, amount, status, provider_reference,
    client_operation_id, recorded_by
  ) values (
    payment_key, p_customer_id, p_payment_method, p_amount, 'recorded',
    nullif(btrim(p_provider_reference), ''), p_client_operation_id, actor
  );
  update public.credit_accounts account
    set current_balance = next_balance where account.customer_id = p_customer_id;
  insert into public.credit_transactions(
    id, customer_id, transaction_type, amount, payment_id,
    client_operation_id, recorded_by, balance_after, available_after
  ) values (
    transaction_key, p_customer_id, 'repayment', p_amount, payment_key,
    p_client_operation_id, actor, next_balance, next_available
  );
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
  values (actor, 'payment.recorded', 'payment', payment_key,
    jsonb_build_object('customer_id', p_customer_id, 'method', p_payment_method,
      'amount', p_amount, 'credit_transaction_id', transaction_key));
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
  values (actor, 'credit.repayment_recorded', 'credit_transaction', transaction_key,
    jsonb_build_object('customer_id', p_customer_id, 'amount', p_amount,
      'balance_before', account_row.current_balance, 'balance_after', next_balance,
      'payment_method', p_payment_method));
  return query select payment_key, transaction_key, p_customer_id, customer_row.full_name,
    p_amount, p_payment_method, nullif(btrim(p_provider_reference), ''), next_balance, next_available,
    actor_name, now();
end;
$$;
revoke all on function public.record_credit_repayment(uuid, numeric, public.payment_method, uuid, text)
  from public, anon;
grant execute on function public.record_credit_repayment(uuid, numeric, public.payment_method, uuid, text)
  to authenticated;

create function public.get_credit_repayment(p_payment_id uuid)
returns table (
  payment_id uuid,
  customer_id uuid,
  customer_name text,
  amount numeric,
  payment_method public.payment_method,
  provider_reference text,
  balance_after numeric,
  available_after numeric,
  recorded_by_name text,
  occurred_at timestamptz
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.has_permission('view_credit_history') then
    raise exception 'You are not authorized to view credit history.' using errcode = '42501';
  end if;
  return query
    select payment.id, payment.customer_id, customer.full_name, payment.amount,
      payment.method, payment.provider_reference, transaction.balance_after, transaction.available_after,
      staff.full_name, payment.occurred_at
    from public.payments payment
    join public.credit_transactions transaction on transaction.payment_id = payment.id
    join public.customers customer on customer.id = payment.customer_id
    left join public.staff_profiles staff on staff.user_id = payment.recorded_by
    where payment.id = p_payment_id and transaction.transaction_type = 'repayment';
end;
$$;
revoke all on function public.get_credit_repayment(uuid) from public, anon;
grant execute on function public.get_credit_repayment(uuid) to authenticated;

comment on table public.credit_accounts is
  'Current credit limits and outstanding balance. Balance changes only through immutable credit transactions.';
comment on table public.credit_transactions is
  'Append-only credit sales and repayments. adjustment/reversal are reserved for future controlled workflows.';
comment on column public.payments.status is
  'For a credit tender, outstanding means debt was recorded and no money was received.';
