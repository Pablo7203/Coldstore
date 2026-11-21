# Database ERD

This diagram is derived from the committed Supabase migrations in `supabase/migrations/`. It represents the application schema as defined in source; the configured hosted Supabase database could not be reached from the current environment for a live catalog comparison.

`auth.users` is owned by Supabase Auth and shown as an external table. `audit_logs.entity_id` and `stock_movements.reference_id` are polymorphic references and therefore do not have database foreign keys to one specific table.

```mermaid
erDiagram
  AUTH_USERS {
    uuid id PK
  }

  PERMISSIONS {
    text permission_key PK
    text description
  }

  ROLE_PERMISSIONS {
    staff_role role PK
    text permission_key PK, FK
  }

  STAFF_PROFILES {
    uuid user_id PK, FK
    text full_name
    text phone
    staff_role role
    boolean is_active
    timestamptz created_at
    timestamptz updated_at
  }

  STAFF_PROFILE_AUDIT {
    bigint id PK
    uuid staff_user_id
    uuid actor_user_id FK
    text event_type
    staff_role old_role
    staff_role new_role
    boolean old_is_active
    boolean new_is_active
    timestamptz created_at
  }

  CUSTOMERS {
    uuid id PK
    uuid auth_user_id FK
    text full_name
    text phone
    text email
    customer_status status
    text notes
    timestamptz created_at
    timestamptz updated_at
  }

  CATEGORIES {
    uuid id PK
    text name
    text slug
    boolean is_active
    timestamptz created_at
    timestamptz updated_at
  }

  PRODUCTS {
    uuid id PK
    uuid category_id FK
    text sku
    text barcode
    text name
    numeric selling_price
    numeric cost_price
    numeric reorder_level
    boolean is_active
  }

  INVENTORY_BALANCES {
    uuid product_id PK, FK
    numeric quantity
    timestamptz updated_at
  }

  STOCK_MOVEMENTS {
    uuid id PK
    uuid product_id FK
    stock_movement_type movement_type
    numeric quantity_delta
    text reference_type
    uuid reference_id
    uuid actor_user_id FK
    text actor_name
    timestamptz occurred_at
  }

  AUDIT_LOGS {
    bigint id PK
    uuid actor_user_id FK
    text action
    text entity_type
    uuid entity_id
    jsonb details
    timestamptz created_at
  }

  SALES {
    uuid id PK
    text receipt_number
    uuid customer_id FK
    uuid cashier_user_id FK
    sale_channel channel
    sale_status status
    numeric subtotal
    numeric total
    uuid client_operation_id
    timestamptz occurred_at
  }

  SALE_ITEMS {
    uuid id PK
    uuid sale_id FK
    uuid product_id FK
    text product_name_snapshot
    text sku_snapshot
    numeric unit_price
    numeric quantity
    numeric line_total
  }

  PAYMENTS {
    uuid id PK
    uuid sale_id FK
    uuid customer_id FK
    uuid order_id
    payment_method method
    numeric amount
    payment_status status
    text provider
    text provider_reference
    uuid recorded_by FK
    timestamptz occurred_at
  }

  CREDIT_ACCOUNTS {
    uuid customer_id PK, FK
    numeric credit_limit
    numeric current_balance
    credit_account_status status
    timestamptz created_at
    timestamptz updated_at
  }

  CREDIT_TRANSACTIONS {
    uuid id PK
    uuid customer_id FK
    credit_transaction_type transaction_type
    numeric amount
    uuid sale_id FK
    uuid payment_id FK
    uuid client_operation_id
    uuid recorded_by FK
    numeric balance_after
    numeric available_after
    timestamptz occurred_at
  }

  PERMISSIONS ||--o{ ROLE_PERMISSIONS : grants
  AUTH_USERS ||--o| STAFF_PROFILES : has_profile
  AUTH_USERS ||--o| CUSTOMERS : linked_identity
  AUTH_USERS ||--o{ STAFF_PROFILE_AUDIT : audited_staff
  AUTH_USERS o|--o{ STAFF_PROFILE_AUDIT : audit_actor
  CUSTOMERS ||--o| CREDIT_ACCOUNTS : has_account
  CUSTOMERS o|--o{ SALES : places
  AUTH_USERS ||--o{ SALES : cashier
  CATEGORIES ||--o{ PRODUCTS : contains
  PRODUCTS ||--o| INVENTORY_BALANCES : balance
  PRODUCTS ||--o{ STOCK_MOVEMENTS : movement_history
  AUTH_USERS o|--o{ STOCK_MOVEMENTS : movement_actor
  SALES ||--|{ SALE_ITEMS : contains
  PRODUCTS ||--o{ SALE_ITEMS : sold_as
  SALES ||--o| PAYMENTS : paid_by
  CUSTOMERS o|--o{ PAYMENTS : repayment_customer
  AUTH_USERS o|--o{ PAYMENTS : payment_recorder
  CUSTOMERS ||--o{ CREDIT_TRANSACTIONS : ledger
  SALES o|--o| CREDIT_TRANSACTIONS : credit_sale
  PAYMENTS o|--o| CREDIT_TRANSACTIONS : repayment
  AUTH_USERS o|--o{ CREDIT_TRANSACTIONS : transaction_recorder
  AUTH_USERS o|--o{ AUDIT_LOGS : audit_actor
```

## Relationship notes

- `staff_profiles.user_id` and `customers.auth_user_id` point to `auth.users`; a database trigger prevents the same identity from being assigned to both customer and staff records.
- `role_permissions` uses `(role, permission_key)` as its composite primary key. `role` references the `staff_role` enum, while `permission_key` references `permissions`.
- `inventory_balances.product_id` is both its primary key and a foreign key, giving each product at most one current balance. The migrations do not require a balance row at product creation time.
- `payments` supports both sale payments and customer credit repayments. Its `sale_id`, `customer_id`, and `order_id` combinations are constrained by a check; `order_id` has no foreign key because no `orders` table is present in these migrations.
- `credit_transactions` are append-only ledger rows. A credit sale may reference both a sale and its outstanding payment; a repayment references its payment and customer.
- `staff_profile_audit.staff_user_id` is intentionally not a foreign key, preserving history if a staff identity is deleted. `audit_logs.entity_id`, `stock_movements.reference_id`, and `payments.order_id` are not foreign keys.
