# Frieren isolated Discord test lab

This guide configures a safe staging guild before enabling live command testing.

## Current capability boundary

The Frieren test bot can run repository checks and report what they cover. A bot account cannot create a normal user slash-command interaction against another application's commands. Do not use a user token, self-bot, or browser-cookie automation. Live end-to-end testing of the game's slash commands needs a supported, authorized test-client workflow or a human test operator; until that exists, reports must label API checks and code tests separately.

## 1. Create the staging guild

1. Create a Discord server named `Frieren Test Lab`.
2. Invite the main Frieren RPG bot and the Frieren test bot to this server.
3. Keep real players out of this server.
4. Use a dedicated test character/database if the game supports it. If the bot shares a production database, do not run commands that spend currency, consume items, reset progress, ban users, or otherwise mutate player state.

## 2. Invite and permission the test bot

In Discord Developer Portal → the test bot application → OAuth2 → URL Generator:
- Scopes: `bot`, `applications.commands`
- Bot permissions: `View Channels`, `Send Messages`, `Read Message History`, `Attach Files`, `Use Application Commands`

Invite it using the generated URL. Do not grant Administrator unless a specific test proves it is required. For moderation tests, grant only the relevant permission in this staging guild and use disposable test members/roles.

## 3. Configure Render environment variables

Open the Render service for the **test agent** → Environment. Keep the existing variables and set:

- `DISCORD_GUILD_ID`: ID of the staging guild. This makes the test agent's own slash commands register in that guild for faster updates.
- `TEST_GUILD_ID`: same staging guild ID, reserved for staging readiness checks.
- `TARGET_BOT_ID`: application/user ID of the main Frieren RPG bot (not a token).
- `FRIEREN_ADMIN_IDS`: your Discord user ID(s), comma-separated.

To copy IDs, enable Discord Settings → Advanced → Developer Mode, then right-click the server, user, or bot → Copy ID. Never paste a bot token into chat or commit it to GitHub. Do not add the main bot token to the test service.

Save changes and let Render redeploy. Check the service's `/health` endpoint and logs; only consider the service ready when Discord reports it connected and the deploy is live.

## 4. Validate manually once

1. In the staging server, run `/frieren-test` with target `command interaction coverage`.
2. Confirm the report is attached and inspect whether a targeted test was actually selected. A missing targeted test is a coverage gap, not a pass.
3. Run a harmless main-bot command in the staging server manually and record its expected response. Do not use economy, combat, or moderation commands until state isolation is verified.

## 5. What is and is not a live test

- **Code test:** a local automated test passed.
- **Discord API readiness:** the bot is connected and can see the configured guild.
- **Human-observed end-to-end test:** a tester actually invoked the main bot's slash command and checked its response/components.
- **Automated end-to-end test:** only report this when a supported authorized client actually invokes the command and verifies the response. A bot-to-bot message, command schema audit, or green health check is not proof.

## Troubleshooting

- Commands absent: verify the test agent's `DISCORD_GUILD_ID`, app ID, bot token, invite scopes, and Render deploy logs.
- Bot cannot see channels: check its role/channel overwrites and `View Channels`.
- Reports fail: inspect Render logs and the attached report; do not share tokens or secrets.
- Never use a Discord user account token as a self-bot. Use a dedicated test guild and authorized test flow.