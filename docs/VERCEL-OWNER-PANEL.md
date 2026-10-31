# Frieren Owner Panel on Vercel

This repository remains the single source repository for Poğaça Frieren, Frieren AI, and the Owner Panel.

## Architecture

- Vercel serves the Frieren site hostname and reverse-proxies requests to the existing Poğaça Frieren HTTP service.
- The public homepage, bot introduction pages, and site GIF assets require a signed Discord member session; the existing OAuth callback creates that session for any authenticated Discord account.
- `/owner` remains a separate owner-only area. A second signed owner session is issued only when the Discord user ID matches the configured owner ID.
- The main Node.js service continues to run the persistent Poğaça Frieren Discord client and supervises the Frieren AI child process.
- Neon PostgreSQL remains the database. No database migration is performed by this deployment.
- Vercel does not run either persistent Discord Gateway client.

## Vercel project

- Repository: `soire07/pogaca-frieren-`
- Root directory: `./`
- Framework preset: `Other`
- Build command: leave unset (the Vercel project is acting as a reverse proxy, not building the Discord bot).
- Output directory: leave unset.
- All paths, including `/`, are proxied to the current main service by `vercel.json`; the app routes `/` to the Discord-gated member homepage and keeps `/owner` separate.

## Required OAuth hostname configuration

Before using the Vercel hostname, configure these variables on the **main Poğaça Frieren service**:

- `OWNER_DASHBOARD_BASE_URL=https://frierenbot.vercel.app`
- `OWNER_DASHBOARD_REDIRECT_URI=https://frierenbot.vercel.app/owner/callback`

The existing OAuth callback is shared by the member site and Owner Panel. Add this exact redirect URI to the Discord Developer Portal OAuth2 redirect list:

`https://frierenbot.vercel.app/owner/callback`

Keep `CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and `ADMIN_SESSION_SECRET` only in the main service's private environment. `ADMIN_SESSION_SECRET` must be at least 32 characters. Do not add secrets to Vercel client-side variables or commit them to Git.

If the Vercel project has not yet been assigned `frierenbot.vercel.app`, replace the hostname in both environment variables and the Discord redirect list with the actual assigned hostname.

## Deployment safety

- Do not merge this change until the focused owner-panel test workflow passes.
- Do not change `DATABASE_URL`, Discord bot tokens, AI provider credentials, or production database schemas as part of the Vercel panel setup.
- Do not shut down the existing Render service; it is the current upstream runtime for the Vercel proxy.
- The panel currently manages the main bot's existing owner operations and displays independent health status for Frieren AI. Start/stop/restart controls for both persistent services require a separately authenticated service-management API and are not enabled by this proxy configuration alone.
