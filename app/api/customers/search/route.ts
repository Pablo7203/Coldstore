import { NextResponse } from "next/server";
import { normalizeGhanaPhoneSearchPrefix } from "@/lib/validation/ghana-phone";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const client = await createClient();
  const { data: allowed } = await client.rpc("has_permission", {
    requested_permission: "view_customers",
  });
  if (!allowed) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const raw = new URL(request.url).searchParams.get("query")?.trim() ?? "";
  if (raw.length > 100)
    return NextResponse.json({ error: "Search is too long." }, { status: 400 });
  const query = normalizeGhanaPhoneSearchPrefix(raw);
  const { data, error } = await client.rpc("search_customers", {
    p_query: query,
    p_limit: 20,
  });
  if (error)
    return NextResponse.json(
      { error: "Customer search is unavailable." },
      { status: 500 },
    );
  return NextResponse.json({ customers: data ?? [] });
}
