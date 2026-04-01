# BharatInfra Sim

## Getting Started

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

Secure round scoring is server-only. Local and deployed environments must include:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=true
```

If `SUPABASE_SERVICE_ROLE_KEY` is missing, locking a round will fail when the app tries to write
secure scoring results to `team_results`.

## Auth Review Mode

Reviewer-friendly password login is available by default. To hide it and keep a magic-link-only
experience, set:

```env
NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=false
```

Magic link remains available as a fallback path. Full setup instructions live in
[`docs/AUTH_REVIEW_MODE.md`](docs/AUTH_REVIEW_MODE.md).

## Scripts

- `npm run dev`
- `npm run build`
- `npm run lint`
