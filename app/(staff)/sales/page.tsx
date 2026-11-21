import Link from "next/link";
import { StaffWorkspaceNav } from "@/components/staff/staff-workspace-nav";
import { formatGhs } from "@/lib/inventory/format";
import { requireStaffContext, userHasPermission } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

export default async function SalesHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireStaffContext();
  const client = await createClient();
  const [allowed, canUsePos, canViewCustomers, canViewHistory] = await Promise.all([
    userHasPermission("view_sales_history"),
    userHasPermission("complete_sale"),
    userHasPermission("view_customers"),
    userHasPermission("view_stock_history"),
  ]);
  if (!allowed)
    return (
      <main className="p-8">
        <h1 className="text-2xl font-semibold">Sales history unavailable</h1>
        <p className="mt-2">Your role cannot view POS sales.</p>
      </main>
    );
  const params = await searchParams;
  const query =
    (Array.isArray(params.query) ? params.query[0] : params.query)
      ?.trim()
      .slice(0, 100) ?? "";
  const { data: sales, error } = await client.rpc("search_pos_sales", {
    p_query: query,
    p_limit: 50,
    p_offset: 0,
  });
  return (
    <main className="min-h-svh bg-[#f7f4ec] px-4 py-6 text-[#1f2924] sm:px-8 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <StaffWorkspaceNav
          active="/sales"
          canUsePos={canUsePos}
          canViewSales
          canViewCustomers={canViewCustomers}
          canViewHistory={canViewHistory}
        />
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5e6b64]">
            POS transactions
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sales history</h1>
        </header>
        <section className="rounded-xl border border-[#d7e0d9] bg-white p-4">
          <form className="mb-4 flex gap-2">
            <label className="sr-only" htmlFor="sales-search">
              Receipt number
            </label>
            <input
              id="sales-search"
              name="query"
              defaultValue={query}
              placeholder="Search by receipt number"
              className="min-h-11 min-w-0 flex-1 rounded-lg border px-3"
            />
            <button className="min-h-11 rounded-lg bg-[#153c33] px-4 font-semibold text-white">
              Search
            </button>
          </form>
          {error ? (
            <p role="alert">Sales history could not be loaded.</p>
          ) : !sales?.length ? (
            <p>No sales found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-[#647064]">
                    <th className="p-3">Receipt</th>
                    <th className="p-3">Date / time</th>
                    <th className="p-3">Cashier</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Payment</th>
                    <th className="p-3">Total</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => (
                    <tr key={sale.id} className="border-b">
                      <td className="p-3">
                        <Link
                          href={`/sales/${sale.id}`}
                          className="font-semibold underline"
                        >
                          {sale.receipt_number}
                        </Link>
                      </td>
                      <td className="p-3">
                        {new Intl.DateTimeFormat("en-GH", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "Africa/Accra",
                        }).format(new Date(sale.occurred_at))}
                      </td>
                      <td className="p-3">{sale.cashier_name}</td>
                      <td className="p-3">{sale.customer_name ?? "Walk-in"}</td>
                      <td className="p-3">
                        {sale.payment_method === "external_momo"
                          ? "Externally confirmed MoMo"
                          : "Cash"}
                      </td>
                      <td className="p-3 tabular-nums">{formatGhs(sale.total)}</td>
                      <td className="p-3">
                        {sale.status === "completed" ? "Completed" : sale.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
