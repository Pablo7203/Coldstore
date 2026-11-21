import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { CheckoutForm } from "@/components/storefront/checkout-form";
import { getAuthContext } from "@/lib/auth/authorization";
import { getServerEnvironment } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function CheckoutPage() {
  await connection();
  const customer = await getAuthContext();
  if (customer?.type === "staff") redirect("/staff");
  if (customer?.type !== "customer") redirect("/login?next=%2Fcheckout");
  const client = await createClient();
  const { data: customerProfile } = await client
    .from("customers")
    .select("phone, email")
    .eq("id", customer.customerId)
    .maybeSingle();
  const { data: deliverySettings } = await client
    .from("delivery_settings")
    .select("flat_fee")
    .eq("singleton", true)
    .maybeSingle();
  const serverEnvironment = getServerEnvironment();
  const paystackAvailable = Boolean(
    serverEnvironment.PAYSTACK_SECRET_KEY &&
    serverEnvironment.SUPABASE_SECRET_KEY &&
    serverEnvironment.NEXT_PUBLIC_SITE_URL,
  );

  return (
    <main className="storefront min-h-svh px-4 py-7 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/cart"
          className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-[#153c33]"
        >
          <ArrowLeft size={15} /> Back to cart
        </Link>
        <p className="store-eyebrow mt-7">CHOOSE HOW TO RECEIVE IT</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em]">Checkout</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--store-muted)]">
          Choose pickup or delivery, review the full total, then pay with cash or securely
          online with Paystack.
        </p>
        <CheckoutForm
          customerName={customer.fullName}
          customerPhone={customerProfile?.phone ?? ""}
          customerEmail={customerProfile?.email ?? ""}
          deliveryFee={deliverySettings?.flat_fee ?? null}
          paystackAvailable={paystackAvailable}
        />
      </div>
    </main>
  );
}
