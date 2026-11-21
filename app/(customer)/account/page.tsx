import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock3,
  LayoutDashboard,
  LogOut,
  PackageCheck,
  ShoppingBag,
  Store,
  Truck,
  UserRound,
} from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { requireCustomerContext } from "@/lib/auth/authorization";
import { StoreProductCard } from "@/components/storefront/store-product-card";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { CustomerDetailsCard } from "@/components/storefront/customer-details-card";
import { formatAccraDateTime, formatGhs } from "@/lib/inventory/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type CatalogProduct =
  Database["public"]["Functions"]["get_orderable_catalog"]["Returns"][number];

async function getRecommendedProducts(): Promise<CatalogProduct[]> {
  try {
    const { data, error } = await createAdminClient().rpc("get_orderable_catalog", {
      p_query: "",
      p_limit: 3,
      p_category_id: null,
    });
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

const activeStatuses = ["pending", "confirmed", "preparing", "ready"] as const;

const orderStatusLabels: Record<string, string> = {
  pending: "Reserved",
  confirmed: "Confirmed",
  preparing: "Being prepared",
  ready: "Ready for pickup",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Reservation expired",
};

const deliveryStatusLabels: Record<string, string> = {
  confirmed: "Delivery confirmed",
  preparing: "Being prepared",
  packed: "Packed",
  out_for_delivery: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
  awaiting_fee: "Needs store review",
  fee_quoted: "Needs store review",
  not_applicable: "Delivery order",
};

export default async function CustomerAccountPage() {
  const customer = await requireCustomerContext();
  const client = await createClient();

  const [
    profileResult,
    ordersResult,
    totalResult,
    activeResult,
    deliveryResult,
    recommendedProducts,
  ] = await Promise.all([
    client
      .from("customers")
      .select("phone, email")
      .eq("id", customer.customerId)
      .maybeSingle(),
    client
      .from("orders")
      .select(
        "id, order_number, status, fulfillment_method, total, placed_at, delivery_stage, payment_method, payment_status",
      )
      .eq("customer_id", customer.customerId)
      .order("placed_at", { ascending: false })
      .limit(4),
    client
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customer.customerId),
    client
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customer.customerId)
      .in("status", [...activeStatuses]),
    client
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customer.customerId)
      .eq("fulfillment_method", "delivery")
      .in("status", [...activeStatuses]),
    getRecommendedProducts(),
  ]);

  const recentOrders = ordersResult.data ?? [];
  const firstName = customer.fullName.trim().split(/\s+/)[0] || "there";
  const orderCount = totalResult.count ?? 0;
  const activeCount = activeResult.count ?? 0;
  const activeDeliveryCount = deliveryResult.count ?? 0;

  return (
    <main className="storefront min-h-svh">
      <StorefrontHeader />
      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-8 sm:py-10 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="relative overflow-hidden rounded-3xl bg-[#153c33] p-5 text-white">
            <span className="pointer-events-none absolute -right-8 -top-9 size-28 rounded-full border border-white/10" />
            <span className="grid size-12 place-items-center rounded-full bg-[#f7f4ec] text-[#153c33]">
              <UserRound size={21} aria-hidden="true" />
            </span>
            <h2 className="mt-4 truncate text-lg font-semibold">{customer.fullName}</h2>
            <p className="mt-1 break-all text-xs text-white/70">
              {profileResult.data?.email ?? "Customer account"}
            </p>
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-bold tracking-[0.12em] text-[#e6b94f]">
              <CheckCircle2 size={13} aria-hidden="true" /> CUSTOMER ACCOUNT
            </span>
          </section>

          <nav
            className="rounded-3xl border border-[var(--store-line)] bg-white p-3"
            aria-label="Customer account navigation"
          >
            <Link
              href="/account"
              aria-current="page"
              className="flex min-h-11 items-center gap-3 rounded-xl bg-[#153c33] px-3 text-sm font-semibold text-white"
            >
              <LayoutDashboard size={17} aria-hidden="true" /> Dashboard
            </Link>
            <Link
              href="/shop"
              className="mt-1 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-[var(--store-ink)] transition-colors hover:bg-[var(--store-soft)]"
            >
              <Store size={17} aria-hidden="true" /> Shop products
            </Link>
            <Link
              href="/account/orders"
              className="mt-1 flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 text-sm font-medium text-[var(--store-ink)] transition-colors hover:bg-[var(--store-soft)]"
            >
              <span className="flex items-center gap-3">
                <ClipboardList size={17} aria-hidden="true" /> My orders
              </span>
              {orderCount ? (
                <span className="rounded-full bg-[#b7472a] px-2 py-0.5 text-[10px] font-bold text-white">
                  {orderCount}
                </span>
              ) : null}
            </Link>
            <a
              href="#customer-details"
              className="mt-1 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-[var(--store-ink)] transition-colors hover:bg-[var(--store-soft)]"
            >
              <UserRound size={17} aria-hidden="true" /> Personal details
            </a>
            <div className="my-2 border-t border-[var(--store-line)]" />
            <form action={signOut}>
              <button className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-[#9d4029] transition-colors hover:bg-[#fff1eb]">
                <LogOut size={17} aria-hidden="true" /> Sign out
              </button>
            </form>
          </nav>

          <section className="rounded-3xl bg-[#eaf2f3] p-5 text-[#1f2924]">
            <PackageCheck size={19} className="text-[#2f654f]" aria-hidden="true" />
            <h2 className="mt-3 text-sm font-semibold">Ready when you are</h2>
            <p className="mt-1 text-xs leading-5 text-[#5e6b64]">
              Choose store pickup or delivery when you check out.
            </p>
          </section>
        </aside>

        <div className="min-w-0">
          <section className="mt-0 overflow-hidden rounded-3xl border border-[var(--store-line)] bg-white px-6 py-7 sm:px-9 sm:py-8">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="max-w-2xl">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2f654f]">
                  YOUR GRAND PA’S ACCOUNT
                </p>
                <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                  Good to see you, {firstName}.
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--store-muted)] sm:text-base">
                  Your latest orders, pickup plans, and delivery progress are all in one
                  place.
                </p>
              </div>
              <Link href="/shop" className="store-button-primary min-h-12 px-5">
                Shop frozen favourites <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </section>

          <section className="mt-5 grid gap-3 sm:grid-cols-3" aria-label="Order overview">
            <article className="rounded-2xl border border-[var(--store-line)] bg-[var(--store-surface)] p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-[var(--store-muted)]">
                  All orders
                </p>
                <ShoppingBag size={18} className="text-[#2f654f]" aria-hidden="true" />
              </div>
              <p className="mt-3 text-3xl font-semibold tabular-nums">{orderCount}</p>
              <p className="mt-1 text-xs text-[var(--store-muted)]">
                Orders placed with us
              </p>
            </article>
            <article className="rounded-2xl border border-[var(--store-line)] bg-[var(--store-surface)] p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-[var(--store-muted)]">
                  In progress
                </p>
                <Clock3 size={18} className="text-[#2f654f]" aria-hidden="true" />
              </div>
              <p className="mt-3 text-3xl font-semibold tabular-nums">{activeCount}</p>
              <p className="mt-1 text-xs text-[var(--store-muted)]">
                Active reservations and orders
              </p>
            </article>
            <article className="rounded-2xl border border-[var(--store-line)] bg-[var(--store-surface)] p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-[var(--store-muted)]">
                  Deliveries
                </p>
                <Truck size={18} className="text-[#2f654f]" aria-hidden="true" />
              </div>
              <p className="mt-3 text-3xl font-semibold tabular-nums">
                {activeDeliveryCount}
              </p>
              <p className="mt-1 text-xs text-[var(--store-muted)]">
                Delivery orders being handled
              </p>
            </article>
          </section>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
            <section className="rounded-3xl border border-[var(--store-line)] bg-[var(--store-surface)] p-5 sm:p-7">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--store-line)] pb-4">
                <div>
                  <p className="store-eyebrow">ORDER ACTIVITY</p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">
                    Your recent orders
                  </h2>
                </div>
                <Link
                  href="/account/orders"
                  className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[#153c33] hover:underline"
                >
                  Order history <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </div>

              {ordersResult.error ? (
                <p
                  role="alert"
                  className="mt-5 rounded-xl bg-[#fff0eb] p-4 text-sm text-[#87351f]"
                >
                  We couldn’t load your recent orders. Please try again in a moment.
                </p>
              ) : recentOrders.length ? (
                <ul className="divide-y divide-[var(--store-line)]">
                  {recentOrders.map((order) => {
                    const label =
                      order.fulfillment_method === "delivery"
                        ? (deliveryStatusLabels[order.delivery_stage] ??
                          order.delivery_stage)
                        : (orderStatusLabels[order.status] ?? order.status);
                    const paymentLabel =
                      order.payment_status === "paid"
                        ? order.payment_method === "paystack"
                          ? "Paid online"
                          : "Cash received"
                        : order.payment_status === "pending"
                          ? "Payment pending"
                          : order.fulfillment_method === "delivery"
                            ? "Cash due on delivery"
                            : "Cash due at pickup";

                    return (
                      <li key={order.id}>
                        <Link
                          href={
                            order.fulfillment_method === "delivery"
                              ? `/account/orders/${order.id}`
                              : "/account/orders"
                          }
                          className="group flex flex-wrap items-center justify-between gap-4 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f654f]"
                        >
                          <span className="flex min-w-0 items-start gap-3">
                            <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--store-soft)] text-[#153c33]">
                              {order.fulfillment_method === "delivery" ? (
                                <Truck size={18} aria-hidden="true" />
                              ) : (
                                <PackageCheck size={18} aria-hidden="true" />
                              )}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold">
                                {order.order_number}
                              </span>
                              <span className="mt-1 block text-xs text-[var(--store-muted)]">
                                {formatAccraDateTime(order.placed_at)} · {paymentLabel}
                              </span>
                            </span>
                          </span>
                          <span className="ml-12 flex items-center gap-3 sm:ml-0">
                            <span className="rounded-full bg-[var(--store-soft)] px-3 py-1 text-xs font-semibold text-[#153c33]">
                              {label}
                            </span>
                            <strong className="text-sm tabular-nums">
                              {formatGhs(order.total)}
                            </strong>
                            <ArrowRight
                              size={15}
                              className="text-[var(--store-muted)] transition-transform group-hover:translate-x-0.5"
                              aria-hidden="true"
                            />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="py-10 text-center">
                  <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[var(--store-soft)] text-[#153c33]">
                    <ShoppingBag size={20} aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 font-semibold">Your first order starts here</h3>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--store-muted)]">
                    Browse the cold-store selection and reserve what you need for pickup
                    or delivery.
                  </p>
                  <Link href="/shop" className="store-button-primary mt-5">
                    Browse products <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                </div>
              )}
            </section>

            <aside className="space-y-5">
              <CustomerDetailsCard
                fullName={customer.fullName}
                email={profileResult.data?.email ?? null}
                phone={profileResult.data?.phone ?? null}
                unavailable={Boolean(profileResult.error)}
                localEmailPreviewUrl={
                  /^http:\/\/(127\.0\.0\.1|localhost):57321\/?$/u.test(
                    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
                  )
                    ? "http://127.0.0.1:57324"
                    : null
                }
              />

              <section className="rounded-3xl bg-[#eaf2f3] p-5 text-[#1f2924]">
                <CheckCircle2 size={20} className="text-[#2f654f]" aria-hidden="true" />
                <h2 className="mt-3 font-semibold">Order tracking, made simple</h2>
                <p className="mt-2 text-sm leading-6 text-[#5e6b64]">
                  Our team updates delivery progress as your order is prepared and
                  dispatched.
                </p>
                <Link
                  href="/account/orders"
                  className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#153c33] hover:underline"
                >
                  See all order updates <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </section>
            </aside>
          </div>

          {recommendedProducts.length ? (
            <section className="mt-8" aria-labelledby="store-picks-heading">
              <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="store-eyebrow">FROM THE COLD STORE</p>
                  <h2
                    id="store-picks-heading"
                    className="mt-1 text-xl font-semibold tracking-tight"
                  >
                    Picked for your table
                  </h2>
                  <p className="mt-1 text-sm text-[var(--store-muted)]">
                    A few favourites from today’s catalogue.
                  </p>
                </div>
                <Link href="/shop" className="store-footer-link text-sm">
                  Browse all products <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </header>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {recommendedProducts.map((product) => (
                  <StoreProductCard key={product.product_id} product={product} />
                ))}
              </div>
            </section>
          ) : null}

          <footer className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--store-line)] pt-5 text-xs text-[var(--store-muted)]">
            <p>Fresh stock, picked and prepared by Grand Pa’s Cold Store.</p>
            <Link href="/shop" className="font-semibold text-[#153c33] hover:underline">
              Return to shop
            </Link>
          </footer>
        </div>
      </div>
    </main>
  );
}
