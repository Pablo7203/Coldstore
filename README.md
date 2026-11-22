# Grand Pa’s Cold Store

A responsive cold store application for customer ordering, pickup and delivery, staff point of sale, inventory, customer credit, and offline POS synchronisation. The application uses Next.js, TypeScript, Supabase, and Paystack test checkout.

## Requirements

- Node.js 22.16 or newer and pnpm 10.33.2
- A Supabase project with the migrations in `supabase/migrations/` applied
- A Paystack test secret key to enable online checkout

## Local setup

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
pnpm dev
```

Fill `.env.local` with the Supabase URL, publishable key, and server-only secret key. Set `NEXT_PUBLIC_SITE_URL` to the local origin printed by `pnpm dev`. Keep the Supabase secret, Paystack key, and SMTP password out of client code and Git. Email setup is described in [docs/EMAIL-SETUP.md](docs/EMAIL-SETUP.md).

To apply the schema to a new Supabase project:

```powershell
pnpm exec supabase login
pnpm exec supabase link --project-ref YOUR_PROJECT_REF
pnpm exec supabase db push --dry-run
pnpm exec supabase db push
```

The application requires a confirmed Supabase Auth identity to bootstrap the first administrator; see `scripts/bootstrap-admin.mjs`.

## Checks

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm build` uses Webpack because the current Windows Turbopack CSS worker fails on this workstation. SQL migrations are intentionally excluded from Prettier.

## Deployment

Set the variables in `.env.example` in Vercel for the intended environment. Use the hosted Supabase project keys, the public HTTPS deployment URL for `NEXT_PUBLIC_SITE_URL`, and a Paystack **test** key until checkout is verified. Configure the hosted Supabase Auth site URL and redirect URL for the deployment domain. Configure app SMTP and Supabase Auth SMTP on a verified sender domain before relying on external email delivery.

## Documentation

- [Product requirements](docs/PRD.md)
- [Technical architecture](docs/TECHNICAL-ARCHITECTURE.md)
- [Database and architecture diagrams](docs/architecture/README.md)
- [Email setup](docs/EMAIL-SETUP.md)
- [Test evidence](docs/evidence/)
