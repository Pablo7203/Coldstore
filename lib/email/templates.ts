export type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

export type OrderEmailDetails = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  items: Array<{
    name: string;
    quantity: number;
    lineTotal: number;
  }>;
  fulfillmentMethod: "pickup" | "delivery";
  paymentMethod: "cash" | "external_momo" | "paystack" | "credit";
  paymentStatus: "unpaid" | "pending" | "paid" | "failed";
  deliveryAddress: string | null;
  deliveryArea: string | null;
  deliveryFee: number | null;
  trackingReference: string | null;
  estimatedAt: string | null;
  subtotal: number;
  total: number;
  siteUrl: string;
};

export type DeliveryEmailStage =
  "preparing" | "packed" | "out_for_delivery" | "delivered";

type LayoutOptions = {
  subject?: string;
  preheader: string;
  eyebrow: string;
  title: string;
  intro: string;
  bodyHtml?: string;
  bodyText?: string;
  actionLabel?: string;
  actionUrl?: string;
  closing?: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeHref(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return escapeHtml(url.toString());
  } catch {
    return "";
  }
}

function renderLayout(options: LayoutOptions): EmailTemplate {
  const safeActionUrl = options.actionUrl ? safeHref(options.actionUrl) : "";
  const actionHtml =
    safeActionUrl && options.actionLabel
      ? '<tr><td align="left" style="padding:26px 0 8px">' +
        '<a href="' +
        safeActionUrl +
        '" style="display:inline-block;background:#b7472a;border-radius:10px;color:#ffffff;font-size:15px;font-weight:700;line-height:20px;padding:14px 22px;text-decoration:none">' +
        escapeHtml(options.actionLabel) +
        "</a></td></tr>"
      : "";
  const actionText =
    safeActionUrl && options.actionLabel
      ? "\n\n" + options.actionLabel + ": " + options.actionUrl
      : "";
  const bodyHtml = options.bodyHtml ?? "";
  const bodyText = options.bodyText ? "\n\n" + options.bodyText : "";
  const closingHtml = options.closing
    ? '<tr><td style="padding:22px 0 0;color:#5e6b64;font-size:14px;line-height:22px">' +
      escapeHtml(options.closing) +
      "</td></tr>"
    : "";
  const closingText = options.closing ? "\n\n" + options.closing : "";

  const html = [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    "<title>" + escapeHtml(options.title) + "</title></head>",
    '<body style="margin:0;background:#f7f4ec;color:#1f2924;font-family:Arial,Helvetica,sans-serif">',
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">',
    escapeHtml(options.preheader),
    "</div>",
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f7f4ec;padding:28px 12px">',
    '<tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #d7e0d9;border-radius:16px;overflow:hidden">',
    '<tr><td style="background:#153c33;padding:22px 30px">',
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>',
    '<td align="center" valign="middle" width="42" height="42" style="width:42px;height:42px;background:#e6b94f;border-radius:12px;color:#153c33;font-size:16px;font-weight:800">GP</td>',
    '<td style="padding-left:12px;color:#ffffff;font-size:16px;font-weight:700;line-height:20px">Grand Pa’s',
    '<br><span style="color:#d9e8df;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase">Cold Store</span></td>',
    "</tr></table></td></tr>",
    '<tr><td style="padding:34px 32px 36px">',
    '<p style="margin:0 0 12px;color:#2f654f;font-size:11px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase">',
    escapeHtml(options.eyebrow),
    "</p>",
    '<h1 style="margin:0;color:#153c33;font-size:28px;line-height:35px;letter-spacing:-.5px">',
    escapeHtml(options.title),
    "</h1>",
    '<p style="margin:16px 0 0;color:#5e6b64;font-size:16px;line-height:25px">',
    escapeHtml(options.intro),
    "</p>",
    bodyHtml,
    actionHtml,
    closingHtml,
    "</td></tr>",
    '<tr><td style="border-top:1px solid #d7e0d9;padding:18px 30px;color:#5e6b64;font-size:12px;line-height:19px">',
    "Grand Pa’s Cold Store · Osu, Accra<br>",
    "Questions? Reply to this email and our team will help.",
    "</td></tr></table></td></tr></table></body></html>",
  ].join("");

  return {
    subject: options.subject ?? options.title,
    html,
    text:
      options.title +
      "\n" +
      options.intro +
      bodyText +
      actionText +
      closingText +
      "\n\nGrand Pa’s Cold Store · Osu, Accra",
  };
}

function formatMoney(amount: number) {
  return (
    "GHS " +
    amount.toLocaleString("en-GH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  }).format(date);
}

function renderOrderSummary(details: OrderEmailDetails) {
  const itemRows = details.items
    .map(
      (item) =>
        '<tr><td style="padding:11px 0;border-bottom:1px solid #e8ede9;color:#1f2924;font-size:14px;line-height:20px">' +
        escapeHtml(String(item.quantity)) +
        " × " +
        escapeHtml(item.name) +
        '</td><td align="right" style="padding:11px 0;border-bottom:1px solid #e8ede9;color:#1f2924;font-size:14px;font-weight:600;white-space:nowrap">' +
        escapeHtml(formatMoney(item.lineTotal)) +
        "</td></tr>",
    )
    .join("");
  const deliveryLine =
    details.fulfillmentMethod === "delivery"
      ? '<tr><td style="padding:10px 0;color:#5e6b64;font-size:14px">Delivery</td><td align="right" style="padding:10px 0;color:#5e6b64;font-size:14px;white-space:nowrap">' +
        escapeHtml(
          details.deliveryFee === null
            ? "To be confirmed"
            : formatMoney(details.deliveryFee),
        ) +
        "</td></tr>"
      : "";
  const fulfillment =
    details.fulfillmentMethod === "delivery"
      ? "Delivery to " +
        [details.deliveryAddress, details.deliveryArea].filter(Boolean).join(", ")
      : "Store pickup at Grand Pa’s Cold Store, Osu";
  const payment =
    details.paymentMethod === "cash"
      ? details.fulfillmentMethod === "delivery"
        ? "Cash on delivery"
        : "Cash at pickup"
      : details.paymentMethod === "paystack"
        ? details.paymentStatus === "paid"
          ? "Paid online with Paystack"
          : details.paymentStatus === "failed"
            ? "Paystack payment needs attention"
            : "Online payment pending"
        : details.paymentMethod === "external_momo"
          ? details.paymentStatus === "paid"
            ? "Paid by mobile money"
            : "Mobile money payment pending"
          : "Store credit";
  const paymentLine =
    '<tr><td style="padding:12px 0 0;color:#5e6b64;font-size:13px">Payment</td><td align="right" style="padding:12px 0 0;color:#153c33;font-size:13px;font-weight:700">' +
    escapeHtml(payment) +
    "</td></tr>";
  const html =
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;border-top:1px solid #d7e0d9;border-bottom:1px solid #d7e0d9">' +
    itemRows +
    '<tr><td style="padding:12px 0;color:#5e6b64;font-size:14px">Items subtotal</td><td align="right" style="padding:12px 0;color:#5e6b64;font-size:14px;white-space:nowrap">' +
    escapeHtml(formatMoney(details.subtotal)) +
    "</td></tr>" +
    deliveryLine +
    '<tr><td style="padding:14px 0;border-top:1px solid #d7e0d9;color:#153c33;font-size:15px;font-weight:700">Order total</td><td align="right" style="padding:14px 0;border-top:1px solid #d7e0d9;color:#153c33;font-size:15px;font-weight:700;white-space:nowrap">' +
    escapeHtml(formatMoney(details.total)) +
    "</td></tr>" +
    paymentLine +
    "</table>" +
    '<p style="margin:18px 0 0;padding:14px 16px;background:#eaf2f3;border-radius:10px;color:#1f2924;font-size:13px;line-height:21px"><strong style="color:#153c33">Fulfilment</strong><br>' +
    escapeHtml(fulfillment) +
    "</p>";
  const textItems = details.items
    .map(
      (item) =>
        String(item.quantity) + " × " + item.name + " — " + formatMoney(item.lineTotal),
    )
    .join("\n");
  const textDelivery =
    details.fulfillmentMethod === "delivery"
      ? "\nDelivery: " +
        (details.deliveryFee === null
          ? "To be confirmed"
          : formatMoney(details.deliveryFee))
      : "";
  const text =
    textItems +
    "\nItems subtotal: " +
    formatMoney(details.subtotal) +
    textDelivery +
    "\nOrder total: " +
    formatMoney(details.total) +
    "\nPayment: " +
    payment +
    "\nFulfilment: " +
    fulfillment;
  return { html, text };
}

export function createWelcomeEmail(fullName: string, shopUrl: string): EmailTemplate {
  const firstName = fullName.trim().split(/\s+/)[0] || "there";
  return renderLayout({
    subject: "Welcome to Grand Pa’s Cold Store",
    preheader: "Your Grand Pa’s Cold Store account is ready.",
    eyebrow: "Welcome to the store",
    title: "Good to have you, " + firstName + ".",
    intro:
      "Your account is ready. Browse the current selection, reserve what you need, and follow your orders from one place.",
    bodyHtml:
      '<p style="margin:20px 0 0;color:#5e6b64;font-size:15px;line-height:24px">We’ll keep your order updates clear and your checkout simple.</p>',
    bodyText: "Browse products and manage your orders from your account.",
    actionLabel: "Browse the store",
    actionUrl: shopUrl,
    closing: "Thank you for choosing Grand Pa’s Cold Store.",
  });
}

export function createOrderPlacedEmail(details: OrderEmailDetails): EmailTemplate {
  const summary = renderOrderSummary(details);
  const paystackNeedsAction =
    details.paymentMethod === "paystack" && details.paymentStatus !== "paid";
  const delivery = details.fulfillmentMethod === "delivery";
  return renderLayout({
    subject: "Order " + details.orderNumber + " received",
    preheader: "Order " + details.orderNumber + " has been received.",
    eyebrow: delivery ? "Delivery order received" : "Pickup order received",
    title: "We’ve received your order.",
    intro:
      "Hello " +
      details.customerName +
      ", order " +
      details.orderNumber +
      " is now in our system. Here is a clear summary for your records.",
    bodyHtml: summary.html,
    bodyText: summary.text,
    actionLabel: paystackNeedsAction ? "View order and payment" : "Track your order",
    actionUrl: details.siteUrl + "/account/orders",
    closing: paystackNeedsAction
      ? "Your items are reserved while online payment is completed. Open your orders to continue or retry payment."
      : delivery
        ? "We’ll email you as the team prepares and dispatches your delivery."
        : "We’ll let you know when your order is ready to collect.",
  });
}

export function createOrderPaidEmail(details: OrderEmailDetails): EmailTemplate {
  const summary = renderOrderSummary(details);
  return renderLayout({
    subject: "Payment confirmed for order " + details.orderNumber,
    preheader: "Payment for order " + details.orderNumber + " is confirmed.",
    eyebrow: "Payment confirmed",
    title: "Your payment went through.",
    intro:
      "Hello " +
      details.customerName +
      ", we’ve confirmed your Paystack payment for order " +
      details.orderNumber +
      ".",
    bodyHtml: summary.html,
    bodyText: summary.text,
    actionLabel: "View your order",
    actionUrl: details.siteUrl + "/account/orders",
    closing:
      details.fulfillmentMethod === "delivery"
        ? "We’ll keep you updated as your delivery moves through preparation and dispatch."
        : "Your order is reserved for store pickup. We’ll let you know when it is ready.",
  });
}

export function createDeliveryUpdateEmail(
  details: OrderEmailDetails,
  stage: DeliveryEmailStage,
): EmailTemplate {
  const statusCopy: Record<
    DeliveryEmailStage,
    { eyebrow: string; title: string; intro: string }
  > = {
    preparing: {
      eyebrow: "Delivery update",
      title: "We’re preparing your order.",
      intro: "Our team has started preparing order " + details.orderNumber + ".",
    },
    packed: {
      eyebrow: "Ready for dispatch",
      title: "Your order is packed.",
      intro:
        "Order " + details.orderNumber + " has been packed and is ready for dispatch.",
    },
    out_for_delivery: {
      eyebrow: "On the way",
      title: "Your delivery is on its way.",
      intro:
        "Order " + details.orderNumber + " has left the store and is on its way to you.",
    },
    delivered: {
      eyebrow: "Delivery complete",
      title: "Your order has been delivered.",
      intro:
        "Order " +
        details.orderNumber +
        " has been marked as delivered. Thank you for shopping with us.",
    },
  };
  const status = statusCopy[stage];
  const trackingRows = [
    details.trackingReference
      ? '<tr><td style="padding:10px 0;color:#5e6b64;font-size:14px">Tracking reference</td><td align="right" style="padding:10px 0;color:#153c33;font-size:14px;font-weight:700">' +
        escapeHtml(details.trackingReference) +
        "</td></tr>"
      : "",
    details.estimatedAt
      ? '<tr><td style="padding:10px 0;color:#5e6b64;font-size:14px">Estimated arrival</td><td align="right" style="padding:10px 0;color:#153c33;font-size:14px;font-weight:700">' +
        escapeHtml(formatDate(details.estimatedAt)) +
        "</td></tr>"
      : "",
  ].join("");
  const trackingHtml = trackingRows
    ? '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;border-top:1px solid #d7e0d9;border-bottom:1px solid #d7e0d9">' +
      trackingRows +
      "</table>"
    : "";
  const trackingText = [
    details.trackingReference ? "Tracking reference: " + details.trackingReference : "",
    details.estimatedAt ? "Estimated arrival: " + formatDate(details.estimatedAt) : "",
  ]
    .filter(Boolean)
    .join("\n");

  return renderLayout({
    subject: "Delivery update for order " + details.orderNumber,
    preheader: status.title + " Order " + details.orderNumber + ".",
    eyebrow: status.eyebrow,
    title: status.title,
    intro: status.intro,
    bodyHtml: trackingHtml,
    bodyText: trackingText,
    actionLabel: stage === "delivered" ? "View order details" : "Track your delivery",
    actionUrl: details.siteUrl + "/account/orders",
    closing:
      stage === "delivered"
        ? "We hope everything arrived in good condition. Reply to this email if you need help."
        : "We’ll send another update when there is a meaningful change.",
  });
}

export function createPickupReadyEmail(details: OrderEmailDetails): EmailTemplate {
  const summary = renderOrderSummary(details);
  return renderLayout({
    subject: "Order " + details.orderNumber + " is ready for pickup",
    preheader: "Order " + details.orderNumber + " is ready for pickup.",
    eyebrow: "Ready for collection",
    title: "Your order is ready.",
    intro:
      "Hello " +
      details.customerName +
      ", order " +
      details.orderNumber +
      " is ready to collect from Grand Pa’s Cold Store in Osu.",
    bodyHtml: summary.html,
    bodyText: summary.text,
    actionLabel: "View order details",
    actionUrl: details.siteUrl + "/account/orders",
    closing:
      details.paymentStatus === "paid"
        ? "Your online payment is confirmed. Show your order number to the store team when you arrive."
        : "If you chose cash, payment is due when you collect your order.",
  });
}
