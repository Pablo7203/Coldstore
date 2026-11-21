import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const saleInput = z
  .object({
    clientOperationId: z.uuid(),
    items: z
      .array(
        z.object({
          productId: z.uuid(),
          quantity: z.string().regex(/^\d+(?:\.\d{1,3})?$/u),
        }),
      )
      .min(1)
      .max(100),
    paymentMethod: z.enum(["cash", "external_momo"]),
    customerId: z.uuid().nullable().optional(),
    momoReference: z.string().trim().max(120).optional(),
  })
  .superRefine((value, context) => {
    if (value.paymentMethod === "external_momo" && value.momoReference === "") {
      context.addIssue({
        code: "custom",
        path: ["momoReference"],
        message: "Enter a valid MoMo reference or leave it blank.",
      });
    }
  });

export async function POST(request: Request) {
  const client = await createClient();
  const body: unknown = await request.json().catch(() => null);
  const parsed = saleInput.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the sale." },
      { status: 400 },
    );
  const { data, error } = await client.rpc("complete_pos_sale", {
    p_client_operation_id: parsed.data.clientOperationId,
    p_items: parsed.data.items.map(({ productId, quantity }) => ({
      product_id: productId,
      quantity,
    })),
    p_payment_method: parsed.data.paymentMethod,
    ...(parsed.data.customerId ? { p_customer_id: parsed.data.customerId } : {}),
    ...(parsed.data.paymentMethod === "external_momo" && parsed.data.momoReference
      ? { p_momo_reference: parsed.data.momoReference }
      : {}),
  });
  if (error) {
    const message = error.message ?? "";
    const status =
      error.code === "42501"
        ? 403
        : error.code === "23514"
          ? 409
          : error.code === "P0002"
            ? 409
            : 400;
    const safeMessage = message.includes("Insufficient stock for")
      ? message.replace(/^.*?Insufficient stock for /u, "Insufficient stock for ")
      : error.code === "42501"
        ? "You are not authorized to complete this sale."
        : error.code === "P0002"
          ? "A selected product or customer is unavailable. Refresh and try again."
          : error.code === "23514"
            ? "Stock changed and is insufficient for this sale. No items were sold."
            : "Sale could not be completed. No changes were saved.";
    return NextResponse.json({ error: safeMessage }, { status });
  }
  const sale = data?.[0];
  if (!sale)
    return NextResponse.json({ error: "Sale could not be confirmed." }, { status: 500 });
  return NextResponse.json({ sale }, { status: 201 });
}
