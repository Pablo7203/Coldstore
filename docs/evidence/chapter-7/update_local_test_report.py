from pathlib import Path

from docx import Document


SOURCE = Path("docs/reports/Grand_Pas_Cold_Store_Report_Chapter_7_Updated.docx")
OUTPUT = Path(
    "docs/reports/Grand_Pas_Cold_Store_Report_Chapter_7_Local_Test_Evidence.docx"
)


def replace_paragraph(paragraph, text: str) -> None:
    if paragraph.runs:
        first = paragraph.runs[0]
        first.text = text
        for run in paragraph.runs[1:]:
            run._element.getparent().remove(run._element)
    else:
        paragraph.add_run(text)


def replace_cell(cell, text: str) -> None:
    paragraph = cell.paragraphs[0]
    replace_paragraph(paragraph, text)
    for extra in cell.paragraphs[1:]:
        extra._element.getparent().remove(extra._element)


def update_table(table_index: int, updates: dict[str, tuple[str, str]]) -> None:
    table = document.tables[table_index]
    found: set[str] = set()
    for row in table.rows[1:]:
        key = row.cells[0].text.strip()
        if key not in updates:
            continue
        result, status = updates[key]
        replace_cell(row.cells[-2], result)
        replace_cell(row.cells[-1], status)
        found.add(key)
    missing = set(updates) - found
    if missing:
        raise ValueError(f"Table {table_index + 1} is missing rows: {sorted(missing)}")


document = Document(SOURCE)

# Table 7.1: functional and integration test cases.
update_table(
    5,
    {
        "GPA-TC-01": (
            "Phase 1C local E2E passed staff and customer sign-in and role landing. "
            "The customer dashboard is shown in Figure 7.18.",
            "Passed",
        ),
        "GPA-TC-02": (
            "Unknown credentials were rejected with the expected sign-in error "
            "(Figure 7.14).",
            "Passed",
        ),
        "GPA-TC-03": (
            "Phase 1C verified staff permission boundaries and customer isolation; "
            "Phase 3 verified cashier and Stock Assistant boundaries.",
            "Passed",
        ),
        "GPA-TC-04": (
            "Phase 2 created a category and product, edited the price and searched "
            "by product name, SKU and barcode.",
            "Passed",
        ),
        "GPA-TC-05": (
            "Phase 2 opening stock and receipt movements reached 12.250; the later "
            "wastage movement also reconciled.",
            "Passed",
        ),
        "GPA-TC-06": (
            "Phase 3 completed local cash (GHS 18.51) and externally confirmed MoMo "
            "(GHS 6.17) sales; receipt and stock checks passed (Figures 7.20-7.22).",
            "Passed",
        ),
        "GPA-TC-07": (
            "An insufficient-stock POS attempt was not exercised in the local browser "
            "run; the earlier database fixture did not finish cleanly.",
            "Not tested",
        ),
        "GPA-TC-08": (
            "Product browsing, add-to-cart and cart review passed. No order was submitted "
            "in this local run; earlier pickup-order evidence is separate.",
            "Partial",
        ),
        "GPA-TC-09": (
            "No customer order status transition was saved in this local run.",
            "Not tested",
        ),
        "GPA-TC-10": (
            "Local cash and externally confirmed MoMo payment methods were recorded "
            "correctly; Paystack was tested separately.",
            "Passed",
        ),
        "GPA-TC-11": (
            "The credit-sale workflow was not executed; the earlier Phase 4 database "
            "case was blocked by actor authorization.",
            "Blocked",
        ),
        "GPA-TC-12": (
            "The repayment workflow was not executed; the earlier Phase 4 authorization "
            "blocker remains.",
            "Blocked",
        ),
        "GPA-TC-13": (
            "The public shell worked offline, but offline POS transaction storage was "
            "not available in the tested build.",
            "Not met",
        ),
        "GPA-TC-14": (
            "No offline transaction queue or synchronization workflow was demonstrated.",
            "Not met",
        ),
        "GPA-TC-15": (
            "Phase 3 concurrency passed; duplicate retry after synchronization was not "
            "exercised, and the earlier fixed-operation-ID case was inconclusive.",
            "Blocked",
        ),
        "GPA-TC-16": (
            "No sales-report route or report export was executed.",
            "Not met",
        ),
        "GPA-TC-17": (
            "A GHS 45 Paystack sandbox payment was verified earlier; no Paystack "
            "transaction was run against local Supabase in this session.",
            "Partial",
        ),
        "GPA-TC-18": (
            "Delivery checkout remained disabled because the store flat rate was unset; "
            "no delivery tracking update was tested.",
            "Blocked",
        ),
        "GPA-TC-19": (
            "Email delivery was not tested because no provider was configured in the "
            "local environment.",
            "Blocked",
        ),
    },
)

# Table 7.4: product quality checks.
update_table(
    7,
    {
        "Page load time": ("No controlled timing was recorded.", "Not tested"),
        "POS response time": ("No timed POS transaction was performed.", "Not tested"),
        "Login security": (
            "Unknown credentials were rejected; local staff and customer sign-in passed.",
            "Passed",
        ),
        "Role-based access": (
            "Staff role boundaries, customer isolation and cashier/stock restrictions "
            "passed in the local E2E runs.",
            "Passed",
        ),
        "Offline recovery": (
            "Only the public shell was cached; offline POS transaction recovery was not "
            "available in the tested build.",
            "Not met",
        ),
        "Browser compatibility": (
            "Chrome checks passed; other desktop browsers were not tested.",
            "Partial",
        ),
        "Mobile responsiveness": (
            "The 375 x 812 viewport check passed; no physical mobile device was tested.",
            "Partial",
        ),
        "Backup/recovery": ("No backup or restoration exercise was run.", "Not tested"),
    },
)

# Table 7.6: functional requirement traceability.
update_table(
    9,
    {
        "FR01": ("TC-01, TC-02; local staff/customer login and invalid-login checks passed.", "Met"),
        "FR02": ("TC-03; Phase 1C role boundaries/customer isolation and Phase 3 staff restrictions passed.", "Met"),
        "FR03": ("Phase 1C created staff roles, verified audit events and deactivated a Manager account.", "Met"),
        "FR04": ("TC-04; category/product creation, price edit and name/SKU/barcode search passed.", "Met"),
        "FR05": ("TC-05, TC-06; stock receipt and POS balance reconciliation passed; the damage movement failed.", "Partially met"),
        "FR06": ("TC-05; opening stock, receipt and wastage passed; damage left quantity at 11.250 instead of 11.000.", "Partially met"),
        "FR07": ("TC-06; POS product search and add-to-sale passed.", "Met"),
        "FR08": ("TC-06; sale stock deduction and Phase 3 ledger/balance reconciliation passed.", "Met"),
        "FR09": ("TC-10; local cash and externally confirmed MoMo payment methods were recorded.", "Met"),
        "FR10": ("TC-06; cash and MoMo receipts/references were captured (Figures 7.21-7.22).", "Met"),
        "FR11": ("TC-08; product catalogue, responsive view and add-to-cart/cart review passed (Figures 7.9-7.11).", "Met"),
        "FR12": ("TC-08, TC-17; an earlier pickup/Paystack order succeeded, but local checkout was not rerun.", "Partially met"),
        "FR13": ("TC-09; no online order status transition was tested.", "Not tested"),
        "FR14": ("TC-11; the earlier Phase 4 credit-account case remained blocked by actor authorization.", "Blocked"),
        "FR15": ("TC-11, TC-12; credit sale and repayment were not exercised locally; authorization remains unresolved.", "Blocked"),
        "FR16": ("No credit-limit change or denial scenario was run.", "Not tested"),
        "FR17": ("TC-13; the service worker caches the public shell, not offline POS transactions.", "Not met"),
        "FR18": ("TC-14, TC-15; no offline queue or synchronization workflow was demonstrated.", "Not met"),
        "FR19": ("TC-13, TC-14; no synchronization status for queued transactions was demonstrated.", "Not met"),
        "FR20": ("TC-16; no sales-report route or report service was available for testing.", "Not met"),
    },
)

# Table 7.7: non-functional requirement evaluation.
update_table(
    10,
    {
        "Usability": ("Technical evaluator walkthrough and browser journeys only; no participants, task timings or SUS result.", "Partial"),
        "Performance": ("Page and POS response targets were not measured.", "Not tested"),
        "Security": ("Invalid login, anonymous-route protection, staff role checks and customer isolation passed; no penetration test was run.", "Partial"),
        "Reliability": ("Unit and Phase 3 tests passed; the stock-damage check failed and local Auth/REST became unavailable during a rerun.", "Partial"),
        "Compatibility": ("Chrome desktop and narrow-viewport checks passed; no other browser or physical-device run.", "Partial"),
        "Scalability": ("No load or concurrency benchmark completed.", "Not tested"),
        "Maintainability": ("Lint, type, format and production-build checks passed in earlier verification; no formal maintainability review.", "Partial"),
    },
)

replacements = {
    "Security checks covered invalid credentials and anonymous access to protected routes. The local row-level security suite did not finish cleanly because populated demo data differed from its fixed fixtures; a complete staff-role and security review remains outstanding.": (
        "Local security checks rejected unknown credentials and anonymous protected-route access. "
        "The Phase 1C staff-role matrix and customer-isolation workflow passed, as did the Phase 3 "
        "cashier and Stock Assistant boundaries. No penetration test was performed."
    ),
    "Testing confirmed selected prototype behaviours, particularly customer product browsing, account access, pickup order creation and Paystack sandbox payment verification. Unit tests, lint, type checking, formatting checks, the production build and targeted browser checks passed. These results do not show that every functional requirement is complete: offline POS, synchronisation and reports were absent from the tested build, while delivery, order-status changes, cash and credit workflows, recovery and performance targets remain unverified.": (
        "Testing confirmed customer storefront and cart use, customer and staff authentication, "
        "staff-role boundaries, product and category maintenance, selected inventory movements, "
        "and local POS sales with cash and externally confirmed Mobile Money. The unit suite passed "
        "37 of 37 tests. The full local production-mode browser run passed 12 of 15 tests, failed two "
        "and skipped the confirmation-email case. A focused Phase 1C rerun passed after its old "
        "dashboard greeting assertion was updated. Phase 2 still failed when a damage movement left "
        "quantity at 11.250 instead of the expected 11.000; a later rerun stopped at sign-in when "
        "local Auth and REST became unavailable. Phase 3 POS sales, receipts, stock reconciliation "
        "and concurrency passed. Paystack was verified in an earlier sandbox run, but was not tested "
        "against local Supabase in this session. Delivery checkout, email delivery, credit, offline "
        "POS and synchronization remain unverified or incomplete."
    ),
    "The traceability tables distinguish Passed, Partial, Blocked, Not tested and Not met outcomes. The local Supabase integration run was not a clean acceptance pass: existing demo records conflicted with fixed fixtures, a phase-three operation identifier was already in use, and a phase-four test actor lacked credit-management permission. No participant interviews, satisfaction scores or user-acceptance results were collected.": (
        "The traceability tables distinguish Met, Partially met, Blocked, Not tested and Not met "
        "outcomes. Nine of the 20 functional requirements (45%) were met, three were partially met, "
        "two were blocked, two were not tested and four were not met. The local migration history "
        "does not fully align with the repository, and Auth/REST became unreachable during later "
        "retries. No interviews, participant observations, satisfaction scores or user-acceptance "
        "results were collected."
    ),
    "Before making a complete acceptance claim, configure the delivery rate and email provider, use one canonical payment return origin, rerun the database suite with controlled fixtures, complete the offline and credit/order workflows, and collect genuine participant feedback. This chapter therefore provides a partial evaluation of the prototype and identifies the evidence still required.": (
        "Before making a complete acceptance claim, reconcile the local database migrations and "
        "stabilize the Supabase services, correct and retest the damage movement, configure the "
        "delivery rate and email provider, rerun customer checkout and order-status workflows, "
        "exercise credit and offline synchronization, and collect genuine participant feedback. "
        "The GHS 45 Paystack sandbox result should be repeated against the canonical local callback "
        "origin before it is counted as current local evidence. This chapter records a partial "
        "evaluation and the remaining work."
    ),
    "The testing was performed on the functional and non-functional requirements as outlined in the earlier stages of the project. The final assessment revealed that [insert number/percentage] of the requirements tested were fully met and [insert number] were partially met or needed further development. The project [achieved / substantially achieved] the overall aim within the scope of the academics.": (
        "The testing was performed against the functional and non-functional requirements defined "
        "earlier. Of the 20 functional requirements traced in Table 7.6, nine (45%) were met. Three "
        "were partially met, two were blocked, two were not tested and four were not met. The project "
        "substantially achieved its core aim within the tested scope, while delivery, credit, offline "
        "synchronization, reporting and participant acceptance still require further work."
    ),
}

seen: set[str] = set()
for paragraph in document.paragraphs:
    old_text = paragraph.text.strip()
    if old_text in replacements:
        replace_paragraph(paragraph, replacements[old_text])
        seen.add(old_text)

missing_paragraphs = set(replacements) - seen
if missing_paragraphs:
    raise ValueError(f"Expected report paragraphs were not found: {sorted(missing_paragraphs)}")

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
document.save(OUTPUT)
print(f"Updated report: {OUTPUT}")
print(f"Updated test tables: 7.1, 7.4, 7.6 and 7.7")
print(f"Updated conclusion and requirements summary paragraphs: {len(replacements)}")
