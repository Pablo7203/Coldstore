import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { customerInputSchema } from "@/lib/validation/customer";

export async function POST(request: Request) {
  const client = await createClient();
  const { data: allowed } = await client.rpc("has_permission", {
    requested_permission: "create_customer",
  });
  if (!allowed)
    return NextResponse.json(
      { error: "Not authorized to create customers." },
      { status: 403 },
    );
  const body: unknown = await request.json().catch(() => null);
  const parsed = customerInputSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check customer details." },
      { status: 400 },
    );
  const email = parsed.data.email?.toLowerCase() || null;
  const [phoneMatches, emailMatches] = await Promise.all([
    client
      .from("customers")
      .select("id, full_name, phone")
      .eq("phone", parsed.data.phone)
      .limit(3),
    email
      ? client
          .from("customers")
          .select("id, full_name, phone")
          .ilike("email", email)
          .limit(3)
      : Promise.resolve({ data: [] }),
  ]);
  const duplicateMatches = [
    ...(phoneMatches.data ?? []),
    ...(emailMatches.data ?? []),
  ].filter(
    (row, index, rows) => rows.findIndex((other) => other.id === row.id) === index,
  );
  const { data: customer, error } = await client
    .from("customers")
    .insert({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone,
      email,
      notes: parsed.data.notes || null,
    })
    .select("id, full_name, phone, email, status")
    .single();
  if (error) {
    if (error.code === "23505")
      return NextResponse.json(
        {
          error:
            "A customer with that email already exists. Check the possible duplicate before continuing.",
        },
        { status: 409 },
      );
    if (error.code === "42501")
      return NextResponse.json(
        { error: "The database denied this customer record write." },
        { status: 403 },
      );
    return NextResponse.json({ error: "Customer could not be saved." }, { status: 500 });
  }
  return NextResponse.json(
    { customer, duplicateWarning: duplicateMatches.length > 0, duplicateMatches },
    { status: 201 },
  );
}
