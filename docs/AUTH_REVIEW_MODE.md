# Auth Review Mode

This app exposes password login by default and keeps email magic links available as a fallback for
teams that hit resend limits during review or testing.

## What stays true

- Password login is shown by default.
- Set `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=false` if you need a magic-link-only build.
- Client code uses only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Do not place a service-role key in client code.
- Do not add admin-bypass routes for reviewers.
- Secure server scoring also requires `SUPABASE_SERVICE_ROLE_KEY` in server environments only.

## Local environment variables

Add these values to `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=true
```

If you omit `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN`, the login page will expose both password and
magic-link sign-in. Set it to `false` only if you need to hide password login.

`SUPABASE_SERVICE_ROLE_KEY` is used only by the Next.js server route for secure round scoring.
Do not expose it to the client or rename it with a `NEXT_PUBLIC_` prefix.

## Vercel environment variables

In Vercel:

1. Open your project.
2. Go to `Settings`.
3. Click `Environment Variables`.
4. Add or confirm:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_APP_URL`
   - Optional: `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN` with value `false` if you want to hide password login
5. Save the variables.
6. Redeploy so the client bundle picks up the new public env values.

Use your production site URL for `NEXT_PUBLIC_APP_URL`, for example
`https://your-app.vercel.app`.

## Supabase dashboard settings

### Enable email auth with password support

In the Supabase dashboard:

1. Open your project.
2. In the left sidebar, click `Authentication`.
3. Click `Providers`.
4. Open the `Email` provider.
5. Make sure the provider is enabled.
6. Keep email-based auth enabled for magic links.
7. Turn on password sign-ins for the `Email` provider.
8. Save the provider settings.

### Confirm URL configuration

Still in `Authentication`:

1. Click `URL Configuration`.
2. Confirm `Site URL` matches your app base URL.
3. Add these redirect URLs as needed:
   - `http://localhost:3000/auth/callback`
   - `https://your-production-domain/auth/callback`
4. Save the URL configuration.

## Create a test user safely

Manual creation in the dashboard is fine for review mode.

1. Open your Supabase project.
2. Go to `Authentication`.
3. Click `Users`.
4. Click `Add user`.
5. Enter the reviewer email address.
6. Set a strong temporary password.
7. Mark the email as confirmed if you want password login to work immediately without inbox steps.
8. Create the user.
9. Share the credentials through your normal secure review channel, then rotate or remove the user after testing.

Notes:

- Keep test users separate from real users.
- Use temporary reviewer accounts, not personal production accounts.
- Remove or disable the account when the review cycle ends.

## Smoke test checklist

### Magic link login

1. Set `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=false`.
2. Open `/login` and confirm only the magic-link UI is visible.
3. Submit a valid email.
4. Confirm the success message appears.
5. Open the email link and verify the app lands on `/dashboard`.
6. Confirm `/auth/callback` completes sign-in without errors.

### Password login

1. Leave `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN` unset or set it to `true`.
2. Open `/login` and confirm the `Magic Link` and `Password` tabs are both visible.
3. Switch to `Password`.
4. Sign in with the pre-created reviewer account.
5. Confirm the app goes directly to `/dashboard`.
6. Try an invalid password and confirm the error state appears clearly.

### Core app flow regression pass

1. Create a session.
2. Join the session from the expected path.
3. Progress through rounds.
4. Open results and confirm there is no redirect loop back to decisions.
5. Confirm results are showing the intended round only.
6. Confirm scoring is stable and there are no duplicate points.
