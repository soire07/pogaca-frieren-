# Frieren AI Test Agent

A separate, restricted Discord bot for AI-assisted diagnostics of the Frieren game bot.

## Commands
- `/frieren-test`: runs the repository's allowlisted `npm run check` command and returns the test report.
- `/frieren-ai soru:`: asks the coding assistant for read-only code and test-system guidance, using relevant saved memory when configured.
- `/frieren-bellek kaydet`: save a user-owned memory by key.
- `/frieren-bellek listele`: list your own saved memories.
- `/frieren-bellek sil`: delete one of your own saved memories.
- `/frieren-bellek temizle`: delete all of your own saved memories after explicit confirmation.

Persistent memory requires `DATABASE_URL` pointing to a PostgreSQL database. Saved memory records and recent conversational turns are scoped to the Discord user ID and are never selected across accounts. The bot keeps at most 12 recent user/assistant conversation messages per user; only ordinary conversational `/frieren-ai` turns are retained, while technical/code requests are not added to chat history. `/frieren-bellek` manages explicitly saved facts; its `temizle` action clears saved facts, not the separate recent conversation history. Never store credentials, tokens, or other secrets. The AI treats memory contents as untrusted context, not instructions.

The `/frieren-test` and `/frieren-komut-denetle` diagnostic commands are restricted to Discord user IDs listed in `FRIEREN_ADMIN_IDS`. `/status`, `/frieren-ai`, and personal `/frieren-bellek` actions are available to users. No arbitrary shell commands, file writes, GitHub mutations, or deployments are exposed by the bot.

## Render setup

This service uses the free Groq API and does not fall back to paid providers.

- Root Directory: `ai-agent`
- Build Command: `npm install && cd .. && npm install`
- Start Command: `npm start`
- Runtime: Node 20 or newer

Configure these environment variables in Render:
- `DISCORD_TOKEN`: token for the separate Frieren AI agent Discord application.
- `DISCORD_CLIENT_ID`: application ID for that bot.
- `DISCORD_GUILD_ID`: required; must be the Frieren AI test server ID `1564945192803639356`. Global slash-command registration is disabled.
- `GROQ_API_KEY`: secret key from https://console.groq.com/keys. Never commit the key to GitHub.
- `FRIEREN_MODEL_PROVIDER=groq`: selected provider.
- `FRIEREN_MODEL`: optional model override; default is `openai/gpt-oss-20b`.
- `FRIEREN_ADMIN_IDS`: comma-separated trusted Discord user IDs.
- `DATABASE_URL`: optional PostgreSQL connection string for persistent memory. Store it only as a Render secret environment variable; never commit it.
- `FRIEREN_TEST_TIMEOUT_MS`: optional test timeout, maximum five minutes.

Save environment changes and let Render redeploy. Groq free-tier rate limits apply. If quota is reached, the request fails visibly rather than switching to a paid API.

## Important limitations

This is not a copy of ChatGPT and does not automatically inherit this conversation's tools, memory, GitHub permissions, or Render access. The model only sees the question and selected source context. The current implementation does not edit code or deploy changes.

Never commit a real `.env` file or secrets. The agent uses a separate Discord bot token and must not be given Administrator permission.


## Free Groq repair workflow

The optional GitHub Actions workflow `.github/workflows/frieren-ai-self-repair.yml` can draft a bounded repair pull request without using a paid OpenAI API.

1. In GitHub, open **Settings → Secrets and variables → Actions** for this repository.
2. Add repository secret `GROQ_API_KEY` using a free-tier key from https://console.groq.com/keys.
3. Open **Actions → Frieren AI Safe Self-Repair → Run workflow**, choose `frieren-ai-agent` as the base branch, and describe one specific bug.
4. The workflow proposes changes, runs `npm run check`, and opens a pull request only if checks pass. It does not merge or deploy the proposed repair automatically.

The key is not stored in the repository. Groq free-tier limits apply; quota errors stop the run rather than falling back to a paid provider.


## Free scheduled health check

The GitHub Actions workflow `.github/workflows/frieren-ai-health.yml` checks the Render `/health` endpoint every 10 minutes and retries briefly if Render is waking the service. It fails if the HTTP health response or Discord gateway readiness is not healthy. You can also run it manually from the Actions tab.

This is a best-effort free-tier workaround, not an uptime guarantee: GitHub scheduled jobs can be delayed, and Render can still restart or suspend free services.

