import Dexie, { type Table } from "dexie";

export type OfflineProduct = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  selling_price: string;
  available_stock: string;
  reorder_level: string;
  syncedAt: string;
};

export type OfflineSaleItem = {
  productId: string;
  productName: string;
  sku: string | null;
  unitPrice: string;
  quantity: string;
  lineTotal: string;
};

export type OfflineSaleStatus =
  "queued" | "syncing" | "pending_review" | "synced" | "blocked" | "voided";

export type OfflineSale = {
  clientOperationId: string;
  cashierUserId: string;
  cashierName: string;
  occurredAt: string;
  items: OfflineSaleItem[];
  subtotal: string;
  localReceiptNumber: string;
  serverReceiptNumber?: string;
  serverSaleId?: string;
  status: OfflineSaleStatus;
  conflictReasons: Array<{ code: string; message: string; productName?: string }>;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

export type OfflineCartDraft = {
  cashierUserId: string;
  items: Array<OfflineProduct & { quantity: string }>;
  paymentMethod: "cash" | "external_momo" | "credit";
  customer: {
    id: string;
    full_name: string;
    phone: string;
    email: string | null;
    status: string;
  } | null;
  momoReference: string;
  clientOperationId: string | null;
  updatedAt: string;
};

export type OfflinePosProfile = {
  id: "prepared";
  cashierUserId: string;
  cashierName: string;
  preparedAt: string;
  catalogCount: number;
  persistentStorageGranted: boolean;
};

class OfflinePosDatabase extends Dexie {
  products!: Table<OfflineProduct, string>;
  outbox!: Table<OfflineSale, string>;
  drafts!: Table<OfflineCartDraft, string>;
  profile!: Table<OfflinePosProfile, string>;

  constructor() {
    super("grandpa-offline-pos");
    this.version(1).stores({
      products: "id, name, sku, barcode, syncedAt",
      outbox: "clientOperationId, cashierUserId, createdAt, status",
      drafts: "cashierUserId, updatedAt",
      profile: "id, cashierUserId, preparedAt",
    });
  }
}

export const offlinePosDb = new OfflinePosDatabase();
