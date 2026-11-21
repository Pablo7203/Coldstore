import { decimalToScaled, formatScaled } from "@/lib/pos/decimal";

export function availableCredit(
  limit: string,
  balance: string,
  status: "active" | "suspended",
) {
  if (status === "suspended") return "0.00";
  const remaining = decimalToScaled(limit, 2) - decimalToScaled(balance, 2);
  return formatScaled(remaining > BigInt(0) ? remaining : BigInt(0), 2, 2);
}

export function canUseCreditSale(
  status: "active" | "suspended",
  customerActive: boolean,
  available: string,
  charge: string,
) {
  return (
    status === "active" &&
    customerActive &&
    decimalToScaled(charge, 2) > BigInt(0) &&
    decimalToScaled(charge, 2) <= decimalToScaled(available, 2)
  );
}
