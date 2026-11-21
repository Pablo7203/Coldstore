"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useSyncExternalStore } from "react";
import { formatGhs } from "@/lib/inventory/format";

export type CartProduct = {
  id: string;
  name: string;
  price: number;
  imagePath: string | null;
};

export type CartItem = CartProduct & { quantity: number };

const STORAGE_KEY = "grandpa-store-cart-v1";
const EMPTY_CART: CartItem[] = [];
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedCart: CartItem[] = EMPTY_CART;

function readCart() {
  if (typeof window === "undefined") return EMPTY_CART;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY_CART;
  }
  if (raw === cachedRaw) return cachedCart;
  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cachedCart = Array.isArray(parsed)
      ? parsed.filter(
          (item): item is CartItem =>
            item &&
            typeof item.id === "string" &&
            typeof item.name === "string" &&
            typeof item.price === "number" &&
            Number.isFinite(item.price) &&
            typeof item.quantity === "number" &&
            Number.isInteger(item.quantity) &&
            item.quantity > 0 &&
            (typeof item.imagePath === "string" || item.imagePath === null),
        )
      : EMPTY_CART;
  } catch {
    cachedCart = EMPTY_CART;
  }
  return cachedCart;
}

function notifyCartChanged() {
  for (const listener of listeners) listener();
}

function writeCart(items: CartItem[]) {
  cachedCart = items;
  try {
    cachedRaw = JSON.stringify(items);
    window.localStorage.setItem(STORAGE_KEY, cachedRaw);
  } catch {
    cachedRaw = undefined;
  }
  notifyCartChanged();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      cachedRaw = undefined;
      notifyCartChanged();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useStoreCart() {
  const items = useSyncExternalStore(subscribe, readCart, () => EMPTY_CART);

  function addItem(product: CartProduct, available: number) {
    const existing = readCart();
    const current = existing.find((item) => item.id === product.id)?.quantity ?? 0;
    if (current >= available) return false;
    writeCart([
      ...existing.filter((item) => item.id !== product.id),
      { ...product, quantity: current + 1 },
    ]);
    return true;
  }

  function setQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      writeCart(items.filter((item) => item.id !== productId));
      return;
    }
    writeCart(
      items.map((item) => (item.id === productId ? { ...item, quantity } : item)),
    );
  }

  function removeItem(productId: string) {
    writeCart(items.filter((item) => item.id !== productId));
  }

  function clearCart() {
    writeCart(EMPTY_CART);
  }

  return { items, addItem, setQuantity, removeItem, clearCart };
}

export function CartCount() {
  const { items } = useStoreCart();
  const count = items.reduce((total, item) => total + item.quantity, 0);
  return (
    <span className="rounded-full bg-[#e9eee6] px-2 py-0.5 text-xs tabular-nums">
      {count}
    </span>
  );
}

export function AddToCartButton({
  product,
  maxQuantity,
  className = "",
}: {
  product: CartProduct;
  maxQuantity: number;
  className?: string;
}) {
  const { addItem, items } = useStoreCart();
  const inCart = items.find((item) => item.id === product.id)?.quantity ?? 0;
  const unavailable = maxQuantity <= 0;

  return (
    <button
      type="button"
      disabled={unavailable || inCart >= maxQuantity}
      onClick={() => addItem(product, maxQuantity)}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#b7472a] px-4 text-sm font-semibold text-white transition hover:bg-[#97391f] disabled:cursor-not-allowed disabled:bg-[#a3ada0] ${className}`}
    >
      <ShoppingBag size={16} aria-hidden="true" />
      {unavailable
        ? "Out of stock"
        : inCart >= maxQuantity
          ? `In cart (${inCart})`
          : inCart
            ? `Add another · ${inCart} in cart`
            : "Add to cart"}
    </button>
  );
}

export function CartContents() {
  const { items, setQuantity, removeItem } = useStoreCart();
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  if (!items.length) {
    return (
      <div className="mt-8 rounded-2xl border border-dashed border-[#d7e0d9] bg-white p-10 text-center">
        <ShoppingBag className="mx-auto text-[#2f654f]" size={30} />
        <h2 className="mt-4 text-xl font-semibold">Your cart is empty</h2>
        <p className="mt-2 text-sm text-[#5e6b64]">
          Browse the cold-store selection and add something for your table.
        </p>
        <Link
          href="/shop"
          className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-[#b7472a] px-5 text-sm font-semibold text-white hover:bg-[#97391f]"
        >
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-3">
        {items.map((item) => (
          <article
            key={item.id}
            className="grid grid-cols-[5.5rem_1fr] gap-4 rounded-xl border border-[#d7e0d9] bg-white p-3 sm:grid-cols-[6rem_1fr_auto] sm:items-center sm:p-4"
          >
            <div className="relative h-22 overflow-hidden rounded-lg bg-[#eef1eb] sm:h-24">
              {item.imagePath ? (
                <Image
                  src={item.imagePath}
                  alt=""
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold">{item.name}</h2>
              <p className="mt-1 text-sm text-[#5e6b64]">{formatGhs(item.price)} each</p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`Remove one ${item.name}`}
                  onClick={() => setQuantity(item.id, item.quantity - 1)}
                  className="grid size-9 place-items-center rounded-lg border border-[#d7e0d9]"
                >
                  <Minus size={15} />
                </button>
                <span className="min-w-8 text-center tabular-nums">{item.quantity}</span>
                <button
                  type="button"
                  aria-label={`Add one ${item.name}`}
                  onClick={() => setQuantity(item.id, item.quantity + 1)}
                  className="grid size-9 place-items-center rounded-lg border border-[#d7e0d9]"
                >
                  <Plus size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="ml-2 inline-flex min-h-9 items-center gap-1 text-xs font-medium text-[#7b443b]"
                >
                  <Trash2 size={14} /> Remove
                </button>
              </div>
            </div>
            <strong className="col-start-2 text-sm tabular-nums sm:col-start-auto sm:text-right">
              {formatGhs(item.price * item.quantity)}
            </strong>
          </article>
        ))}
      </div>
      <aside className="h-fit rounded-xl border border-[#d7e0d9] bg-white p-5">
        <h2 className="text-lg font-semibold">Order summary</h2>
        <div className="mt-4 flex justify-between border-t border-[#d7e0d9] pt-4 text-sm">
          <span className="text-[#5e6b64]">Estimated total</span>
          <strong className="tabular-nums">{formatGhs(total)}</strong>
        </div>
        <p className="mt-3 text-xs leading-5 text-[#5e6b64]">
          Stock and prices are confirmed when you place your order.
        </p>
        <Link
          href="/checkout"
          className="mt-5 flex min-h-11 items-center justify-center rounded-lg bg-[#b7472a] px-4 text-sm font-semibold text-white hover:bg-[#97391f]"
        >
          Continue to checkout
        </Link>
      </aside>
    </div>
  );
}
