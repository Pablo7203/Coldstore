# ADR-004: Credit tender records customer debt, not received payment

**Status:** Accepted for Phase 4<br>
**Date:** 2026-10-12

## Context

Phase 3 already includes `credit` as a reserved `payment_method`, but its `payment_status` values could only describe a recorded or reversed payment. Recording a credit sale as an ordinary `recorded` payment would suggest that money had been received, which is false.

## Decision

Add `payment_status.outstanding` in a separate migration and use it only for a POS sale allocated to the `credit` tender. Its `payments.customer_id` must identify the customer and its `sale_id` must identify the sale. Cash and externally confirmed MoMo sale tenders keep `recorded` status. A repayment is a separate `cash` or `external_momo` payment with `customer_id`, no sale/order link, and `recorded` status, paired atomically with a repayment ledger entry.

Receipts say “Customer Credit” and “Amount charged to credit,” and explicitly state that no money was received for the credit sale. The database transaction remains authoritative; no provider verification is implied for externally confirmed MoMo.

## Consequences

- The existing payment table remains the shared tender/receipt record.
- Credit debt is represented separately by an immutable credit ledger.
- Phase 4 does not implement split tenders, Paystack repayments, reversals, or refunds.
- The new status is not a settled/paid state and must not be included in cash received totals.
