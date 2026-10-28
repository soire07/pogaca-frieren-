# Frieren AI Test Agent

A separate, restricted Discord bot for AI-assisted diagnostics of the Frieren game bot.

## Commands
- `/frieren-test`: runs the repository's allowlisted `npm run check` command and returns the test report.
- `/frieren-ai soru:`: asks the coding assistant for read-only code and test-system guidance.

Only Discord user IDs listed in `FRIEREN_ADMIN_IDS` can run either command. No arbitrary shell commands, file writes, GitHub mutations, or deployments are exposed by the bot.

## Render setup

This service uses the free Groq API and does not fall back to paid providers.

- Root Directory: `ai-agent`
- Build Command: `npm install && cd .. && npm install`
- Start Command: `npm start`
- Runtime: Node 20 or newer

Configure these environment variables in Render:
- `DISCORD_TOKEN`: token for the separate Frieren AI agent Discord application.
- `DISCORD_CLIENT_ID`: application ID for that bot.
- `DISCORD_GUILD_ID`: optional test server ID for fast guild-scoped command registration.
- `GROQ_API_KEY`: secret key from https://console.groq.com/keys. Never commit the key to GitHub.
- `FRIEREN_MODEL_PROVIDER=groq`: selected provider.
- `FRIEREN_MODEL`: optional model override; default is `openai/gpt-oss-20b`.
- `FRIEREN_ADMIN_IDS`: comma-separated trusted Discord user IDs.
- `FRIEREN_TEST_TIMEOUT_MS`: optional test timeout, maximum five minutes.

Save environment changes and let Render redeploy. Groq free-tier rate limits apply. If quota is reached, the request fails visibly rather than switching to a paid API.

## Important limitations

This is not a copy of ChatGPT and does not automatically inherit this conversation's tools, memory, GitHub permissions, or Render access. The model only sees the question and selected source context. The current implementation does not edit code or deploy changes.

Never commit a real `.env` file or secrets. The agent uses a separate Discord bot token and must not be given Administrator permission.
