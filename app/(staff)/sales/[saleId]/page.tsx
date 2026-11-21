import Link from "next/link";
import { notFound } from "next/navigation";
import { StaffWorkspaceNav } from "@/components/staff/staff-workspace-nav";
import { PrintReceiptButton } from "@/components/pos/print-receipt-button";
import { formatGhs, formatQuantity } from "@/lib/inventory/format";
import { requireStaffContext, userHasPermission } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

export default async function SaleReceiptPage({
  params,
}: {
  params: Promise<{ saleId: string }>;
}) {
  await requireStaffContext();
  const { saleId } = await params;
  const client = await createClient();
  const [allowed, canUsePos, canViewCustomers, canViewHistory, canViewCredit] =
    await Promise.all([
      userHasPermission("view_sales_history"),
      userHasPermission("complete_sale"),
      userHasPermission("view_customers"),
      userHasPermission("view_stock_history"),
      userHasPermission("view_credit"),
    ]);
  if (!allowed)
    return (
      <main className="p-8">
        <h1 className="text-2xl font-semibold">Receipt unavailable</h1>
        <p className="mt-2">Your role cannot view sales history.</p>
      </main>
    );
  const { data: rows, error } = await client.rpc("get_pos_sale", { p_sale_id: saleId });
  if (error || !rows?.length) notFound();
  const sale = rows[0];
  return (
    <main className="min-h-svh bg-[#f7f4ec] px-4 py-6 text-[#1f2924] sm:px-8 sm:py-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-4xl">
        <div className="print:hidden">
          <StaffWorkspaceNav
            active="/sales"
            canUsePos={canUsePos}
            canViewSales
            canViewCustomers={canViewCustomers}
            canViewHistory={canViewHistory}
            canViewCredit={canViewCredit}
          />
          <Link href="/sales" className="text-sm underline">
            Back to sales history
          </Link>
        </div>
        <article className="receipt mx-auto mt-5 max-w-2xl rounded-xl border border-[#d7e0d9] bg-white p-6 print:mt-0 print:max-w-none print:rounded-none print:border-0">
          <header className="border-b border-dashed border-[#8a9389] pb-4 text-center">
            <h1 className="text-2xl font-bold">Grand Pa’s Cold Store</h1>
            <p className="mt-2 text-sm">Receipt {sale.receipt_number}</p>
            <p className="text-sm">
              {new Intl.DateTimeFormat("en-GH", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Africa/Accra",
              }).format(new Date(sale.occurred_at))}
            </p>
          </header>
          <dl className="grid gap-1 border-b border-dashed border-[#8a9389] py-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="inline font-medium">Cashier: </dt>
              <dd className="inline">{sale.cashier_name}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Customer: </dt>
              <dd className="inline">{sale.customer_name ?? "Walk-in"}</dd>
            </div>
          </dl>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-3">Item</th>
                  <th className="py-3 text-right">Qty</th>
                  <th className="py-3 text-right">Unit</th>
                  <th className="py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.item_id} className="border-b border-[#e6e8e3]">
                    <td className="py-3">
                      {row.product_name}
                      {row.sku ? (
                        <span className="block text-xs text-[#5e6b64]">{row.sku}</span>
                      ) : null}
                    </td>
                    <td className="py-3 text-right tabular-nums">
                      {formatQuantity(row.quantity)}
                    </td>
                    <td className="py-3 text-right tabular-nums">
                      {formatGhs(row.unit_price)}
                    </td>
                    <td className="py-3 text-right tabular-nums">
                      {formatGhs(row.line_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="space-y-2 border-t border-dashed border-[#8a9389] pt-4">
            <div className="flex justify-between text-lg font-bold">
              <dt>Total</dt>
              <dd>{formatGhs(sale.total)}</dd>
            </div>
            <div className="flex justify-between text-sm">
              <dt>Payment</dt>
              <dd>
                {sale.payment_method === "external_momo"
                  ? "Externally Confirmed Mobile Money"
                  : sale.payment_method === "credit"
                    ? "Customer Credit"
                    : "Cash"}
              </dd>
            </div>
            {sale.payment_method === "credit" && (
              <>
                <div className="flex justify-between text-sm">
                  <dt>Amount charged to credit</dt>
                  <dd>{formatGhs(sale.total)}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt>New outstanding balance</dt>
                  <dd>{formatGhs(sale.credit_balance_after)}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt>Remaining available credit</dt>
                  <dd>{formatGhs(sale.credit_available_after)}</dd>
                </div>
                <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
                  This amount was added to the customer’s outstanding balance. No money
                  was collected for this sale.
                </p>
              </>
            )}
            {sale.provider_reference && (
              <div className="flex justify-between text-sm">
                <dt>MoMo reference</dt>
                <dd>{sale.provider_reference}</dd>
              </div>
            )}
          </dl>
          <footer className="mt-5 border-t border-dashed border-[#8a9389] pt-4 text-center text-sm">
            Thank you for shopping with us.
          </footer>
        </article>
        <div className="mx-auto mt-4 max-w-2xl print:hidden">
          <PrintReceiptButton />
          <p className="mt-2 text-xs text-[#5e6b64]">
            Completed sales are read-only. Corrections require a controlled void or
            reversal workflow, which is not part of this phase.
          </p>
        </div>
      </div>
    </main>
  );
}
