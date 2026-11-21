import Link from "next/link";
import { notFound } from "next/navigation";
import { CreditAccountForm, RepaymentForm } from "@/components/credit/credit-forms";
import { StaffWorkspaceNav } from "@/components/staff/staff-workspace-nav";
import { requireStaffContext, userHasPermission } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import { formatAccraDateTime, formatGhs } from "@/lib/inventory/format";
import type { Database } from "@/types/database";

type CreditHistoryRow =
  Database["public"]["Functions"]["get_credit_history"]["Returns"][number];
type CreditAccountRow =
  Database["public"]["Functions"]["get_credit_account"]["Returns"][number];

export default async function CreditAccountPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  await requireStaffContext();
  const { customerId } = await params;
  const [
    canView,
    canManage,
    canRepay,
    canUsePos,
    canViewSales,
    canViewCustomers,
    canViewStockHistory,
  ] = await Promise.all([
    userHasPermission("view_credit"),
    userHasPermission("manage_credit"),
    userHasPermission("record_credit_repayment"),
    userHasPermission("complete_sale"),
    userHasPermission("view_sales_history"),
    userHasPermission("view_customers"),
    userHasPermission("view_stock_history"),
  ]);
  if (!canView)
    return (
      <main className="p-8">
        <h1>Credit unavailable</h1>
      </main>
    );
  const client = await createClient();
  const { data: accounts, error: accountError } = await client.rpc("get_credit_account", {
    p_customer_id: customerId,
  });
  if (accountError) notFound();

  const existingAccount = accounts?.[0];
  const isNewAccount = !existingAccount;
  let account: CreditAccountRow;

  if (existingAccount) {
    account = existingAccount;
  } else {
    if (!canManage || !canViewCustomers) notFound();

    const { data: customer, error: customerError } = await client
      .from("customers")
      .select("id, full_name, phone, status")
      .eq("id", customerId)
      .maybeSingle();
    if (customerError || !customer) notFound();

    account = {
      customer_id: customer.id,
      customer_name: customer.full_name,
      customer_phone: customer.phone,
      customer_status: customer.status,
      credit_limit: 0,
      current_balance: 0,
      available_credit: 0,
      status: "active",
      updated_at: new Date().toISOString(),
    };
  }

  let history: CreditHistoryRow[] = [];
  let historyError = false;
  if (!isNewAccount) {
    const historyResult = await client.rpc("get_credit_history", {
      p_customer_id: customerId,
      p_limit: 100,
      p_offset: 0,
    });
    history = historyResult.data ?? [];
    historyError = Boolean(historyResult.error);
  }
  return (
    <main className="min-h-svh bg-[#f7f4ec] px-4 py-6 text-[#1f2924] sm:px-8 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <StaffWorkspaceNav
          active="/credit"
          canUsePos={canUsePos}
          canViewSales={canViewSales}
          canViewCustomers={canViewCustomers}
          canViewHistory={canViewStockHistory}
          canViewCredit
        />
        <Link href="/credit" className="text-sm underline">
          Back to customer credit
        </Link>
        <header className="my-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5e6b64]">
            {isNewAccount ? "Credit setup" : "Credit account"}
          </p>
          <h1 className="mt-2 text-3xl font-semibold">{account.customer_name}</h1>
          <p className="mt-1 text-sm text-[#5e6b64]">
            {account.customer_phone} · Customer {account.customer_status}
          </p>
        </header>
        <section className="mb-5 grid gap-3 sm:grid-cols-4">
          {(
            [
              ["Credit limit", isNewAccount ? "Not set" : account.credit_limit],
              ["Outstanding balance", account.current_balance],
              ["Available credit", account.available_credit],
              ["Status", isNewAccount ? "Not configured" : account.status],
            ] as [string, number | string][]
          ).map(([label, value]) => (
            <article
              key={label}
              className="rounded-xl border border-[#d7e0d9] bg-white p-4"
            >
              <p className="text-sm text-[#5e6b64]">{label}</p>
              <p className="mt-2 text-xl font-semibold capitalize tabular-nums">
                {typeof value === "string" ? value : formatGhs(value)}
              </p>
            </article>
          ))}
        </section>
        {canManage && (
          <section className="mb-5">
            <h2 className="mb-3 text-xl font-semibold">
              {isNewAccount ? "Set up customer credit" : "Manage credit access"}
            </h2>
            {account.customer_status !== "active" ? (
              <p role="alert" className="rounded-xl border border-[#d7e0d9] bg-white p-4">
                Credit access can only be set for an active customer. Update the customer
                status first, then return here.
              </p>
            ) : (
              <CreditAccountForm
                customerId={customerId}
                limit={isNewAccount ? "" : String(account.credit_limit)}
                status={account.status}
                submitLabel={isNewAccount ? "Enable credit" : "Save account"}
                pendingLabel={isNewAccount ? "Enabling…" : "Saving…"}
              />
            )}
          </section>
        )}
        {canRepay && Number(account.current_balance) > 0 && (
          <section className="mb-5">
            <h2 className="mb-3 text-xl font-semibold">Record a repayment</h2>
            <RepaymentForm
              customerId={customerId}
              balance={String(account.current_balance)}
            />
          </section>
        )}
        {!isNewAccount && (
          <section className="rounded-xl border border-[#d7e0d9] bg-white p-4">
            <h2 className="mb-4 text-xl font-semibold">Credit history</h2>
            {historyError ? (
              <p role="alert">Credit history could not be loaded.</p>
            ) : history.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead className="border-b bg-[#f7f4ec] text-xs uppercase">
                    <tr>
                      {[
                        "Date",
                        "Transaction",
                        "Reference",
                        "Amount",
                        "Balance after",
                        "Available after",
                        "Recorded by",
                      ].map((heading) => (
                        <th key={heading} className="px-3 py-3">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {history.map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-3">
                          {formatAccraDateTime(row.occurred_at)}
                        </td>
                        <td className="px-3 py-3">
                          {row.transaction_type === "credit_sale"
                            ? "Credit sale"
                            : "Repayment"}
                        </td>
                        <td className="px-3 py-3">
                          {row.receipt_number ??
                            (row.payment_id ? (
                              <Link
                                className="underline"
                                href={`/credit/repayments/${row.payment_id}`}
                              >
                                Repayment receipt
                              </Link>
                            ) : (
                              "—"
                            ))}
                        </td>
                        <td className="px-3 py-3 tabular-nums">
                          {row.transaction_type === "repayment" ? "−" : "+"}
                          {formatGhs(row.amount)}
                        </td>
                        <td className="px-3 py-3 tabular-nums">
                          {formatGhs(row.balance_after)}
                        </td>
                        <td className="px-3 py-3 tabular-nums">
                          {formatGhs(row.available_after)}
                        </td>
                        <td className="px-3 py-3">
                          {row.recorded_by_name ?? "Former staff member"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No credit transactions have been recorded.</p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
