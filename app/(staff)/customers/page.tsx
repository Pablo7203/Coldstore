import Link from "next/link";
import { CustomerCreateForm } from "@/components/customers/customer-create-form";
import { StaffWorkspaceNav } from "@/components/staff/staff-workspace-nav";
import { requireStaffContext, userHasPermission } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import { normalizeGhanaPhoneSearchPrefix } from "@/lib/validation/ghana-phone";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireStaffContext();
  const params = await searchParams;
  const queryRaw = Array.isArray(params.query) ? params.query[0] : params.query;
  const query = (queryRaw ?? "").trim().slice(0, 100);
  const safe = query.replace(/[\\%_]/gu, "\\$&");
  const phonePrefix = normalizeGhanaPhoneSearchPrefix(query).replace(/[\\%_]/gu, "\\$&");
  const client = await createClient();
  const [
    canView,
    canCreate,
    canManage,
    canViewCredit,
    canManageCredit,
    canUsePos,
    canViewSales,
    canViewHistory,
  ] = await Promise.all([
    userHasPermission("view_customers"),
    userHasPermission("create_customer"),
    userHasPermission("manage_customers"),
    userHasPermission("view_credit"),
    userHasPermission("manage_credit"),
    userHasPermission("complete_sale"),
    userHasPermission("view_sales_history"),
    userHasPermission("view_stock_history"),
  ]);
  if (!canView)
    return (
      <main className="p-8">
        <h1 className="text-2xl font-semibold">Customer records unavailable</h1>
        <p className="mt-2">Your role cannot view customer records.</p>
      </main>
    );
  const customerQuery = client
    .from("customers")
    .select("id, full_name, phone, email, status, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const lists = query
    ? await Promise.all([
        customerQuery.ilike("full_name", `${safe}%`),
        client
          .from("customers")
          .select("id, full_name, phone, email, status, created_at")
          .like("phone", `${phonePrefix}%`)
          .limit(100),
        client
          .from("customers")
          .select("id, full_name, phone, email, status, created_at")
          .ilike("email", `${safe}%`)
          .limit(100),
      ])
    : [await customerQuery];
  const customers = [
    ...new Map(
      lists.flatMap((result) => result.data ?? []).map((row) => [row.id, row]),
    ).values(),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <main className="min-h-svh bg-[#f7f4ec] px-4 py-6 text-[#1f2924] sm:px-8 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <StaffWorkspaceNav
          active="/customers"
          canViewCustomers
          canViewCredit={canViewCredit}
          canUsePos={canUsePos}
          canViewSales={canViewSales}
          canViewHistory={canViewHistory}
        />
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5e6b64]">
            Customer management
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Customers</h1>
          <p className="mt-2 text-sm text-[#5e6b64]">
            Walk-in customer records do not need an Auth account. Phone numbers use
            canonical Ghana format.
          </p>
        </header>
        <div className="grid gap-5 lg:grid-cols-[minmax(260px,0.7fr)_minmax(0,1.3fr)]">
          {canCreate && <CustomerCreateForm />}
          <section className="rounded-xl border border-[#d7e0d9] bg-white p-4">
            <form className="mb-4 flex gap-2">
              <label htmlFor="customer-query" className="sr-only">
                Search customers by name, phone, or email
              </label>
              <input
                id="customer-query"
                name="query"
                defaultValue={query}
                placeholder="Name, phone, or email"
                className="min-h-11 min-w-0 flex-1 rounded-lg border px-3"
              />
              <button className="min-h-11 rounded-lg bg-[#153c33] px-4 font-semibold text-white">
                Search
              </button>
            </form>
            {customers.length === 0 ? (
              <p>No matching customer records.</p>
            ) : (
              <ul className="divide-y divide-[#e4e7e1]">
                {customers.map((customer) => (
                  <li
                    key={customer.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <p className="font-semibold">{customer.full_name}</p>
                      <p className="text-sm">
                        {customer.phone}
                        {customer.email ? ` · ${customer.email}` : ""}
                      </p>
                      <p className="text-xs text-[#5e6b64]">
                        {customer.status === "active" ? "Active" : "Inactive"} ·{" "}
                        {customer.created_at.slice(0, 10)}
                      </p>
                    </div>
                    {(canManage || canManageCredit) && (
                      <div className="flex flex-wrap gap-2">
                        {canManageCredit && (
                          <Link
                            href={`/credit/${customer.id}`}
                            aria-label={`Set up or manage credit for ${customer.full_name}`}
                            className="min-h-10 rounded-lg border border-[#9eb5aa] bg-[#eaf2f3] px-3 py-2 text-sm font-semibold text-[#153c33] hover:bg-[#dbe9e7]"
                          >
                            Credit account
                          </Link>
                        )}
                        {canManage && (
                          <Link
                            href={`/customers/${customer.id}/edit`}
                            className="min-h-10 rounded-lg border px-3 py-2 text-sm"
                          >
                            View / edit
                          </Link>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
