import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/auth/redirect-path";

describe("safeRedirectPath", () => {
  it("keeps a local application path", () => {
    expect(safeRedirectPath("/account/orders")).toBe("/account/orders");
  });

  it("rejects external and malformed paths", () => {
    expect(safeRedirectPath("https://attacker.example")).toBe("/account");
    expect(safeRedirectPath("//attacker.example")).toBe("/account");
    expect(safeRedirectPath("/\\attacker.example")).toBe("/account");
  });
});
