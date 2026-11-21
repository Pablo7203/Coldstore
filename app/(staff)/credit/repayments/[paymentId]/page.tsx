import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintReceiptButton } from "@/components/pos/print-receipt-button";
import { StaffWorkspaceNav } from "@/components/staff/staff-workspace-nav";
import { requireStaffContext, userHasPermission } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import { formatAccraDateTime, formatGhs } from "@/lib/inventory/format";

export default async function RepaymentReceiptPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  await requireStaffContext();
  const { paymentId } = await params;
  const [allowed, canUsePos, canViewSales, canViewCustomers, canViewStockHistory] =
    await Promise.all([
      userHasPermission("view_credit_history"),
      userHasPermission("complete_sale"),
      userHasPermission("view_sales_history"),
      userHasPermission("view_customers"),
      userHasPermission("view_stock_history"),
    ]);
  if (!allowed)
    return (
      <main className="p-8">
        <h1>Receipt unavailable</h1>
      </main>
    );
  const client = await createClient();
  const { data, error } = await client.rpc("get_credit_repayment", {
    p_payment_id: paymentId,
  });
  if (error || !data?.length) notFound();
  const row = data[0];
  return (
    <main className="min-h-svh bg-[#f7f4ec] px-4 py-6 print:bg-white print:p-0">
      <div className="mx-auto max-w-4xl print:max-w-none">
        <div className="print:hidden">
          <StaffWorkspaceNav
            active="/credit"
            canUsePos={canUsePos}
            canViewSales={canViewSales}
            canViewCustomers={canViewCustomers}
            canViewHistory={canViewStockHistory}
            canViewCredit
          />
          <Link href={`/credit/${row.customer_id}`} className="text-sm underline">
            Back to customer credit
          </Link>
        </div>
        <article className="mx-auto mt-5 max-w-xl rounded-xl border border-[#d7e0d9] bg-white p-6 print:mt-0 print:max-w-none print:rounded-none print:border-0">
          <header className="border-b border-dashed pb-4 text-center">
            <h1 className="text-2xl font-bold">Grand Pa’s Cold Store</h1>
            <p className="mt-2">Credit repayment receipt</p>
            <p className="text-sm">{formatAccraDateTime(row.occurred_at)}</p>
          </header>
          <dl className="my-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt>Customer</dt>
              <dd>{row.customer_name}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Repayment amount</dt>
              <dd className="font-bold">{formatGhs(row.amount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Method</dt>
              <dd>
                {row.payment_method === "external_momo"
                  ? "Externally confirmed MoMo"
                  : "Cash"}
              </dd>
            </div>
            {row.provider_reference && (
              <div className="flex justify-between">
                <dt>Reference</dt>
                <dd>{row.provider_reference}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt>Recorded by</dt>
              <dd>{row.recorded_by_name ?? "Former staff member"}</dd>
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold">
              <dt>Remaining outstanding</dt>
              <dd>{formatGhs(row.balance_after)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Available credit</dt>
              <dd>{formatGhs(row.available_after)}</dd>
            </div>
          </dl>
          <footer className="border-t border-dashed pt-4 text-center text-sm">
            Repayment recorded successfully.
          </footer>
        </article>
        <div className="mx-auto mt-4 max-w-xl print:hidden">
          <PrintReceiptButton />
        </div>
      </div>
    </main>
  );
}
