import Link from "next/link";
import { StaffWorkspaceNav } from "@/components/staff/staff-workspace-nav";
import { requireStaffContext, userHasPermission } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import { formatGhs } from "@/lib/inventory/format";
import type { Database } from "@/types/database";

type CreditAccountRow =
  Database["public"]["Functions"]["search_credit_accounts"]["Returns"][number];

export default async function CreditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireStaffContext();
  const params = await searchParams;
  const query = (Array.isArray(params.query) ? params.query[0] : (params.query ?? ""))
    .trim()
    .slice(0, 100);
  const [canView, canManage, canUsePos, canViewSales, canViewCustomers, canViewHistory] =
    await Promise.all([
      userHasPermission("view_credit"),
      userHasPermission("manage_credit"),
      userHasPermission("complete_sale"),
      userHasPermission("view_sales_history"),
      userHasPermission("view_customers"),
      userHasPermission("view_stock_history"),
    ]);
  if (!canView)
    return (
      <main className="p-8">
        <h1 className="text-2xl font-semibold">Credit unavailable</h1>
        <p className="mt-2">Your role cannot view credit accounts.</p>
      </main>
    );
  const client = await createClient();
  const { data: accounts, error } = await client.rpc("search_credit_accounts", {
    p_query: query,
    p_limit: 100,
  });
  return (
    <main className="min-h-svh bg-[#f7f4ec] px-4 py-6 text-[#1f2924] sm:px-8 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <StaffWorkspaceNav
          active="/credit"
          canUsePos={canUsePos}
          canViewSales={canViewSales}
          canViewCustomers={canViewCustomers}
          canViewHistory={canViewHistory}
          canViewCredit
        />
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5e6b64]">
              Customer accounts
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Customer credit</h1>
            <p className="mt-2 text-sm text-[#5e6b64]">
              Balances change only through credit sales and recorded repayments.
            </p>
          </div>
          {canManage && canViewCustomers && (
            <Link
              href="/customers"
              className="inline-flex min-h-11 items-center rounded-lg bg-[#153c33] px-4 font-semibold text-white transition-colors hover:bg-[#2f654f]"
            >
              Set up customer credit
            </Link>
          )}
        </header>
        <form className="mb-4 flex gap-2">
          <label htmlFor="credit-query" className="sr-only">
            Search credit accounts
          </label>
          <input
            id="credit-query"
            name="query"
            defaultValue={query}
            maxLength={100}
            placeholder="Search by customer name or phone"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-[#d7e0d9] px-3"
          />
          <button className="min-h-11 rounded-lg bg-[#153c33] px-4 font-semibold text-white">
            Search
          </button>
        </form>
        {error ? (
          <p role="alert" className="rounded-lg bg-rose-50 p-4">
            Credit accounts could not be loaded.
          </p>
        ) : accounts?.length ? (
          <div className="overflow-x-auto rounded-xl border border-[#d7e0d9] bg-white">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-[#f7f4ec] text-xs uppercase text-[#5e6b64]">
                <tr>
                  {[
                    "Customer",
                    "Phone",
                    "Credit limit",
                    "Outstanding",
                    "Available",
                    "Status",
                    "",
                  ].map((head) => (
                    <th className="px-4 py-3" key={head}>
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eaf2f3]">
                {(accounts as CreditAccountRow[]).map((account) => (
                  <tr key={account.customer_id}>
                    <td className="px-4 py-3 font-semibold">
                      {account.customer_name}
                      {account.customer_status === "inactive" && (
                        <span className="ml-2 text-xs font-normal">
                          Inactive customer
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{account.customer_phone}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatGhs(account.credit_limit)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatGhs(account.current_balance)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatGhs(account.available_credit)}
                    </td>
                    <td className="px-4 py-3 capitalize">{account.status}</td>
                    <td className="px-4 py-3">
                      <Link
                        className="font-semibold underline"
                        href={`/credit/${account.customer_id}`}
                      >
                        {canManage ? "Manage" : "History"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-[#d7e0d9] bg-white p-8 text-center">
            No credit accounts found. Use “Set up customer credit” to choose an active
            customer and assign a limit.
          </p>
        )}
      </div>
    </main>
  );
}
