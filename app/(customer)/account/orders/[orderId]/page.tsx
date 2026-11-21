import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, MapPin, PackageCheck, Truck } from "lucide-react";
import { OrderTrackingRefresh } from "@/components/storefront/order-tracking-refresh";
import { requireCustomerContext } from "@/lib/auth/authorization";
import { formatAccraDateTime, formatGhs } from "@/lib/inventory/format";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type DeliveryStage = Database["public"]["Enums"]["delivery_stage"];

const deliverySteps: { stage: DeliveryStage; label: string; detail: string }[] = [
  {
    stage: "confirmed",
    label: "Confirmed",
    detail: "The flat delivery rate is locked and your order is confirmed.",
  },
  {
    stage: "preparing",
    label: "Preparing",
    detail: "The store is preparing your items.",
  },
  {
    stage: "packed",
    label: "Packed",
    detail: "Your order is packed and ready to leave the store.",
  },
  {
    stage: "out_for_delivery",
    label: "Out for delivery",
    detail: "Your order is on its way to you.",
  },
  { stage: "delivered", label: "Delivered", detail: "Your order has been handed over." },
];

const legacyStageLabels: Partial<Record<DeliveryStage, string>> = {
  awaiting_fee: "Older order · contact the store",
  fee_quoted: "Older fee quote · contact the store",
};

export default async function CustomerDeliveryPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const customer = await requireCustomerContext();
  const { orderId } = await params;
  const client = await createClient();
  await client.rpc("expire_customer_order_reservations");
  const { data: order, error } = await client
    .from("orders")
    .select(
      "id, order_number, status, fulfillment_method, subtotal, total, placed_at, reservation_expires_at, delivery_address, delivery_area, delivery_instructions, delivery_fee, delivery_fee_accepted_at, delivery_stage, delivery_tracking_reference, delivery_estimated_at, delivery_updated_at, payment_method, payment_status",
    )
    .eq("id", orderId)
    .eq("customer_id", customer.customerId)
    .maybeSingle();

  if (error || !order) notFound();
  if (order.fulfillment_method !== "delivery") notFound();

  const [{ data: items, error: itemsError }, { data: events, error: eventsError }] =
    await Promise.all([
      client
        .from("order_items")
        .select("id, product_name_snapshot, quantity, line_total")
        .eq("order_id", order.id)
        .order("created_at"),
      client
        .from("order_delivery_events")
        .select("id, stage, message, created_at")
        .eq("order_id", order.id)
        .order("created_at", { ascending: false }),
    ]);

  const currentStep = deliverySteps.findIndex(
    (step) => step.stage === order.delivery_stage,
  );
  const isCancelled =
    order.delivery_stage === "cancelled" || order.status === "cancelled";
  const isExpired = order.status === "expired";

  return (
    <main className="storefront min-h-svh px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/account/orders"
            className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-[#2f654f]"
          >
            <ArrowLeft size={15} aria-hidden="true" /> All orders
          </Link>
          <OrderTrackingRefresh />
        </div>

        <header className="mt-7 rounded-2xl border border-[var(--store-line)] bg-[var(--store-surface)] p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="store-eyebrow">DELIVERY TRACKING</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                Order {order.order_number}
              </h1>
              <p className="store-muted mt-2 text-sm">
                Placed {formatAccraDateTime(order.placed_at)} ·{" "}
                {order.payment_status === "paid"
                  ? order.payment_method === "paystack"
                    ? "Paystack payment verified"
                    : "Cash received on delivery"
                  : order.payment_status === "pending"
                    ? "Paystack payment pending"
                    : order.payment_status === "failed"
                      ? "Paystack payment needs retry"
                      : "Cash on delivery"}
              </p>
            </div>
            <span className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[#eaf2f3] px-3 text-sm font-semibold text-[#153c33]">
              {order.delivery_stage === "delivered" ? (
                <CheckCircle2 size={16} aria-hidden="true" />
              ) : (
                <Truck size={16} aria-hidden="true" />
              )}
              {isExpired
                ? "Reservation expired"
                : (deliverySteps.find((step) => step.stage === order.delivery_stage)
                    ?.label ??
                  legacyStageLabels[order.delivery_stage] ??
                  (isCancelled ? "Cancelled" : "Order update"))}
            </span>
          </div>
          {itemsError || eventsError ? (
            <p
              role="alert"
              className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-950"
            >
              Some order details are temporarily unavailable. Refresh this page in a
              moment.
            </p>
          ) : null}
        </header>

        {isExpired ? (
          <div
            role="status"
            className="mt-5 rounded-2xl border border-[#e6d0c9] bg-[#fff8f5] p-5 text-sm text-[#6f392e]"
          >
            {order.payment_status === "paid"
              ? "Payment was received, but this reservation has expired. Contact the store for help completing or refunding your order."
              : "This reservation expired before the delivery was completed. No payment is due. You can start a new order from the shop."}{" "}
            <Link
              href="/shop"
              className="ml-1 font-semibold underline underline-offset-2"
            >
              Browse products
            </Link>
          </div>
        ) : isCancelled ? (
          <div
            role="status"
            className="mt-5 rounded-2xl border border-[#e6d0c9] bg-[#fff8f5] p-5 text-sm text-[#6f392e]"
          >
            This delivery order was cancelled. No delivery payment is due.
          </div>
        ) : (
          <section className="mt-5 rounded-2xl border border-[var(--store-line)] bg-[var(--store-surface)] p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="store-eyebrow">LIVE ORDER PROGRESS</p>
                <h2 className="mt-2 text-xl font-semibold">
                  Follow each delivery update
                </h2>
              </div>
              <p className="store-muted text-xs">
                Refreshes automatically every 30 seconds
              </p>
            </div>
            <ol className="mt-6 grid gap-0 sm:grid-cols-7">
              {deliverySteps.map((step, index) => {
                const complete = currentStep >= 0 && index < currentStep;
                const active = index === currentStep;
                return (
                  <li
                    key={step.stage}
                    className="relative flex gap-3 pb-5 sm:block sm:pb-0"
                  >
                    {index < deliverySteps.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className={`absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px sm:left-7 sm:top-[13px] sm:h-px sm:w-[calc(100%-1.25rem)] ${complete ? "bg-[#789273]" : "bg-[var(--store-line)]"}`}
                      />
                    ) : null}
                    <span
                      className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-bold ${complete ? "border-[#2f654f] bg-[#2f654f] text-white" : active ? "border-[#2f654f] bg-[#eaf2f3] text-[#153c33] ring-4 ring-[#eaf2f3]" : "border-[var(--store-line)] bg-[var(--store-bg)] text-[var(--store-muted)]"}`}
                    >
                      {complete ? (
                        <CheckCircle2 size={15} aria-hidden="true" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span className="sm:mt-3 sm:block sm:pr-2">
                      <span
                        className={`block text-sm font-semibold ${active ? "text-[#153c33]" : "text-[var(--store-ink)]"}`}
                      >
                        {step.label}
                      </span>
                      <span className="store-muted mt-1 block text-xs leading-5 sm:hidden">
                        {active ? step.detail : complete ? "Completed" : "Waiting"}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
            {legacyStageLabels[order.delivery_stage] ? (
              <p className="mt-4 rounded-xl bg-[#f7f4ec] p-4 text-sm leading-6 text-[#546357]">
                This delivery order uses an older fee workflow. Please contact the store
                before arranging delivery.
              </p>
            ) : null}
          </section>
        )}

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_0.9fr]">
          <section className="rounded-2xl border border-[var(--store-line)] bg-[var(--store-surface)] p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <MapPin size={18} className="text-[#2f654f]" aria-hidden="true" />
              <h2 className="font-semibold">Delivering to</h2>
            </div>
            <p className="mt-3 font-medium">{order.delivery_address}</p>
            <p className="mt-1 text-sm text-[#5e6b64]">
              {order.delivery_area}, Accra, Ghana
            </p>
            {order.delivery_instructions ? (
              <p className="mt-3 rounded-lg bg-[var(--store-bg)] p-3 text-sm leading-5 text-[#5e6b64]">
                {order.delivery_instructions}
              </p>
            ) : null}
            {order.delivery_tracking_reference || order.delivery_estimated_at ? (
              <dl className="mt-4 space-y-2 border-t border-[var(--store-line)] pt-4 text-sm">
                {order.delivery_tracking_reference ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#5e6b64]">Tracking reference</dt>
                    <dd className="font-semibold">{order.delivery_tracking_reference}</dd>
                  </div>
                ) : null}
                {order.delivery_estimated_at ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#5e6b64]">Estimated arrival</dt>
                    <dd className="font-semibold">
                      {formatAccraDateTime(order.delivery_estimated_at)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </section>

          <section className="rounded-2xl border border-[var(--store-line)] bg-[var(--store-surface)] p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <PackageCheck size={18} className="text-[#2f654f]" aria-hidden="true" />
              <h2 className="font-semibold">Items and order total</h2>
            </div>
            <ul className="mt-4 space-y-3">
              {(items ?? []).map((item) => (
                <li key={item.id} className="flex justify-between gap-3 text-sm">
                  <span className="text-[#5e6b64]">
                    {item.quantity} × {item.product_name_snapshot}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {formatGhs(item.line_total)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 space-y-2 border-t border-[var(--store-line)] pt-4 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-[#5e6b64]">Items</span>
                <span className="font-medium tabular-nums">
                  {formatGhs(order.subtotal)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-[#5e6b64]">Flat delivery rate</span>
                <span className="font-medium tabular-nums">
                  {order.delivery_fee === null
                    ? "Contact the store"
                    : formatGhs(order.delivery_fee)}
                </span>
              </div>
              <div className="flex justify-between gap-3 border-t border-[var(--store-line)] pt-3">
                <strong>
                  {order.delivery_fee_accepted_at
                    ? "Cash due on delivery"
                    : "Order total"}
                </strong>
                <strong className="tabular-nums">{formatGhs(order.total)}</strong>
              </div>
            </div>
          </section>
        </div>

        <section className="mt-5 rounded-2xl border border-[var(--store-line)] bg-[var(--store-surface)] p-5 sm:p-6">
          <h2 className="font-semibold">Update history</h2>
          <ol className="mt-4 space-y-4">
            {(events ?? []).map((event) => (
              <li key={event.id} className="flex gap-3">
                <span
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#789273]"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="text-sm leading-6">{event.message}</p>
                  <time className="store-muted text-xs" dateTime={event.created_at}>
                    {formatAccraDateTime(event.created_at)} (Accra time)
                  </time>
                </div>
              </li>
            ))}
            {!events?.length ? (
              <li className="text-sm text-[#5e6b64]">
                Your first update will appear here.
              </li>
            ) : null}
          </ol>
        </section>
      </div>
    </main>
  );
}
