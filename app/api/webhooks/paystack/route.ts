import { NextResponse, type NextRequest } from "next/server";
import { sendOrderPaidEmail } from "@/lib/email/notifications";
import {
  hasValidPaystackSignature,
  verifyAndRecordPaystackPayment,
} from "@/lib/payments/paystack";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!hasValidPaystackSignature(rawBody, request.headers.get("x-paystack-signature"))) {
    return NextResponse.json({ received: false }, { status: 401 });
  }

  let event: { event?: string; data?: { reference?: string } };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return NextResponse.json({ received: false }, { status: 400 });
  }

  if (event.event !== "charge.success") {
    return NextResponse.json({ received: true });
  }
  const reference = event.data?.reference;
  if (!reference) return NextResponse.json({ received: false }, { status: 400 });

  try {
    const result = await verifyAndRecordPaystackPayment(reference);
    if (result.status === "success" && result.orderId) {
      await sendOrderPaidEmail(result.orderId);
    }
    return NextResponse.json({ received: true });
  } catch {
    // A non-2xx response asks Paystack to retry transient verification failures.
    return NextResponse.json({ received: false }, { status: 503 });
  }
}
