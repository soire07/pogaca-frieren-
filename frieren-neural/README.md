# Frieren Neural

Frieren Neural is the Turkish-first inference and model-research track for Frieren AI. The from-scratch GPT remains an isolated research baseline; the serving API can use a pretrained Turkish chat model.

This directory is isolated from the existing Discord bot and its runtime. It does not replace the current Frieren AI agent, call a hosted LLM, or require a paid API.

## Current scope

- A compact decoder-only Transformer (GPT-style) implemented with PyTorch, retained as a research baseline.
- An optional Turkish-first pretrained chat backend (`ufakai/ufakzeka-1`, Apache-2.0) served through its published Q8 GGUF weights and native chat template.
- A deterministic byte-level BPE tokenizer with lossless multilingual UTF-8 round-trips; the earlier character tokenizer remains for compatibility.
- Next-token training with AdamW, gradient clipping, and train/validation loss measurement.
- Tokenizer training uses only the training text; validation text is held out before BPE merges are learned.
- Corpus splitting preserves complete source documents and the Turkish dialogue importer's conversation separators, preventing a single dialogue from crossing the train/validation boundary.
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

## Verified Turkish dialogue starter corpus

A reproducible importer is included for **Turkish Daily Dialogues 5K v1.0.0** by Enes Deniz. The source dataset contains synthetic Turkish multi-turn dialogues and is published under **CC BY 4.0**. The importer downloads only the train split (3,950 conversations), pins the upstream Git commit and verifies the published SHA-256 before parsing. It rejects unexpected language/split/provenance fields, malformed or non-alternating turns, and any changed download. It never downloads the validation or test split for training.

```bash
pip install -e .
frieren-neural-prepare-turkish-dialogues --output ./corpus/turkish-daily-dialogues
frieren-neural-train --data ./corpus/turkish-daily-dialogues --steps 1000 --batch-size 4 --block-size 64
# More conservative CPU profile (smaller model and shorter evaluation batches):
frieren-neural-train-small --data ./corpus/turkish-daily-dialogues --steps 1000
```

The importer stores each conversation as a separate section divided by `\n\n---\n\n`. Training uses those section boundaries when making its chronological train/validation split, so no conversation is divided between the two sets. The same pinned importer can prepare the validation or test split separately; the trainer only downloads the train split. To evaluate on the untouched test set, use:
```bash
frieren-neural-prepare-turkish-dialogues --split test --output ./corpus/turkish-daily-dialogues-test
frieren-neural-evaluate --data ./corpus/turkish-daily-dialogues-test --checkpoint ./checkpoints/frieren-neural-small.pt --batch-size 4 --batches 25 --device cpu
```

The generated manifest records the dataset source, version, CC BY 4.0 license, attribution requirement, and verified source digest. Keep the generated corpus out of Git. This small synthetic dialogue set is suitable for a Turkish conversational-format baseline; it is **not** broad pretraining data and cannot by itself produce a knowledgeable or fluent general-purpose assistant. Add separately licensed, diverse Turkish and English text before drawing conclusions about general language ability.

Dataset source and attribution: [Turkish Daily Dialogues 5K](https://github.com/3nesdeniz/turkish-daily-dialogues-5k), [Hugging Face dataset card](https://huggingface.co/datasets/3nesdeniz/turkish-daily-dialogues-5k), [CC BY 4.0 license](https://creativecommons.org/licenses/by/4.0/). Attribution to Enes Deniz and the dataset version is retained in `corpus_manifest.json`.

## First CPU baseline (2026-11-01)

The first reproducible CPU run completed 1,000 optimizer steps on 3,950 training conversations. It used the source-provided training split only; the source-provided 525-conversation test split was downloaded separately and checksum-verified after training.

| Metric | Result |
| --- | ---: |
| Training loss | 3.4826 |
| Internal validation loss | 3.5467 |
| Held-out test loss | 3.4835 |
| Held-out test perplexity | 32.5736 |
| Optimizer steps | 1,000 |
| Device | CPU |

The checkpoint loaded successfully and text generation executed, but the generated Turkish sample was not coherent. These metrics confirm that the pipeline runs and the model learns token patterns; they do **not** establish conversational usefulness. Do not deploy this checkpoint to real users. Improve the corpus, increase model capacity/training carefully, and add human-rated quality tests first.

[GitHub Actions run and 30-day checkpoint artifact](https://github.com/soire07/pogaca-frieren-/actions/runs/41306097844).

## Assistant-turn EOS and multi-turn prompt encoding (2026-11-01)

Dialogue encoding version 2 inserts an EOS token after every assistant response, rather than only at the end of a complete conversation. Generation prompts preserve the same boundary markers between completed assistant turns while leaving the final `Asistan:` prefix open. Held-out evaluation uses the same chat-aware encoder as training.

New checkpoints record `dialogue_encoding_version=2`. Version-1 checkpoints remain loadable for inference, but the trainer refuses to resume them because their token boundaries are incompatible; start a fresh training run to adopt version 2.

## Dialogue-boundary-safe retraining (2026-11-01)

After correcting the internal split to preserve complete conversations, the baseline was retrained from scratch on the same pinned 3,950-conversation training split. The independent 525-conversation test split remained untouched and was checksum-verified again.

| Metric | Result |
| --- | ---: |
| Training loss | 3.4484 |
| Internal validation loss | 3.5376 |
| Held-out test loss | 3.4980 |
| Held-out test perplexity | 33.0493 |
| Optimizer steps | 1,000 |
| Device | CPU |

The new checkpoint loads and generates text, but the smoke sample remains incoherent Turkish. The held-out test loss is slightly worse than the earlier run, so this change improves split integrity rather than proving improved language quality. Keep the model experimental and do not deploy it to users.

[GitHub Actions run and 30-day checkpoint artifact](https://github.com/soire07/pogaca-frieren-/actions/runs/41307444879).

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

Training automatically uses CUDA when available and otherwise CPU. CPU is suitable for smoke tests and very small experiments, not large-scale pretraining. The `frieren-neural-train-small` command uses a 2-layer, 64-dimensional model, batch size 4, context length 64, and three evaluation batches to keep the first CPU experiment resource-conscious. Resume verifies corpus fingerprint, tokenizer, model configuration, and training settings; only the target step count may increase. It also restores RNG states so a split CPU run can reproduce an uninterrupted run.

Checkpoints are written atomically and ignored by Git. Keep datasets and model weights in private storage, not Git.

## Evaluate on held-out data

Use a separate corpus directory with its own `corpus_manifest.json`; the evaluator rejects the exact training corpus fingerprint.

```bash
frieren-neural-evaluate --data ./held-out-corpus --checkpoint checkpoints/frieren-neural.pt --batches 50
```

The reported perplexity is a language-model metric, not a guarantee of factual accuracy or conversational quality.

## Candidate comparison and deployment decision (2026-11-01)

See [CANDIDATE_DECISION_2026-11-01.md](CANDIDATE_DECISION_2026-11-01.md) for measured results from the scratch checkpoint, Qwen3 float32, Q8, and Q4 GGUF candidates. All remain **NOT READY**. [HUMAN_REVIEW_INSTRUCTIONS.md](HUMAN_REVIEW_INSTRUCTIONS.md) explains the two-reviewer release gate and how to download score sheets. None of these experiments deploys a model or changes production services.

## Automated Turkish conversation quality report

The fixed 24-case benchmark in `QUALITY_GATE.md` is executable through:

```bash
frieren-neural-evaluate-quality \
  --checkpoint checkpoints/frieren-neural-small.pt \
  --output-dir quality-reports/candidate
```

The command writes three files:

- `quality-report.json`: machine-readable metadata and generated responses.
- `quality-report.md`: reviewer-friendly report with all 24 prompts and outputs.
- `human-scores.template.json`: blank two-reviewer score sheet.

The model never grades itself. Two human reviewers independently score all six dimensions from 0 to 4 and mark critical safety/privacy failures and fabricated claims. A prior human-scored report with the same prompt-set version and decoding settings is required for a READY decision. Supply the completed score sheet and comparable baseline using `--scores` and `--baseline-report`. Without human scores or a comparable baseline, the decision remains `NOT READY`.

Training workflow runs generate and archive the prompt report automatically after training. This produces evidence for review; it does not auto-approve or deploy the checkpoint. The first baseline has not passed human review.


## Load and generate

```python
from frieren_neural import load_checkpoint, generate_text

model, tokenizer, metrics = load_checkpoint("checkpoints/frieren-neural.pt")
print(metrics)
print(generate_text(model, tokenizer, "Frieren ", max_new_tokens=80))
```

## Shared inference API

The optional FastAPI service exposes health, authenticated server-to-server generation, and a same-origin browser chat. The Discord adapter calls the same inference core; neither client loads a separate model copy.

### Turkish-first model backend

The serving API supports `FRIEREN_MODEL_BACKEND=ufakzeka`. This selects `ufakai/ufakzeka-1`, a Turkish-first 151M-parameter chat model published under Apache-2.0. Its recommended Q8 GGUF is approximately 196 MB. The runtime downloads it on first model load, verifies the published SHA-256 before accepting it, uses memory mapping, and keeps one model instance per process. It uses the model's native user/assistant chat template; do not inject a system-role message because the released chat model was trained without system messages.

The model is not perfect: its published evaluation documents limits in factual recall, arithmetic over multiple turns, and some safety edge cases. It is a substantially better Turkish starting point than training the current 128-dimensional scratch model from chat-only data, but it still requires Frieren-specific supervised tuning and measured review before production rollout. No paid API is used.


Install the serving extra and start the service:

```bash
pip install -e ".[serve]"
export FRIEREN_MODEL_BACKEND=ufakzeka
# Optional: choose a persistent model-cache path; default is models/ufakzeka-1-q8_0.gguf
export FRIEREN_GGUF_MODEL_PATH=models/ufakzeka-1-q8_0.gguf
# Scratch research backend remains available with FRIEREN_MODEL_BACKEND=scratch and FRIEREN_CHECKPOINT=...
export FRIEREN_API_TOKEN="use-a-random-secret-at-least-32-characters-long"
export FRIEREN_DATABASE_URL="postgresql://.../neondb?sslmode=require"
export FRIEREN_ALLOWED_ORIGINS="https://your-web-app.example"
uvicorn frieren_neural.api:app --host 0.0.0.0 --port 8000
```

- `GET /health` loads and checks the selected model; for the Turkish backend it downloads the pinned-size, SHA-256-verified Q8 model on first load.
- `POST /generate` requires `Authorization: Bearer <token>` and has strict prompt/output limits.
- CORS is disabled unless explicit origins are listed in `FRIEREN_ALLOWED_ORIGINS`; wildcard origins are rejected.
- If no strong API token or valid model is configured, generation fails closed.
- Keep the API token in the host's secret/environment settings. Never commit it or place it in the browser bundle.

This API is a single shared service, not a collection of serverless functions. It is not deployed by this change; hosting and the web/Discord clients remain separate milestones.


## Browser chat

The FastAPI service also serves a small responsive chat page at `/`. It uses a server-side password login and an HttpOnly, Secure, SameSite=Strict signed session cookie; the shared API token is never placed in browser JavaScript.

### Shared admission, login limits, and worker constraints

Set `FRIEREN_DATABASE_URL` to the connection string of the dedicated `frieren-neural-infra` Neon database. Install `.[serve]`; it includes the Psycopg PostgreSQL driver. Apply `migrations/001_shared_admission.sql` before enabling the setting.

- With `FRIEREN_DATABASE_URL` configured, PostgreSQL advisory locks enforce **one global active inference request** across API processes. The session lock is released automatically when the database connection closes or the worker crashes. If PostgreSQL is unavailable, inference fails closed with HTTP 503 rather than silently falling back to a weaker local limit.
- Login attempts are stored as SHA-256 client keys in `neural_login_attempts`; a PostgreSQL transaction lock makes the five-attempt/five-minute threshold and 2,000-client cap atomic across processes. Expired rows are pruned during login checks.
- Without `FRIEREN_DATABASE_URL`, the API retains process-local limits for local development only. Do not mistake this fallback for multi-worker protection.

**Deployment constraint: continue to run exactly one API worker and one service instance.** Do not start Uvicorn with `--workers > 1`, Gunicorn with multiple workers, or horizontal replicas. The shared lock prevents concurrent inference, but each worker still has its own model cache and may load a duplicate model copy over time. Multi-instance hosting requires a deliberate model-memory/worker architecture and load testing first.

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

## Candidate dataset review: Turkish Chat Max 25K (2026-11-01)

A second candidate was reviewed: [cisimcik/Turkish Chat Max 25K](https://huggingface.co/datasets/cisimcik/turkish-chat-max-25k). Its published card describes 24,543 synthetic conversations across 16 task types, stored as Parquet, and declares Apache-2.0 licensing. The card reports 16,864 rows marked `tr_only`, 6,637 `tr_en`, 1,042 `en_source`, 921 rows with tool calls, and 18,056 rows with separate reasoning fields. It also states that the conversations were generated using third-party LLM services. See the [dataset card](https://huggingface.co/datasets/cisimcik/turkish-chat-max-25k) and [English card](https://huggingface.co/datasets/cisimcik/turkish-chat-max-25k/blob/main/README_en.md).

**Decision: reviewed, not imported or used for training.** The public card establishes the claimed format and license, but this review has not yet pinned an immutable dataset revision, verified the exact Parquet file list and byte sizes, or recorded SHA-256 digests for the exact files to be consumed. The repository's current importer requires those integrity guarantees; therefore no mutable `main` download or unverified dataset library resolution is permitted.

Before integration, a dedicated importer must:
- Pin an immutable Hugging Face commit and exact Parquet paths, sizes, and SHA-256 digests; enforce a strict download-size cap and reject changed files.
- Preserve the Apache-2.0 license and upstream attribution/notices in the generated corpus manifest after checking the repository's actual license file.
- Parse only explicitly allowlisted Turkish records; exclude `tr_en` and `en_source`, tool-call conversations, tool messages, and all `reasoning` fields. Never train on hidden reasoning or serialized tool schemas.
- Validate every message role/content, reject empty assistant turns and malformed conversations, and keep complete conversations intact.
- Create a deterministic, ID-based train/validation/test partition because the dataset card exposes one `train` split; deduplicate IDs and normalized conversation content before partitioning.
- Produce a corpus manifest with source revision, file digests, filtering rules, row counts, and attribution, and refuse to overwrite existing output.
- Compare against the current baseline on a genuinely held-out set and inspect generated samples before considering any deployment.

The current trainer is a next-token language-model baseline, not a chat-template supervised fine-tuner. A dataset import alone will not make this model a capable assistant. The model must continue to be treated as experimental until both quantitative evaluation and human-reviewed Turkish conversation tests show useful improvement.



### Additional content-safety gate (2026-11-01)

A live inspection of the public dataset viewer exposed at least one `tr_only` casual-conversation row whose topic is adult sexual material. This means the language-mode allowlist alone is not a sufficient content filter, even when tool calls and reasoning are excluded. The dataset must remain blocked until an explicit topic/task allowlist and a conservative content-safety screening stage are implemented and tested; merely dropping `has_reasoning` or `has_tools` rows is insufficient. The dataset card declares Apache-2.0, but the repository's actual `LICENSE` file and immutable file digests still need independent verification. No dataset bytes have been imported and no training run has been started from this candidate.

## Turkish conversation quality gate

The fixed, human-reviewed benchmark, scoring rubric, and release thresholds are defined in [QUALITY_GATE.md](QUALITY_GATE.md). The current checkpoint has not passed that review and remains experimental.


### Baseline artifact audit (2026-11-01)

The CPU baseline artifact from workflow run [41307444879](https://github.com/soire07/pogaca-frieren-/actions/runs/41307444879) was downloaded and inspected without deploying or modifying any service. Its checkpoint confirms a deliberately small configuration: 2 Transformer layers, 2 attention heads, 64-dimensional embeddings, 64-token context, vocabulary size 384, batch size 4, and 1,000 optimizer steps. The held-out metrics file reports loss 3.4980 and perplexity 33.0493. The training workflow used only 3 evaluation batches for this small CPU run, so these metrics are useful as a smoke/baseline signal but are too noisy and too narrow to establish conversational quality. A future comparison must use identical, larger held-out evaluation settings, fixed prompts, reviewed generations, and preferably multiple seeds. Do not treat this artifact as a deployable assistant checkpoint.



## Assistant-only loss objective v2

The trainer keeps user turns and role markers in the context window but excludes them from the loss. Only assistant response bodies and assistant-turn EOS boundaries are supervised. Role-marker tokenization is kept consistent between training history and inference prompts. The checkpoint stores the objective version; resuming an older full-stream or earlier assistant-mask checkpoint is rejected, while inference loading remains backward-compatible. Held-out metrics explicitly distinguish the evaluation objective from the checkpoint's training objective.

## Additional dataset candidate: TFLai Turkish-Alpaca

The [TFLai Turkish-Alpaca dataset card](https://huggingface.co/datasets/TFLai/Turkish-Alpaca) declares Apache-2.0 and reports 51,914 rows / 24.2 MB. Its public examples show mixed response quality, including incorrect arithmetic reasoning and weak/unsafe password-generation examples. **It is not imported or used for training.** The current public file listing exposes a mutable main path and an LFS digest, but the exact immutable revision, complete license notice, file digest, and row-level safety/quality filtering have not been verified together. Before use, pin a full immutable revision, verify all consumed bytes, inspect license notices, and add deterministic allowlist-based task filtering plus independent human spot checks. A larger dataset must not be assumed to be a better dataset.
