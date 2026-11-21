import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthContext } from "@/lib/auth/authorization";
import { StorefrontHeader } from "@/components/storefront/storefront-header";

vi.mock("@/lib/auth/authorization", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/components/storefront/store-cart", () => ({
  CartCount: () => null,
}));

const mockGetAuthContext = vi.mocked(getAuthContext);

describe("storefront account navigation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sends signed-out shoppers to customer sign-in", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    render(await StorefrontHeader());

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login?next=%2Faccount",
    );
  });

  it("shows customers a direct link to their dashboard", async () => {
    mockGetAuthContext.mockResolvedValue({
      type: "customer",
      userId: "customer-user",
      fullName: "Demo Customer",
      customerId: "customer-profile",
    });

    render(await StorefrontHeader());

    expect(screen.getByRole("link", { name: "My account" })).toHaveAttribute(
      "href",
      "/account",
    );
  });

  it("takes signed-in staff to their workspace", async () => {
    mockGetAuthContext.mockResolvedValue({
      type: "staff",
      userId: "staff-user",
      email: "staff@example.test",
      fullName: "Store Manager",
      role: "manager",
    });

    render(await StorefrontHeader());

    expect(screen.getByRole("link", { name: "Staff workspace" })).toHaveAttribute(
      "href",
      "/staff",
    );
  });
});
