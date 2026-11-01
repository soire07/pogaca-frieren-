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
5. **Serving:** a small inference API, then web and Discord adapters sharing the same core.
6. **Scaling:** improve data, tokenizer, model size, and training only when suitable compute is available.

A genuinely capable model requires substantial clean data and compute. This is a small research model, not a ChatGPT-equivalent system.
