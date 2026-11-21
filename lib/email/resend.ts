import "server-only";

import { getServerEnvironment } from "@/lib/env";

export function isTransactionalEmailConfigured() {
  try {
    const environment = getServerEnvironment();
    return Boolean(environment.RESEND_API_KEY && environment.EMAIL_FROM);
  } catch {
    return false;
  }
}

export type TransactionalEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
};

/**
 * Sends one transactional message through Resend.
 * Missing configuration and provider errors are logged without exposing email
 * addresses, order details, credentials, or provider response bodies.
 */
export async function sendTransactionalEmail(
  event: string,
  message: TransactionalEmail,
): Promise<boolean> {
  try {
    const environment = getServerEnvironment();
    if (!environment.RESEND_API_KEY || !environment.EMAIL_FROM) {
      console.info("[email] " + event + " skipped: email provider is not configured");
      return false;
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: {
        authorization: "Bearer " + environment.RESEND_API_KEY,
        "content-type": "application/json",
        "Idempotency-Key": message.idempotencyKey,
      },
      body: JSON.stringify({
        from: environment.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(environment.EMAIL_REPLY_TO ? { reply_to: environment.EMAIL_REPLY_TO } : {}),
      }),
    });

    if (!response.ok) {
      console.error("[email] " + event + " failed with HTTP " + response.status);
      return false;
    }

    console.info("[email] " + event + " sent");
    return true;
  } catch {
    console.error("[email] " + event + " could not be sent");
    return false;
  }
}
