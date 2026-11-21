import { PosTerminal } from "@/components/pos/pos-terminal";
import { StaffWorkspaceNav } from "@/components/staff/staff-workspace-nav";
import { requireStaffContext, userHasPermission } from "@/lib/auth/authorization";

export default async function PosPage() {
  const actor = await requireStaffContext();
  const [canUsePos, canViewSales, canViewCustomers, canViewHistory, canViewCredit] =
    await Promise.all([
      userHasPermission("complete_sale"),
      userHasPermission("view_sales_history"),
      userHasPermission("view_customers"),
      userHasPermission("view_stock_history"),
      userHasPermission("view_credit"),
    ]);
  if (!canUsePos)
    return (
      <main className="p-8">
        <h1 className="text-2xl font-semibold">POS unavailable</h1>
        <p className="mt-2">Your role cannot complete customer sales.</p>
      </main>
    );
  return (
    <main className="min-h-svh bg-[#f7f4ec] px-4 py-6 text-[#1f2924] sm:px-8 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <StaffWorkspaceNav
          active="/pos"
          canUsePos
          canViewSales={canViewSales}
          canViewCustomers={canViewCustomers}
          canViewHistory={canViewHistory}
          canViewCredit={canViewCredit}
        />
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5e6b64]">
            Point of sale
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">New sale</h1>
          <p className="mt-2 text-sm text-[#5e6b64]">
            Prepare the product catalogue while online to enable cash-only sales during a
            temporary connection loss. Every synced sale is revalidated by the database.
          </p>
        </header>
        <PosTerminal
          cashierUserId={actor.userId}
          cashierName={actor.fullName}
          canUseCredit={canViewCredit}
        />
      </div>
    </main>
  );
}
