import Link from "next/link";
import { redirect } from "next/navigation";
import {
  advanceDeliveryOrder,
  completeDeliveryOrder,
  markPickupOrderReady,
  recordPickupCash,
} from "@/app/(staff)/orders/actions";
import { StaffWorkspaceNav } from "@/components/staff/staff-workspace-nav";
import { requireStaffContext, userHasPermission } from "@/lib/auth/authorization";
import { formatAccraDateTime, formatGhs } from "@/lib/inventory/format";
import { createClient } from "@/lib/supabase/server";

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
  awaiting_fee: "Older delivery · needs review",
  fee_quoted: "Older fee quote · needs review",
  confirmed: "Confirmed · ready to prepare",
  preparing: "Being prepared",
  packed: "Packed · ready to dispatch",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const notices: Record<string, string> = {
  ready: "Order marked ready for pickup.",
  collected: "Cash collection recorded and order completed.",
  delivery_updated: "Delivery progress updated.",
  delivery_error: "We couldn’t update delivery progress. Check the order status.",
  delivery_invalid: "Check the tracking reference and estimated time, then try again.",
  delivery_completed: "Delivery marked complete and cash received.",
  delivery_complete_error:
    "We couldn’t complete delivery. Check its status and payment record.",
  ready_error: "We couldn’t mark that order ready. It may have expired or been updated.",
  collect_error:
    "We couldn’t complete the cash collection. Check order status and stock.",
  invalid: "That order link is invalid. Refresh the page and try again.",
};

export default async function StaffOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const staff = await requireStaffContext();
  if (!(await userHasPermission("manage_orders"))) redirect("/staff");
  const { notice } = await searchParams;
  const client = await createClient();
  await client.rpc("expire_customer_order_reservations");
  const { data: orders, error } = await client
    .from("orders")
    .select(
      "id, order_number, customer_id, status, fulfillment_method, subtotal, total, placed_at, reservation_expires_at, delivery_address, delivery_area, delivery_instructions, delivery_fee, delivery_fee_accepted_at, delivery_stage, delivery_tracking_reference, delivery_estimated_at, payment_method, payment_status",
    )
    .order("placed_at", { ascending: false })
    .limit(100);
  const rows = orders ?? [];
  const orderIds = rows.map((order) => order.id);
  const [{ data: items }, { data: customers }, { data: payments }] = orderIds.length
    ? await Promise.all([
        client
          .from("order_items")
          .select("order_id, product_name_snapshot, quantity, line_total")
          .in("order_id", orderIds),
        client
          .from("customers")
          .select("id, full_name, phone")
          .in("id", [...new Set(rows.map((order) => order.customer_id))]),
        client
          .from("payments")
          .select("order_id, method, amount, provider_reference, occurred_at")
          .in("order_id", orderIds)
          .eq("method", "paystack"),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  return (
    <main className="min-h-svh bg-[#f7f4ec] px-5 py-8 text-[#1f2924] sm:px-8">
      <div className="mx-auto max-w-6xl">
        <StaffWorkspaceNav active="/orders" />
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5e6b64]">
          CUSTOMER FULFILLMENT
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Online orders</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5e6b64]">
          Update delivery progress and complete pickup or delivery orders. Set the store’s
          flat delivery rate in Delivery rate settings.
        </p>
        {notice && notices[notice] ? (
          <p
            role="status"
            className={`mt-5 rounded-lg p-3 text-sm ${notice.endsWith("_error") || notice.endsWith("_invalid") || notice === "invalid" ? "bg-amber-50 text-amber-950" : "bg-[#eaf2f3] text-[#153c33]"}`}
          >
            {notices[notice]}
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-950"
          >
            The order list is unavailable right now. Please refresh in a moment.
          </p>
        ) : rows.length ? (
          <div className="mt-7 space-y-4">
            {rows.map((order) => {
              const reservationExpired = order.status === "expired";
              const awaitingOnlinePayment =
                order.payment_method === "paystack" && order.payment_status !== "paid";
              const verifiedPayment = payments?.find(
                (payment) => payment.order_id === order.id,
              );

              return (
                <article
                  key={order.id}
                  className="rounded-2xl border border-[#d7e0d9] bg-white p-5 sm:p-6"
                >
                  <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#d7e0d9] pb-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.12em] text-[#5e6b64]">
                        {formatAccraDateTime(order.placed_at)} ·{" "}
                        {customers?.find((customer) => customer.id === order.customer_id)
                          ?.full_name ?? "Customer"}
                      </p>
                      <h2 className="mt-1 text-lg font-semibold">{order.order_number}</h2>
                      <p className="mt-1 text-sm text-[#5e6b64]">
                        {order.fulfillment_method === "delivery"
                          ? "Home delivery"
                          : "Store pickup"}
                        {!reservationExpired &&
                        (order.status === "pending" || order.status === "confirmed")
                          ? ` · Reservation expires ${formatAccraDateTime(order.reservation_expires_at)}`
                          : ""}
                      </p>
                    </div>
                    <span className="rounded-full bg-[#eaf2f3] px-3 py-1 text-xs font-semibold text-[#153c33]">
                      {reservationExpired
                        ? "Reservation expired"
                        : order.fulfillment_method === "delivery"
                          ? (deliveryStageLabels[order.delivery_stage] ??
                            order.delivery_stage)
                          : (statusLabels[order.status] ?? order.status)}
                    </span>
                  </header>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#eaf2f3] px-3 py-1 text-xs font-semibold text-[#153c33]">
                      {order.payment_method === "paystack"
                        ? order.payment_status === "paid"
                          ? "Paystack · verified"
                          : `Paystack · ${order.payment_status}`
                        : order.payment_status === "paid"
                          ? "Cash · received"
                          : "Cash · due at handover"}
                    </span>
                    {order.payment_method === "paystack" &&
                    order.payment_status === "paid" ? (
                      <span className="text-xs text-[#5e6b64]">
                        Verified payment · {formatGhs(order.total)}
                        {verifiedPayment?.provider_reference
                          ? ` · Ref ${verifiedPayment.provider_reference}`
                          : ""}
                      </span>
                    ) : null}
                  </div>
                  {order.fulfillment_method === "delivery" ? (
                    <section className="mt-4 grid gap-4 rounded-xl bg-[#f7f8f4] p-4 sm:grid-cols-[1fr_auto]">
                      <div>
                        <p className="text-sm font-semibold">Delivery details</p>
                        <p className="mt-1 text-sm">{order.delivery_address}</p>
                        <p className="text-sm text-[#5e6b64]">
                          {order.delivery_area}, Accra
                        </p>
                        <p className="mt-2 text-xs text-[#5e6b64]">
                          Contact:{" "}
                          {customers?.find(
                            (customer) => customer.id === order.customer_id,
                          )?.phone ?? "Not on file"}
                        </p>
                        {order.delivery_instructions ? (
                          <p className="mt-2 text-xs leading-5 text-[#5e6b64]">
                            Instructions: {order.delivery_instructions}
                          </p>
                        ) : null}
                        {order.delivery_tracking_reference ? (
                          <p className="mt-2 text-xs text-[#5e6b64]">
                            Tracking ref:{" "}
                            <strong>{order.delivery_tracking_reference}</strong>
                          </p>
                        ) : null}
                        {order.delivery_estimated_at ? (
                          <p className="mt-1 text-xs text-[#5e6b64]">
                            ETA: {formatAccraDateTime(order.delivery_estimated_at)} (Accra
                            time)
                          </p>
                        ) : null}
                      </div>
                      <div className="min-w-56">
                        <p className="text-sm font-semibold">Delivery fee</p>
                        <p className="mt-1 text-sm">
                          {order.delivery_fee === null
                            ? "Rate not set"
                            : formatGhs(order.delivery_fee)}
                          {order.delivery_fee_accepted_at ? " · locked at checkout" : ""}
                        </p>
                        <p className="mt-1 text-xs text-[#5e6b64]">
                          Current total: {formatGhs(order.total)}
                        </p>
                      </div>
                    </section>
                  ) : null}
                  <ul className="mt-4 space-y-2">
                    {(items ?? [])
                      .filter((item) => item.order_id === order.id)
                      .map((item) => (
                        <li
                          key={`${order.id}-${item.product_name_snapshot}`}
                          className="flex justify-between gap-3 text-sm"
                        >
                          <span className="text-[#5e6b64]">
                            {item.quantity} × {item.product_name_snapshot}
                          </span>
                          <span className="tabular-nums">
                            {formatGhs(item.line_total)}
                          </span>
                        </li>
                      ))}
                  </ul>
                  <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#d7e0d9] pt-4">
                    <strong className="tabular-nums">
                      {reservationExpired
                        ? order.payment_status === "paid"
                          ? `Paid online · reservation expired: ${formatGhs(order.total)}`
                          : "No payment due · reservation expired"
                        : order.payment_method === "paystack" &&
                            order.payment_status === "paid"
                          ? `Paid online: ${formatGhs(order.total)}`
                          : order.fulfillment_method === "delivery"
                            ? order.delivery_stage === "delivered"
                              ? `Cash received: ${formatGhs(order.total)}`
                              : order.delivery_fee_accepted_at
                                ? `Cash due on delivery: ${formatGhs(order.total)}`
                                : `Items subtotal: ${formatGhs(order.subtotal)}`
                            : `Cash due at pickup: ${formatGhs(order.total)}`}
                    </strong>
                    {reservationExpired ? (
                      <span className="text-sm font-medium text-[#8a3c30]">
                        {order.payment_status === "paid"
                          ? "Reservation expired · store action required"
                          : "Reservation expired · no payment due"}
                      </span>
                    ) : order.fulfillment_method === "delivery" ? (
                      awaitingOnlinePayment ? (
                        <span className="text-sm font-medium text-[#5e6b64]">
                          Waiting for verified payment before preparation
                        </span>
                      ) : order.delivery_stage === "confirmed" ? (
                        <form action={advanceDeliveryOrder}>
                          <input type="hidden" name="orderId" value={order.id} />
                          <input type="hidden" name="nextStage" value="preparing" />
                          <button className="min-h-10 rounded-lg bg-[#153c33] px-4 text-sm font-semibold text-white hover:bg-[#2f654f]">
                            Start preparing
                          </button>
                        </form>
                      ) : order.delivery_stage === "preparing" ? (
                        <form action={advanceDeliveryOrder}>
                          <input type="hidden" name="orderId" value={order.id} />
                          <input type="hidden" name="nextStage" value="packed" />
                          <button className="min-h-10 rounded-lg bg-[#153c33] px-4 text-sm font-semibold text-white hover:bg-[#2f654f]">
                            Mark packed
                          </button>
                        </form>
                      ) : order.delivery_stage === "packed" ? (
                        <form
                          action={advanceDeliveryOrder}
                          className="grid gap-2 sm:grid-cols-2"
                        >
                          <input type="hidden" name="orderId" value={order.id} />
                          <input
                            type="hidden"
                            name="nextStage"
                            value="out_for_delivery"
                          />
                          <label className="grid gap-1 text-xs font-medium">
                            Tracking reference{" "}
                            <span className="font-normal text-[#5e6b64]">(optional)</span>
                            <input
                              name="trackingReference"
                              maxLength={120}
                              className="min-h-10 rounded-lg border border-[#d7e0d9] bg-white px-3 text-sm"
                            />
                          </label>
                          <label className="grid gap-1 text-xs font-medium">
                            Estimated arrival · Accra time
                            <input
                              name="estimatedAt"
                              type="datetime-local"
                              className="min-h-10 rounded-lg border border-[#d7e0d9] bg-white px-3 text-sm"
                            />
                          </label>
                          <button className="min-h-10 rounded-lg bg-[#153c33] px-4 text-sm font-semibold text-white hover:bg-[#2f654f] sm:col-span-2">
                            Dispatch order
                          </button>
                        </form>
                      ) : order.delivery_stage === "out_for_delivery" ? (
                        <form action={completeDeliveryOrder}>
                          <input type="hidden" name="orderId" value={order.id} />
                          <button className="min-h-10 rounded-lg bg-[#153c33] px-4 text-sm font-semibold text-white hover:bg-[#2f654f]">
                            {order.payment_method === "paystack"
                              ? "Confirm delivery complete"
                              : "Confirm delivered · cash received"}
                          </button>
                        </form>
                      ) : order.delivery_stage === "delivered" ? (
                        <span className="text-sm font-medium text-[#2f654f]">
                          {order.payment_method === "paystack"
                            ? "Delivered · Paystack payment verified"
                            : "Delivered · cash recorded"}
                        </span>
                      ) : null
                    ) : awaitingOnlinePayment ? (
                      <span className="text-sm font-medium text-[#5e6b64]">
                        Waiting for verified Paystack payment before preparation
                      </span>
                    ) : order.status === "pending" ||
                      order.status === "confirmed" ||
                      order.status === "preparing" ? (
                      <form action={markPickupOrderReady}>
                        <input type="hidden" name="orderId" value={order.id} />
                        <button className="min-h-10 rounded-lg border border-[#d7e0d9] px-4 text-sm font-semibold hover:bg-[#f7f4ec]">
                          Mark ready for pickup
                        </button>
                      </form>
                    ) : order.status === "ready" ? (
                      <form action={recordPickupCash}>
                        <input type="hidden" name="orderId" value={order.id} />
                        <button className="min-h-10 rounded-lg bg-[#153c33] px-4 text-sm font-semibold text-white hover:bg-[#2f654f]">
                          {order.payment_method === "paystack"
                            ? "Complete paid pickup"
                            : "Confirm cash received & complete"}
                        </button>
                      </form>
                    ) : order.status === "completed" ? (
                      <span className="text-sm font-medium text-[#2f654f]">
                        {order.payment_method === "paystack"
                          ? "Paystack payment verified · collected"
                          : "Cash recorded · collected"}
                      </span>
                    ) : null}
                  </footer>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-7 rounded-xl border border-dashed border-[#d7e0d9] bg-white p-10 text-center">
            <p className="font-semibold">No customer orders yet</p>
            <p className="mt-2 text-sm text-[#5e6b64]">
              Orders placed through the customer shop will appear here.
            </p>
          </div>
        )}
        <Link
          href="/staff"
          className="mt-6 inline-flex text-sm font-medium text-[#2f654f] underline"
        >
          Back to staff workspace · {staff.fullName}
        </Link>
      </div>
    </main>
  );
}
