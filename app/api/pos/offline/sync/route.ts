import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthContext } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

const decimal = z.string().regex(/^\d+(?:\.\d{1,3})?$/u);
const money = z.string().regex(/^\d+(?:\.\d{1,2})?$/u);
const offlineSaleInput = z.object({
  cashierUserId: z.uuid(),
  clientOperationId: z.uuid(),
  occurredAt: z.iso.datetime({ offset: true }),
  items: z
    .array(
      z.object({
        productId: z.uuid(),
        productName: z.string().trim().min(1).max(160),
        sku: z.string().max(120).nullable(),
        unitPrice: money,
        quantity: decimal,
        lineTotal: money,
      }),
    )
    .min(1)
    .max(100),
});

export async function POST(request: Request) {
  const client = await createClient();
  const context = await resolveAuthContext(client);
  if (context?.type !== "staff") {
    return NextResponse.json(
      { error: "Sign in as the cashier who recorded this sale to sync it." },
      { status: 401 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = offlineSaleInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the offline sale." },
      { status: 400 },
    );
  }
  if (parsed.data.cashierUserId !== context.userId) {
    const { data: canReview } = await client.rpc("has_permission", {
      requested_permission: "resolve_conflicts",
    });
    if (!canReview) {
      return NextResponse.json(
        {
          error: "Only an authorised manager can submit another cashier’s offline sale.",
        },
        { status: 403 },
      );
    }
  }

  const { data, error } = await client.rpc("sync_offline_pos_sale", {
    p_cashier_user_id: parsed.data.cashierUserId,
    p_client_operation_id: parsed.data.clientOperationId,
    p_occurred_at: parsed.data.occurredAt,
    p_items: parsed.data.items.map((item) => ({
      product_id: item.productId,
      product_name_snapshot: item.productName,
      sku_snapshot: item.sku,
      unit_price: item.unitPrice,
      quantity: item.quantity,
      line_total: item.lineTotal,
    })),
  });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "22023" ? 400 : 500;
    return NextResponse.json(
      {
        error:
          status === 403
            ? "Your role cannot sync this sale."
            : "The offline sale could not be synced yet.",
      },
      { status },
    );
  }
  const result = data?.[0];
  if (!result) {
    return NextResponse.json(
      { error: "The sync result could not be confirmed." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    status: result.operation_status,
    saleId: result.synced_sale_id,
    receiptNumber: result.synced_receipt_number,
    conflictReasons: result.conflicts,
  });
}
