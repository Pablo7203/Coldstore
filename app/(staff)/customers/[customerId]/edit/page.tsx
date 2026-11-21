import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerEditForm } from "@/components/customers/customer-edit-form";
import { StaffWorkspaceNav } from "@/components/staff/staff-workspace-nav";
import { requireStaffContext, userHasPermission } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  await requireStaffContext();
  const { customerId } = await params;
  const canManage = await userHasPermission("manage_customers");
  if (!canManage)
    return (
      <main className="p-8">
        <h1 className="text-2xl font-semibold">Customer editing unavailable</h1>
        <p className="mt-2">
          Your role may search and create customers but cannot edit existing records.
        </p>
        <Link href="/customers" className="mt-4 inline-block underline">
          Back to customers
        </Link>
      </main>
    );
  const client = await createClient();
  const { data: customer } = await client
    .from("customers")
    .select("id, full_name, phone, email, notes, status")
    .eq("id", customerId)
    .maybeSingle();
  if (!customer) notFound();
  return (
    <main className="min-h-svh bg-[#f7f4ec] px-4 py-6 text-[#1f2924] sm:px-8 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <StaffWorkspaceNav
          active="/customers"
          canViewCustomers
          canViewSales={await userHasPermission("view_sales_history")}
          canUsePos={await userHasPermission("complete_sale")}
          canViewHistory={await userHasPermission("view_stock_history")}
        />
        <Link href="/customers" className="text-sm underline">
          Back to customers
        </Link>
        <h1 className="my-4 text-3xl font-semibold">Customer details</h1>
        <CustomerEditForm customer={customer} />
      </div>
    </main>
  );
}
