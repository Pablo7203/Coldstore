import Link from "next/link";
import { redirect } from "next/navigation";
import { updateDeliveryRate } from "@/app/(staff)/settings/actions";
import { StaffWorkspaceNav } from "@/components/staff/staff-workspace-nav";
import { requireStaffContext, userHasPermission } from "@/lib/auth/authorization";
import { formatGhs } from "@/lib/inventory/format";
import { createClient } from "@/lib/supabase/server";

const notices: Record<string, string> = {
  saved: "The flat delivery rate is saved and will apply to new orders.",
  invalid: "Enter a valid delivery rate in Ghana cedis.",
  error: "We couldn’t save the delivery rate. Please try again.",
};

export default async function DeliverySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  await requireStaffContext();
  if (!(await userHasPermission("manage_delivery_rate"))) redirect("/staff");

  const [{ notice }, client] = await Promise.all([searchParams, createClient()]);
  const { data: settings, error } = await client
    .from("delivery_settings")
    .select("flat_fee, updated_at")
    .eq("singleton", true)
    .maybeSingle();

  return (
    <main className="min-h-svh bg-[#f7f4ec] px-5 py-8 text-[#1f2924] sm:px-8">
      <div className="mx-auto max-w-5xl">
        <StaffWorkspaceNav active="/settings/delivery" />
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5e6b64]">
          STORE SETTINGS
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Delivery rate</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5e6b64]">
          Set one flat delivery fee in Ghana cedis. Customers see it before placing a
          delivery order, and it is saved with that order so later changes do not change
          existing totals.
        </p>

        {notice && notices[notice] ? (
          <p
            role="status"
            className={`mt-5 rounded-lg p-3 text-sm ${notice === "saved" ? "bg-[#eaf2f3] text-[#153c33]" : "bg-amber-50 text-amber-950"}`}
          >
            {notices[notice]}
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-950"
          >
            The delivery setting is unavailable right now. Refresh the page in a moment.
          </p>
        ) : null}

        <section className="mt-7 max-w-2xl rounded-2xl border border-[#d7e0d9] bg-white p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5e6b64]">
            Current flat rate
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">
            {settings ? formatGhs(settings.flat_fee) : "Not set"}
          </p>
          <form
            action={updateDeliveryRate}
            className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto]"
          >
            <label className="grid gap-2 text-sm font-medium">
              New delivery rate (GHS)
              <input
                required
                name="flatFee"
                type="number"
                min="0"
                max="999999999.99"
                step="0.01"
                defaultValue={settings?.flat_fee ?? ""}
                aria-describedby="delivery-rate-help"
                className="min-h-12 rounded-lg border border-[#d7e0d9] bg-white px-3 text-sm font-normal outline-none focus:border-[#2f654f] focus:ring-2 focus:ring-[#d7e0d9]"
              />
              <span
                id="delivery-rate-help"
                className="text-xs font-normal text-[#5e6b64]"
              >
                Up to two decimal places. Use 0.00 for free delivery.
              </span>
            </label>
            <button className="min-h-12 self-end rounded-lg bg-[#153c33] px-5 text-sm font-semibold text-white hover:bg-[#2f654f]">
              Save flat rate
            </button>
          </form>
        </section>

        <p className="mt-5 text-sm text-[#5e6b64]">
          Need to review incoming orders?{" "}
          <Link className="font-semibold text-[#153c33] underline" href="/orders">
            Open online orders
          </Link>
        </p>
      </div>
    </main>
  );
}
