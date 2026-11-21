"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { CustomerCreateForm } from "@/components/customers/customer-create-form";
import {
  offlinePosDb,
  type OfflineCartDraft,
  type OfflineSale,
  type OfflineSaleItem,
} from "@/lib/pos/offline-db";
import {
  decimalToScaled,
  estimatedLineTotal,
  formatGhsExact,
  formatScaled,
  sumMoney,
} from "@/lib/pos/decimal";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  selling_price: string;
  available_stock: string;
  reorder_level: string;
  syncedAt?: string;
};
type Customer = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  status: string;
};
type CartItem = Product & { quantity: string };
type CreditAccount = {
  customer_id: string;
  credit_limit: string;
  current_balance: string;
  available_credit: string;
  status: "active" | "suspended";
};
type CreditSnapshot = { customerId: string; account: CreditAccount | null };

function subscribeToConnectivity(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function getConnectivitySnapshot() {
  return navigator.onLine;
}

function getServerConnectivitySnapshot() {
  return true;
}

export function PosTerminal({
  cashierUserId: initialCashierUserId,
  cashierName,
  canUseCredit = false,
  offlineOnly = false,
}: {
  cashierUserId?: string;
  cashierName?: string;
  canUseCredit?: boolean;
  offlineOnly?: boolean;
}) {
  const router = useRouter();
  const [cashierUserId, setCashierUserId] = useState(initialCashierUserId ?? "");
  const [cashierDisplayName, setCashierDisplayName] = useState(cashierName ?? "");
  const isOnline = useSyncExternalStore(
    subscribeToConnectivity,
    getConnectivitySnapshot,
    getServerConnectivitySnapshot,
  );
  const [localReady, setLocalReady] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [preparingOffline, setPreparingOffline] = useState(false);
  const [preparedAt, setPreparedAt] = useState<string | null>(null);
  const [persistentStorageGranted, setPersistentStorageGranted] = useState(false);
  const [offlineSales, setOfflineSales] = useState<OfflineSale[]>([]);
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [customerSearch, setCustomerSearch] = useState<{
    query: string;
    results: Customer[];
  }>({ query: "", results: [] });
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "external_momo" | "credit">(
    "cash",
  );
  const [creditSnapshot, setCreditSnapshot] = useState<CreditSnapshot | null>(null);
  const [momoReference, setMomoReference] = useState("");
  const [showCustomerCreate, setShowCustomerCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const syncingQueueRef = useRef(false);
  const operationIdRef = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const productInput = useRef<HTMLInputElement>(null);
  const customers = customerSearch.query === customerQuery ? customerSearch.results : [];
  const offlineMode = offlineOnly || !isOnline;
  // Match each response to its customer so a previous account is never shown during a new lookup.
  const creditAccount =
    creditSnapshot &&
    selectedCustomer &&
    creditSnapshot.customerId === selectedCustomer.id
      ? creditSnapshot.account
      : null;

  useEffect(() => {
    if (!selectedCustomer || !canUseCredit) return;
    const customerId = selectedCustomer.id;
    const controller = new AbortController();
    fetch(`/api/credit/account?customerId=${encodeURIComponent(customerId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as { account?: CreditAccount | null };
        if (response.ok) setCreditSnapshot({ customerId, account: body.account ?? null });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [selectedCustomer, canUseCredit]);

  useEffect(() => {
    const controller = new AbortController();
    async function findProducts() {
      try {
        if (offlineOnly || !navigator.onLine) {
          const needle = query.trim().toLocaleLowerCase();
          const cached = await offlinePosDb.products.toArray();
          const matches = cached.filter(
            (product) =>
              !needle ||
              product.name.toLocaleLowerCase().startsWith(needle) ||
              (product.sku ?? "").toLocaleLowerCase().startsWith(needle) ||
              (product.barcode ?? "").toLocaleLowerCase().startsWith(needle),
          );
          if (!controller.signal.aborted) setProducts(matches);
          return;
        }

        const response = await fetch(
          `/api/pos/products?query=${encodeURIComponent(query)}`,
          {
            signal: controller.signal,
          },
        );
        const body = (await response.json()) as { products?: Product[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Product search failed.");
        const found = body.products ?? [];
        if (!controller.signal.aborted) setProducts(found);
        await offlinePosDb.products.bulkPut(
          found.map((product) => ({ ...product, syncedAt: new Date().toISOString() })),
        );
      } catch (cause) {
        if (controller.signal.aborted) return;
        const cached = await offlinePosDb.products.toArray().catch(() => []);
        const needle = query.trim().toLocaleLowerCase();
        const matches = cached.filter(
          (product) =>
            !needle ||
            product.name.toLocaleLowerCase().startsWith(needle) ||
            (product.sku ?? "").toLocaleLowerCase().startsWith(needle) ||
            (product.barcode ?? "").toLocaleLowerCase().startsWith(needle),
        );
        if (matches.length > 0) setProducts(matches);
        else setError(cause instanceof Error ? cause.message : "Product search failed.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void findProducts();
    return () => controller.abort();
  }, [query, isOnline, offlineOnly]);

  useEffect(() => {
    const controller = new AbortController();
    if (offlineMode || !customerQuery.trim()) return () => controller.abort();
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
  }, [customerQuery, offlineMode]);

  const subtotal = useMemo(
    () =>
      sumMoney(cart.map((item) => estimatedLineTotal(item.selling_price, item.quantity))),
    [cart],
  );
  const proposedCents = useMemo(() => decimalToScaled(subtotal, 2), [subtotal]);
  const availableCents = useMemo(
    () => decimalToScaled(creditAccount?.available_credit ?? "0", 2),
    [creditAccount],
  );
  const remainingCredit =
    availableCents > proposedCents ? availableCents - proposedCents : BigInt(0);

  const refreshOfflineSales = useCallback(async (ownerId: string) => {
    const rows = await offlinePosDb.outbox
      .where("cashierUserId")
      .equals(ownerId)
      .toArray();
    rows.sort((first, second) => second.createdAt.localeCompare(first.createdAt));
    setOfflineSales(rows.slice(0, 8));
  }, []);

  const refreshOfflineCatalog = useCallback(async () => {
    if (!navigator.onLine) return;
    const response = await fetch("/api/pos/offline/catalog");
    if (!response.ok) return;
    const catalog = (await response.json()) as {
      products: Product[];
      cashier: { userId: string; fullName: string };
      preparedAt: string;
    };
    const syncedAt = catalog.preparedAt;
    await offlinePosDb.products.clear();
    await offlinePosDb.products.bulkPut(
      catalog.products.map((product) => ({ ...product, syncedAt })),
    );
    await offlinePosDb.profile.put({
      id: "prepared",
      cashierUserId: catalog.cashier.userId,
      cashierName: catalog.cashier.fullName,
      preparedAt: catalog.preparedAt,
      catalogCount: catalog.products.length,
      persistentStorageGranted,
    });
  }, [persistentStorageGranted]);

  const syncOfflineSales = useCallback(async () => {
    if (!navigator.onLine || !cashierUserId || syncingQueueRef.current) return;
    syncingQueueRef.current = true;
    let changedCatalog = false;
    try {
      const pending = await offlinePosDb.outbox
        .where("cashierUserId")
        .equals(cashierUserId)
        .filter((sale) => ["queued", "blocked", "pending_review"].includes(sale.status))
        .toArray();

      for (const sale of pending) {
        if (!navigator.onLine) break;
        await offlinePosDb.outbox.update(sale.clientOperationId, {
          status: "syncing",
          updatedAt: new Date().toISOString(),
        });
        try {
          const response = await fetch("/api/pos/offline/sync", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              cashierUserId: sale.cashierUserId,
              clientOperationId: sale.clientOperationId,
              occurredAt: sale.occurredAt,
              items: sale.items.map((item) => ({
                productId: item.productId,
                productName: item.productName,
                sku: item.sku,
                unitPrice: item.unitPrice,
                quantity: item.quantity,
                lineTotal: item.lineTotal,
              })),
            }),
          });
          const body = (await response.json()) as {
            error?: string;
            status?: string;
            saleId?: string | null;
            receiptNumber?: string | null;
            conflictReasons?: OfflineSale["conflictReasons"];
          };
          if (!response.ok) {
            await offlinePosDb.outbox.update(sale.clientOperationId, {
              status: response.status < 500 ? "blocked" : "queued",
              lastError:
                body.error ?? "Waiting for a connection or the right cashier to sign in.",
              updatedAt: new Date().toISOString(),
            });
            continue;
          }

          if (body.status === "pending_review") {
            await offlinePosDb.outbox.update(sale.clientOperationId, {
              status: "pending_review",
              conflictReasons: body.conflictReasons ?? [],
              lastError: undefined,
              updatedAt: new Date().toISOString(),
            });
          } else if (body.status === "voided") {
            await offlinePosDb.outbox.update(sale.clientOperationId, {
              status: "voided",
              lastError: undefined,
              updatedAt: new Date().toISOString(),
            });
            changedCatalog = true;
          } else {
            await offlinePosDb.outbox.update(sale.clientOperationId, {
              status: "synced",
              serverSaleId: body.saleId ?? undefined,
              serverReceiptNumber: body.receiptNumber ?? undefined,
              conflictReasons: [],
              lastError: undefined,
              updatedAt: new Date().toISOString(),
            });
            changedCatalog = true;
          }
        } catch {
          await offlinePosDb.outbox.update(sale.clientOperationId, {
            status: "queued",
            lastError: "Connection interrupted. This sale remains saved on this device.",
            updatedAt: new Date().toISOString(),
          });
          break;
        }
      }
      if (changedCatalog) await refreshOfflineCatalog();
      await refreshOfflineSales(cashierUserId);
    } finally {
      syncingQueueRef.current = false;
    }
  }, [cashierUserId, refreshOfflineCatalog, refreshOfflineSales]);

  async function prepareOfflinePos() {
    if (!navigator.onLine || !cashierUserId) {
      setError("Sign in and prepare the POS while connected before using it offline.");
      return;
    }
    setPreparingOffline(true);
    setError("");
    try {
      const response = await fetch("/api/pos/offline/catalog", { cache: "no-store" });
      const body = (await response.json()) as {
        error?: string;
        cashier?: { userId: string; fullName: string };
        preparedAt?: string;
        products?: Product[];
      };
      if (!response.ok || !body.cashier || !body.preparedAt || !body.products) {
        throw new Error(body.error ?? "The offline catalogue could not be prepared.");
      }
      if (body.cashier.userId !== cashierUserId) {
        throw new Error(
          "The signed-in cashier changed. Refresh the POS and prepare again.",
        );
      }

      const persistent = await navigator.storage?.persist?.().catch(() => false);
      const persistGranted = persistent === true;
      await offlinePosDb.transaction(
        "rw",
        offlinePosDb.products,
        offlinePosDb.profile,
        async () => {
          await offlinePosDb.products.clear();
          await offlinePosDb.products.bulkPut(
            body.products!.map((product) => ({
              ...product,
              syncedAt: body.preparedAt!,
            })),
          );
          await offlinePosDb.profile.put({
            id: "prepared",
            cashierUserId: body.cashier!.userId,
            cashierName: body.cashier!.fullName,
            preparedAt: body.preparedAt!,
            catalogCount: body.products!.length,
            persistentStorageGranted: persistGranted,
          });
        },
      );
      setCashierDisplayName(body.cashier.fullName);
      setOfflineReady(body.products.length > 0);
      setPreparedAt(body.preparedAt);
      setPersistentStorageGranted(persistGranted);
      setNotice(
        `Offline POS prepared with ${body.products.length} products. Open the offline workspace once while connected to cache its app shell.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The offline POS could not be prepared.",
      );
    } finally {
      setPreparingOffline(false);
    }
  }

  async function queueOfflineSale() {
    if (!offlineReady || !cashierUserId || !cashierDisplayName) {
      setError("Prepare the POS while online before recording offline sales.");
      return;
    }
    if (paymentMethod !== "cash") {
      setError(
        "Only cash sales can be recorded offline. Reconnect to use credit or mobile money.",
      );
      return;
    }

    const operationId = operationIdRef.current ?? crypto.randomUUID();
    operationIdRef.current = operationId;
    const now = new Date().toISOString();
    const items: OfflineSaleItem[] = cart.map((item) => ({
      productId: item.id,
      productName: item.name,
      sku: item.sku,
      unitPrice: item.selling_price,
      quantity: item.quantity,
      lineTotal: estimatedLineTotal(item.selling_price, item.quantity),
    }));
    const sale: OfflineSale = {
      clientOperationId: operationId,
      cashierUserId,
      cashierName: cashierDisplayName,
      occurredAt: now,
      items,
      subtotal,
      localReceiptNumber: `OFF-${operationId.slice(0, 8).toUpperCase()}`,
      status: "queued",
      conflictReasons: [],
      createdAt: now,
      updatedAt: now,
    };

    await persistOfflineSale(sale);
  }

  async function persistOfflineSale(sale: OfflineSale) {
    await offlinePosDb.transaction(
      "rw",
      offlinePosDb.outbox,
      offlinePosDb.products,
      offlinePosDb.drafts,
      async () => {
        if (!(await offlinePosDb.outbox.get(sale.clientOperationId))) {
          await offlinePosDb.outbox.add(sale);
          for (const item of sale.items) {
            const cached = await offlinePosDb.products.get(item.productId);
            if (cached) {
              const remaining = Math.max(
                0,
                Number(cached.available_stock) - Number(item.quantity),
              );
              await offlinePosDb.products.update(item.productId, {
                available_stock: remaining.toFixed(3).replace(/\.?0+$/u, ""),
              });
            }
          }
        }
        await offlinePosDb.drafts.delete(cashierUserId);
      },
    );

    setCart([]);
    setSelectedCustomer(null);
    setCustomerQuery("");
    setMomoReference("");
    operationIdRef.current = null;
    setNotice(
      `Cash sale saved on this device as ${sale.localReceiptNumber}. It will sync when the cashier reconnects.`,
    );
    setProducts((current) =>
      current.map((product) => {
        const sold = sale.items.find((item) => item.productId === product.id);
        if (!sold) return product;
        const remaining = Math.max(
          0,
          Number(product.available_stock) - Number(sold.quantity),
        );
        return {
          ...product,
          available_stock: remaining.toFixed(3).replace(/\.?0+$/u, ""),
        };
      }),
    );
    await refreshOfflineSales(cashierUserId);
    if (navigator.onLine) void syncOfflineSales();
  }

  useEffect(() => {
    if (!localReady || !cashierUserId) return;
    if (cart.length === 0) {
      void offlinePosDb.drafts.delete(cashierUserId);
      return;
    }
    const draft: OfflineCartDraft = {
      cashierUserId,
      items: cart.map((item) => ({
        ...item,
        syncedAt: item.syncedAt ?? preparedAt ?? new Date().toISOString(),
      })),
      paymentMethod,
      customer: selectedCustomer,
      momoReference,
      clientOperationId: operationIdRef.current,
      updatedAt: new Date().toISOString(),
    };
    void offlinePosDb.drafts.put(draft);
  }, [
    cart,
    cashierUserId,
    localReady,
    momoReference,
    paymentMethod,
    preparedAt,
    selectedCustomer,
  ]);

  useEffect(() => {
    const handleOffline = () => {
      setPaymentMethod("cash");
      setSelectedCustomer(null);
      setCustomerQuery("");
    };
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function restoreLocalPos() {
      try {
        const profile = await offlinePosDb.profile.get("prepared");
        const ownerId =
          initialCashierUserId ?? (offlineOnly ? profile?.cashierUserId : undefined);
        if (offlineOnly && !initialCashierUserId && profile && !cancelled) {
          setCashierUserId(profile.cashierUserId);
          setCashierDisplayName(profile.cashierName);
        }
        if (ownerId) {
          // A tab may close after marking an item as syncing but before the
          // server responds. Requeue it; the stable operation ID makes retry safe.
          await offlinePosDb.outbox
            .where("cashierUserId")
            .equals(ownerId)
            .modify((sale) => {
              if (sale.status === "syncing") {
                sale.status = "queued";
                sale.lastError =
                  "The previous sync was interrupted. This sale is safe to retry.";
                sale.updatedAt = new Date().toISOString();
              }
            });

          const [catalogCount, draft] = await Promise.all([
            offlinePosDb.products.count(),
            offlinePosDb.drafts.get(ownerId),
          ]);
          if (!cancelled) {
            const preparedForCashier = profile?.cashierUserId === ownerId;
            setOfflineReady(preparedForCashier && catalogCount > 0);
            if (preparedForCashier) {
              setPreparedAt(profile.preparedAt);
              setPersistentStorageGranted(profile.persistentStorageGranted);
            }
            if (draft?.cashierUserId === ownerId) {
              setCart(draft.items);
              setPaymentMethod(
                navigator.onLine && !offlineOnly ? draft.paymentMethod : "cash",
              );
              if (navigator.onLine && !offlineOnly) {
                setSelectedCustomer(draft.customer);
                setMomoReference(draft.momoReference);
              }
              operationIdRef.current = draft.clientOperationId;
              setNotice("Your saved cart was restored from this device.");
            }
            await refreshOfflineSales(ownerId);
          }
        }
      } catch {
        if (!cancelled) setError("This browser could not open local POS storage.");
      } finally {
        if (!cancelled) setLocalReady(true);
      }
    }
    void restoreLocalPos();
    return () => {
      cancelled = true;
    };
  }, [initialCashierUserId, offlineOnly, refreshOfflineSales]);

  useEffect(() => {
    if (isOnline && localReady && cashierUserId) void syncOfflineSales();
  }, [isOnline, localReady, cashierUserId, syncOfflineSales]);

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
    if (proposedCents <= BigInt(0)) {
      setError("Sale total must be greater than zero.");
      return;
    }
    if (offlineMode && paymentMethod !== "cash") {
      setError(
        "Only cash sales can be recorded offline. Reconnect to use credit or mobile money.",
      );
      return;
    }
    if (paymentMethod === "external_momo" && momoReference.trim().length > 120) {
      setError("MoMo reference must be 120 characters or fewer.");
      return;
    }
    if (
      paymentMethod === "credit" &&
      (!selectedCustomer ||
        !creditAccount ||
        creditAccount.status !== "active" ||
        proposedCents > availableCents)
    ) {
      setError(
        "This customer cannot cover the proposed charge with available credit. Refresh the account or reduce the cart.",
      );
      return;
    }
    if (offlineMode) {
      if (!offlineReady || !cashierUserId || !cashierDisplayName) {
        setError("Prepare the POS while online before recording offline sales.");
        return;
      }
      submittingRef.current = true;
      setSubmitting(true);
      try {
        await queueOfflineSale();
      } catch {
        setError(
          "The sale could not be saved locally. Keep the page open and reconnect before retrying.",
        );
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
      return;
    }

    operationIdRef.current ??= crypto.randomUUID();
    const operationId = operationIdRef.current;
    const occurredAt = new Date().toISOString();
    const offlineItems: OfflineSaleItem[] = cart.map((item) => ({
      productId: item.id,
      productName: item.name,
      sku: item.sku,
      unitPrice: item.selling_price,
      quantity: item.quantity,
      lineTotal: estimatedLineTotal(item.selling_price, item.quantity),
    }));
    const offlineSale: OfflineSale | null =
      paymentMethod === "cash" && cashierUserId && cashierDisplayName
        ? {
            clientOperationId: operationId,
            cashierUserId,
            cashierName: cashierDisplayName,
            occurredAt,
            items: offlineItems,
            subtotal,
            localReceiptNumber: `OFF-${operationId.slice(0, 8).toUpperCase()}`,
            status: "queued",
            conflictReasons: [],
            createdAt: occurredAt,
            updatedAt: occurredAt,
          }
        : null;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await offlinePosDb.drafts.put({
        cashierUserId,
        items: cart.map((item) => ({
          ...item,
          syncedAt: item.syncedAt ?? preparedAt ?? occurredAt,
        })),
        paymentMethod,
        customer: selectedCustomer,
        momoReference,
        clientOperationId: operationId,
        updatedAt: occurredAt,
      });
      const response = await fetch("/api/pos/sales", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientOperationId: operationId,
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
      if (!response.ok || !body.sale) {
        if (response.status >= 500 && offlineSale) {
          await persistOfflineSale(offlineSale);
          return;
        }
        if (offlineSale) await offlinePosDb.outbox.delete(operationId);
        throw new Error(body.error ?? "Sale could not be completed.");
      }
      await offlinePosDb.drafts.delete(cashierUserId);
      if (offlineSale) {
        await offlinePosDb.outbox.put({
          ...offlineSale,
          status: "synced",
          serverSaleId: body.sale.sale_id,
          serverReceiptNumber: body.sale.receipt_number,
          updatedAt: new Date().toISOString(),
        });
        await refreshOfflineSales(cashierUserId);
        if (offlineReady) await refreshOfflineCatalog();
      }
      setCart([]);
      setSelectedCustomer(null);
      setCustomerQuery("");
      setMomoReference("");
      operationIdRef.current = null;
      setNotice(`Sale completed. Receipt ${body.sale.receipt_number}.`);
      router.push(`/sales/${body.sale.sale_id}`);
      router.refresh();
    } catch (cause) {
      if (offlineSale && (!navigator.onLine || cause instanceof TypeError)) {
        try {
          await persistOfflineSale(offlineSale);
          return;
        } catch {
          setError(
            "Connection lost and the sale could not be saved locally. Keep this page open.",
          );
        }
      } else {
        setError(
          cause instanceof Error
            ? cause.message
            : "Sale could not be completed. Your cart is unchanged.",
        );
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(400px,0.8fr)]">
      <section
        aria-label="Offline POS status"
        className="rounded-xl border border-[#d7e0d9] bg-white p-4 xl:col-span-2"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">POS connection</h2>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  offlineMode
                    ? "bg-amber-100 text-amber-950"
                    : "bg-emerald-100 text-emerald-950"
                }`}
              >
                {offlineMode ? "Offline · cash only" : "Online"}
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-5 text-[#5e6b64]">
              {offlineReady
                ? `Catalogue prepared${preparedAt ? ` ${new Date(preparedAt).toLocaleString()}` : ""}. ${persistentStorageGranted ? "Persistent browser storage was granted." : "Browser storage may be cleared; sync saved sales promptly."}`
                : "Prepare the catalogue and open the offline workspace once while connected before relying on offline sales."}
            </p>
          </div>
          {!offlineOnly && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={prepareOfflinePos}
                disabled={!isOnline || preparingOffline}
                className="min-h-10 rounded-xl border border-[#153c33] px-3.5 text-sm font-semibold text-[#153c33] hover:bg-[#eaf2f3] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {preparingOffline
                  ? "Preparing…"
                  : offlineReady
                    ? "Refresh offline data"
                    : "Prepare offline POS"}
              </button>
              {offlineReady && (
                <a
                  href="/offline-pos"
                  className="inline-flex min-h-10 items-center rounded-xl bg-[#153c33] px-3.5 text-sm font-semibold text-white hover:bg-[#2f654f]"
                >
                  Open offline workspace
                </a>
              )}
            </div>
          )}
        </div>

        {offlineSales.length > 0 && (
          <div className="mt-4 border-t border-[#e7e9e4] pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Saved cash sales on this device</p>
              {isOnline && (
                <button
                  type="button"
                  onClick={() => void syncOfflineSales()}
                  disabled={submitting}
                  className="min-h-9 rounded-lg px-3 text-sm font-semibold text-[#2f654f] underline disabled:opacity-50"
                >
                  Sync now
                </button>
              )}
            </div>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {offlineSales.map((sale) => (
                <li
                  key={sale.clientOperationId}
                  className="rounded-lg bg-[#f7f4ec] px-3 py-2 text-xs"
                >
                  <span className="block font-semibold">
                    {sale.serverReceiptNumber ?? sale.localReceiptNumber}
                  </span>
                  <span className="text-[#5e6b64]">
                    {sale.status === "pending_review"
                      ? "Manager review required"
                      : sale.status === "synced"
                        ? "Synced"
                        : sale.status === "voided"
                          ? "Voided after review"
                          : sale.status === "blocked"
                            ? "Waiting for cashier access"
                            : sale.status === "syncing"
                              ? "Syncing"
                              : "Waiting to sync"}
                  </span>
                  {sale.lastError && (
                    <span className="mt-1 block text-[#5e6b64]">{sale.lastError}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

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
          {offlineMode ? (
            <>
              <h2 className="text-sm font-semibold">
                Customer lookup unavailable offline
              </h2>
              <p className="mt-1 text-sm leading-5 text-[#5e6b64]">
                This cash sale will be saved without a customer account. Customer credit
                and electronic payment require a live connection.
              </p>
            </>
          ) : (
            <>
              <label htmlFor="pos-customer" className="mb-2 block text-sm font-semibold">
                Customer (optional)
              </label>
              {selectedCustomer ? (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-[#f7f4ec] p-3">
                  <p>
                    {selectedCustomer.full_name} · {selectedCustomer.phone}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCustomer(null);
                      if (paymentMethod === "credit") setPaymentMethod("cash");
                    }}
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
              {canUseCredit && selectedCustomer && (
                <div className="mt-3 rounded-lg border border-[#d7e0d9] bg-[#fbfcfa] p-3 text-sm">
                  {creditAccount ? (
                    <dl className="grid grid-cols-2 gap-2">
                      <dt>Credit limit</dt>
                      <dd className="text-right">
                        {formatGhsExact(creditAccount.credit_limit)}
                      </dd>
                      <dt>Outstanding</dt>
                      <dd className="text-right">
                        {formatGhsExact(creditAccount.current_balance)}
                      </dd>
                      <dt>Available credit</dt>
                      <dd className="text-right">
                        {formatGhsExact(creditAccount.available_credit)}
                      </dd>
                      <dt>Status</dt>
                      <dd className="text-right capitalize">{creditAccount.status}</dd>
                      {paymentMethod === "credit" && (
                        <>
                          <dt>Proposed charge</dt>
                          <dd className="text-right">{formatGhsExact(subtotal)}</dd>
                          <dt>Expected remaining</dt>
                          <dd className="text-right">
                            {formatGhsExact(formatScaled(remainingCredit, 2, 2))}
                          </dd>
                        </>
                      )}
                    </dl>
                  ) : (
                    <p>
                      {selectedCustomer.status !== "active"
                        ? "Inactive customers cannot make new credit sales."
                        : "No credit account is available for this customer."}
                    </p>
                  )}
                </div>
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
            </>
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
                  disabled={offlineMode}
                />
                <span className={offlineMode ? "text-[#8c9690]" : ""}>
                  Externally Confirmed Mobile Money
                </span>
              </label>
              {!offlineMode &&
                canUseCredit &&
                selectedCustomer?.status === "active" &&
                creditAccount?.status === "active" && (
                  <label className="flex min-h-10 items-center gap-2">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="credit"
                      checked={paymentMethod === "credit"}
                      onChange={() => setPaymentMethod("credit")}
                    />
                    Customer Credit
                  </label>
                )}
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
          {paymentMethod === "credit" &&
            (!creditAccount ||
              creditAccount.status !== "active" ||
              selectedCustomer?.status !== "active" ||
              proposedCents > availableCents) && (
              <p
                role="alert"
                className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
              >
                Available credit is insufficient for this proposed charge.
              </p>
            )}
          <p className="mt-3 text-xs text-[#5e6b64]">
            Cashier: {cashierDisplayName || "Offline cashier"}. Mobile money is recorded
            after external confirmation; no automatic provider verification is performed.
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
            disabled={
              submitting ||
              cart.length === 0 ||
              (paymentMethod === "credit" && proposedCents > availableCents)
            }
            onClick={completeSale}
            className="mt-4 min-h-12 w-full rounded-lg bg-[#153c33] px-4 font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f654f] disabled:bg-[#5e6b64]"
            aria-busy={submitting}
          >
            {submitting
              ? offlineMode
                ? "Saving sale locally…"
                : "Completing sale…"
              : offlineMode
                ? `Save cash sale · ${formatGhsExact(subtotal)}`
                : `Complete sale · ${formatGhsExact(subtotal)}`}
          </button>
        </div>
      </section>
    </div>
  );
}
