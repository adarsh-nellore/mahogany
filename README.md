This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Supabase Auth: Signup → Onboarding Flow

For the desired flow (sign up → sign in → onboarding, no email confirmation gate):

1. In **Supabase Dashboard** → **Authentication** → **Providers** → **Email**, turn off **"Confirm email"**.
2. With confirmation disabled, new users sign up, are auto-signed in, and go straight to onboarding.
3. If you keep confirmation enabled, the verification link redirects to `/auth/callback?next=/onboarding` so users land on onboarding after confirming.

### Feed Seeding (Supabase)

To populate the feed with stories, run (with the dev server running):

```bash
npm run seed-feed
```

This runs the ingestion pipeline (RSS + API) and feed generation. For deployed apps, use `BASE_URL=https://your-app.vercel.app npm run seed-feed`.

### Vercel Crons (Production)

When deployed on Vercel, cron jobs in `vercel.json` run automatically. Ensure `DATABASE_URL` in Vercel project settings points to your Supabase connection string so crons populate the correct database.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
