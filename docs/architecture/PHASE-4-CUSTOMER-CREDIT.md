# Phase 4 — Customer Credit

## Scope and preserved limitations

Phase 4 adds online customer credit management, POS credit sales, immutable balance ledger entries, cash/external MoMo repayments, account/history screens, and security/integrity coverage. It does not add ordering, reservations, Paystack, offline sales/storage/sync, interest, fees, instalments, collections, split tender, reporting, or reversal controls.

Previously deferred items remain deferred: Phase 1 Customer B live UI/session verification; Phase 2 product image upload; Phase 3 customer authenticated browser route verification; Phase 3 void/reversal flows; and Phase 3 offline receipt allocation verification.

## Schema and invariants

`credit_accounts` has one row per customer, a NUMERIC limit and outstanding balance, and `active`/`suspended` status. Limit/status changes use `manage_credit_account`; the RPC locks the customer then account and audits enablement, limit changes, and status changes. It cannot change balance. Direct account writes are revoked and a trigger rejects balance changes outside the controlled ledger operations.

`credit_transactions` is append-only through grants/RLS. Its type enum includes `credit_sale` and `repayment`, with `adjustment`/`reversal` reserved for later controlled flows. Each entry includes its operation ID, actor, authoritative amount, resulting balance, and resulting available-credit snapshot. The current balance reconciles to the signed sum of credit-sale and repayment entries.

Available credit is centralized in `public.available_credit(limit,balance,status)`: active accounts use `greatest(limit - balance, 0)`; suspended accounts expose zero. An authorized limit reduction can leave balance above limit without erasing debt.

## POS and transactions

The Phase 3 POS offers Customer Credit only when an active customer with an active account is selected and the operator has credit-view permission. The exact-decimal browser preview is informational. `complete_pos_sale` revalidates authoritative product prices, customer status, account status and available credit under row locks.

One database transaction creates the completed sale, item snapshots, outstanding credit tender, immutable credit-sale ledger entry, stock movements, inventory balance reductions, and audit records. Any validation error rolls all of those changes back. Credit does not create a cash-received audit event.

Payment semantics are recorded in [ADR-004](../adr/ADR-004-credit-tender-semantics.md). A credit sale uses method `credit`, status `outstanding`, and a customer. A repayment is a recorded cash/external MoMo payment linked to the customer but not to a sale/order; it is atomically paired with a repayment credit-ledger entry. Receipts avoid “paid” wording for credit tender.

## Repayments and idempotency

`record_credit_repayment` locks customer then account, allows inactive customer repayment and suspended account repayment, and rejects non-positive, over-balance, or over-precision amounts. A unique client operation ID plus an actor-scoped advisory transaction lock makes matching retries idempotent and rejects reuse with a different payload.

Credit sales inherit the POS sale operation ID; the ledger also has a unique sale link. Sale retries must match tender, customer, products, and quantities. Ledger snapshots support future offline conflict review without implementing offline storage now.

## Lock ordering and concurrency

Credit mutations use customer → credit account. Credit POS sales then lock product rows by UUID → inventory balance rows by UUID. This preserves the existing deterministic inventory order and serializes balance checks. Repayments do not acquire inventory locks. Limit/status management uses customer → account. The browser never coordinates locks.

Hosted concurrency must prove that two GHS 15 credit attempts against GHS 20 available allow exactly one, and that simultaneous GHS 40 repayments against GHS 50 outstanding do not overpay. Those require independent overlapping hosted sessions; sequential SQL tests do not claim this proof.

## RBAC, RLS, and audit

Central permissions:

- `manage_credit`: admin/manager only.
- `view_credit`, `view_credit_history`, `record_credit_repayment`: admin/manager/cashier.
- Stock Assistant and customer receive no credit permission.

RLS is enabled on both credit tables. Authenticated direct writes are revoked. Account and ledger reads use the corresponding permission policy. Mutations are security-definer RPCs with explicit permission, role, and payload checks. No customer credit self-read UI or policy is introduced.

Audit actions cover account enablement, limit/status changes, credit sale completion, and repayment. Limit/status records contain safe before/after values; no credentials are written.

## Application routes

- `/credit`: searchable operational account list.
- `/credit/[customerId]`: limit/status management (manager/admin), account snapshots, immutable history, and repayment (manager/admin/cashier).
- `/credit/repayments/[paymentId]`: printable repayment confirmation.
- `/pos`: customer credit tender and exact-decimal preview.
- `/sales/[saleId]`: credit-specific receipt semantics and resulting balance/availability.

## Tests and evidence

Unit tests cover exact available-credit math, suspended/inactive eligibility, limits, repayments, precision, and GHS formatting. `supabase/tests/phase4_customer_credit.test.sql` covers account roles/RLS, atomicity, repayments, idempotency, audit, and reconciliation. Hosted concurrent credit-sale and repayment verification must use two truly simultaneous requests. Hosted browser workflow is expected twice with separate fictional fixtures, then existing Phase 3 POS and Phase 2 inventory regressions are rerun.

No database schema is created through Studio. All changes are migration-backed. Phase 4 remains online-only; no indexed credit snapshot or business data is cached in the PWA.
