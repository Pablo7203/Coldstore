import { describe, expect, it } from "vitest";
import { normalizeGhanaPhone } from "@/lib/validation/ghana-phone";

describe("normalizeGhanaPhone", () => {
  it.each([
    ["0241234567", "+233241234567"],
    ["024 123 4567", "+233241234567"],
    ["(024) 123-4567", "+233241234567"],
    ["+233241234567", "+233241234567"],
    ["+233 24 123 4567", "+233241234567"],
    ["233-24-123-4567", "+233241234567"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeGhanaPhone(input)).toBe(expected);
  });

  it.each([
    "",
    "024123456",
    "02412345678",
    "+234241234567",
    "02412ABC67",
    "+2330241234567",
    "++233241234567",
  ])("rejects invalid Ghana phone input %s", (input) => {
    expect(normalizeGhanaPhone(input)).toBeNull();
  });
});
