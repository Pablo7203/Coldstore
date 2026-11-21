import { describe, expect, it } from "vitest";
import { formatAccraDateTime } from "@/lib/inventory/format";

describe("formatAccraDateTime", () => {
  it("formats valid timestamps in Accra time", () => {
    expect(formatAccraDateTime("2026-11-16T09:00:00.000Z")).toBe("16 Nov 2026, 9:00 am");
  });

  it.each(["invalid-date", null, undefined])(
    "returns a readable fallback for invalid or missing timestamp %s",
    (value) => {
      expect(formatAccraDateTime(value)).toBe("Date unavailable");
    },
  );
});
