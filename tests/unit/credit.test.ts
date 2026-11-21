import { describe, expect, it } from "vitest";
import { availableCredit, canUseCreditSale } from "@/lib/credit/math";
import {
  creditAccountSchema,
  normalizeCreditMoney,
  repaymentSchema,
} from "@/lib/credit/validation";
import { formatGhsExact } from "@/lib/pos/decimal";

describe("customer credit", () => {
  it("computes available credit with exact decimal integer math", () => {
    expect(availableCredit("100.00", "80.01", "active")).toBe("19.99");
    expect(availableCredit("50.00", "70.00", "active")).toBe("0.00");
    expect(availableCredit("100.00", "10.00", "suspended")).toBe("0.00");
  });

  it("allows only an active customer and active account within available credit", () => {
    expect(canUseCreditSale("active", true, "20.00", "20.00")).toBe(true);
    expect(canUseCreditSale("active", true, "19.99", "20.00")).toBe(false);
    expect(canUseCreditSale("suspended", true, "20.00", "1.00")).toBe(false);
    expect(canUseCreditSale("active", false, "20.00", "1.00")).toBe(false);
  });

  it("validates limits and repayment precision and positive amounts", () => {
    expect(
      creditAccountSchema.safeParse({
        customerId: "00000000-0000-4000-8000-000000000001",
        creditLimit: "100.00",
        status: "active",
      }).success,
    ).toBe(true);
    expect(
      creditAccountSchema.safeParse({
        customerId: "00000000-0000-4000-8000-000000000001",
        creditLimit: "1.001",
        status: "active",
      }).success,
    ).toBe(false);
    expect(
      repaymentSchema.safeParse({
        customerId: "00000000-0000-4000-8000-000000000001",
        amount: "0.00",
        paymentMethod: "cash",
      }).success,
    ).toBe(false);
    expect(
      repaymentSchema.safeParse({
        customerId: "00000000-0000-4000-8000-000000000001",
        amount: "5.001",
        paymentMethod: "cash",
      }).success,
    ).toBe(false);
    expect(normalizeCreditMoney("5")).toBe("5.00");
  });

  it("formats GHS to two decimal places", () => {
    expect(formatGhsExact("1000.5")).toBe("GHS 1000.50");
  });
});
