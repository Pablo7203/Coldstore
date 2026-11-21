"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CustomerCreateForm } from "@/components/customers/customer-create-form";
import { estimatedLineTotal, formatGhsExact, sumMoney } from "@/lib/pos/decimal";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  selling_price: string;
  available_stock: string;
  reorder_level: string;
};
type Customer = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  status: string;
};
type CartItem = Product & { quantity: string };

export function PosTerminal({ cashierName }: { cashierName: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [customerSearch, setCustomerSearch] = useState<{
    query: string;
    results: Customer[];
  }>({ query: "", results: [] });
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "external_momo">("cash");
  const [momoReference, setMomoReference] = useState("");
  const [showCustomerCreate, setShowCustomerCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const operationIdRef = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const productInput = useRef<HTMLInputElement>(null);
  const customers = customerSearch.query === customerQuery ? customerSearch.results : [];

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/pos/products?query=${encodeURIComponent(query)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as { products?: Product[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Product search failed.");
        setProducts(body.products ?? []);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Product search failed.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    if (!customerQuery.trim()) return () => controller.abort();
    fetch(`/api/customers/search?query=${encodeURIComponent(customerQuery)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as { customers?: Customer[] };
        if (response.ok)
          setCustomerSearch({ query: customerQuery, results: body.customers ?? [] });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [customerQuery]);

  const subtotal = useMemo(
    () =>
      sumMoney(cart.map((item) => estimatedLineTotal(item.selling_price, item.quantity))),
    [cart],
  );

  function addProduct(product: Product) {
    setError("");
    setNotice("");
    if (Number(product.available_stock) <= 0) {
      setError(`${product.name} is out of stock.`);
      return;
    }
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (!existing) return [...current, { ...product, quantity: "1" }];
      const nextQuantity = (Number(existing.quantity) + 1).toString();
      if (Number(nextQuantity) > Number(product.available_stock)) {
        setError(`Insufficient stock for ${product.name}.`);
        return current;
      }
      return current.map((item) =>
        item.id === product.id ? { ...item, quantity: nextQuantity } : item,
      );
    });
    productInput.current?.focus();
  }

  function setQuantity(productId: string, quantity: string) {
    if (quantity === "") {
      setCart((items) =>
        items.map((item) => (item.id === productId ? { ...item, quantity } : item)),
      );
      return;
    }
    if (!/^\d+(?:\.\d{0,3})?$/u.test(quantity)) return;
    setCart((items) =>
      items.map((item) => (item.id === productId ? { ...item, quantity } : item)),
    );
  }

  async function completeSale() {
    if (submittingRef.current) return;
    setError("");
    setNotice("");
    for (const item of cart) {
      if (!/^\d+(?:\.\d{1,3})?$/u.test(item.quantity) || Number(item.quantity) <= 0) {
        setError(`Enter a valid quantity for ${item.name}.`);
        return;
      }
      if (Number(item.quantity) > Number(item.available_stock)) {
        setError(`Insufficient stock for ${item.name}.`);
        return;
      }
    }
    if (cart.length === 0) {
      setError("Add at least one product to the cart.");
      return;
    }
    if (paymentMethod === "external_momo" && momoReference.trim().length > 120) {
      setError("MoMo reference must be 120 characters or fewer.");
      return;
    }
    operationIdRef.current ??= crypto.randomUUID();
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const response = await fetch("/api/pos/sales", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientOperationId: operationIdRef.current,
          items: cart.map(({ id, quantity }) => ({ productId: id, quantity })),
          paymentMethod,
          customerId: selectedCustomer?.id ?? null,
          momoReference:
            paymentMethod === "external_momo"
              ? momoReference.trim() || undefined
              : undefined,
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        sale?: { sale_id: string; receipt_number: string };
      };
      if (!response.ok || !body.sale)
        throw new Error(body.error ?? "Sale could not be completed.");
      setCart([]);
      setSelectedCustomer(null);
      setCustomerQuery("");
      setMomoReference("");
      operationIdRef.current = null;
      setNotice(`Sale completed. Receipt ${body.sale.receipt_number}.`);
      router.push(`/sales/${body.sale.sale_id}`);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Sale could not be completed. Your cart is unchanged.",
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(400px,0.8fr)]">
      <section className="space-y-4" aria-label="Product lookup">
        <div className="rounded-xl border border-[#d7e0d9] bg-white p-4">
          <label
            htmlFor="pos-product-search"
            className="mb-2 block text-sm font-semibold"
          >
            Search or scan product
          </label>
          <input
            ref={productInput}
            id="pos-product-search"
            value={query}
            onChange={(event) => {
              setLoading(true);
              setQuery(event.target.value);
            }}
            placeholder="Name, SKU, or barcode"
            autoComplete="off"
            className="min-h-12 w-full rounded-lg border border-[#7c8980] px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f654f]"
            onKeyDown={(event) => {
              if (event.key === "Enter" && products[0]) {
                event.preventDefault();
                addProduct(products[0]);
              }
            }}
          />
          <p className="mt-2 text-xs text-[#5e6b64]">
            USB barcode scanners that type into this field are supported.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {loading && (
            <p role="status" className="rounded-lg bg-white p-4 text-sm">
              Loading products…
            </p>
          )}
          {!loading && products.length === 0 && (
            <p className="rounded-lg bg-white p-4 text-sm">No active products found.</p>
          )}
          {products.map((product) => {
            const unavailable = Number(product.available_stock) <= 0;
            return (
              <article
                key={product.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[#d7e0d9] bg-white p-4"
              >
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{product.name}</h2>
                  <p className="text-sm">
                    {formatGhsExact(product.selling_price)} · Stock{" "}
                    {product.available_stock}
                  </p>
                  <p className="text-xs text-[#5e6b64]">
                    {product.sku || product.barcode || "No SKU"} ·{" "}
                    {unavailable
                      ? "Out of stock"
                      : Number(product.available_stock) <= Number(product.reorder_level)
                        ? "Low stock"
                        : "In stock"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={unavailable || submitting}
                  onClick={() => addProduct(product)}
                  aria-label={`Add ${product.name}`}
                  className="min-h-11 shrink-0 rounded-lg bg-[#153c33] px-3 font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f654f] disabled:bg-[#5e6b64]"
                >
                  Add
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section aria-label="Sale cart" className="space-y-4">
        <div className="rounded-xl border border-[#d7e0d9] bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Current sale</h2>
            <button
              type="button"
              disabled={cart.length === 0 || submitting}
              onClick={() => {
                setCart([]);
                setError("");
              }}
              className="min-h-10 rounded-lg border px-3 text-sm disabled:opacity-50"
            >
              Clear cart
            </button>
          </div>
          {cart.length === 0 ? (
            <p className="rounded-lg bg-[#f7f4ec] p-4 text-sm">
              Your cart is empty. Search for a product to begin.
            </p>
          ) : (
            <div className="space-y-3">
              {cart.map((item) => (
                <article
                  key={item.id}
                  className="grid grid-cols-[1fr_100px] gap-2 border-b border-[#e7e9e4] pb-3"
                >
                  <div>
                    <h3 className="font-medium">{item.name}</h3>
                    <p className="text-sm text-[#5e6b64]">
                      {formatGhsExact(item.selling_price)} each
                    </p>
                    <label className="sr-only" htmlFor={`quantity-${item.id}`}>
                      Quantity for {item.name}
                    </label>
                    <input
                      id={`quantity-${item.id}`}
                      inputMode="decimal"
                      value={item.quantity}
                      onChange={(event) => setQuantity(item.id, event.target.value)}
                      className="mt-2 min-h-10 w-28 rounded border px-2"
                    />
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">
                      {formatGhsExact(
                        estimatedLineTotal(item.selling_price, item.quantity || "0"),
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setCart((rows) => rows.filter((row) => row.id !== item.id))
                      }
                      className="mt-2 min-h-9 rounded px-2 text-sm underline"
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          <dl className="mt-4 space-y-2 border-t border-[#d7e0d9] pt-3">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{formatGhsExact(subtotal)}</dd>
            </div>
            <div className="flex justify-between text-lg font-bold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatGhsExact(subtotal)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-[#d7e0d9] bg-white p-4">
          <label htmlFor="pos-customer" className="mb-2 block text-sm font-semibold">
            Customer (optional)
          </label>
          {selectedCustomer ? (
            <div className="flex items-center justify-between rounded-lg bg-[#f7f4ec] p-3">
              <p>
                {selectedCustomer.full_name} · {selectedCustomer.phone}
              </p>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="min-h-9 underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <>
              <input
                id="pos-customer"
                value={customerQuery}
                onChange={(event) => setCustomerQuery(event.target.value)}
                placeholder="Search name, phone, or email"
                className="min-h-11 w-full rounded-lg border px-3"
              />
              {customers.length > 0 && (
                <ul className="mt-2 max-h-40 overflow-auto rounded border">
                  {customers.map((customer) => (
                    <li key={customer.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(customer);
                          setCustomerQuery("");
                        }}
                        className="min-h-10 w-full px-3 text-left hover:bg-[#f7f4ec]"
                      >
                        {customer.full_name} · {customer.phone}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => setShowCustomerCreate((shown) => !shown)}
            className="mt-2 min-h-10 text-sm font-medium underline"
          >
            {showCustomerCreate ? "Hide quick customer" : "Create walk-in customer"}
          </button>
          {showCustomerCreate && (
            <div className="mt-3">
              <CustomerCreateForm
                compact
                onCreated={(customer) => {
                  setSelectedCustomer({ ...customer, status: "active" });
                }}
              />
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[#d7e0d9] bg-white p-4">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Payment method</legend>
            <div className="flex flex-wrap gap-4">
              <label className="flex min-h-10 items-center gap-2">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="cash"
                  checked={paymentMethod === "cash"}
                  onChange={() => setPaymentMethod("cash")}
                />
                Cash
              </label>
              <label className="flex min-h-10 items-center gap-2">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="external_momo"
                  checked={paymentMethod === "external_momo"}
                  onChange={() => setPaymentMethod("external_momo")}
                />
                Externally Confirmed Mobile Money
              </label>
            </div>
          </fieldset>
          {paymentMethod === "external_momo" && (
            <label className="mt-3 grid gap-1 text-sm">
              MoMo reference (optional)
              <input
                value={momoReference}
                onChange={(event) => setMomoReference(event.target.value)}
                maxLength={120}
                className="min-h-11 rounded-lg border px-3"
              />
            </label>
          )}
          <p className="mt-3 text-xs text-[#5e6b64]">
            Cashier: {cashierName}. Mobile money is recorded after external confirmation;
            no automatic provider verification is performed.
          </p>
          {error && (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
            >
              {error}
            </p>
          )}
          {notice && (
            <p
              role="status"
              className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"
            >
              {notice}
            </p>
          )}
          <button
            type="button"
            disabled={submitting || cart.length === 0}
            onClick={completeSale}
            className="mt-4 min-h-12 w-full rounded-lg bg-[#153c33] px-4 font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f654f] disabled:bg-[#5e6b64]"
            aria-busy={submitting}
          >
            {submitting
              ? "Completing sale…"
              : `Complete sale · ${formatGhsExact(subtotal)}`}
          </button>
        </div>
      </section>
    </div>
  );
}
