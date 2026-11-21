export type StockStatus = "in_stock" | "low_stock" | "out_of_stock" | "inactive";

function milliunits(value: number | string | null) {
  const [whole = "0", fraction = ""] = String(value ?? "0").split(".");
  return (
    BigInt(whole) * BigInt(1000) + BigInt(fraction.padEnd(3, "0").slice(0, 3) || "0")
  );
}

export function getStockStatus(
  quantity: number | string | null,
  reorderLevel: number | string,
  isActive: boolean,
): StockStatus {
  if (!isActive) return "inactive";
  const current = milliunits(quantity);
  if (current <= BigInt(0)) return "out_of_stock";
  if (current <= milliunits(reorderLevel)) return "low_stock";
  return "in_stock";
}

export const stockStatusLabels: Record<StockStatus, string> = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
  inactive: "Inactive",
};

export const stockStatusStyles: Record<StockStatus, string> = {
  in_stock: "bg-emerald-50 text-emerald-800 ring-emerald-700/15",
  low_stock: "bg-amber-50 text-amber-900 ring-amber-700/20",
  out_of_stock: "bg-rose-50 text-rose-800 ring-rose-700/20",
  inactive: "bg-stone-100 text-stone-700 ring-stone-600/15",
};
