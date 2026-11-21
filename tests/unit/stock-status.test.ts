import { describe, expect, it } from "vitest";
import { getStockStatus } from "@/lib/inventory/stock-status";

describe("inventory stock status", () => {
  it("distinguishes inactive, out, low, and in-stock products", () => {
    expect(getStockStatus(20, 4, false)).toBe("inactive");
    expect(getStockStatus(0, 4, true)).toBe("out_of_stock");
    expect(getStockStatus("2.500", "2.500", true)).toBe("low_stock");
    expect(getStockStatus(4, 2, true)).toBe("in_stock");
    expect(getStockStatus(null, 0, true)).toBe("out_of_stock");
  });
});
