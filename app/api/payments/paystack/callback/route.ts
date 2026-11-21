import { NextResponse, type NextRequest } from "next/server";
import { sendOrderPaidEmail } from "@/lib/email/notifications";
import { verifyAndRecordPaystackPayment } from "@/lib/payments/paystack";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference")?.trim();
  if (!reference || reference.length > 80) {
    return NextResponse.redirect(new URL("/account/orders?payment=missing", request.url));
  }

  try {
    const result = await verifyAndRecordPaystackPayment(reference);
    if (!result.orderId) {
      return NextResponse.redirect(
        new URL("/account/orders?payment=unknown", request.url),
      );
    }
    if (result.status === "success") {
      await sendOrderPaidEmail(result.orderId);
    }
    return NextResponse.redirect(
      new URL(
        `/account/orders?payment=${result.status}&order=${encodeURIComponent(result.orderId)}`,
        request.url,
      ),
    );
  } catch {
    // The webhook can complete a temporarily unavailable verification later.
    const { findPaystackOrder } = await import("@/lib/payments/paystack");
    const attempt = await findPaystackOrder(reference).catch(() => null);
    if (!attempt) {
      return NextResponse.redirect(
        new URL("/account/orders?payment=review", request.url),
      );
    }
    return NextResponse.redirect(
      new URL(
        `/account/orders?payment=review&order=${encodeURIComponent(attempt.order_id)}`,
        request.url,
      ),
    );
  }
}
