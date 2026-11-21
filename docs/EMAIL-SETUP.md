# Customer email setup

The application prepares branded transactional messages for customer signup,
order placement, Paystack payment confirmation, pickup readiness, and delivery
tracking updates. App messages use the Resend email API. Missing email settings
disable sending safely; an email provider failure does not undo a signup,
payment, or order update.

## Application email settings

Add these server-only values to .env.local after creating a Resend account and
verifying the sender domain:

    RESEND_API_KEY=re_...
    EMAIL_FROM=Grand Pa's Cold Store <orders@example.com>
    EMAIL_REPLY_TO=support@example.com
    NEXT_PUBLIC_SITE_URL=http://localhost:3000

Use the actual development URL and port for local testing. In deployment,
NEXT_PUBLIC_SITE_URL must be the public HTTPS origin so the email buttons point
back to the deployed store. Never add NEXT_PUBLIC_ to the Resend key.

Replace example.com with a domain verified in Resend. EMAIL_REPLY_TO is
optional. Restart the Next.js server after changing environment values.

## Supabase account confirmation

supabase/templates/confirmation.html contains the branded confirmation message,
and supabase/config.toml points the local Auth confirmation template to it.
Local email confirmations remain disabled for the existing development flow,
so local Supabase can continue using its email catcher when started.

For a hosted Supabase project, copy the same HTML into the Authentication email
template for signup confirmation. Configure custom SMTP in Supabase before
enabling email confirmations. With Resend, use host smtp.resend.com, port 465,
username resend, and a Resend API key as the SMTP password. Use a verified
sender address such as accounts@example.com. The default Supabase mail service
is intended for limited testing, not normal customer use.

Keep the application sender and authentication sender as separate addresses,
for example orders@example.com and accounts@example.com, on your verified
domain. This keeps order delivery and login/confirmation traffic easy to
identify and manage.

## Messages currently prepared

- Welcome message after a customer account is created or its signup link is
  confirmed.
- Order receipt with item lines, fulfilment method, total, and payment state.
- Payment receipt after Paystack verification succeeds.
- Pickup-ready notice.
- Delivery updates when staff move an order through preparation, packing,
  dispatch, and delivery completion. Tracking reference and estimated arrival
  are included when staff have set them.

Order and delivery email keys are deterministic so a callback retry does not
send duplicate messages. Resend retains idempotency keys for 24 hours; the
database also limits normal delivery stages to a single forward transition.

## Delivery setup checklist

1. Verify the sender domain in Resend.
2. Add the server-only Resend and sender values to .env.local.
3. Set NEXT_PUBLIC_SITE_URL to the active local or deployed origin.
4. Configure Supabase SMTP and the signup confirmation template when setting up
   hosted Supabase authentication.
5. Send a signup, cash order, Paystack test order, pickup-ready update, and each
   delivery stage to a mailbox you control. Check both the delivered email and
   the provider delivery log.
