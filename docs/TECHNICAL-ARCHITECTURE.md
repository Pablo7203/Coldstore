# Grand Pa’s Cold Store Management System
# Technical Architecture & Engineering Reference
## Web-Only Offline-Capable Architecture

**Document role:** Permanent technical source of truth for Codex\
**Project:** Grand Pa’s Cold Store Management System\
**Business location:** Ghana\
**Currency:** GHS\
**Timezone:** Africa/Accra\
**Status:** New web-only architecture baseline\
**Must be read with:** `docs/PRD.md`\
**Supersedes:** All previous WordPress, Tauri, Windows desktop, SQLite and installer architecture documents

---

# 1. Purpose

This document defines the permanent technical architecture, engineering rules, security boundaries, data ownership model, offline strategy, synchronization rules, database principles, testing expectations and implementation constraints for the Grand Pa’s Cold Store Management System.

Codex must treat this document as a binding engineering reference throughout implementation.

If an approved architectural decision needs to change, Codex must document the change in an Architecture Decision Record (ADR) under:

```text
docs/adr/
```

before implementing it.

---

# 2. Source-of-Truth Precedence

If implementation documents conflict, use this order:

1. `docs/PRD.md` — product scope and business requirements
2. `docs/TECHNICAL-ARCHITECTURE.md` — technical architecture and engineering rules
3. Approved ADRs
4. Phase-specific implementation plans
5. Code comments and local implementation notes

Do not silently override higher-priority documents because another implementation is easier.

---

# 3. System Architecture

Grand Pa’s Cold Store is implemented as one responsive web application.

```text
                    GRAND PA'S COLD STORE
                             │
                      WEB APPLICATION
                    Next.js + React
                             │
              ┌──────────────┴──────────────┐
              │                             │
         STAFF SYSTEM                 CUSTOMER SIDE
              │                             │
 Dashboard / POS / Inventory         Catalogue / Cart
 Customers / Credit / Reports        Orders / Payments
              │                             │
              └──────────────┬──────────────┘
                             │
                       NEXT.JS SERVER
                             │
                      SUPABASE CLOUD
                ┌────────────┼────────────┐
                │            │            │
           PostgreSQL       Auth        Storage
                │
             Paystack
```

Offline-capable staff POS:

```text
Browser / Installed PWA
        │
        ▼
 IndexedDB + Dexie.js
        │
        ▼
    Sync Outbox
        │
 Connectivity returns
        ▼
 Next.js Sync Endpoint
        │
        ▼
 Supabase PostgreSQL
```

---

# 4. Locked Technology Stack

## Application

- Next.js
- React
- TypeScript
- App Router
- Tailwind CSS
- shadcn/ui

## Backend

- Next.js Server Actions
- Next.js Route Handlers
- Supabase PostgreSQL
- Supabase Auth
- Supabase Storage where required
- PostgreSQL Row Level Security
- PostgreSQL functions/RPC where transactionally appropriate

## Offline Capability

- Progressive Web App
- Service Worker
- IndexedDB
- Dexie.js

## Payments

- Paystack
- Server-side verification
- Webhooks
- Idempotent event handling

## Deployment

- Vercel
- Supabase

## Testing

- Vitest
- React Testing Library
- Playwright
- SQL/RLS tests
- Offline/synchronization integration tests

## Development

- Git
- GitHub
- Supabase CLI
- Database migrations
- Environment variables
- CI where practical

---

# 5. Explicitly Excluded Technologies

Do not introduce without a new approved ADR:

- WordPress
- WooCommerce
- Tauri
- Electron
- SQLite
- Native Windows application
- Native Android application
- Native iOS application
- Separate desktop codebase

The product is one web application.

---

# 6. Recommended Repository Structure

Use one repository.

```text
GrandPa-Web/
├── app/
│   ├── (auth)/
│   ├── (staff)/
│   │   ├── dashboard/
│   │   ├── products/
│   │   ├── inventory/
│   │   ├── customers/
│   │   ├── credit/
│   │   ├── orders/
│   │   ├── reports/
│   │   ├── audit/
│   │   └── settings/
│   │
│   ├── (customer)/
│   │   ├── shop/
│   │   ├── cart/
│   │   ├── checkout/
│   │   └── account/
│   │
│   ├── pos/
│   └── api/
│       ├── sync/
│       ├── payments/
│       └── webhooks/
│
├── components/
│   ├── ui/
│   ├── layout/
│   ├── pos/
│   ├── inventory/
│   ├── customers/
│   ├── orders/
│   └── reports/
│
├── lib/
│   ├── supabase/
│   ├── auth/
│   ├── permissions/
│   ├── database/
│   ├── offline/
│   ├── sync/
│   ├── payments/
│   ├── audit/
│   ├── validation/
│   └── utils/
│
├── types/
├── public/
│
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── tests/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── security/
│
└── docs/
    ├── PRD.md
    ├── TECHNICAL-ARCHITECTURE.md
    ├── adr/
    ├── architecture/
    ├── testing/
    └── evidence/
```

Do not create a monorepo unless a future approved requirement clearly justifies it.

---

# 7. Core Architectural Principles

## 7.1 PostgreSQL is the central source of truth

Supabase PostgreSQL is authoritative for all synchronized business records.

IndexedDB is only a temporary operational cache and offline transaction store.

## 7.2 Offline capability is temporary resilience

The system supports temporary connectivity interruption, not indefinite detached operation.

A user must have previously authenticated online before offline POS operation is available.

## 7.3 Transactions are traceable

Completed financial and inventory events must not be silently edited.

Corrections use:

- reversals
- voids
- adjustments
- compensating stock movements

## 7.4 Security is enforced beyond the UI

Authorization must be enforced through:

- Supabase Auth
- RLS
- server-side permission checks
- secure server-side operations
- runtime validation

Hiding a button is not authorization.

## 7.5 Historical values are preserved

Changing a product name or price later must not change historical orders or sales.

Snapshot transaction-time values into transaction item rows.

## 7.6 No fake functionality

Do not add visual controls that have no working backend behavior.

---

# 8. User Identity Model

There are two broad user classes:

```text
STAFF
CUSTOMER
```

Staff roles:

```text
admin
manager
cashier
stock_assistant
```

Customers are not staff roles.

Do not model customer authorization by assigning a fake staff role.

---

# 9. Authentication Architecture

Use Supabase Auth.

The application should support:

- email/password login;
- logout;
- password reset;
- session refresh;
- server-side authenticated route protection.

For the MVP:

- staff authenticate with email/password;
- customers authenticate with email/password;
- phone is stored in the customer profile;
- phone/SMS OTP is out of scope unless later approved.

---

# 10. Authorization Architecture

Authorization operates at multiple layers:

```text
UI
↓
Server/Route Handler
↓
PostgreSQL RLS
```

The UI should hide inaccessible actions for usability.

The server and database must still deny unauthorized requests.

Suggested permission concepts:

```text
manage_staff
manage_products
manage_inventory
complete_sale
manage_credit
manage_orders
view_reports
resolve_conflicts
view_audit
manage_settings
```

Codex may implement roles directly at first, but important business authorization rules should remain centralized and understandable.

---

# 11. Staff Profile Model

Conceptual:

```text
staff_profiles
--------------
user_id UUID PK/FK -> auth.users
full_name
phone
role
is_active
created_at
updated_at
```

Rules:

- one staff profile per staff Auth user;
- deactivated staff cannot perform protected operations;
- role changes are audited;
- users cannot promote themselves.

---

# 12. Customer Model

Conceptual:

```text
customers
---------
id UUID PK
auth_user_id UUID nullable unique
full_name
phone
email nullable
status
notes nullable
created_at
updated_at
```

A customer may exist without a web login.

This permits walk-in customers and staff-created credit customers.

If a customer later creates an account, the Auth identity may be linked using a controlled flow.

---

# 13. ID Strategy

Use UUIDs for internal primary keys unless there is a documented reason not to.

Human-readable identifiers are separate:

```text
receipt_number
order_number
```

Do not use receipt numbers or order numbers as relational primary keys.

---

# 14. Time Strategy

Store authoritative timestamps using the database/server.

Primary business timezone:

```text
Africa/Accra
```

Store timestamps consistently and format them for Ghanaian users at presentation time.

Do not use the browser clock as authoritative transaction time for synchronized records.

Offline records may keep:

- local_created_at
- client_created_at

but the server also records:

- received_at
- processed_at

where needed.

---

# 15. Financial Precision

Use PostgreSQL:

```text
NUMERIC / DECIMAL
```

for monetary values.

Presentation:

```text
GHS 0.00
```

Do not use JavaScript binary floating point as financial truth.

Use decimal-safe logic for authoritative calculations.

---

# 16. Quantity Precision

Support up to 3 decimal places for quantities.

This allows:

- whole-unit goods;
- weight-based goods.

Database quantity types must preserve that precision.

---

# 17. Product Model

Conceptual:

```text
products
--------
id UUID PK
category_id UUID FK
sku nullable unique
barcode nullable unique
name
description nullable
selling_price NUMERIC
cost_price NUMERIC nullable
reorder_level NUMERIC
is_active boolean
image_path nullable
created_at
updated_at
```

Rules:

- SKU unique where provided.
- Barcode unique where provided.
- Used products are deactivated rather than hard-deleted.
- Price changes apply prospectively.

---

# 18. Category Model

```text
categories
----------
id UUID PK
name
slug
is_active
created_at
updated_at
```

Do not hard-code business categories in frontend code.

---

# 19. Inventory Architecture

Inventory uses:

1. Current balance
2. Immutable movement history

Conceptual:

```text
inventory_balances
------------------
product_id UUID PK/FK
quantity NUMERIC
updated_at
```

```text
stock_movements
---------------
id UUID PK
product_id UUID FK
movement_type
quantity_delta NUMERIC
reference_type nullable
reference_id UUID nullable
reason nullable
actor_user_id UUID nullable
client_operation_id UUID nullable
occurred_at
created_at
```

Supported movement types:

```text
opening_stock
receipt
sale
customer_return
wastage
damage
adjustment_in
adjustment_out
reversal
```

---

# 20. Inventory Rules

Every stock-changing operation must create a stock movement.

Do not update inventory balances without a corresponding movement.

Manual corrections require a reason.

Historical movements should not be edited through ordinary UI.

Corrections are represented by new compensating movements.

---

# 21. Inventory Reservations

Online cart items do not reserve stock.

A submitted order can create reservations.

Conceptual:

```text
inventory_reservations
----------------------
id UUID PK
product_id UUID FK
order_id UUID FK
quantity NUMERIC
status
expires_at
created_at
released_at nullable
```

Statuses:

```text
active
consumed
released
expired
```

Available online inventory is conceptually:

```text
physical/current stock
-
active reservation quantity
```

Default reservation duration:

```text
24 hours
```

Store the value in business settings.

Do not hard-code the duration throughout the application.

---

# 22. Sale Architecture

Conceptual:

```text
sales
-----
id UUID PK
receipt_number unique
customer_id nullable
cashier_user_id
channel
status
subtotal NUMERIC
total NUMERIC
client_operation_id UUID nullable unique
occurred_at
created_at
```

Channels:

```text
pos
order_fulfilment
```

Statuses may include:

```text
completed
voided
reversed
```

---

# 23. Sale Item Architecture

```text
sale_items
----------
id UUID PK
sale_id UUID FK
product_id UUID FK
product_name_snapshot
unit_price NUMERIC
quantity NUMERIC
line_total NUMERIC
```

Historical sale items must retain their transaction-time values.

---

# 24. Online Sale Transaction

Online sale completion must occur atomically.

Conceptually:

```text
BEGIN
  validate authenticated user
  validate cashier permission
  validate cart
  validate stock
  validate payment rules
  create sale
  create sale items
  create payment
  create credit transaction if required
  create stock movements
  update inventory balances
  create audit event where required
COMMIT
```

On failure:

```text
ROLLBACK
```

Never leave a half-created sale.

---

# 25. Payment Architecture

Supported MVP methods:

```text
cash
external_momo
paystack
credit
```

Conceptual:

```text
payments
--------
id UUID PK
sale_id nullable
order_id nullable
method
amount NUMERIC
status
provider nullable
provider_reference nullable
client_operation_id nullable
recorded_by nullable
occurred_at
created_at
```

---

# 26. External MoMo

Externally confirmed mobile money is manually recorded by staff.

It must be labelled distinctly from provider-verified payments.

Never imply automatic verification when there was none.

---

# 27. Paystack Architecture

Paystack requires:

- server-side initiation where appropriate;
- server-side verification;
- webhook verification;
- idempotent event handling;
- no card credential storage.

Never expose Paystack secret keys to the browser.

---

# 28. Credit Architecture

Use a ledger model.

```text
credit_accounts
---------------
customer_id UUID PK/FK
credit_limit NUMERIC
current_balance NUMERIC
status
updated_at
```

```text
credit_transactions
-------------------
id UUID PK
customer_id UUID FK
transaction_type
amount NUMERIC
sale_id nullable
payment_id nullable
client_operation_id nullable
recorded_by nullable
occurred_at
created_at
```

Types:

```text
credit_sale
repayment
adjustment
reversal
```

Credit balance must remain reconcilable to ledger history.

---

# 29. Order Architecture

Conceptual:

```text
orders
------
id UUID PK
order_number unique
customer_id UUID FK
status
payment_status
fulfillment_method
subtotal NUMERIC
total NUMERIC
notes nullable
created_at
updated_at
```

Statuses:

```text
pending
confirmed
preparing
ready
completed
cancelled
```

MVP fulfilment:

```text
store_pickup
```

---

# 30. Order Items

```text
order_items
-----------
id UUID PK
order_id UUID FK
product_id UUID FK
product_name_snapshot
unit_price NUMERIC
quantity NUMERIC
line_total NUMERIC
```

---

# 31. Offline Architecture

Offline capability is limited to staff POS workflows.

Do not attempt to make the entire management system offline.

The offline system should support:

- cached products;
- cached categories;
- cached stock balances;
- cached customers required for POS;
- cached credit account snapshots;
- local sales;
- local payments;
- local credit entries;
- sync queue;
- sync conflicts.

---

# 32. IndexedDB Architecture

Use Dexie.js over IndexedDB.

Suggested stores:

```text
cached_products
cached_categories
cached_inventory_balances
cached_customers
cached_credit_accounts

local_sales
local_sale_items
local_payments
local_credit_transactions

sync_outbox
sync_conflicts
sync_meta
```

Do not mirror the entire cloud database into IndexedDB.

---

# 33. Offline Authentication Rule

A staff user must have successfully authenticated online before offline POS operation is possible.

The PWA may continue working during a temporary outage using the established authenticated application state and cached operational data.

Do not store raw passwords.

Do not build an independent long-term offline identity system for MVP.

When connectivity returns, revalidate the server session and permissions before synchronizing pending mutations.

---

# 34. PWA Architecture

PWA requirements:

- web app manifest;
- service worker;
- app shell caching;
- installability in supported browsers;
- offline fallback;
- cache versioning;
- update strategy;
- clear connectivity state.

Do not cache sensitive authenticated API responses indiscriminately.

---

# 35. Service Worker Rules

The service worker should cache:

- static application assets;
- necessary POS shell assets;
- safe public assets.

Business records should primarily live in IndexedDB rather than opaque HTTP cache.

Do not use the service worker cache as the financial transaction store.

---

# 36. Offline Sale Flow

When internet is unavailable:

```text
Cashier completes sale
→ generate local sale UUID
→ generate client_operation_id
→ transactionally write sale to IndexedDB
→ write sale items
→ write payment
→ write credit entry if needed
→ update cached inventory
→ create sync_outbox entry
→ mark pending
→ generate receipt
```

The UI must not show the sale as successfully stored until the local IndexedDB transaction completes.

---

# 37. Sync Outbox

Conceptual:

```text
sync_outbox
-----------
id
client_operation_id
operation_type
entity_type
entity_id
payload
created_at
attempt_count
last_attempt_at
status
last_error
```

Statuses:

```text
pending
syncing
synced
failed
review_required
```

---

# 38. Idempotency

Every offline mutation must have a globally unique:

```text
client_operation_id
```

The server must persist processed operation IDs.

Conceptual cloud model:

```text
processed_client_operations
---------------------------
client_operation_id UUID PK
operation_type
canonical_entity_id
processed_at
result_summary JSONB
```

Retrying the same operation must return the prior result rather than creating a duplicate.

---

# 39. Synchronization Sequence

```text
Connectivity restored
→ verify authenticated session
→ refresh current permission state
→ push pending outbox operations
→ server checks idempotency
→ process each operation
→ mark success/failure/conflict locally
→ pull latest POS reference data
→ update IndexedDB
→ store sync cursor/marker
```

Do not mark a local operation synced before the server confirms successful processing.

---

# 40. Sync Server Boundary

Offline mutations should be sent to a controlled server endpoint.

Conceptually:

```text
POST /api/sync
```

The sync endpoint must:

- authenticate the user;
- validate payload;
- verify role;
- enforce idempotency;
- process atomically;
- return canonical result;
- surface conflicts honestly.

Do not let IndexedDB payloads write directly to privileged database tables from the browser.

---

# 41. Inventory Conflict Policy

Example:

- cached stock says 10;
- offline sale uses 4;
- cloud stock changes independently;
- offline sale reconnects.

The physical sale already happened.

Therefore:

1. preserve the sale;
2. apply its stock movement;
3. detect discrepancy;
4. create a sync conflict;
5. flag management review.

Do not silently delete the sale.

---

# 42. Credit Conflict Policy

If an offline credit sale was locally allowed but the cloud balance changed during the outage:

1. preserve the sale;
2. create the credit transaction;
3. flag the conflict;
4. require management review.

Do not rewrite history to pretend the sale did not occur.

---

# 43. Conflict Model

```text
sync_conflicts
--------------
id UUID PK
client_operation_id UUID
conflict_type
entity_type
entity_id nullable
details JSONB
status
resolved_by nullable
resolved_at nullable
created_at
```

Statuses:

```text
open
resolved
dismissed
```

Resolution must be audited.

---

# 44. Receipt Numbering

Every sale gets:

- UUID
- human-readable receipt number

Receipt number must be collision-safe.

Offline-generated receipts must remain identifiable after synchronization.

Use a documented receipt-number strategy later in an ADR before offline POS implementation.

---

# 45. Business Settings

Conceptual:

```text
business_settings
-----------------
id
business_name
currency
timezone
reservation_expiry_hours
receipt_prefix
contact_phone
contact_email nullable
address nullable
updated_at
```

Defaults:

```text
currency = GHS
timezone = Africa/Accra
reservation_expiry_hours = 24
```

---

# 46. Audit Architecture

Audit at minimum:

- staff created;
- staff deactivated;
- role changed;
- product created/updated;
- selling price changed;
- stock adjustment;
- wastage/damage;
- sale void/reversal;
- credit limit changed;
- repayment recorded;
- sync conflict resolved.

Conceptual:

```text
audit_logs
----------
id UUID PK
actor_user_id nullable
action
entity_type
entity_id nullable
metadata JSONB
created_at
```

Audit logs should be append-only through normal application paths.

---

# 47. Data Protection Rules

The application should:

- collect only business-necessary customer data;
- restrict access by role;
- avoid secrets/personal data in logs;
- use HTTPS;
- use fictional/anonymized test data where possible;
- avoid unnecessary exposure of full inventory or financial data to customers.

---

# 48. Environment Strategy

Use:

```text
LOCAL
↓
STAGING
↓
PRODUCTION
```

Do not develop against production data.

---

# 49. Environment Variables

Public/browser-safe examples:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY
```

Server-only examples:

```text
SUPABASE_SERVICE_ROLE_KEY
PAYSTACK_SECRET_KEY
```

Server-only keys must never reach browser bundles.

---

# 50. Supabase Development Strategy

Use a dedicated Grand Pa local or hosted development Supabase environment.

Do not share another project's database.

All application schema changes must use migrations.

---

# 51. Migration Rules

All schema changes must be:

- versioned;
- committed;
- forward-only;
- reproducible;
- tested.

Never rewrite migrations already applied to shared environments.

Create a new migration instead.

---

# 52. Runtime Validation

Use runtime schemas, preferably Zod, for:

- forms;
- API payloads;
- sync payloads;
- filters;
- external webhook inputs.

TypeScript types do not replace runtime validation.

---

# 53. Server-Side Operations

Sensitive operations must cross a trusted server boundary.

Examples:

- staff creation;
- role change;
- product price change;
- stock adjustment;
- complete sale;
- create credit repayment;
- update credit limit;
- process sync mutation;
- verify Paystack payment;
- resolve sync conflict.

---

# 54. Service-Role Key Rule

Supabase service-role credentials are server-only.

Never put them in:

- client components;
- public environment variables;
- browser JavaScript;
- IndexedDB;
- service worker storage.

---

# 55. Error Handling

Errors should be:

- visible when user action is needed;
- actionable where possible;
- safe;
- non-secret-bearing.

Do not expose raw database errors or stack traces to end users.

Sync failures must persist until retried or reviewed.

---

# 56. Logging

Use structured logging where practical.

Useful context:

- request ID;
- user ID where safe;
- operation ID;
- action;
- result;
- error category.

Never log:

- passwords;
- access tokens;
- refresh tokens;
- service-role key;
- Paystack secret key.

---

# 57. UI Architecture

Staff routes conceptually:

```text
/dashboard
/products
/inventory
/stock-movements
/customers
/credit
/orders
/reports
/audit
/settings
/pos
```

Customer routes:

```text
/shop
/shop/[product]
/cart
/checkout
/account
/account/orders
/account/orders/[id]
```

Actual route grouping can follow Next.js App Router conventions.

---

# 58. POS UX

The POS should prioritize speed.

Main elements:

- product/barcode search;
- results;
- cart;
- quantity;
- customer selector;
- payment method;
- total;
- complete sale;
- connectivity indicator;
- sync status.

Do not overcrowd the screen with management features.

---

# 59. Connectivity UX

Always show staff one of:

```text
ONLINE
OFFLINE
SYNCING
SYNC ISSUE
```

When offline, display a clear message:

> Offline Mode — transactions will be stored on this device and synchronised when connectivity returns.

Also show the last successful sync time.

---

# 60. Offline Data Freshness

When offline, the UI must not imply cloud data is current.

Where helpful, show:

```text
Last updated: [time]
```

for cached stock or credit data.

---

# 61. Dashboard Architecture

Dashboard data should come from controlled queries/views/functions rather than expensive uncontrolled client queries.

Initial metrics:

- today’s sales;
- transaction count;
- sales by payment method;
- pending orders;
- low-stock count;
- outstanding credit;
- open sync conflicts.

---

# 62. Reporting Principles

Reports must reconcile to source transactions.

Do not build report totals from fragile frontend aggregation when reliable database aggregation is appropriate.

Add indexes based on actual query patterns.

---

# 63. Performance Principles

Ensure:

- indexed SKU/barcode lookups;
- indexed date filters;
- pagination for large lists;
- no obvious N+1 queries;
- fast IndexedDB product lookup;
- background/non-blocking synchronization.

Do not prematurely over-engineer.

---

# 64. Accessibility

Target WCAG 2.2 AA principles where practical.

At minimum:

- keyboard operability;
- visible focus;
- semantic labels;
- adequate contrast;
- understandable validation;
- status not communicated by colour alone.

---

# 65. Browser Support

Primary staff environment:

- current Microsoft Edge;
- current Chrome;
- Windows laptop;
- PWA installation where supported.

Also support, where practical:

- current Firefox;
- mobile Chromium;
- mobile Safari for customer workflows.

---

# 66. Testing Architecture

## Unit

Test pure logic:

- totals;
- credit calculations;
- inventory calculations;
- validation;
- status transitions;
- sync state logic.

## Integration

Test:

- sale transaction;
- stock movement;
- payment recording;
- credit transaction;
- inventory reservation;
- sync idempotency;
- conflict creation;
- Paystack webhook handling.

## RLS/Security

Test unauthorized reads and writes.

## E2E

Use Playwright for:

- authentication;
- POS online flow;
- customer ordering;
- staff permissions;
- reports where practical.

## Offline

Test:

```text
online login
cache POS data
disconnect
complete sale
restart PWA/browser
pending sale persists
reconnect
sync
retry
no duplicate
```

---

# 67. Critical Security Tests

Must prove:

1. Cashier cannot change credit limit.
2. Stock Assistant cannot complete sale.
3. Customer cannot access staff routes.
4. Customer A cannot access Customer B order.
5. Anonymous user cannot access internal reports.
6. Deactivated staff cannot perform protected mutations.
7. Direct privileged API calls are rejected without permission.
8. Service-role key is absent from client bundles.
9. Sync endpoint rejects unauthorized operations.
10. Paystack webhook handling rejects invalid events.

---

# 68. Seed Data

Use fictional development data only.

Suggested categories:

- Poultry
- Fish
- Meat
- Dairy
- Frozen Vegetables

Suggested products:

- Whole Chicken
- Chicken Wings
- Tilapia
- Mackerel
- Beef
- Sausages
- Frozen Mixed Vegetables
- Milk

Do not seed real customer information.

---

# 69. Coding Standards

Use:

- TypeScript strict mode;
- meaningful names;
- modular services;
- small focused functions;
- runtime validation;
- linting;
- formatting.

Avoid:

- widespread `any`;
- giant components;
- business logic inside UI components;
- duplicated permission logic;
- duplicated financial logic;
- hard-coded business constants;
- direct scattered database mutations.

---

# 70. Suggested Domain Modules

Conceptual modules:

```text
AuthService
PermissionService
ProductService
InventoryService
SaleService
CustomerService
CreditService
OrderService
PaymentService
OfflineStore
SyncService
AuditService
ReportService
```

Exact file naming may differ.

The responsibility boundaries should remain clear.

---

# 71. Architecture Decision Records

Store ADRs in:

```text
docs/adr/
```

Format:

```text
# ADR-XXX: Title

Status:
Date:

## Context

## Decision

## Alternatives Considered

## Consequences

## Reversal / Migration Notes
```

ADRs are required for meaningful architecture changes such as:

- PWA library strategy;
- service worker strategy;
- receipt numbering;
- sync cursor/change-feed design;
- Paystack event strategy;
- offline conflict rules;
- major authorization model changes.

---

# 72. Change Control

Before changing a locked architecture decision:

1. identify the reason;
2. check PRD impact;
3. create/update ADR;
4. update this document;
5. update tests;
6. update evidence notes.

Do not allow silent architecture drift.

---

# 73. Evidence Requirements

Store dissertation evidence under:

```text
docs/evidence/
```

Preserve:

- repository structure;
- migrations;
- ERD;
- RLS policies/tests;
- auth flow;
- POS;
- stock movement;
- credit ledger;
- customer ordering;
- PWA installability;
- offline IndexedDB records;
- pending sync;
- successful sync;
- conflict examples;
- Paystack sandbox;
- reports;
- audit records;
- automated test output.

Never commit secrets into evidence files.

---

# 74. Phase Boundaries

## Phase 0
Foundation only.

## Phase 1
Database/Auth/RBAC/RLS.

## Phase 2
Products/Inventory.

## Phase 3
Customers/POS.

## Phase 4
Credit.

## Phase 5
Customer ordering/reservations.

## Phase 6
Offline PWA/IndexedDB.

## Phase 7
Sync/conflicts.

## Phase 8
Paystack.

## Phase 9
Reports/audit.

## Phase 10
Hardening/deployment.

Codex must not automatically begin the next phase.

---

# 75. Definition of Done

A feature is Done only when:

- implemented;
- validation exists;
- authorization exists;
- database constraints exist where appropriate;
- error states are handled;
- loading states exist where relevant;
- tests pass;
- documentation is updated;
- audit exists where required;
- offline behavior is explicitly handled where relevant;
- no fake UI remains;
- feature can be demonstrated.

---

# 76. Required Phase Report

At the end of each phase, Codex must report:

```text
PHASE:
STATUS: PASS / PASS WITH LIMITATIONS / FAIL

IMPLEMENTED:
-

FILES CREATED/CHANGED:
-

DATABASE MIGRATIONS:
-

TESTS ADDED:
-

TEST RESULTS:
-

ROUTES/SCREENS CREATED:
-

OFFLINE/PWA IMPACT:
-

SECURITY CHECKS:
-

MANUAL VERIFICATION:
-

KNOWN LIMITATIONS:
-

ARCHITECTURE DEVIATIONS:
-

EVIDENCE TO CAPTURE:
-

NEXT PHASE BLOCKERS:
-

READY FOR NEXT PHASE:
YES / NO
```

---

# 77. Final Engineering Rules

When choosing between convenience and correct transaction history:

**Choose correct transaction history.**

When choosing between hidden UI and real authorization:

**Choose real authorization.**

When choosing between silently fixing data and preserving an auditable conflict:

**Preserve the auditable conflict.**

When choosing between clever architecture and understandable maintainable architecture:

**Choose understandable maintainable architecture.**

The application must be technically defensible, testable and explainable in the final-year project report.
