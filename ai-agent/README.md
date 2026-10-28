# Frieren AI Test Agent

A separate, restricted Discord bot for AI-assisted diagnostics of the Frieren game bot.

## Commands

- `/frieren-test`: runs the repository's allowlisted `npm run check` command and asks the configured OpenAI model to summarize the output.
- `/frieren-ai soru:`: asks the model for coding and test-system guidance.

Only Discord user IDs listed in `FRIEREN_ADMIN_IDS` can run either command. No arbitrary shell commands, file writes, GitHub mutations, or deployments are exposed by the bot. Test execution is limited to one run per guild at a time and has a timeout.

## Render setup

Create a **new Web Service** from the same GitHub repository. Do not alter the existing Frieren bot service.

- Root Directory: `ai-agent`
- Build Command: `npm install && cd .. && npm install`
- Start Command: `npm start`
- Runtime: Node
- Node version: 20 or newer

Add environment variables in the new service's Render dashboard:

- `DISCORD_TOKEN`: token for the new Discord application, not the existing Frieren bot.
- `DISCORD_CLIENT_ID`: application ID for the new bot.
- `DISCORD_GUILD_ID`: optional test server ID for instant guild-scoped command registration.
- `OPENAI_API_KEY`: API key with API billing/access configured.
- `OPENAI_MODEL`: optional model name; default is `gpt-4.1-mini`.
- `FRIEREN_ADMIN_IDS`: comma-separated trusted Discord user IDs.
- `FRIEREN_TEST_TIMEOUT_MS`: optional test timeout, maximum five minutes.

Run `npm run register` once in the service shell after setting the Discord variables, or run it locally with the new bot's environment. Then start the service.

## Important limitations

This is not a copy of ChatGPT and does not automatically inherit this conversation's tools, memory, GitHub permissions, or Render access. The model only sees the question and any test report supplied to it. The current implementation does not edit code or deploy changes. Review proposed changes separately and keep production deployment under human control.

Never commit a real `.env` file or secrets. The agent uses a separate Discord bot token and must not be given Administrator permission. Grant only the permissions needed to view the server and use slash commands.
