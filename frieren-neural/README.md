# Frieren Neural

Frieren Neural is the experimental, from-scratch language-model research track for Frieren AI.

This directory is intentionally isolated from the existing Discord bot and its runtime. It does not replace the current Frieren AI agent, call a hosted LLM, or require a paid API.

## Current scope

- A small decoder-only Transformer (GPT-style) implemented with PyTorch.
- A deterministic character-level tokenizer for the first educational baseline.
- A next-token language-model objective and a small generation helper.
- A deterministic text-corpus loader, chronological train/validation split, mini-batch sampler, AdamW training loop, gradient clipping, evaluation, and atomic resumable checkpoints.\n- Unit tests and a CPU GitHub Actions test workflow.

The character tokenizer is a temporary baseline, not the final multilingual tokenizer. The character tokenizer is still a temporary baseline. SentencePiece/BPE and a properly licensed multilingual corpus remain prerequisites for serious training.

## Requirements

- Python 3.11+
- PyTorch 2.x
- pytest

Install from this directory:

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
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

## Training a small baseline\n\nPlace UTF-8 `.txt` or `.md` files in a corpus directory. Only use text you have the right to use; record its source and license separately before training. The loader reads files recursively in sorted path order.\n\n```bash\npip install -e ".[dev]"\nfrieren-neural-train --data ./corpus --steps 1000 --batch-size 8 --block-size 128\n# Continue the same run to a higher total step count:\nfrieren-neural-train --data ./corpus --steps 2000 --batch-size 8 --block-size 128 --resume\n```\n\nCheckpoints are written atomically and ignored by Git. Resume requires the same corpus-derived tokenizer and model configuration. Training uses CUDA when available, otherwise CPU; CPU runs are intended for small smoke experiments.\n\n## Engineering constraints

1. Do not put credentials, Discord tokens, database URLs, or private user data in this directory.
2. Do not connect this experimental model to production Discord or web traffic until quality, safety, load, and persistence tests exist.
3. Keep model checkpoints out of Git; use an appropriate artifact store when one is selected.
4. Training data must have a documented source and license/usage basis.
5. A passing unit test proves implementation behavior only; it does not prove useful language ability.

## Roadmap

1. **Foundation:** tokenizer, Transformer, tests. (Current)
2. **Training:** licensed corpus loader, batching, optimizer, checkpoint/resume.
3. **Evaluation:** held-out perplexity, Turkish/English quality sets, regression benchmarks.
4. **Memory and tools:** separate retrieval/memory and tool execution from model weights.
5. **Serving:** a small inference API, then web and Discord adapters sharing the same core.
6. **Scaling:** improve data, tokenizer, model size, and training only when compute is available.

A genuinely capable model requires substantial clean data and compute. The first Frieren Neural version is a small research model, not a ChatGPT-equivalent system.