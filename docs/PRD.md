# Product Requirements Document (PRD)
## Grand Pa’s Cold Store Management System
### Responsive Offline-Capable Web Application

**Document status:** New baseline PRD\
**Business location:** Ghana\
**Currency:** GHS\
**Timezone:** Africa/Accra\
**Primary implementation agent:** Codex\
**Supersedes:** Previous WordPress and Tauri/desktop architecture documents.

## 1. Product Summary

Grand Pa’s Cold Store currently uses fragmented manual and standalone digital processes. Stock is not directly linked to sales, customer orders may arrive through phone calls or WhatsApp, customer credit is managed manually, payment information is fragmented, and management lacks one reliable real-time view of sales, inventory, orders, payments and outstanding credit.

The new product is a **single responsive web application** for staff and customers. It will provide staff authentication and role-based access, product and inventory management, POS, customer management, customer credit, customer ordering, payments, Paystack integration, reports, audit trails, and temporary offline POS operation with later synchronisation.

## 2. Product Goal

Build a secure, affordable and user-friendly web-based retail management system that integrates:

- sales;
- inventory;
- customer orders;
- payments;
- customer credit;
- reporting.

The system must remain usable during temporary internet outages for essential in-store POS activity.

## 3. Final Product Description

> A responsive, offline-capable web-based retail management system for Grand Pa’s Cold Store in Ghana, integrating point of sale, inventory, customer ordering, payments, customer credit and reporting through a central cloud database, with temporary offline POS operation and later synchronisation when connectivity is restored.

## 4. Locked Technology Stack

| Area | Technology |
|---|---|
| Framework | Next.js |
| Frontend | React + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| Backend | Next.js Server Actions / Route Handlers |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth |
| Authorization | RBAC + PostgreSQL RLS |
| Offline storage | IndexedDB + Dexie.js |
| Offline support | PWA + Service Worker |
| Payments | Paystack |
| Hosting | Vercel |
| Testing | Vitest + React Testing Library + Playwright |
| Version control | Git + GitHub |

Do not use WordPress, WooCommerce, Tauri, Electron or SQLite.

## 5. High-Level Architecture

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

Offline POS:

```text
Browser / Installed PWA
        │
        ▼
 IndexedDB + Dexie
        │
        ▼
    Sync Queue
        │
 Internet restored
        ▼
 Next.js Sync Endpoint
        │
        ▼
 Supabase PostgreSQL
```

## 6. Architecture Principles

1. **Supabase PostgreSQL is the central source of truth.**
2. IndexedDB is only for temporary offline operations and cached POS data.
3. First authentication requires internet access.
4. Completed transactions must be traceable and not silently edited.
5. Corrections use reversals, voids or compensating adjustments.
6. Security must be enforced server-side and through RLS.
7. No fake or decorative functionality.
8. Offline capability is for temporary connectivity interruptions, not indefinite standalone operation.

## 7. User Roles

### Administrator / Owner
Can manage staff, roles, products, inventory, customer credit, reports, audit history, sync conflicts and business settings.

### Manager
Can manage products, inventory, stock movements, orders, approved credit, reports and sync conflicts.

### Cashier
Can use POS, search/scan products, complete sales, record permitted payment methods, find/create customers, process approved credit sales, reprint receipts and work temporarily offline.

Cannot manage staff, change credit limits or perform arbitrary stock adjustments.

### Stock Assistant
Can view inventory, receive stock, record approved wastage/damage and participate in stock counts.

### Customer
Can register/sign in, browse products, use cart, place orders, pay online where enabled, view own order history and track order status.

## 8. Core Modules

1. Authentication
2. RBAC/RLS
3. Staff management
4. Categories and products
5. Inventory
6. Stock movements
7. Customers
8. POS
9. Customer credit
10. Customer web ordering
11. Payments
12. Paystack
13. PWA/offline POS
14. IndexedDB local cache
15. Synchronisation
16. Conflict management
17. Dashboard
18. Reports
19. Audit trail
20. Business settings

## 9. Authentication Requirements

- Staff and customers use Supabase Auth.
- Support login, logout and password reset.
- Inactive staff must be blocked.
- First login on a browser/device requires internet.
- Offline POS is available only after successful online authentication and required data caching.
- Never store raw passwords in browser storage.
- Revalidate session and permissions before synchronising pending mutations.

## 10. Staff Management

Staff roles:

```text
admin
manager
cashier
stock_assistant
```

Requirements:

- Admin can create/deactivate staff.
- Admin can assign roles.
- Role changes are audited.
- Users cannot elevate their own privileges.

## 11. Product Management

Products support:

- ID
- Name
- SKU
- Barcode
- Category
- Description
- Selling price
- Optional cost price
- Reorder level
- Image
- Active/inactive status

Rules:

- SKU unique where populated.
- Barcode unique where populated.
- Used products are archived, not hard-deleted.
- Price changes do not alter historical sales.

## 12. Inventory Management

Movement types:

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

Every inventory change must create a stock movement containing product, quantity delta, movement type, references, actor, time and client operation ID where relevant.

Managers/Admins can view movement history. Manual corrections require a reason. Historical movements are not directly edited.

## 13. Quantity and Money

- Quantities support up to 3 decimal places.
- PostgreSQL NUMERIC/DECIMAL is the source of financial truth.
- GHS displays to 2 decimal places.
- Do not use JavaScript binary floating point as authoritative financial arithmetic.

## 14. Customer Management

Customer fields:

- Full name
- Phone
- Optional email
- Status
- Optional notes

Phone must be searchable. Warn about likely duplicate phone/email. Customers can access only their own profile/order data.

## 15. Point of Sale

Workflow:

```text
Login
→ Open POS
→ Search/Scan Product
→ Add to Cart
→ Set Quantity
→ Optional Customer
→ Select Payment Method
→ Complete Sale
→ Save Sale
→ Save Payment
→ Create Stock Movements
→ Update Inventory
→ Generate Receipt
```

Search by name, SKU or barcode. USB barcode scanners acting as keyboard input should work.

Each sale needs UUID, receipt number, cashier ID, optional customer, timestamp, channel and client operation ID where applicable.

Online sale completion must be atomic. Completed sales are corrected through void/reversal flows.

## 16. Payments

MVP methods:

```text
cash
external_momo
paystack
credit
```

Externally confirmed MoMo must be labelled honestly as externally confirmed. Paystack verification is server-side. Webhooks must be idempotent. Never store card credentials.

## 17. Customer Credit

Credit account fields:

- credit_limit
- current_balance
- status

Only Admin/Manager may change limits. Credit sales and repayments create separate ledger entries. Show limit, outstanding balance, available credit and transaction history.

Offline credit sales may use only previously cached valid account data. Server revalidates on sync. Conflicts are preserved and flagged for review.

## 18. Customer Web Ordering

MVP fulfilment: **store pickup/collection**.

Statuses:

```text
pending
confirmed
preparing
ready
completed
cancelled
```

Customers browse active products, add to cart, submit orders, optionally pay through Paystack and track their own order status.

## 19. Inventory Reservations

Cart items do not reserve stock.

Submitted orders create transactional inventory reservations.

Reservation statuses:

```text
active
consumed
released
expired
```

Default reservation duration: 24 hours, stored in business settings.

Cancellation/expiry releases reservations. Fulfilment consumes reservation and creates the actual stock movement.

## 20. Offline POS

When temporarily offline, POS must support:

- cached product search;
- barcode lookup;
- cached inventory;
- cart;
- cash sales;
- externally confirmed MoMo;
- approved cached credit sales;
- cached customer lookup;
- receipt generation;
- recent local transactions;
- pending sync visibility.

Internet is required for first login, password reset, staff management, role changes, Paystack, full cloud reports and major settings.

## 21. PWA

The staff interface should be installable as a PWA where supported.

Requirements:

- app manifest;
- service worker;
- cached application shell;
- installability;
- offline fallback;
- clear update strategy.

It remains one web application, not a separate desktop product.

## 22. IndexedDB / Dexie

Local stores should be limited to what the POS needs:

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

Do not duplicate the entire cloud database.

## 23. Synchronisation

Each offline mutation receives a globally unique `client_operation_id`.

Outbox fields should include:

- id
- client_operation_id
- operation_type
- entity_type
- entity_id
- payload
- created_at
- attempt_count
- last_attempt_at
- status
- last_error

Statuses:

```text
pending
syncing
synced
failed
review_required
```

## 24. Offline Sale Flow

```text
Internet unavailable
       ↓
Complete POS sale
       ↓
Generate client_operation_id
       ↓
Write transaction to IndexedDB
       ↓
Update cached stock locally
       ↓
Create sync_outbox record
       ↓
Status = pending
       ↓
Generate receipt
```

Do not show success until all required local writes succeed.

## 25. Reconnection Flow

```text
Connectivity restored
       ↓
Revalidate session
       ↓
Push pending operations
       ↓
Server checks client_operation_id
       ↓
Already processed?
  ├── Yes → return prior result
  └── No → process atomically
       ↓
Mark local operation synced
       ↓
Pull latest reference data
       ↓
Refresh IndexedDB cache
```

## 26. Idempotency

Mandatory for:

- offline POS operations;
- retried mutation APIs where needed;
- Paystack webhooks.

The same client operation must never create duplicate cloud transactions.

## 27. Conflict Handling

### Inventory conflict
Preserve the real offline sale, apply the stock movement and create a management reconciliation conflict rather than deleting the sale.

### Credit conflict
Preserve the completed sale and credit entry, then flag the account for management review.

Conflict statuses:

```text
open
resolved
dismissed
```

Resolution must be audited.

## 28. Dashboard

Show working metrics only:

- Today’s sales
- Transaction count
- Sales by payment method
- Pending orders
- Low-stock count
- Outstanding customer credit
- Open sync conflicts

## 29. Reports

### Sales
Filters: date, cashier, payment method, channel.

### Inventory
Product, current quantity, reorder level, stock status and movements.

### Credit
Customer, limit, outstanding, available credit and recent transaction.

### Orders
Order number, customer, status, total and date.

## 30. Audit Trail

Audit:

- staff created/deactivated;
- role changed;
- product created/updated;
- price changed;
- stock adjustment;
- wastage/damage;
- sale void/reversal;
- credit limit changed;
- repayment recorded;
- sync conflict resolved.

Never log passwords, tokens, Supabase secret keys or Paystack secrets.

## 31. Security

Use HTTPS, Supabase Auth, RLS, server-side authorization, runtime input validation, least privilege and secure environment variables.

Supabase secret and Paystack secret keys must never reach browser JavaScript.

## 32. Required Security Tests

| Scenario | Expected |
|---|---|
| Admin uses admin function | Allowed |
| Manager uses permitted function | Allowed |
| Cashier uses POS | Allowed |
| Cashier changes credit limit | Denied |
| Stock Assistant completes sale | Denied |
| Customer accesses staff route | Denied |
| Customer A reads Customer B order | Denied |
| Anonymous visitor accesses reports | Denied |
| Deactivated staff mutates data | Denied |
| Direct privileged API call without permission | Denied |

## 33. Non-Functional Requirements

### Usability
Fast, clear POS; moderate digital-literacy target; clear feedback and confirmations.

### Accessibility
Target WCAG 2.2 AA principles: keyboard use, visible focus, labels, contrast, clear errors, status not communicated by colour alone.

### Performance
- Normal pages approximately <= 3 seconds.
- Common POS actions approximately <= 2 seconds.
- Offline search should feel immediate.
- Sync must not freeze UI.

### Reliability
- Pending offline transactions survive browser/PWA restart.
- Retries do not duplicate transactions.
- Failed sync remains visible.
- Service-worker/cache failures do not silently lose completed sales.

### Compatibility
Current Chrome, Edge, Firefox and mobile browsers where practical. Primary staff POS target is Windows laptops using current Edge/Chrome or installed PWA.

## 34. Ghana-Specific Requirements

- Currency: GHS
- Timezone: Africa/Accra
- Mobile-money-friendly workflows
- Ghana-compatible Paystack setup
- Mobile-responsive customer experience
- Minimise unnecessary customer personal data

## 35. Repository Structure

Use one repository:

```text
GrandPa-Web/
├── app/
│   ├── (auth)/
│   ├── (staff)/
│   ├── (customer)/
│   └── api/
├── components/
│   ├── ui/
│   ├── pos/
│   ├── inventory/
│   └── customers/
├── lib/
│   ├── supabase/
│   ├── auth/
│   ├── offline/
│   ├── sync/
│   ├── payments/
│   └── validation/
├── types/
├── public/
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── tests/
├── tests/
└── docs/
    ├── PRD.md
    ├── TECHNICAL-ARCHITECTURE.md
    ├── adr/
    ├── testing/
    └── evidence/
```

Do not use a monorepo unless a later requirement genuinely needs one.

## 36. Build Phases

### Phase 0 — Foundation
Next.js, TypeScript, Tailwind, shadcn/ui, Supabase structure, environment handling, testing, PWA foundation, lint/format, README and CI. No business features.

### Phase 1 — Database, Auth, RBAC and RLS
Core schema foundation, staff profiles, customer linkage, auth, protected routes, roles and permission tests.

### Phase 2 — Products and Inventory
Categories, products, balances, stock movements, receiving, wastage, adjustments and low-stock indicators.

### Phase 3 — Customers and POS
Customers, cart, sales, sale items, cash/external MoMo, receipts and transactional online sales.

### Phase 4 — Customer Credit
Credit accounts, limits, credit sales, repayments, ledger and reports.

### Phase 5 — Customer Web Ordering
Catalogue, cart, checkout, orders, reservations and status management.

### Phase 6 — Offline PWA POS
Service worker, installability, Dexie/IndexedDB, cached data, offline sales, receipts, connectivity status and queue.

### Phase 7 — Synchronisation and Conflicts
Outbox, idempotency, pull refresh, inventory conflicts, credit conflicts and retry/recovery.

### Phase 8 — Paystack
Test integration, verification, webhooks, statuses and idempotency.

### Phase 9 — Dashboard, Reports and Audit
Operational dashboard, reports, audit UI and conflict review.

### Phase 10 — Hardening and Deployment
Security, RLS, accessibility, responsive, offline/reconnect, PWA install, performance, E2E, Vercel/Supabase deployment and evidence.

## 37. Out of Scope

Do not build:

- native Windows app;
- Tauri;
- Electron;
- SQLite;
- Android/iOS native app;
- multi-branch;
- supplier purchasing;
- full accounting;
- payroll;
- AI forecasting;
- IoT freezer monitoring;
- WhatsApp bot;
- loyalty programme;
- delivery fleet;
- enterprise multi-tenancy;
- biometrics.

## 38. Critical End-to-End Acceptance Scenario

```text
Admin signs in
→ creates staff
→ creates products/categories
→ adds opening inventory
→ cashier signs in
→ completes online sale
→ sale/payment/stock correct
→ receipt generated

internet disconnects
→ cashier completes offline sale
→ sale stored in IndexedDB
→ cached stock updates
→ pending sync visible
→ PWA/browser closes and reopens
→ pending sale still exists
→ internet returns
→ sale syncs exactly once
→ cloud stock updates
→ manager sees sale in reports

customer gets credit
→ credit purchase recorded
→ balance increases
→ repayment recorded
→ balance decreases

customer places web order
→ stock reserved
→ staff updates status
→ customer sees status

Paystack test payment succeeds
→ server verifies once

unauthorized role attempts protected action
→ denied
```

## 39. Definition of Done

A feature is complete only when:

- UI exists;
- backend exists;
- database rules exist;
- validation exists;
- authorization exists;
- error/loading states exist;
- tests pass;
- documentation is updated;
- audit exists where required;
- offline behaviour is defined where relevant;
- no fake UI remains;
- feature is demonstrable.

## 40. Codex Rules

1. Read PRD and technical architecture before each phase.
2. Inspect before changing.
3. Use migrations for schema changes.
4. Keep secrets server-side.
5. Never use UI hiding as authorization.
6. Preserve historical values.
7. Use decimal-safe financial logic.
8. Use idempotency for offline operations and payment webhooks.
9. Persist sync failures.
10. Never silently delete completed offline sales.
11. Write tests during implementation.
12. Keep code modular.
13. Avoid unnecessary dependencies.
14. Report blockers honestly.
15. Never begin the next phase automatically.

## 41. Codex Phase Report

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

## 42. Dissertation Evidence

Preserve evidence for:

- repository structure;
- migrations;
- ERD;
- Auth/RBAC/RLS;
- product/inventory screens;
- POS;
- online sale;
- customer credit;
- customer ordering;
- PWA installation;
- offline mode;
- IndexedDB sale;
- pending sync;
- successful sync;
- conflict handling;
- Paystack sandbox;
- dashboard/reports;
- audit logs;
- automated tests;
- deployment.

Do not manufacture evidence for features that were not built.
