# ADR-003: Human-readable POS receipt numbers

- **Status:** Accepted for Phase 3 development
- **Date:** 2026-10-12

## Context

Receipts must be readable and unique, while the UUID sale primary key remains stable. Phase 3 is online-only, but later offline synchronization needs a client operation identifier that can be generated before a request reaches the server.

## Decision

The server formats a receipt as `GP-YYMMDD-<16 uppercase hex characters>`. `YYMMDD` uses the `Africa/Accra` sale date; the hexadecimal suffix is derived from the client-generated UUID operation ID. If the short candidate is already present, the database appends another operation-ID suffix. A unique constraint on `sales.receipt_number` remains the final collision guard. The number is never used as a primary key. The cashier UI creates one UUID operation ID for a cart submission and reuses it on retry.

## Consequences

- Receipts are compact, recognizable, and can be correlated with an idempotent operation.
- The database uniquely enforces receipt values and retries return the original sale.
- Phase 3 issues numbers only when an online database transaction commits.
- Offline sales must define provisional receipt allocation and conflict handling before implementation. The UUID operation ID is the compatibility seam; this ADR does not claim offline receipt allocation is solved.
- If the collision fallback itself encounters a unique conflict, the transaction fails rather than issuing a duplicate receipt.
