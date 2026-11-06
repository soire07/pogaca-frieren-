# Frieren public site authentication

Public site access uses Discord OAuth only. There is no public username/password registration, email verification, password reset, or email delivery requirement.

## Required Render environment variables

- `CLIENT_ID`: existing Discord application client ID.
- `DISCORD_CLIENT_SECRET`: existing Discord OAuth client secret.
- `ADMIN_SESSION_SECRET`: existing stable signing secret (at least 32 characters).
- `SITE_BASE_URL`: canonical public site origin; defaults to `https://frierenbot.vercel.app`.
- `SITE_DISCORD_REDIRECT_URI`: optional explicit callback URL; defaults to `OWNER_DASHBOARD_BASE_URL/discord/callback` when that value exists, otherwise `SITE_BASE_URL/discord/callback`.

Register the exact callback URL in the Discord Developer Portal under OAuth2 Redirects. For the production site, the expected URL is `https://frierenbot.vercel.app/discord/callback` unless `SITE_DISCORD_REDIRECT_URI` is explicitly configured.

## Account behavior

- The only public sign-in action is **Discord ile giriş yap**.
- Discord OAuth requests only the `identify` scope; no guild permissions are requested.
- First successful sign-in creates a site account automatically and maps it to the Discord user ID.
- Later sign-ins reuse the same site account.
- A signed, time-limited, HttpOnly, Secure, SameSite=Lax session cookie is issued after OAuth identity verification.
- OAuth state is signed, short-lived, and bound to an HttpOnly cookie to prevent login CSRF.
- Existing site accounts and RPG data are not deleted or migrated by this change. Existing email/password routes redirect to the Discord sign-in page.
- Synthetic internal email/password fields are generated only to satisfy the legacy account table schema; they are not shown, sent, or usable for login. The Discord mapping is the authentication source of truth.
- Owner Panel remains separately protected by its existing Discord OAuth owner-ID allowlist and signed owner session.

Do not rotate `ADMIN_SESSION_SECRET` casually. Never commit Discord credentials or database URLs.
