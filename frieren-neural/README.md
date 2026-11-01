# Frieren Neural

Frieren Neural is the experimental, from-scratch language-model research track for Frieren AI.

This directory is isolated from the existing Discord bot and its runtime. It does not replace the current Frieren AI agent, call a hosted LLM, or require a paid API.

## Current scope

- A compact decoder-only Transformer (GPT-style) implemented with PyTorch.
- A deterministic Unicode character tokenizer for the first educational baseline.
- Next-token language-model objective and autoregressive generation helper.
- UTF-8 text corpus loader for `.txt` and `.md` files.
- Chronological train/validation split, mini-batch sampling, AdamW, gradient clipping, and periodic loss evaluation.
- Atomic checkpoints with optimizer state and guarded resume.
- Unit tests and a CPU GitHub Actions test workflow.

The character tokenizer is temporary, not a production multilingual tokenizer. SentencePiece/BPE and a properly licensed multilingual corpus remain prerequisites for serious training.

## Requirements

- Python 3.11+
- PyTorch 2.x
- pytest

Install from this directory:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

## Minimal model smoke test

```python
import torch
from frieren_neural import CharacterTokenizer, GPTConfig, GPTLanguageModel

tokenizer = CharacterTokenizer.train(["Merhaba Frieren."])
tokens = torch.tensor([tokenizer.encode("Merhaba")], dtype=torch.long)

model = GPTLanguageModel(
    GPTConfig(
        vocab_size=tokenizer.vocab_size,
        d_model=64,
        n_heads=4,
        n_layers=2,
        max_seq_len=64,
    )
)
logits = model(tokens)
print(logits.shape)
```

## Training a small baseline

Place UTF-8 `.txt` or `.md` files in a corpus directory. Only use text you have the right to use. Record each source, its license, and any usage restrictions before training; do not use private messages or personal data.

The loader recursively reads supported files in sorted path order. The train/validation split is chronological to reduce leakage between neighboring text windows.

```bash
pip install -e ".[dev]"
frieren-neural-train --data ./corpus --steps 1000 --batch-size 8 --block-size 128
# Continue the same run to a higher total step count:
frieren-neural-train --data ./corpus --steps 2000 --batch-size 8 --block-size 128 --resume
```

Training automatically uses CUDA when available and otherwise CPU. CPU is suitable for smoke tests and very small experiments, not large-scale pretraining. Resume verifies the corpus fingerprint, tokenizer, model configuration, and training settings; only the total target step count may increase.

Checkpoints are written atomically and ignored by Git. Keep them in private storage; do not commit model weights or datasets.

## Engineering constraints

1. Never put credentials, Discord tokens, database URLs, or private user data in this directory.
2. Do not connect this experimental model to production Discord or web traffic until quality, safety, load, and persistence tests exist.
3. Keep model checkpoints and datasets out of Git.
4. Training data must have a documented source and license/usage basis.
5. A passing unit test proves implementation behavior only; it does not prove useful language ability.

## Roadmap

1. **Foundation:** tokenizer, Transformer, and baseline tests.
2. **Training:** baseline corpus loader, batching, optimizer, evaluation, and checkpoint-resume are implemented. Corpus provenance tooling and a scalable subword tokenizer remain.
3. **Evaluation:** held-out perplexity, Turkish/English quality sets, and regression benchmarks.
4. **Memory and tools:** separate retrieval/memory and tool execution from model weights.
5. **Serving:** a small inference API, then web and Discord adapters sharing the same core.
6. **Scaling:** improve data, tokenizer, model size, and training only when compute is available.

A genuinely capable model requires substantial clean data and compute. This is a small research model, not a ChatGPT-equivalent system.
