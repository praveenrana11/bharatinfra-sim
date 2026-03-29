# BharatInfra Sim

## Getting Started

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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
