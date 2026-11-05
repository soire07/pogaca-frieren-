# Frieren public site account authentication

Public site membership uses a username and password. Owner Panel authentication remains separate and uses Discord OAuth with a server-side owner-ID allowlist. Authenticator/TOTP is not required.

## Required Render environment variables

Set these on the **Poğaça Frieren web service** (the service that handles `frierenbot.vercel.app` requests):

- `SITE_SMTP_USER`: the site's Gmail address, e.g. `frieren.portal@gmail.com`.
- `SITE_SMTP_APP_PASSWORD`: a Google App Password for that Gmail account. Do not use the normal Gmail password.
- `SITE_EMAIL_FROM`: optional sender address; defaults to `SITE_SMTP_USER`.
- `SITE_BASE_URL`: optional public origin; defaults to `https://frierenbot.vercel.app`.

The existing `ADMIN_SESSION_SECRET` must remain configured and must not be rotated casually. It signs public-site sessions and CSRF tokens.

## Gmail setup

1. Create and verify the dedicated Gmail account.
2. Enable Google's 2-Step Verification for that account.
3. Create an App Password in the Google Account security settings.
4. Add the app password to Render as `SITE_SMTP_APP_PASSWORD`; remove spaces when entering it.
5. Add the sender address as `SITE_SMTP_USER` and optionally `SITE_EMAIL_FROM`.
6. Save the environment changes and wait for the Render service to restart.

Never commit the App Password to GitHub or send it in chat.

## Account behavior

- Registration requires a unique username, email address, password and matching password confirmation.
- Passwords are stored as salted scrypt hashes; plaintext passwords are never stored.
- New accounts must verify their email before login.
- Verification links expire after 24 hours and can be re-sent at `/resend-verification`.
- Password reset links are single-use and expire after 30 minutes.
- Reset requests use a generic response to avoid revealing whether an email address has an account.
- Forms use signed, time-limited CSRF tokens; authentication cookies are HttpOnly, Secure and SameSite=Lax.
- Basic per-IP request throttling is applied to registration, login, verification resend and reset flows.

The legacy `frieren_site_members` Discord membership table is retained for data preservation, but new public registration and login no longer use Discord OAuth. Owner Panel sign-in continues to use Discord OAuth and a signed owner session, without a TOTP enrollment or verification step.

## Owner account presentation

After the owner creates and verifies the new site account, add its exact `site_<UUID>` identifier to the Render environment variable `FRIEREN_OWNER_ACCOUNT_IDS` on the primary `pogaca-frieren` service. Preserve existing IDs as a comma-separated list if the variable already contains any.

This allowlist controls only the account's Owner profile identity: the OWNER badge, the fixed `Kurucu · Owner` title, the animated blood-red XP bar and the exclusive Owner profile frame. Owner identity takes precedence over VIP presentation; an account on both lists is rendered as Owner, never VIP.

`FRIEREN_OWNER_ACCOUNT_IDS` does **not** grant access to Owner Panel or change Discord permissions. Owner Panel continues to require the existing Discord OAuth owner-ID check and signed owner session. Never add an account based only on its username; use the verified account UUID from the production account record.
