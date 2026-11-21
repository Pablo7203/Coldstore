/** Exact display helpers for POS estimates; PostgreSQL remains authoritative. */
export function decimalToScaled(value: string | number, scale: number): bigint {
  const raw = String(value).trim();
  if (!/^-?\d+(?:\.\d+)?$/u.test(raw)) throw new Error("Invalid decimal value.");
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, fraction = ""] = unsigned.split(".");
  if (fraction.length > scale) throw new Error("Too many decimal places.");
  const factor = BigInt(10) ** BigInt(scale);
  const result =
    BigInt(whole) * factor +
    BigInt((fraction + "0".repeat(scale)).slice(0, scale) || "0");
  return negative ? -result : result;
}

export function formatScaled(
  value: bigint,
  scale: number,
  minimumFraction = scale,
): string {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const factor = BigInt(10) ** BigInt(scale);
  const whole = absolute / factor;
  let fraction = String(absolute % factor).padStart(scale, "0");
  while (fraction.length > minimumFraction && fraction.endsWith("0"))
    fraction = fraction.slice(0, -1);
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function estimatedLineTotal(
  price: string | number,
  quantity: string | number,
): string {
  const priceCents = decimalToScaled(price, 2);
  const quantityMilli = decimalToScaled(quantity, 3);
  const product = priceCents * quantityMilli;
  const roundedCents =
    (product + (product >= BigInt(0) ? BigInt(500) : BigInt(-500))) / BigInt(1000);
  return formatScaled(roundedCents, 2, 2);
}

export function sumMoney(values: readonly (string | number)[]): string {
  return formatScaled(
    values.reduce((sum, value) => sum + decimalToScaled(value, 2), BigInt(0)),
    2,
    2,
  );
}

export function formatGhsExact(value: string | number): string {
  return `GHS ${formatScaled(decimalToScaled(value, 2), 2, 2)}`;
}
