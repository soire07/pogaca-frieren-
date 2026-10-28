# Frieren Local AI Core

Frieren's AI analysis now uses an Ollama-compatible model endpoint instead of the OpenAI SDK or a paid API key.

## Environment variables

- `FRIEREN_MODEL_URL`: base URL reachable **from the Frieren process**, e.g. `http://127.0.0.1:11434` when Frieren and Ollama run on the same machine.
- `FRIEREN_LOCAL_MODEL`: installed Ollama model name; default `qwen2.5:3b`.
- `FRIEREN_MODEL_TIMEOUT_MS`: request timeout, default 90000 ms, clamped to 5–180 seconds.

The client calls `POST /api/chat` with `stream: false`, validates the response, and returns readable errors for HTTP failures, empty responses, and timeouts. No API key is sent.

## Important Render limitation

Render cannot reach `127.0.0.1` on your personal computer. To keep the existing Render deployment, you must either:
1. run an Ollama-compatible model on a separate always-on machine/server and set `FRIEREN_MODEL_URL` to a private, authenticated endpoint reachable from Render, or
2. run Frieren and Ollama together on a computer that stays online (this changes where the AI service runs, not the main Discord bot).

Do not expose an unauthenticated Ollama port directly to the public internet. A small local model such as `qwen2.5:3b` can be slower or less capable than hosted models, and the host needs enough RAM. The repo change alone does not provision a model host.

## Memory

The current change adds short conversation context in process memory, limited to the last four user/assistant exchanges per Discord user. It resets when the service restarts or redeploys. Durable memory is a separate next step and should use a persistent database or disk; do not treat this session buffer as permanent memory.

## Validation

Run `npm run check` in the repository. Local model client tests use a mocked HTTP response and do not require a running model. To test a real model, install Ollama on the model host, pull a model, and verify the endpoint from the Frieren host before enabling the Discord command.
