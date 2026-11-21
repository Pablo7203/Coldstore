"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  MapPin,
  ShieldCheck,
  Store,
  Truck,
} from "lucide-react";
import {
  placeCustomerOrder,
  type CheckoutActionState,
} from "@/app/(customer)/checkout/actions";
import { formatAccraDateTime, formatGhs } from "@/lib/inventory/format";
import { useStoreCart } from "@/components/storefront/store-cart";

const initialState: CheckoutActionState = {};

type FulfillmentMethod = "pickup" | "delivery";
type PaymentMethod = "cash" | "paystack";

export function CheckoutForm({
  customerName,
  customerPhone,
  deliveryFee,
  customerEmail,
  paystackAvailable,
}: {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  deliveryFee: number | null;
  paystackAvailable: boolean;
}) {
  const { items, clearCart } = useStoreCart();
  const operationId = useRef<string | null>(null);
  const [fulfillmentMethod, setFulfillmentMethod] = useState<FulfillmentMethod>("pickup");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");

  const checkoutAction = async (
    previousState: CheckoutActionState,
    formData: FormData,
  ) => {
    if (!items.length) return { message: "Your cart is empty." };
    operationId.current ??= crypto.randomUUID();
    formData.set("operationId", operationId.current);
    formData.set(
      "items",
      JSON.stringify(
        items.map(({ id, quantity }) => ({
          product_id: id,
          quantity,
        })),
      ),
    );

    const result = await placeCustomerOrder(previousState, formData);
    if (result.redirectTo) {
      clearCart();
      window.location.assign(result.redirectTo);
      return {};
    }
    if (result.success) {
      clearCart();
      operationId.current = null;
    }
    return result;
  };

  const [state, formAction, pending] = useActionState(checkoutAction, initialState);
  const estimatedSubtotal = items.reduce(
    (total, item) => total + item.price * item.quantity,
    0,
  );
  const deliveryTotal = estimatedSubtotal + (deliveryFee ?? 0);

  if (state.success) {
    const isDelivery = state.fulfillmentMethod === "delivery";
    return (
      <section className="mt-8 max-w-2xl rounded-3xl border border-[var(--store-line)] bg-[var(--store-surface)] p-6 shadow-sm sm:p-8">
        <div className="grid size-14 place-items-center rounded-2xl bg-[#eaf2f3] text-[#153c33]">
          <CheckCircle2 size={28} aria-hidden="true" />
        </div>
        <p className="store-eyebrow mt-5">
          {isDelivery ? "DELIVERY ORDER" : "PICKUP ORDER"} · CONFIRMED
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
          Thanks, {customerName}.
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--store-muted)]">
          {state.message}
        </p>
        <dl className="mt-6 grid gap-4 rounded-2xl bg-[var(--store-soft)] p-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[var(--store-muted)]">Order number</dt>
            <dd className="mt-1 font-semibold">{state.orderNumber}</dd>
          </div>
          <div>
            <dt className="text-[var(--store-muted)]">
              {isDelivery ? "Items subtotal" : "Cash due at pickup"}
            </dt>
            <dd className="mt-1 font-semibold">
              {formatGhs(state.subtotal ?? state.total ?? 0)}
            </dd>
          </div>
          {isDelivery ? (
            <>
              <div>
                <dt className="text-[var(--store-muted)]">Flat delivery rate</dt>
                <dd className="mt-1 font-semibold">
                  {formatGhs(state.deliveryFee ?? deliveryFee ?? 0)}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--store-muted)]">Cash due on delivery</dt>
                <dd className="mt-1 font-semibold">{formatGhs(state.total ?? 0)}</dd>
              </div>
            </>
          ) : null}
          {state.expiresAt ? (
            <div className="sm:col-span-2">
              <dt className="text-[var(--store-muted)]">Reservation expires</dt>
              <dd className="mt-1 font-semibold">
                {formatAccraDateTime(state.expiresAt)} (Accra time)
              </dd>
            </div>
          ) : null}
        </dl>
        <div className="mt-6 flex flex-wrap gap-3">
          {isDelivery && state.orderId ? (
            <Link
              href={`/account/orders/${state.orderId}`}
              className="store-button-primary"
            >
              Track this delivery
            </Link>
          ) : (
            <Link href="/account/orders" className="store-button-primary">
              View my orders
            </Link>
          )}
          <Link href="/shop" className="store-button-quiet">
            Continue shopping
          </Link>
        </div>
      </section>
    );
  }

  return (
    <form
      action={formAction}
      className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start"
    >
      {fulfillmentMethod === "delivery" && deliveryFee !== null ? (
        <input type="hidden" name="expectedDeliveryRate" value={deliveryFee.toFixed(2)} />
      ) : null}

      <div className="space-y-5">
        <section className="rounded-3xl border border-[var(--store-line)] bg-[var(--store-surface)] p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="store-eyebrow">01 · FULFILLMENT</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">
                How should we get it to you?
              </h2>
            </div>
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--store-soft)] text-[#153c33]">
              <Truck size={20} aria-hidden="true" />
            </span>
          </div>

          <fieldset className="mt-5 grid gap-3 sm:grid-cols-2">
            <legend className="sr-only">Choose store pickup or delivery</legend>
            <label
              className={`flex min-h-28 gap-3 rounded-2xl border p-4 transition-colors ${
                fulfillmentMethod === "pickup"
                  ? "border-[#153c33] bg-[#eaf2f3] ring-1 ring-[#153c33]"
                  : "border-[var(--store-line)] hover:border-[#7c8980]"
              }`}
            >
              <input
                type="radio"
                name="fulfillmentMethod"
                value="pickup"
                checked={fulfillmentMethod === "pickup"}
                onChange={() => setFulfillmentMethod("pickup")}
                className="mt-1 size-4 accent-[#153c33]"
              />
              <Store
                size={20}
                className="mt-0.5 shrink-0 text-[#2f654f]"
                aria-hidden="true"
              />
              <span>
                <span className="block text-sm font-semibold">Store pickup</span>
                <span className="mt-1 block text-xs leading-5 text-[var(--store-muted)]">
                  Collect in Osu. No delivery fee.
                </span>
              </span>
            </label>
            <label
              className={`flex min-h-28 gap-3 rounded-2xl border p-4 transition-colors ${
                deliveryFee === null
                  ? "cursor-not-allowed border-[var(--store-line)] bg-[var(--store-bg)] opacity-75"
                  : fulfillmentMethod === "delivery"
                    ? "border-[#153c33] bg-[#eaf2f3] ring-1 ring-[#153c33]"
                    : "border-[var(--store-line)] hover:border-[#7c8980]"
              }`}
            >
              <input
                type="radio"
                name="fulfillmentMethod"
                value="delivery"
                checked={fulfillmentMethod === "delivery"}
                disabled={deliveryFee === null}
                onChange={() => setFulfillmentMethod("delivery")}
                className="mt-1 size-4 accent-[#153c33]"
              />
              <Truck
                size={20}
                className="mt-0.5 shrink-0 text-[#2f654f]"
                aria-hidden="true"
              />
              <span>
                <span className="block text-sm font-semibold">Deliver to my address</span>
                <span className="mt-1 block text-xs leading-5 text-[var(--store-muted)]">
                  {deliveryFee === null
                    ? "Delivery will be available when the store sets its flat rate."
                    : `One flat store rate: ${formatGhs(deliveryFee)}.`}
                </span>
              </span>
            </label>
          </fieldset>

          {fulfillmentMethod === "delivery" ? (
            <div className="mt-5 rounded-2xl border border-[var(--store-line)] bg-[var(--store-bg)] p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <MapPin
                  size={18}
                  className="mt-0.5 shrink-0 text-[#2f654f]"
                  aria-hidden="true"
                />
                <div>
                  <h3 className="font-semibold">Delivery address</h3>
                  <p className="mt-1 text-xs leading-5 text-[var(--store-muted)]">
                    We’ll use {customerPhone || "the phone number on your account"} if the
                    driver needs to reach you.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
                  House number and street
                  <input
                    name="deliveryAddress"
                    autoComplete="street-address"
                    required
                    maxLength={250}
                    placeholder="e.g. House 14, Oxford Street"
                    className="min-h-11 rounded-xl border border-[#7c8980] bg-[var(--store-surface)] px-3 text-sm font-normal outline-none focus:border-[#153c33] focus:ring-2 focus:ring-[#2f654f]/30"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Area or neighbourhood
                  <input
                    name="deliveryArea"
                    autoComplete="address-level2"
                    required
                    maxLength={120}
                    placeholder="e.g. Osu"
                    className="min-h-11 rounded-xl border border-[#7c8980] bg-[var(--store-surface)] px-3 text-sm font-normal outline-none focus:border-[#153c33] focus:ring-2 focus:ring-[#2f654f]/30"
                  />
                </label>
                <div className="grid gap-1.5 text-sm font-medium">
                  City
                  <div className="flex min-h-11 items-center rounded-xl border border-[var(--store-line)] bg-[var(--store-soft)] px-3 text-sm font-normal text-[var(--store-muted)]">
                    Accra, Ghana
                  </div>
                </div>
                <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
                  Landmark or delivery instructions{" "}
                  <span className="font-normal text-[var(--store-muted)]">
                    (optional)
                  </span>
                  <textarea
                    name="deliveryInstructions"
                    maxLength={500}
                    rows={3}
                    placeholder="Nearby landmark, gate instructions, or preferred delivery details"
                    className="resize-y rounded-xl border border-[#7c8980] bg-[var(--store-surface)] px-3 py-2 text-sm font-normal outline-none focus:border-[#153c33] focus:ring-2 focus:ring-[#2f654f]/30"
                  />
                </label>
              </div>
              <p className="mt-4 rounded-xl bg-[#eaf2f3] p-3 text-xs leading-5 text-[#1f2924]">
                The flat rate is locked to your order. Staff will prepare it and keep your
                delivery progress up to date.
              </p>
            </div>
          ) : (
            <div className="mt-5 flex items-center gap-3 rounded-2xl bg-[var(--store-bg)] p-4">
              <Store size={18} className="shrink-0 text-[#2f654f]" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">
                  Collect from Grand Pa’s Cold Store
                </p>
                <p className="mt-1 text-xs text-[var(--store-muted)]">
                  Osu, Accra · {customerName}
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-[var(--store-line)] bg-[var(--store-surface)] p-5 sm:p-7">
          <p className="store-eyebrow">02 · PAYMENT</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">Choose how to pay</h2>
          <p className="mt-1 text-sm text-[var(--store-muted)]">
            {customerEmail
              ? `Receipt and order updates go to ${customerEmail}.`
              : "Secure checkout for your order."}
          </p>
          <fieldset className="mt-5 grid gap-3 sm:grid-cols-2">
            <legend className="sr-only">Choose cash or Paystack online payment</legend>
            <label
              className={`flex min-h-28 gap-3 rounded-2xl border p-4 transition-colors ${
                paymentMethod === "cash"
                  ? "border-[#153c33] bg-[#eaf2f3] ring-1 ring-[#153c33]"
                  : "border-[var(--store-line)] hover:border-[#7c8980]"
              }`}
            >
              <input
                type="radio"
                name="paymentMethod"
                value="cash"
                checked={paymentMethod === "cash"}
                onChange={() => setPaymentMethod("cash")}
                className="mt-1 size-4 accent-[#153c33]"
              />
              <Store
                size={20}
                className="mt-0.5 shrink-0 text-[#2f654f]"
                aria-hidden="true"
              />
              <span>
                <span className="block text-sm font-semibold">
                  {fulfillmentMethod === "delivery"
                    ? "Cash on delivery"
                    : "Cash at pickup"}
                </span>
                <span className="mt-1 block text-xs leading-5 text-[var(--store-muted)]">
                  {fulfillmentMethod === "delivery"
                    ? "Pay the driver when your order arrives."
                    : "Pay the store team when you collect your order."}
                </span>
              </span>
            </label>
            <label
              className={`flex min-h-28 gap-3 rounded-2xl border p-4 transition-colors ${
                !paystackAvailable
                  ? "cursor-not-allowed border-[var(--store-line)] bg-[var(--store-bg)] opacity-75"
                  : paymentMethod === "paystack"
                    ? "border-[#153c33] bg-[#eaf2f3] ring-1 ring-[#153c33]"
                    : "border-[var(--store-line)] hover:border-[#7c8980]"
              }`}
            >
              <input
                type="radio"
                name="paymentMethod"
                value="paystack"
                checked={paymentMethod === "paystack"}
                disabled={!paystackAvailable}
                onChange={() => setPaymentMethod("paystack")}
                className="mt-1 size-4 accent-[#153c33]"
              />
              <CreditCard
                size={20}
                className="mt-0.5 shrink-0 text-[#2f654f]"
                aria-hidden="true"
              />
              <span>
                <span className="block text-sm font-semibold">
                  Pay online with Paystack
                </span>
                <span className="mt-1 block text-xs leading-5 text-[var(--store-muted)]">
                  {paystackAvailable
                    ? "Pay securely by card or supported mobile money."
                    : "Online checkout will be enabled when the store finishes payment setup."}
                </span>
              </span>
            </label>
          </fieldset>
        </section>
      </div>

      <aside className="h-fit rounded-3xl border border-[var(--store-line)] bg-[var(--store-surface)] p-5 shadow-sm lg:sticky lg:top-6 lg:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="store-eyebrow">03 · REVIEW</p>
            <h2 className="mt-1 text-lg font-semibold">Order summary</h2>
          </div>
          <span className="rounded-full bg-[#eaf2f3] px-3 py-1 text-xs font-semibold text-[#153c33]">
            {items.length} {items.length === 1 ? "item" : "items"}
          </span>
        </div>

        {items.length ? (
          <ul className="mt-5 max-h-64 space-y-4 overflow-y-auto border-b border-[var(--store-line)] pb-5">
            {items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.name}</span>
                  <span className="mt-1 block text-xs text-[var(--store-muted)]">
                    Quantity {item.quantity}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatGhs(item.price * item.quantity)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 rounded-xl bg-[var(--store-soft)] p-4 text-sm text-[var(--store-muted)]">
            Your cart is empty. Add products before checking out.
          </p>
        )}

        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--store-muted)]">Items subtotal</dt>
            <dd className="font-medium tabular-nums">{formatGhs(estimatedSubtotal)}</dd>
          </div>
          {fulfillmentMethod === "delivery" ? (
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--store-muted)]">Flat delivery rate</dt>
              <dd className="font-medium tabular-nums">
                {deliveryFee === null ? "Not set" : formatGhs(deliveryFee)}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3 border-t border-[var(--store-line)] pt-4 text-base">
            <dt className="font-semibold">
              {paymentMethod === "paystack" ? "Pay now" : "Total"}
            </dt>
            <dd className="font-semibold tabular-nums">
              {formatGhs(
                fulfillmentMethod === "delivery" ? deliveryTotal : estimatedSubtotal,
              )}
            </dd>
          </div>
        </dl>

        <p className="mt-4 flex gap-2 rounded-xl bg-[var(--store-soft)] p-3 text-xs leading-5 text-[var(--store-muted)]">
          <ShieldCheck
            size={16}
            className="mt-0.5 shrink-0 text-[#2f654f]"
            aria-hidden="true"
          />
          Final price and available stock are confirmed securely when the order is placed.
        </p>
        {state.message ? (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-[#fff0eb] p-3 text-sm text-[#87351f]"
          >
            {state.message}
            {state.paymentOrderId ? (
              <Link
                href="/account/orders"
                className="mt-2 block font-semibold underline underline-offset-2"
              >
                Open your order history
              </Link>
            ) : null}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={
            pending ||
            !items.length ||
            (fulfillmentMethod === "delivery" && deliveryFee === null) ||
            (paymentMethod === "paystack" && !paystackAvailable)
          }
          className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#b7472a] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#97391f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#153c33] disabled:cursor-not-allowed disabled:bg-[#b7bdb8]"
        >
          {pending
            ? "Securing your order…"
            : paymentMethod === "paystack"
              ? "Continue to secure payment"
              : fulfillmentMethod === "delivery"
                ? "Place delivery order"
                : "Reserve for pickup"}
        </button>
        <Link
          href="/cart"
          className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#153c33] underline-offset-4 hover:underline"
        >
          <ArrowLeft size={14} aria-hidden="true" /> Edit cart
        </Link>
      </aside>
    </form>
  );
}
