# Phase 1D — Customer Auth Final Verification

**Final status: PASS WITH LIMITATIONS — project owner deferred remaining live customer UI checks on 2026-10-12 to proceed to Phase 2.**

## Verified

- GrandPa development Auth email signup is enabled and Confirm Email is enabled.
- A disposable Auth signup request was accepted and did not return `over_email_send_rate_limit`. The `example.test` probe identity and linked customer profile were removed immediately. This proves request acceptance only; it does not verify message delivery or confirmation.
- The secret-safe Supabase connectivity verifier passed. `.env.local` is Git-ignored.
- The committed hosted Phase 1 rollback verification passed: 30 assertions, 0 failures, including own-profile read, cross-customer isolation, staff-profile denial, and customer non-promotion.
- Local regression passed: lint, typecheck, format check, unit tests (20), standard E2E (8 passed; 3 skipped, including both live identity workflows), production build, and `git diff --check`.
- Added an opt-in real customer test that does not use an Admin confirmation override. It waits for actual confirmation, then verifies the customer UI, sessions, profile linkage/normalization, hosted RLS isolation, staff-route denial, and cleanup.

## Live run outcome

- One real two-customer run was attempted through the application. The test passed Customer A's registration/profile linkage, invalid-password rejection, valid UI login, account access, staff-route denial, logout, and logged-out account denial.
- For Customer B, the run reached authenticated API profile checks, profile linkage, own-profile access, cross-customer isolation, and staff-role promotion denial. The subsequent UI login check remained at `/login` instead of reaching `/account`; the live test failed at that point and performed its cleanup.
- The user reported confirmation-link errors in the inbox flow. Hosted confirmation was polled by the test, but successful email delivery and a clean browser confirmation callback were not separately established for both identities.
- The live UI login/session, staff-route denial, and logout checks are therefore not accepted as complete for Customer B. This limitation is explicitly deferred by the project owner to allow Phase 2 to proceed; it is not recorded as a passing test.

Confirm Email remains enabled. No database architecture was changed for this deferral. Resume Phase 1D verification later and resolve the Customer B UI login issue before treating the customer authentication acceptance criteria as fully verified.

## Phase gate

**Phase 1 final status: PASS WITH LIMITATIONS.** The project owner has explicitly deferred the remaining Customer B live UI/session checks and authorized Phase 2 to proceed. **Ready for Phase 2: YES, with the limitation above carried forward.**

See [sanitized preflight evidence](../evidence/phase-1/phase1d-preflight.txt).
