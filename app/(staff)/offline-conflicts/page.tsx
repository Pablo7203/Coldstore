import { StaffWorkspaceNav } from "@/components/staff/staff-workspace-nav";
import { OfflineConflictActions } from "@/components/pos/offline-conflict-actions";
import { requireStaffContext, userHasPermission } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

type SnapshotItem = {
  product_id: string;
  product_name_snapshot: string;
  sku_snapshot: string | null;
  unit_price: number | string;
  quantity: number | string;
  line_total: number | string;
};

type ConflictReason = {
  code?: string;
  message?: string;
  productName?: string;
};

export default async function OfflineConflictReviewPage() {
  await requireStaffContext();
  const canResolveConflicts = await userHasPermission("resolve_conflicts");
  if (!canResolveConflicts) {
    return (
      <main className="min-h-svh bg-[#f7f4ec] px-5 py-8 text-[#1f2924] sm:px-8">
        <h1 className="text-2xl font-semibold">Offline sale review</h1>
        <p className="mt-2 text-sm text-[#5e6b64]">
          Your role cannot review offline sale conflicts.
        </p>
      </main>
    );
  }

  const client = await createClient();
  const { data, error } = await client
    .from("offline_pos_operations")
    .select(
      "id, cashier_name_snapshot, client_operation_id, occurred_at, items_snapshot, conflict_reasons, created_at",
    )
    .eq("status", "pending_review")
    .order("created_at", { ascending: true });
  const conflicts = data ?? [];

  return (
    <main className="min-h-svh bg-[#f7f4ec] px-4 py-6 text-[#1f2924] sm:px-8 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <StaffWorkspaceNav active="/offline-conflicts" canResolveConflicts />
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5e6b64]">
            Synchronisation
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Offline sale review
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5e6b64]">
            Review cash sales that could not be safely posted because stock, product
            details, or online reservations changed while the POS was offline. The
            submitted item and price snapshots are retained for this review.
          </p>
        </header>

        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
          >
            Conflict records could not be loaded. Refresh the page or check the database
            migration.
          </p>
        ) : conflicts.length === 0 ? (
          <section className="rounded-2xl border border-[#d7e0d9] bg-white p-7 text-center">
            <h2 className="text-lg font-semibold">No offline sales need review</h2>
            <p className="mt-2 text-sm text-[#5e6b64]">
              New sync conflicts will appear here with their cashier, time, items, and
              reason.
            </p>
          </section>
        ) : (
          <div className="space-y-4">
            <p className="text-sm font-medium text-[#5e6b64]">
              {conflicts.length} sale{conflicts.length === 1 ? "" : "s"} awaiting review
            </p>
            {conflicts.map((conflict) => {
              const items = conflict.items_snapshot as unknown as SnapshotItem[];
              const reasons = conflict.conflict_reasons as unknown as ConflictReason[];
              const total = items.reduce((sum, item) => sum + Number(item.line_total), 0);

              return (
                <article
                  key={conflict.id}
                  className="rounded-2xl border border-[#d7e0d9] bg-white p-5 shadow-sm sm:p-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5e6b64]">
                        Offline sale ·{" "}
                        {conflict.client_operation_id.slice(0, 8).toUpperCase()}
                      </p>
                      <h2 className="mt-1 text-lg font-semibold">
                        Recorded by {conflict.cashier_name_snapshot}
                      </h2>
                      <p className="mt-1 text-sm text-[#5e6b64]">
                        Occurred {new Date(conflict.occurred_at).toLocaleString()} ·
                        synced {new Date(conflict.created_at).toLocaleString()}
                      </p>
                    </div>
                    <p className="rounded-full bg-[#eaf2f3] px-3 py-1 text-sm font-semibold text-[#153c33]">
                      GHS {total.toFixed(2)} · Cash
                    </p>
                  </div>

                  <div className="mt-4 overflow-x-auto rounded-xl border border-[#d7e0d9]">
                    <table className="w-full min-w-[520px] text-left text-sm">
                      <thead className="bg-[#f7f4ec] text-xs uppercase tracking-wide text-[#5e6b64]">
                        <tr>
                          <th className="px-3 py-2">Product snapshot</th>
                          <th className="px-3 py-2">Qty</th>
                          <th className="px-3 py-2">Unit price</th>
                          <th className="px-3 py-2 text-right">Line total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr key={item.product_id} className="border-t border-[#e7e9e4]">
                            <td className="px-3 py-2">
                              <span className="font-medium">
                                {item.product_name_snapshot}
                              </span>
                              {item.sku_snapshot && (
                                <span className="ml-2 text-xs text-[#5e6b64]">
                                  {item.sku_snapshot}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">{item.quantity}</td>
                            <td className="px-3 py-2">
                              GHS {Number(item.unit_price).toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-right font-medium">
                              GHS {Number(item.line_total).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <h3 className="text-sm font-semibold text-amber-950">
                      Why it needs review
                    </h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-950">
                      {reasons.map((reason, index) => (
                        <li key={`${reason.code ?? "conflict"}-${index}`}>
                          {reason.productName ? `${reason.productName}: ` : ""}
                          {reason.message ?? "Store data changed before sync."}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <OfflineConflictActions operationId={conflict.id} />
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
