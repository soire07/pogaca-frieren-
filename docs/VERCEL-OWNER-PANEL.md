# Frieren Owner Panel on Vercel

This repository remains the single source repository for Poğaça Frieren, Frieren AI, and the Owner Panel.

## Architecture

- Vercel serves the Frieren site hostname and reverse-proxies requests to the existing Poğaça Frieren HTTP service.
- The public homepage, bot introduction pages, and site assets require a signed Discord member session. `/register` creates a persistent site membership for a Discord account; `/login` accepts only an account already present in `frieren_site_members`.
- `/owner` remains a separate owner-only area. A second signed owner session is issued only when the Discord user ID matches the configured owner ID.
- The main Node.js service continues to run the persistent Poğaça Frieren Discord client and supervises the Frieren AI child process.
- Neon PostgreSQL remains the database. The site-membership table is created additively on the first registration or login; existing RPG tables and records are not altered.
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
- Do not change `DATABASE_URL`, Discord bot tokens, or AI provider credentials. The site registration flow adds only the dedicated `frieren_site_members` table and does not alter existing RPG tables.
- Do not shut down the existing Render service; it is the current upstream runtime for the Vercel proxy.
- The Owner Panel manages existing owner operations and has independent Render health/status controls for Poğaça and Frieren AI. Render API credentials are server-side only and must remain separate: `RENDER_POGACA_API_KEY` (or legacy `RENDER_API_KEY`) for the Primary account and `RENDER_FRIEREN_AI_API_KEY` for the Frieren Bot account.
- Optional service IDs are `RENDER_POGACA_SERVICE_ID` and `RENDER_FRIEREN_AI_SERVICE_ID`. Do not share either account's API key with the browser or Discord.
- The AI workspace accepts a free-text test goal and forwards it over HTTPS to the separately hosted Frieren AI Render service using the shared private bridge secret. Configure `FRIEREN_AI_PUBLIC_URL` only if the service URL changes. It matches the goal against existing test files; it does not invent or write tests. Unmatched requests are stored as `NOT_TESTED`, never as PASS. Test history stores bounded summaries and file names, not raw output or secrets.
- `/owner/activity` provides paginated audit history, error summaries, and recent AI test runs. Memory search supports user, guild, and key filters; edits are validated and audited without storing the edited memory text in audit metadata.
- The PostgreSQL workspace is read-only for table previews and includes database size, server version, and connection counts. It does not expose private columns or provide direct SQL editing.
- The production Neon Free project currently has a six-hour point-in-time restore window. This is short-term recovery, not a long-term backup. The last external check found no snapshots and no snapshot schedule. Snapshot availability and pricing can change by plan, so verify them in Neon Console. The panel does not create snapshots or initiate production restores. Use Neon Console to restore to a separate branch, inspect it, and only then decide whether to promote it.
- Set `NEON_PROJECT_ID` on the main Render service if you want the database workspace to link directly to the Neon project. This value is an identifier, not a credential.
