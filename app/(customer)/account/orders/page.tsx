import Link from "next/link";
import { ArrowLeft, CreditCard, PackageCheck } from "lucide-react";
import { continuePaystackOrderPayment } from "@/app/(customer)/checkout/actions";
import { requireCustomerContext } from "@/lib/auth/authorization";
import { getServerEnvironment } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { formatAccraDateTime, formatGhs } from "@/lib/inventory/format";

const statusLabels: Record<string, string> = {
  pending: "Reserved",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready for pickup",
  completed: "Collected",
  cancelled: "Cancelled",
  expired: "Reservation expired",
};

const deliveryStageLabels: Record<string, string> = {
  awaiting_fee: "Older delivery · contact the store",
  fee_quoted: "Older fee quote · contact the store",
  confirmed: "Delivery confirmed",
  preparing: "Being prepared",
  packed: "Packed",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  not_applicable: "Store pickup",
};

const paymentNotices: Record<string, { tone: string; text: string }> = {
  success: {
    tone: "border-[#b9d5c8] bg-[#eaf2f3] text-[#153c33]",
    text: "Paystack verified your payment. Your order is reserved and ready for staff to prepare.",
  },
  failed: {
    tone: "border-[#f0c7b5] bg-[#fff0eb] text-[#87351f]",
    text: "The online payment did not complete. You can retry it below or choose another option in the shop.",
  },
  pending: {
    tone: "border-[#ead7a8] bg-[#fff8e8] text-[#604b1c]",
    text: "Your payment is still being confirmed. Refresh this page shortly; staff can prepare the order only after verification.",
  },
  review: {
    tone: "border-[#ead7a8] bg-[#fff8e8] text-[#604b1c]",
    text: "We could not confirm the payment just yet. Your order and payment reference are safe while verification retries.",
  },
  unavailable: {
    tone: "border-[var(--store-line)] bg-[var(--store-soft)] text-[var(--store-ink)]",
    text: "Online payment is temporarily unavailable. Please contact the store if you need help.",
  },
};

export default async function CustomerOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string; order?: string }>;
}) {
  const customer = await requireCustomerContext();
  const { payment, order: highlightedOrderId } = await searchParams;
  const client = await createClient();
  await client.rpc("expire_customer_order_reservations");
  const { data: orders, error } = await client
    .from("orders")
    .select(
      "id, order_number, status, fulfillment_method, total, subtotal, delivery_fee, delivery_fee_accepted_at, delivery_stage, placed_at, reservation_expires_at, payment_method, payment_status",
    )
    .eq("customer_id", customer.customerId)
    .order("placed_at", { ascending: false })
    .limit(50);

  const serverEnvironment = getServerEnvironment();
  const canRetryPaystack = Boolean(
    serverEnvironment.PAYSTACK_SECRET_KEY &&
    serverEnvironment.SUPABASE_SECRET_KEY &&
    serverEnvironment.NEXT_PUBLIC_SITE_URL,
  );
  const paymentNotice = payment ? paymentNotices[payment] : undefined;

  const orderRows = orders ?? [];
  const { data: orderItems } = orderRows.length
    ? await client
        .from("order_items")
        .select("order_id, product_name_snapshot, quantity, line_total")
        .in(
          "order_id",
          orderRows.map((order) => order.id),
        )
    : { data: [] };

  return (
    <main className="storefront min-h-svh px-4 py-7 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/account"
          className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-[#153c33]"
        >
          <ArrowLeft size={15} /> Account
        </Link>
        <p className="store-eyebrow mt-7">CUSTOMER ACCOUNT</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em]">Your orders</h1>

        {paymentNotice ? (
          <div
            role="status"
            className={`mt-5 rounded-2xl border p-4 text-sm leading-6 ${paymentNotice.tone}`}
          >
            {paymentNotice.text}
          </div>
        ) : null}

        {error ? (
          <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
            We couldn’t load your order history. Please refresh in a moment.
          </div>
        ) : orderRows.length ? (
          <div className="mt-8 space-y-4">
            {orderRows.map((order) => (
              <article
                key={order.id}
                className={`rounded-2xl border bg-[var(--store-surface)] p-5 sm:p-6 ${order.id === highlightedOrderId ? "border-[#2f654f] ring-2 ring-[#2f654f]/20" : "border-[var(--store-line)]"}`}
              >
                <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#d7e0d9] pb-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-[var(--store-muted)]">
                      {formatAccraDateTime(order.placed_at)}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold">{order.order_number}</h2>
                  </div>
                  <span className="rounded-full bg-[var(--store-soft)] px-3 py-1 text-xs font-semibold text-[#153c33]">
                    {order.status === "expired"
                      ? "Reservation expired"
                      : order.fulfillment_method === "delivery"
                        ? (deliveryStageLabels[order.delivery_stage] ??
                          order.delivery_stage)
                        : (statusLabels[order.status] ?? order.status)}
                  </span>
                </header>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--store-muted)]">
                  {order.fulfillment_method === "delivery"
                    ? "Home delivery"
                    : "Store pickup"}
                </p>
                <ul className="mt-4 space-y-2">
                  {(orderItems ?? [])
                    .filter((item) => item.order_id === order.id)
                    .map((item) => (
                      <li
                        key={`${order.id}-${item.product_name_snapshot}`}
                        className="flex justify-between gap-3 text-sm"
                      >
                        <span className="text-[var(--store-muted)]">
                          {item.quantity} × {item.product_name_snapshot}
                        </span>
                        <span className="tabular-nums">{formatGhs(item.line_total)}</span>
                      </li>
                    ))}
                </ul>
                <div className="mt-4 flex flex-wrap justify-between gap-3 border-t border-[var(--store-line)] pt-4 text-sm">
                  <span className="text-[var(--store-muted)]">
                    {order.payment_status === "paid"
                      ? order.payment_method === "paystack"
                        ? "Paystack payment verified"
                        : "Cash payment recorded"
                      : order.payment_status === "pending"
                        ? "Paystack payment pending"
                        : order.payment_status === "failed"
                          ? "Paystack payment needs retry"
                          : order.fulfillment_method === "delivery"
                            ? order.delivery_fee_accepted_at
                              ? "Cash due on delivery"
                              : "Contact the store about this delivery"
                            : "Cash due at pickup"}
                    {(order.status === "pending" || order.status === "confirmed") &&
                    order.fulfillment_method === "pickup" &&
                    order.payment_status !== "paid" ? (
                      <span className="mt-1 block text-xs">
                        Reserved until {formatAccraDateTime(order.reservation_expires_at)}
                      </span>
                    ) : null}
                  </span>
                  <strong className="tabular-nums">{formatGhs(order.total)}</strong>
                </div>
                {order.fulfillment_method === "delivery" ? (
                  <Link
                    href={`/account/orders/${order.id}`}
                    className="store-button-quiet mt-5"
                  >
                    Track delivery
                  </Link>
                ) : null}
                {order.payment_method === "paystack" &&
                ["pending", "failed"].includes(order.payment_status) &&
                order.status !== "expired" ? (
                  canRetryPaystack ? (
                    <form action={continuePaystackOrderPayment} className="mt-4">
                      <input type="hidden" name="orderId" value={order.id} />
                      <button className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#b7472a] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#97391f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#153c33]">
                        <CreditCard size={16} aria-hidden="true" />
                        {order.payment_status === "failed"
                          ? "Retry online payment"
                          : "Continue online payment"}
                      </button>
                    </form>
                  ) : (
                    <p className="mt-4 rounded-xl bg-[var(--store-soft)] p-3 text-sm text-[var(--store-muted)]">
                      Paystack checkout is not configured right now. Contact the store if
                      you need help with this order.
                    </p>
                  )
                ) : order.payment_method === "paystack" &&
                  order.status === "expired" &&
                  order.payment_status !== "paid" ? (
                  <p className="mt-4 rounded-xl bg-[var(--store-soft)] p-3 text-sm text-[var(--store-muted)]">
                    This reservation expired before payment completed. Contact the store
                    before placing a new order.
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-[var(--store-line)] bg-[var(--store-surface)] p-10 text-center">
            <PackageCheck size={30} className="mx-auto text-[#2f654f]" />
            <h2 className="mt-4 text-xl font-semibold">No orders yet</h2>
            <p className="mt-2 text-sm text-[var(--store-muted)]">
              Your pickup and delivery orders will appear here after checkout.
            </p>
            <Link href="/shop" className="store-button-primary mt-5">
              Browse products
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
