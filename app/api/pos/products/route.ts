import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const client = await createClient();
  const { data: allowed } = await client.rpc("has_permission", {
    requested_permission: "view_inventory",
  });
  if (!allowed)
    return NextResponse.json({ error: "Not authorized to use POS." }, { status: 403 });
  const query = new URL(request.url).searchParams.get("query")?.trim() ?? "";
  if (query.length > 100)
    return NextResponse.json({ error: "Search is too long." }, { status: 400 });
  const { data, error } = await client.rpc("search_products", {
    p_query: query || undefined,
    p_active: true,
    p_limit: 25,
    p_offset: 0,
  });
  if (error)
    return NextResponse.json(
      { error: "Product search is unavailable." },
      { status: 500 },
    );
  return NextResponse.json({
    products: (data ?? []).map(
      ({ id, name, sku, barcode, selling_price, quantity, reorder_level }) => ({
        id,
        name,
        sku,
        barcode,
        selling_price: String(selling_price),
        available_stock: String(quantity ?? 0),
        reorder_level: String(reorder_level),
      }),
    ),
  });
}
