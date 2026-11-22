# Customer email setup

The application prepares branded transactional messages for customer signup,
order placement, Paystack payment confirmation, pickup readiness, and delivery
tracking updates. The app sends these messages directly through the configured
SMTP server. Missing SMTP settings disable sending safely; an email provider
failure does not undo a signup, payment, or order update.

## Application SMTP settings

Add these server-only values to `.env.local` for local development and to the
Vercel Production environment for the deployed store:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-mailbox@GrandPacoldstore.com
SMTP_PASSWORD=your-google-app-password
EMAIL_FROM="Grand Pa's Cold Store <order@GrandPacoldstore.com>"
EMAIL_REPLY_TO=your-monitored-mailbox@GrandPacoldstore.com
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Use the SMTP server's actual username and password. For Gmail, use a Google App
Password rather than the account's normal password. Keep `SMTP_PASSWORD` in the
Vercel Secret environment variable type. `SMTP_USER` should also be treated as
secret. Never add `NEXT_PUBLIC_` to SMTP credentials.

Supabase stores its Auth SMTP credentials separately and does not expose them
to the Next.js application. If the app should use the same SMTP account, enter
the SMTP username and password into Vercel too. The app connects directly to
the SMTP server; it does not send through Supabase Auth.

For Gmail, port 465 uses a direct TLS connection. Port 587 can be used with
STARTTLS. Vercel blocks outbound port 25, so do not configure port 25. The send
is awaited in the application request so the Vercel function does not stop
before SMTP finishes.

The Supabase dashboard currently warns that Gmail SMTP is intended for
personal rather than transactional messages. It can be adequate for a low-
volume academic demonstration, but may have weaker delivery and sending limits
for real customer traffic. Use the actual HTTPS deployment origin for
`NEXT_PUBLIC_SITE_URL` so email buttons link back to the live store.

## Supabase Auth email

Supabase Auth sends signup confirmation, password reset, magic link, and email
change messages through its separately configured custom SMTP server.
`supabase/templates/confirmation.html` contains the branded local confirmation
message. For hosted Supabase, configure the Auth templates and SMTP settings in
the Supabase dashboard. The local email catcher remains available for local
development.

## Messages currently prepared

- Welcome message after a customer account is created or its signup link is
  confirmed.
- Order receipt with item lines, fulfilment method, total, and payment state.
- Payment receipt after Paystack verification succeeds.
- Pickup-ready notice.
- Delivery updates when staff move an order through preparation, packing,
  dispatch, and delivery completion. Tracking reference and estimated arrival
  are included when staff have set them.

Each message uses a stable `Message-ID` derived from its notification key to
help mail clients group repeated attempts. SMTP does not provide a delivery
idempotency guarantee, so a provider retry after an ambiguous network failure
could still deliver a duplicate message.

## Delivery setup checklist

1. Verify the sending domain with the SMTP provider and configure its SPF,
   DKIM, and DMARC records.
2. Add `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and
   `EMAIL_FROM` to Vercel Production. Add `EMAIL_REPLY_TO` only if there is a
   mailbox that staff monitor.
3. Set `NEXT_PUBLIC_SITE_URL` to the active local or deployed origin.
4. Keep Supabase Auth SMTP configured separately for account emails.
5. Send signup, cash order, Paystack test order, pickup-ready, and delivery
   stage messages to a mailbox you control. Check the mailbox and SMTP provider
   delivery logs.
