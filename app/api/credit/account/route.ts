import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const client = await createClient();
  const { data: allowed } = await client.rpc("has_permission", {
    requested_permission: "view_credit",
  });
  if (!allowed) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const customerId = z
    .uuid()
    .safeParse(new URL(request.url).searchParams.get("customerId"));
  if (!customerId.success)
    return NextResponse.json({ error: "Invalid customer." }, { status: 400 });
  const { data, error } = await client.rpc("get_credit_account", {
    p_customer_id: customerId.data,
  });
  if (error)
    return NextResponse.json(
      { error: "Credit information is unavailable." },
      { status: 500 },
    );
  return NextResponse.json({ account: data?.[0] ?? null });
}
