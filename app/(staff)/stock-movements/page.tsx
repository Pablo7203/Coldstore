import Link from "next/link";
import { redirect } from "next/navigation";
import { StaffWorkspaceNav } from "@/components/staff/staff-workspace-nav";
import { requireStaffContext, userHasPermission } from "@/lib/auth/authorization";
import { formatAccraDateTime, formatQuantity } from "@/lib/inventory/format";
import { createClient } from "@/lib/supabase/server";

const movementLabels = {
  opening_stock: "Opening stock",
  receipt: "Stock received",
  wastage: "Wastage",
  damage: "Damage",
  adjustment_in: "Adjustment in",
  adjustment_out: "Adjustment out",
  sale: "Sale",
  customer_return: "Customer return",
  reversal: "Reversal",
} as const;

export default async function StockMovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string }>;
}) {
  await requireStaffContext();
  const canViewHistory = await userHasPermission("view_stock_history");
  if (!canViewHistory) redirect("/inventory");
  const params = await searchParams;
  const productId = params.productId || null;
  const client = await createClient();
  const [{ data: movements, error }, { data: products }] = await Promise.all([
    client.rpc("search_stock_movements", {
      p_product_id: productId ?? undefined,
      p_limit: 100,
      p_offset: 0,
    }),
    client.from("products").select("id, name, sku").order("name"),
  ]);

  return (
    <main className="min-h-svh bg-[#f7f4ec] px-4 py-6 text-[#1f2924] sm:px-8 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <StaffWorkspaceNav active="/stock-movements" canViewHistory />
        <div className="mb-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5e6b64]">
            Inventory ledger
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Movement history</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5e6b64]">
            Completed movements are append-only. Corrections create a new compensating
            movement, preserving the audit trail.
          </p>
        </div>

        <section className="rounded-2xl border border-[#d7e0d9] bg-white p-5 sm:p-6">
          <form method="get" className="mb-5 flex flex-wrap items-end gap-3">
            <label className="grid min-w-64 flex-1 gap-1 text-xs font-semibold text-[#5e6b64]">
              Product
              <select
                className="min-h-11 rounded-lg border border-[#d7e0d9] bg-white px-3 text-sm font-normal outline-none focus:border-[#2f654f]"
                name="productId"
                defaultValue={productId ?? ""}
              >
                <option value="">All products</option>
                {(products ?? []).map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                    {product.sku ? ` · ${product.sku}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button className="min-h-11 rounded-lg border border-[#d7e0d9] bg-[#f7f4ec] px-5 text-sm font-semibold text-[#153c33] hover:bg-[#eaf2f3]">
              Filter history
            </button>
            {productId ? (
              <Link
                className="min-h-11 rounded-lg px-3 py-3 text-sm font-semibold text-[#2f654f] hover:underline"
                href="/stock-movements"
              >
                Clear filter
              </Link>
            ) : null}
          </form>

          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-900"
            >
              Movement history could not be loaded. Refresh and try again.
            </p>
          ) : movements?.length ? (
            <div className="overflow-x-auto rounded-xl border border-[#d7e0d9]">
              <table className="w-full min-w-[950px] border-collapse text-left text-sm">
                <thead className="bg-[#f7f4ec] text-xs uppercase tracking-wide text-[#5e6b64]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Date / time (Accra)</th>
                    <th className="px-4 py-3 font-semibold">Product</th>
                    <th className="px-4 py-3 font-semibold">Movement</th>
                    <th className="px-4 py-3 text-right font-semibold">
                      Quantity change
                    </th>
                    <th className="px-4 py-3 font-semibold">Actor</th>
                    <th className="px-4 py-3 font-semibold">Reason / reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eaf2f3]">
                  {movements.map((movement) => (
                    <tr key={movement.id}>
                      <td className="whitespace-nowrap px-4 py-4 text-[#5e6b64]">
                        {formatAccraDateTime(movement.occurred_at)}
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-semibold text-[#153c33]">
                          {movement.product_name}
                        </p>
                        <p className="mt-1 font-mono text-xs text-[#5e6b64]">
                          {movement.sku ?? "No SKU"}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        {movementLabels[movement.movement_type]}
                      </td>
                      <td
                        className={`px-4 py-4 text-right font-semibold tabular-nums ${movement.quantity_delta > 0 ? "text-emerald-800" : "text-rose-800"}`}
                      >
                        {movement.quantity_delta > 0 ? "+" : "−"}
                        {formatQuantity(Math.abs(movement.quantity_delta))}
                      </td>
                      <td className="px-4 py-4 text-[#5e6b64]">{movement.actor_name}</td>
                      <td className="max-w-64 px-4 py-4 text-[#5e6b64]">
                        {movement.reason ?? "—"}
                        {movement.reference_type ? (
                          <span className="block text-xs text-[#5e6b64]">
                            {movement.reference_type}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[#d7e0d9] bg-[#f7f4ec] px-5 py-12 text-center">
              <p className="font-medium text-[#153c33]">
                No stock movements recorded yet.
              </p>
              <p className="mt-1 text-sm text-[#5e6b64]">
                Opening stock and later stock operations will appear here.
              </p>
            </div>
          )}
          {(movements?.length ?? 0) >= 100 ? (
            <p className="mt-3 text-xs text-[#5e6b64]">
              Showing the latest 100 movements. Use a product filter to narrow the
              history.
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
