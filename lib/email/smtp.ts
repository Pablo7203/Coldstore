import "server-only";

import { createHash } from "node:crypto";
import nodemailer from "nodemailer";
import { getServerEnvironment } from "@/lib/env";

function getSmtpConfiguration() {
  try {
    const environment = getServerEnvironment();
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM } = environment;
    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD || !EMAIL_FROM) {
      return null;
    }

    return {
      SMTP_HOST,
      SMTP_PORT,
      SMTP_USER,
      SMTP_PASSWORD,
      EMAIL_FROM,
      EMAIL_REPLY_TO: environment.EMAIL_REPLY_TO,
    };
  } catch {
    return null;
  }
}

export function isTransactionalEmailConfigured() {
  return getSmtpConfiguration() !== null;
}

export type TransactionalEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
};

function makeMessageId(idempotencyKey: string) {
  const digest = createHash("sha256").update(idempotencyKey).digest("hex");
  return `<${digest}@grandpacoldstore.com>`;
}

/** Sends one transactional message through the configured SMTP server. */
export async function sendTransactionalEmail(
  event: string,
  message: TransactionalEmail,
): Promise<boolean> {
  const environment = getSmtpConfiguration();
  if (!environment) {
    console.info("[email] " + event + " skipped: SMTP is not configured");
    return false;
  }

  const transport = nodemailer.createTransport({
    host: environment.SMTP_HOST,
    port: environment.SMTP_PORT,
    secure: environment.SMTP_PORT === 465,
    auth: {
      user: environment.SMTP_USER,
      pass: environment.SMTP_PASSWORD,
    },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });

  try {
    await transport.sendMail({
      from: environment.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      messageId: makeMessageId(message.idempotencyKey),
      ...(environment.EMAIL_REPLY_TO ? { replyTo: environment.EMAIL_REPLY_TO } : {}),
    });

    console.info("[email] " + event + " sent");
    return true;
  } catch {
    // SMTP errors can contain credentials or recipient details; keep logs generic.
    console.error("[email] " + event + " could not be sent");
    return false;
  } finally {
    transport.close();
  }
}
