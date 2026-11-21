import { z } from "zod";

const money = z
  .string()
  .trim()
  .regex(
    /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/u,
    "Use a non-negative amount with at most two decimal places.",
  );
export const creditAccountSchema = z.object({
  customerId: z.uuid(),
  creditLimit: money,
  status: z.enum(["active", "suspended"]),
});
export const repaymentSchema = z
  .object({
    customerId: z.uuid(),
    amount: money.refine(
      (value) => Number(value) > 0,
      "Repayment must be greater than zero.",
    ),
    paymentMethod: z.enum(["cash", "external_momo"]),
    reference: z.string().trim().max(120).optional(),
  })
  .refine(
    (value) =>
      value.paymentMethod !== "external_momo" ||
      !value.reference ||
      value.reference.length > 0,
    {
      path: ["reference"],
      message: "Enter a valid MoMo reference or leave it blank.",
    },
  );

export function normalizeCreditMoney(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}
