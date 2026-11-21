export function formatGhs(value: number | string | null) {
  if (value === null) return "—";
  const [whole = "0", fraction = ""] = String(value).split(".");
  const cents = fraction.padEnd(2, "0").slice(0, 2);
  return `GHS ${new Intl.NumberFormat("en-GH").format(BigInt(whole))}.${cents}`;
}

export function formatQuantity(value: number | string | null) {
  const [whole = "0", fraction = ""] = String(value ?? "0").split(".");
  const decimal = fraction.slice(0, 3).replace(/0+$/, "");
  return `${new Intl.NumberFormat("en-GH").format(BigInt(whole))}${decimal ? `.${decimal}` : ""}`;
}

export function formatAccraDateTime(value: string | null | undefined) {
  const date = new Date(value ?? "");
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  }).format(date);
}
