import { NextResponse } from "next/server";
import { resolveAuthContext } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const client = await createClient();
  const context = await resolveAuthContext(client);
  if (context?.type !== "staff") {
    return NextResponse.json(
      { error: "Sign in with an active staff account." },
      { status: 401 },
    );
  }

  const { data, error } = await client.rpc("get_offline_pos_catalog");
  if (error) {
    const status = error.code === "42501" ? 403 : 500;
    return NextResponse.json(
      {
        error:
          status === 403
            ? "Your role cannot prepare offline POS."
            : "The POS catalogue could not be prepared.",
      },
      { status },
    );
  }

  return NextResponse.json({
    cashier: { userId: context.userId, fullName: context.fullName },
    preparedAt: new Date().toISOString(),
    products: (data ?? []).map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      selling_price: String(product.selling_price),
      available_stock: String(product.available_stock),
      reorder_level: String(product.reorder_level),
      updated_at: product.updated_at,
    })),
  });
}
