# Frieren Neural

Frieren Neural is the experimental, from-scratch language-model research track for Frieren AI.

This directory is isolated from the existing Discord bot and its runtime. It does not replace the current Frieren AI agent, call a hosted LLM, or require a paid API.

## Current scope

- A compact decoder-only Transformer (GPT-style) implemented with PyTorch.
- A deterministic byte-level BPE tokenizer with lossless multilingual UTF-8 round-trips; the earlier character tokenizer remains for compatibility.
- Next-token training with AdamW, gradient clipping, and train/validation loss measurement.
- Tokenizer training uses only the training text; validation text is held out before BPE merges are learned.
- CLI corpus loading requires a provenance manifest listing each file's source, license, and permitted usage.
- Atomic, versioned checkpoints store model, optimizer, tokenizer, corpus fingerprint, and RNG states for deterministic resume.
- Safe weights-only checkpoint loading and a small text-generation helper.
- Unit tests and a CPU GitHub Actions workflow.

This compact custom byte-BPE implementation is an experimental baseline, not a production-grade SentencePiece implementation. Benchmark it on a properly licensed multilingual corpus before serious training.

## Requirements and tests

- Python 3.11+
- PyTorch 2.x
- pytest

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

## Prepare a licensed corpus

Create a corpus directory containing only UTF-8 `.txt` or `.md` files. Copy `corpus_manifest.example.json` into that directory as `corpus_manifest.json`, then replace every placeholder with accurate source, license, and usage information. The CLI refuses missing manifests, placeholder metadata, path traversal, symlinks escaping the corpus directory, empty files, and unlisted text files.

The manifest is a provenance record, not legal advice or an automatic license verifier. Only include material you are authorized to use for model training. Do not include private messages, credentials, personal data, or scraped copyrighted books/anime scripts.

Example layout:

```text
corpus/
  corpus_manifest.json
  texts/
    permitted-text.txt
```

## Train a small baseline

```bash
pip install -e ".[dev]"
frieren-neural-train --data ./corpus --steps 1000 --batch-size 8 --block-size 128
# Continue the same run to a higher total step count:
frieren-neural-train --data ./corpus --steps 2000 --batch-size 8 --block-size 128 --resume
```

Training automatically uses CUDA when available and otherwise CPU. CPU is suitable for smoke tests and very small experiments, not large-scale pretraining. Resume verifies corpus fingerprint, tokenizer, model configuration, and training settings; only the target step count may increase. It also restores RNG states so a split CPU run can reproduce an uninterrupted run.

Checkpoints are written atomically and ignored by Git. Keep datasets and model weights in private storage, not Git.

## Evaluate on held-out data

Use a separate corpus directory with its own `corpus_manifest.json`; the evaluator rejects the exact training corpus fingerprint.

```bash
frieren-neural-evaluate --data ./held-out-corpus --checkpoint checkpoints/frieren-neural.pt --batches 50
```

The reported perplexity is a language-model metric, not a guarantee of factual accuracy or conversational quality.


## Load and generate

```python
from frieren_neural import load_checkpoint, generate_text

model, tokenizer, metrics = load_checkpoint("checkpoints/frieren-neural.pt")
print(metrics)
print(generate_text(model, tokenizer, "Frieren ", max_new_tokens=80))
```

## Shared inference API

The optional FastAPI service exposes health, authenticated server-to-server generation, and a same-origin browser chat. The Discord adapter calls the same inference core; neither client loads a separate model copy.

Install the serving extra and start the service:

```bash
pip install -e ".[serve]"
export FRIEREN_CHECKPOINT=checkpoints/frieren-neural.pt
export FRIEREN_API_TOKEN="use-a-random-secret-at-least-32-characters-long"
export FRIEREN_ALLOWED_ORIGINS="https://your-web-app.example"
uvicorn frieren_neural.api:app --host 0.0.0.0 --port 8000
```

- `GET /health` loads and checks the configured checkpoint without exposing its path or credentials.
- `POST /generate` requires `Authorization: Bearer <token>` and has strict prompt/output limits.
- CORS is disabled unless explicit origins are listed in `FRIEREN_ALLOWED_ORIGINS`; wildcard origins are rejected.
- If no strong API token or valid checkpoint is configured, generation fails closed.
- Keep the API token in the host's secret/environment settings. Never commit it or place it in the browser bundle.

This API is a single shared service, not a collection of serverless functions. It is not deployed by this change; hosting and the web/Discord clients remain separate milestones.


## Browser chat

The FastAPI service also serves a small responsive chat page at `/`. It uses a server-side password login and an HttpOnly, Secure, SameSite=Strict signed session cookie; the shared API token is never placed in browser JavaScript.

Configure these additional host secrets:

- `FRIEREN_WEB_PASSWORD`: a strong password of at least 16 characters.
- `FRIEREN_SESSION_SECRET`: a random secret of at least 32 characters, used to sign one-hour sessions.

Login and generation POST requests must be same-origin. The service rejects cross-origin browser requests, limits login attempts, and requires HTTPS outside localhost. The web interface displays generated text with `textContent`, not HTML.

## Discord adapter

The optional Discord client exposes one `/ask` slash command and forwards requests to the same authenticated inference API. It does not load a second model or request privileged Discord intents.

```bash
pip install -e ".[discord]"
export FRIEREN_DISCORD_TOKEN="your-discord-bot-token"
export FRIEREN_API_TOKEN="the-same-strong-server-to-server-token"
export FRIEREN_API_URL="https://your-inference-host.example"
# Optional: sync the slash command to one test server immediately
export FRIEREN_DISCORD_GUILD_ID="your-test-server-id"
python -m frieren_neural.discord_adapter
```

The bot token and API token must be stored as host secrets, never in Git or client-side code. The adapter sends only the prompt to the model API, limits output to Discord-safe chunks, and disables mention parsing on generated replies. Conversation memory is not implemented yet.


## Engineering constraints

1. Never put credentials, Discord tokens, database URLs, or private user data in this directory.
2. Do not connect this experimental model to production Discord or web traffic until quality, safety, load, and persistence tests exist.
3. Keep model checkpoints and datasets out of Git.
4. Training data must have documented source and license/usage basis.
5. A passing unit test proves implementation behavior only; it does not prove useful language ability.

## Roadmap

1. **Foundation:** tokenizer, Transformer, and baseline tests.
2. **Training:** BPE, provenance checks, leakage-free split, training, evaluation, and deterministic resume are implemented.
3. **Evaluation:** held-out perplexity, Turkish/English quality sets, and regression benchmarks.
4. **Memory and tools:** separate retrieval/memory and tool execution from model weights.
5. **Serving:** authenticated FastAPI inference API and Discord `/ask` adapter are implemented; a browser chat UI, hosting, and deployment remain.
6. **Scaling:** improve data, tokenizer, model size, and training only when suitable compute is available.

A genuinely capable model requires substantial clean data and compute. This is a small research model, not a ChatGPT-equivalent system.
