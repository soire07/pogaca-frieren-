# Frieren Owner Panel on Vercel

This repository remains the single source repository for Poğaça Frieren, Frieren AI, and the Owner Panel.

## Architecture

- Vercel serves the Frieren site hostname and reverse-proxies requests to the existing Poğaça Frieren HTTP service.
- The public homepage and account features require a signed site session created only through Discord OAuth. `/login` offers Discord sign-in; the first successful Discord sign-in creates a site account automatically. `/register`, password recovery, and email verification routes redirect to `/login`.
- `/owner` remains a separate owner-only area. A signed owner session is issued after Discord OAuth identity verification and an exact owner-ID allowlist check. Authenticator/TOTP enrollment and recovery-code steps are not required. Owner sessions remain signed, time-limited, and protected by HttpOnly, Secure, SameSite cookies; keep `ADMIN_SESSION_SECRET` private and stable.
- The main Node.js service continues to run the persistent Poğaça Frieren Discord client and supervises the Frieren AI child process.
- Neon PostgreSQL remains the database. Discord-to-site-account mapping is stored in `frieren_site_discord_accounts`; the mapping and account row are created transactionally on first OAuth sign-in. Existing RPG tables and records are not altered.
- Vercel does not run either persistent Discord Gateway client.

## Vercel project

- Repository: `soire07/pogaca-frieren-`
- Root directory: `./`
- Framework preset: `Other`
- Build command: leave unset (the Vercel project is acting as a reverse proxy, not building the Discord bot).
- Output directory: leave unset.
- All paths, including `/`, are proxied to the current main service by `vercel.json`; the app routes `/` to the Discord-gated member homepage and keeps `/owner` separate.

## Required OAuth hostname configuration

Configure these variables on the **main Poğaça Frieren Render service**:

- `OWNER_DASHBOARD_BASE_URL=https://frierenbot.vercel.app`
- `OWNER_DASHBOARD_REDIRECT_URI=https://frierenbot.vercel.app/owner/callback`
- `SITE_BASE_URL=https://frierenbot.vercel.app`
- `SITE_DISCORD_REDIRECT_URI=https://frierenbot.vercel.app/site/discord/callback`

Discord OAuth uses two independent callbacks. Add both exact redirect URIs to the Discord Developer Portal OAuth2 redirect list:

- `https://frierenbot.vercel.app/site/discord/callback` (public site sign-in)
- `https://frierenbot.vercel.app/owner/callback` (Owner Panel)

Keep `CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and `ADMIN_SESSION_SECRET` only in the main service's private environment. Public site sign-in requests only the Discord `identify` scope. `ADMIN_SESSION_SECRET` signs site and owner sessions and must remain stable. Owner Panel access still requires the exact server-side owner-ID allowlist; public Discord sign-in does not grant owner access. Do not add secrets to Vercel client-side variables or commit them to Git.

If the Vercel project hostname changes, update both callback URLs and the matching Discord Developer Portal redirect entries.
## Deployment safety

- Do not merge this change until the focused owner-panel test workflow passes.
- Do not change `DATABASE_URL`, Discord bot tokens, or AI provider credentials. The Discord-only site sign-in adds a dedicated Discord-account mapping table and site account rows; it does not alter existing RPG tables.
- Do not shut down the existing Render service; it is the current upstream runtime for the Vercel proxy.
- The Owner Panel manages existing owner operations and has independent Render health/status controls for Poğaça and Frieren AI. Render API credentials are server-side only and must remain separate: `RENDER_POGACA_API_KEY` (or legacy `RENDER_API_KEY`) for the Primary account and `RENDER_FRIEREN_AI_API_KEY` for the Frieren Bot account.
- Optional service IDs are `RENDER_POGACA_SERVICE_ID` and `RENDER_FRIEREN_AI_SERVICE_ID`. Do not share either account's API key with the browser or Discord.
- The AI workspace accepts a free-text test goal and forwards it over HTTPS to the separately hosted Frieren AI Render service using the shared private bridge secret. Configure `FRIEREN_AI_PUBLIC_URL` only if the service URL changes. It matches the goal against existing test files; it does not invent or write tests. Unmatched requests are stored as `NOT_TESTED`, never as PASS. Test history stores bounded summaries and file names, not raw output or secrets.
- `/owner/activity` provides paginated audit history, error summaries, and recent AI test runs. Memory search supports user, guild, and key filters; edits are validated and audited without storing the edited memory text in audit metadata.
- The PostgreSQL workspace is read-only for table previews and includes database size, server version, and connection counts. It does not expose private columns or provide direct SQL editing.
- The production Neon Free project currently has a six-hour point-in-time restore window. This is short-term recovery, not a long-term backup. The last external check found no snapshots and no snapshot schedule. Snapshot availability and pricing can change by plan, so verify them in Neon Console. The panel does not create snapshots or initiate production restores. Use Neon Console to restore to a separate branch, inspect it, and only then decide whether to promote it.
- Set `NEON_PROJECT_ID` on the main Render service if you want the database workspace to link directly to the Neon project. This value is an identifier, not a credential.
