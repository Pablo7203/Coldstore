import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Home from "@/app/page";

vi.mock("@/components/storefront/storefront-header", () => ({
  StorefrontHeader: () => null,
}));

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) =>
    createElement("img", props),
}));

vi.mock("@/lib/supabase/admin", () => {
  const categoryQuery = {
    select: () => categoryQuery,
    eq: () => categoryQuery,
    order: () => categoryQuery,
    limit: async () => ({
      data: [{ id: "category-poultry", name: "Poultry", slug: "poultry" }],
      error: null,
    }),
  };

  return {
    createAdminClient: () => ({
      from: () => categoryQuery,
      rpc: async () => ({
        data: [
          {
            product_id: "product-chicken",
            category_id: "category-poultry",
            category_name: "Poultry",
            name: "Chicken Breast Fillets",
            description: "Frozen chicken breast fillets in a one kilogram pack.",
            selling_price: 58,
            image_path: null,
            available_to_order: 8,
          },
        ],
        error: null,
      }),
    }),
  };
});

describe("customer storefront", () => {
  it("shows product discovery, stock status, and add-to-cart actions", async () => {
    render(await Home());

    expect(
      screen.getByRole("heading", { name: "Good food. Ready when you are." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Poultry" })).toHaveAttribute(
      "href",
      "/shop?category=poultry",
    );
    expect(
      screen.getByRole("heading", { name: "Chicken Breast Fillets" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to cart" })).toBeEnabled();
  });
});
