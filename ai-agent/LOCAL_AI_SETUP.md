# Frieren AI inference setup

The code agent supports two inference modes. Neither mode automatically switches to a paid provider.

## Recommended for Render without a personal computer: Groq free tier

Groq provides a hosted OpenAI-compatible API with published free-tier rate limits. It is not unlimited or guaranteed always-available, but it avoids hosting model weights yourself. If the free-tier quota is exhausted, the agent returns a clear error and does not silently bill or switch providers.

1. Create an account and an API key at https://console.groq.com/keys.
2. In the Render service for the **Frieren AI coding agent**, open Environment and add:
   - `FRIEREN_MODEL_PROVIDER=groq`
   - `GROQ_API_KEY` = your secret key (keep it private; never commit it to GitHub)
   - `FRIEREN_MODEL=openai/gpt-oss-20b` (default model)
   - `FRIEREN_MODEL_TIMEOUT_MS=90000`
3. Save the environment variables and let Render redeploy.
4. Run `/frieren-ai` in Discord and inspect Render logs if the provider returns a quota, authentication, or timeout error.

The Groq API has free-tier quotas/rate limits that may change. Check the current limits at https://console.groq.com/docs/rate-limits. Do not enable a paid Developer tier or add billing if you want to keep this at $0. A free API tier is not the same as unlimited free compute.

## Alternative: self-hosted Ollama

Use this only if an always-on machine/server is available:
- `FRIEREN_MODEL_PROVIDER=ollama` (default)
- `FRIEREN_MODEL_URL`: reachable base URL; defaults to `http://127.0.0.1:11434`
- `FRIEREN_LOCAL_MODEL`: installed model name; defaults to `qwen2.5:3b`

Render cannot reach localhost on a personal computer. Do not expose an unauthenticated Ollama port directly to the public internet.

## Timeout and errors

- `FRIEREN_MODEL_TIMEOUT_MS`: default 90000 ms, clamped to 5–180 seconds.
- HTTP failures and empty responses produce readable errors.
- HTTP 429 from Groq indicates a possible free-tier rate limit; wait for reset rather than upgrading to paid.

## Scope and memory

This setup applies to the separate Frieren AI coding/test agent. It does not yet connect conversational AI to the normal Frieren RPG bot. The normal bot's character chat and persistent memory must be implemented separately, using its existing PostgreSQL database. Do not confuse in-process chat history with durable memory.

## Validation

Run `npm run check` in the repository. The provider tests mock HTTP responses and do not require a live key. A successful mock test proves client request handling, not that the real Groq account/key is enabled.
